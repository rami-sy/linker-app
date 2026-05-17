import {
  View,
  TouchableOpacity,
  ImageBackground,
  Text,
  Platform,
} from "react-native";
import React, { useEffect, useState, useRef, useCallback, useMemo } from "react";

import { useContext } from "react";
import { useDispatch, useSelector } from "react-redux";
import {
  clearMessages,
  clearThreadPagination,
  setRoomDraft,
  updateMessage,
  updateRooms,
} from "../../../../../src/redux/chatSlice";
import { addAlert } from "../../../../../src/redux/alertSlice";
import { SocketContext } from "../../../../../src/contexts/socket.context";

import Cam from "../../../../../src/components/chat/cam";
import Header from "../../../../../src/components/chat/header";
import Footer from "../../../../../src/components/chat/footer";
import Modal from "../../../../../src/components/modal";
import MessageList from "../../../../../src/components/chat/message-list";
import PinnedMessagesBar from "../../../../../src/components/chat/pinned-messages-bar";
import ThreadMessagesPanel from "../../../../../src/components/chat/thread-messages-panel";
import Button from "../../../../../src/components/button";
import { chatFlags } from "../../../../../src/constants/chatFlags";

import debounce from "lodash/debounce";
import FeIcon from "react-native-vector-icons/Feather";

import ImageViewer from "react-native-image-zoom-viewer";
import Constants from "expo-constants";
import useSelectedRoom from "../../../../../src/hooks/use-selected-room";
import { router, useLocalSearchParams } from "expo-router";
import Head from "expo-router/head";
import { useTranslation } from "react-i18next";
import { useColorScheme } from "~/lib/useColorScheme";
import { loadOrCreateDeviceKeys } from "../../../../../src/crypto/e2eeDevice";
import { tryDecryptChatMessage } from "../../../../../src/crypto/e2eeMessageHelpers";
// import { preventScreenCapture, allowScreenCapture } from "expo-screen-capture";

const apiUrl =
  process.env.EXPO_PUBLIC_API_URL ||
  Constants.expoConfig.extra.EXPO_PUBLIC_API_URL;

/** Stable fallback when persisted state predates `roomDrafts` (see chatSlice + store migrate). */
const EMPTY_ROOM_DRAFTS = Object.freeze({});

const resolveMsgId = (v) => {
  if (v == null) return '';
  if (typeof v === 'object' && v !== null && v._id != null) return String(v._id);
  return String(v);
};

const resolveMessageSenderId = (msg) => {
  if (!msg) return '';
  const candidates = [
    msg?.user,
    msg?.senderSnapshot?.userId,
    msg?.senderSnapshot?._id,
    msg?.sender?._id,
  ];
  for (const c of candidates) {
    const id = resolveMsgId(c);
    if (id) return id;
  }
  return '';
};

const ChatScreen = ({}) => {
  const { roomId, pushMention, highlightMessageId } = useLocalSearchParams();
  const { t } = useTranslation();
  const { socket } = useContext(SocketContext);
  const rooms = useSelector((state) => state.chats?.rooms ?? []);
  const roomDrafts = useSelector(
    (state) => state.chats?.roomDrafts ?? EMPTY_ROOM_DRAFTS
  );
  const { user } = useSelector((state) => state.users);
  const { isDarkColorScheme } = useColorScheme();

  const room = useSelectedRoom();
  const [selectedMessage, setSelectedMessage] = useState(null);

  // const [typing, setTyping] = useState({
  //   isTyping: false,
  // });
  const [selectedMessages, setSelectedMessages] = useState([]);
  const [threadPanelRoot, setThreadPanelRoot] = useState(null);
  const [message, setMessage] = useState("");
  const [isScrollAtBottom, setIsScrollAtBottom] = useState(true);
  const [showUnreadDivider, setShowUnreadDivider] = useState(false);
  const [msgToReply, setMsgToReply] = useState(null);
  const [roomResolveTimedOut, setRoomResolveTimedOut] = useState(false);

  const scrollViewRef = useRef();
  const jumpToMessageRef = useRef(null);
  const threadJumpRef = useRef(null);
  const e2eeDeviceKeysRef = useRef(null);
  const highlightChaseEmitRef = useRef(0);
  const highlightMidRef = useRef(null);
  const dispatch = useDispatch();

  const HIGHLIGHT_MAX_PAGES = 25;

  useEffect(() => {
    const mentionFlag = Array.isArray(pushMention)
      ? pushMention[0]
      : pushMention;
    if (mentionFlag !== "1") return;
    dispatch(
      addAlert({
        type: "info",
        message: t("chat.openedFromMentionPush"),
      })
    );
    try {
      router.setParams({ pushMention: undefined });
    } catch (_) {}
  }, [pushMention, dispatch, t]);

  /** Load older pages until target message exists, then scroll (push deep link). */
  useEffect(() => {
    const midRaw = Array.isArray(highlightMessageId)
      ? highlightMessageId[0]
      : highlightMessageId;
    if (!midRaw || !socket || !roomId) {
      if (!midRaw) {
        highlightChaseEmitRef.current = 0;
        highlightMidRef.current = null;
      }
      return;
    }
    const mid = String(midRaw);
    if (highlightMidRef.current !== mid) {
      highlightMidRef.current = mid;
      highlightChaseEmitRef.current = 0;
    }

    if (!room || String(room._id) !== String(roomId)) return;

    const msgs = Object.values(room.messages || {});
    const found = msgs.some(
      (m) =>
        (m?._id != null && String(m._id) === mid) ||
        (m?.uuId != null && String(m.uuId) === mid)
    );

    const jump = threadPanelRoot
      ? threadJumpRef.current || jumpToMessageRef.current
      : jumpToMessageRef.current;
    if (found) {
      if (typeof jump === "function") {
        requestAnimationFrame(() => jump(mid));
        try {
          router.setParams({ highlightMessageId: undefined });
        } catch (_) {}
        highlightChaseEmitRef.current = 0;
        highlightMidRef.current = null;
      }
      return;
    }

    const cp = room.currentPage ?? 0;
    const hasMore = room.hasMore !== false;
    if (!hasMore || cp >= HIGHLIGHT_MAX_PAGES) {
      dispatch(
        addAlert({
          type: "warning",
          message:
            t("chat.quotedNotLoaded") ||
            "Original message is not loaded. Scroll up to load older messages.",
        })
      );
      try {
        router.setParams({ highlightMessageId: undefined });
      } catch (_) {}
      highlightChaseEmitRef.current = 0;
      highlightMidRef.current = null;
      return;
    }

    const nextPage = cp === 0 ? 1 : cp + 1;
    if (highlightChaseEmitRef.current >= nextPage) return;
    highlightChaseEmitRef.current = nextPage;
    socket.emit("getMessages", {
      room: roomId,
      page: nextPage,
      override: false,
    });
  }, [highlightMessageId, room, socket, roomId, threadPanelRoot, dispatch, t]);

  /** If message is in store before jumpToMessageRef is wired, retry briefly. */
  useEffect(() => {
    const midRaw = Array.isArray(highlightMessageId)
      ? highlightMessageId[0]
      : highlightMessageId;
    if (!midRaw || !room || String(room._id) !== String(roomId)) return;
    const mid = String(midRaw);
    const msgs = Object.values(room.messages || {});
    const found = msgs.some(
      (m) =>
        (m?._id != null && String(m._id) === mid) ||
        (m?.uuId != null && String(m.uuId) === mid)
    );
    const activeJumpRef = threadPanelRoot
      ? threadJumpRef.current || jumpToMessageRef.current
      : jumpToMessageRef.current;
    if (!found || typeof activeJumpRef === "function") return;

    let n = 0;
    const id = setInterval(() => {
      n += 1;
      const fn = threadPanelRoot
        ? threadJumpRef.current || jumpToMessageRef.current
        : jumpToMessageRef.current;
      if (typeof fn === "function") {
        requestAnimationFrame(() => fn(mid));
        try {
          router.setParams({ highlightMessageId: undefined });
        } catch (_) {}
        highlightChaseEmitRef.current = 0;
        highlightMidRef.current = null;
        clearInterval(id);
      } else if (n >= 40) {
        clearInterval(id);
      }
    }, 100);
    return () => clearInterval(id);
  }, [highlightMessageId, room, roomId, threadPanelRoot]);

  useEffect(() => {
    if (!socket) return;
    const activeRoomIdRaw = Array.isArray(roomId) ? roomId[0] : roomId;
    const activeRoomId = activeRoomIdRaw || room?._id || null;
    let onMessageSeen = null;
    let onReactToMessage = null;

    const decryptSocketMessageIfNeeded = async (incomingMessage, source) => {
      let payload = incomingMessage;
      if (incomingMessage?.e2ee?.ciphertext && socket && user?._id && activeRoomId) {
        try {
          let dk = e2eeDeviceKeysRef.current;
          if (!dk) {
            dk = await loadOrCreateDeviceKeys();
            e2eeDeviceKeysRef.current = dk;
          }
          payload = await tryDecryptChatMessage(
            incomingMessage,
            activeRoomId,
            room?.e2ee,
            socket,
            user._id,
            dk
          );
        } catch (_) {}
      }
      return payload;
    };

    // setTyping({ isTyping: false });
    if (socket) {
      socket.on("userJoin", (data) => {
        // showNotification("New Room Created", {
        //   body: "A new room has been created!",
        // });
      });

      socket.on("userLeft", (data) => {
        // console.log({ data });
      });

      onMessageSeen = async ({ message, room }) => {
        const payload = await decryptSocketMessageIfNeeded(message, "messageSeen");
        dispatch(
          updateMessage({
            ...payload,
            room: room,
          })
        );
      };

      socket.on("userStatusChange", (data) => {
        // console.log({ userStatusChange: data });
      });

      // socket.on("typing", (data) => {
      //   console.log({ typing: data, roomId: roomId });
      //   if (data.roomId !== roomId) return;
      //   setTyping(data);
      // });

      onReactToMessage = async ({ message, room }) => {
        const payload = await decryptSocketMessageIfNeeded(message, "reactToMessage");
        dispatch(
          updateMessage({
            ...payload,
            room: room,
          })
        );
      };
      socket.on("messageSeen", onMessageSeen);
      socket.on("reactToMessage", onReactToMessage);

      socket.on("clearChat", async (data) => {
        if (data.success) {
          await dispatch(clearMessages());
        }
      });
    }
    return () => {
      socket.off("userJoin");
      socket.off("userLeft");
      socket.off("messageSeen", onMessageSeen);
      socket.off("userStatusChange");
      // socket.off("typing");
      socket.off("reactToMessage", onReactToMessage);
      socket.off("deleteMessage");
      socket.off("clearChat");
      // setTyping({ isTyping: false });
      setSelectedMessage(null);
      setSelectedMessages([]);
    };
  }, [socket, roomId, room?._id, room?.e2ee, user?._id, dispatch]);

  const actualUnreadMessages = useMemo(() => {
    const uid = resolveMsgId(user?._id);
    return Object.values(room?.messages || {})
      .filter((msg) => {
        if (!msg || msg.call || msg.deletedForAll) return false;
        if (msg?.deletedForUsers?.includes?.(user?._id)) return false;
        if (resolveMessageSenderId(msg) === uid) return false;
        const seenByCurrentUser = (msg?.seenBy || []).some(
          (s) => resolveMsgId(s) === uid
        );
        return !seenByCurrentUser;
      })
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }, [room?.messages, user?._id]);

  const unreadPreviewText = useMemo(() => {
    if (!actualUnreadMessages.length) return "";
    const preview = actualUnreadMessages
      .slice(0, 2)
      .map((msg) => (msg?.text || "").trim())
      .filter(Boolean)
      .join(" • ");
    return preview;
  }, [actualUnreadMessages]);

  const scrollToEnd = () => {
    // console.log("Scrolling to end");
    // scrollViewRef.current?.scrollToEnd({ animated: true });
    // scroll to the start of the list
    scrollViewRef.current?.scrollToOffset({
      offset: 0,
      animated: true,
    });
  };

  const setMessageAndDraft = useCallback(
    (nextValue) => {
      setMessage((previousValue) => {
        const resolvedValue =
          typeof nextValue === "function" ? nextValue(previousValue) : nextValue;
        if (roomId) {
          dispatch(
            setRoomDraft({
              roomId,
              draft: resolvedValue || "",
            })
          );
        }
        return resolvedValue;
      });
    },
    [dispatch, roomId]
  );

  // const scrollToTop = () => {
  //   scrollViewRef.current?.scrollTo({ y: 0, animated: true });
  //   setIsScrollAtBottom(false); // Update state to indicate we are at the top
  // };
  // const toggleScroll = () => {
  //   if (isScrollAtBottom) {
  //     scrollToTop();
  //   } else {
  //     scrollToEnd();
  //   }
  // };

  const isInitialRender = useRef(true);
  const deleteMessage = ({ message, room }) => {
    dispatch(
      updateMessage({
        ...message,
        room: room,
      })
    );
    if (message.deletedForAll) {
      dispatch(
        updateMessage({
          ...message,
          room: room,
        })
      );
    }
    // // check if the message is last message in the room and update the room last message
    const roomMatch = rooms.find(
      (r) => String(r._id) === String(message?.room)
    );
    if (roomMatch?.lastMessage?._id === message?._id) {
      const newMessages = Object.values(roomMatch?.messages || {}).filter(
        (msg) =>
          msg._id !== message?._id &&
          !msg.deletedForAll &&
          !msg.deletedForUsers.includes(user?._id)
      );

      if (newMessages.length > 0) {
        dispatch(
          updateRooms({
            ...roomMatch,
            lastMessage: newMessages[newMessages.length - 1],
          })
        );
      }
    }
  };
  const [images, setImages] = useState([]);
  const [showImages, setShowImages] = useState(null);

  useEffect(() => {
    if (!socket) return;

    socket.on("deleteMessage", deleteMessage);
    setImages(
      Object.values(room?.messages || {})
        .filter(
          (message) =>
            !message.deletedForAll &&
            !message.deletedForUsers?.includes(user?._id) &&
            message?.type === "image"
        )
        .map((message) => ({
          url: (() => {
            const p = String(JSON.parse(message?.content)?.path || "");
            if (/^(https?:|file:)/i.test(p)) return p;
            return apiUrl + p;
          })(),
          path: JSON.parse(message?.content)?.path,
        }))
    );

    return () => {
      socket.off("deleteMessage", deleteMessage);
      setImages([]);
    };
  }, [rooms, socket]);

  //clear messages when user leaves the chat screen

  // useEffect(() => {
  //   const currentMessagesCount = Object.keys(messages).length;

  //   if (
  //     currentMessagesCount > 0 &&
  //     currentMessagesCount > previousMessagesCount.current
  //   ) {
  //     scrollViewRef.current?.scrollToEnd({ animated: true });
  //   }

  //   if (isInitialRender.current) {
  //     scrollViewRef.current?.scrollToEnd({ animated: true });
  //     isInitialRender.current = false;
  //   }

  //   previousMessagesCount.current = currentMessagesCount;
  // }, [messages, scrollViewRef]);

  useEffect(() => {
    if (roomId && socket) {
      // joinChat marks messages seen in DB; getOneRoom must run after it completes
      // or unread aggregation can race and return a stale high count.
      socket.emit("joinChat", { room: roomId }, () => {
        socket.emit("getOneRoom", {
          room: roomId,
          update: false,
          applyReadReceipts: true,
        });
      });

      console.log("✅ [ChatScreen] Joined chat and requested room data:", {
        roomId,
        socketId: socket.id,
      });
    }

    // // Prevent screenshots & screen recordings where supported
    // preventScreenCapture();

    // // Clean up and allow screenshots again when unmounted
    // return () => {
    //   allowScreenCapture();
    // };
  }, [roomId, socket]);

  const removeRoom = (data) => {
    if (roomId === data.room) {
      socket.emit("leaveRoom", { room: data.room });
      router.push("/chats");
    }
  };
  useEffect(() => {
    if (!socket) return;
    socket.on("removeRoom", removeRoom);
    return () => {
      socket.off("removeRoom", removeRoom);
    };
  }, [roomId, socket]);

  const [toggleCamera, setToggleCamera] = useState(false);
  const youBlockedUser = user?.blockedUsers?.includes(room?.members?.[0]?._id);
  const userBlockedYou = room?.members?.[0]?.blockedUsers?.includes(user?._id);

  const socketRef = useRef(socket);
  const roomIdRef = useRef(roomId);
  socketRef.current = socket;
  roomIdRef.current = roomId;

  const debouncedStopTypingRef = useRef(null);
  if (!debouncedStopTypingRef.current) {
    debouncedStopTypingRef.current = debounce(() => {
      const s = socketRef.current;
      if (!s) return;
      s.emit("typing", {
        roomId: roomIdRef.current,
        isTyping: false,
      });
    }, 3000);
  }
  const debouncedStopTyping = debouncedStopTypingRef.current;

  const handleTextChange = (text) => {
    setMessageAndDraft(text);
    if (socket) {
      // Emit typing event immediately
      socket.emit("typing", {
        roomId: roomId,
        isTyping: true,
      });
    }

    // Use the debounced function to emit stop typing event
    debouncedStopTyping();
  };

  useEffect(() => {
    if (!roomId) return;
    const draft = roomDrafts?.[String(roomId)] || "";
    setMessage(draft);
    setIsScrollAtBottom(true);
    setShowUnreadDivider(true);
  }, [roomId]);

  useEffect(() => {
    const resolvedRoomId = Array.isArray(roomId) ? roomId[0] : roomId;
    if (!resolvedRoomId) {
      setRoomResolveTimedOut(false);
      return;
    }
    if (room && String(room?._id) === String(resolvedRoomId)) {
      setRoomResolveTimedOut(false);
      return;
    }
    const timeoutId = setTimeout(() => {
      setRoomResolveTimedOut(true);
    }, 7000);
    return () => clearTimeout(timeoutId);
  }, [roomId, room?._id]);

  useEffect(() => {
    if (!roomId) return;
    const timeoutId = setTimeout(() => {
      setShowUnreadDivider(false);
    }, 5000);
    return () => clearTimeout(timeoutId);
  }, [roomId]);

  useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined") return;
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      if (room?._id) {
        dispatch(clearThreadPagination({ room: room._id }));
      }
      setThreadPanelRoot(null);
      setMsgToReply(null);
      setSelectedMessage(null);
      setSelectedMessages([]);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dispatch, room?._id]);

  const image = {
    uri: "https://i.pinimg.com/736x/37/c5/23/37c52312d234116ece6d6767310ec9b5.jpg",
  };
  const resolvedRoomId = Array.isArray(roomId) ? roomId[0] : roomId;

  if (!resolvedRoomId) {
    return (
      <View className="flex-1 w-full h-screen items-center justify-center bg-chatBgLight dark:bg-chatBgDark px-6">
        <Text className="text-base text-center text-slate-700 dark:text-slate-200 mb-4">
          {t("general.invalidRoom", { defaultValue: "Invalid chat room." })}
        </Text>
        <Button
          label={t("general.back") || "Back"}
          w="w-36"
          h="h-11"
          onPress={() => router.push("/chats")}
          mb="mb-0"
        />
      </View>
    );
  }

  if (!room || String(room?._id) !== String(resolvedRoomId)) {
    return (
      <View className="flex-1 w-full h-screen items-center justify-center bg-chatBgLight dark:bg-chatBgDark px-6">
        {!roomResolveTimedOut ? (
          <>
            <Text className="text-base text-center text-slate-700 dark:text-slate-200 mb-4">
              {t("general.loadingRoom", { defaultValue: "Opening chat..." })}
            </Text>
          </>
        ) : (
          <>
            <Text className="text-base text-center text-slate-700 dark:text-slate-200 mb-4">
              {t("general.roomUnavailable", {
                defaultValue: "This chat is unavailable or failed to load.",
              })}
            </Text>
            <View className="flex-row items-center gap-x-3">
              <Button
                label={t("general.retry") || "Retry"}
                w="w-32"
                h="h-11"
                onPress={() => {
                  setRoomResolveTimedOut(false);
                  socket?.emit("joinChat", { room: resolvedRoomId });
                  socket?.emit("getOneRoom", { room: resolvedRoomId });
                }}
                mb="mb-0"
              />
              <Button
                label={t("general.back") || "Back"}
                w="w-32"
                h="h-11"
                className="bg-slate-600"
                onPress={() => router.push("/chats")}
                mb="mb-0"
              />
            </View>
          </>
        )}
      </View>
    );
  }

  return (
    <>
      <Head>
        <title>Chat | Linker</title>
        <meta
          name="description"
          content="Chat with your friends on Linker. Enjoy seamless messaging and real-time conversations."
        />
      </Head>
      <View
        className="flex-1 w-full h-screen overflow-y-auto bg-chatBgLight dark:bg-chatBgDark md:max-w-4xl md:mx-auto lg:max-w-5xl"
        // make background image
      >
        {/* <VideoCallScreen socket={socket} user={user} room={room} /> */}
        {toggleCamera ? (
          <Cam
            toggleCamera={toggleCamera}
            setToggleCamera={setToggleCamera}
            setSelectedMessage={setSelectedMessage}
            message={message}
              setMessage={setMessageAndDraft}
            handleTextChange={handleTextChange}
            msgToReply={msgToReply}
            setMsgToReply={setMsgToReply}
            scrollToEnd={scrollToEnd}
          />
        ) : (
          <>
            <Modal
              showModal={showImages !== null}
              setShowModal={(val) => {
                if (!val) setShowImages(null);
              }}
              onCancel={() => setShowImages(null)}
              opacity="90"
              animationType="fade"
            >
              <ImageViewer
                renderArrowLeft={() => null}
                renderArrowRight={() => null}
                index={
                  images?.findIndex((image) => image?.path === showImages) || 0
                }
                imageUrls={images}
                renderHeader={() => (
                  <View
                    className={`relative flex-row items-center justify-end p-3`}
                  >
                    <TouchableOpacity
                      onPress={() => {
                        setShowImages(null);
                      }}
                    >
                      <FeIcon
                        name="x"
                        size={25}
                        color={isDarkColorScheme ? "#dee4e6" : "#2D2D37"}
                      />
                    </TouchableOpacity>
                  </View>
                )}
              />
            </Modal>
            <Header
              selectedMessages={selectedMessages}
              setSelectedMessages={setSelectedMessages}
              isInitialRender={isInitialRender}
              onJumpToMessageKey={(key) => jumpToMessageRef.current?.(key)}
            />

            <ImageBackground
              // source={image}
              resizeMode="cover"
              className="flex-1 w-full h-screen bg-chatBgLight dark:bg-chatBgDark"
            >
              <View className="flex-1 w-full px-1.5 pt-1">
              {!threadPanelRoot && (
                <PinnedMessagesBar
                  room={room}
                  onJumpToMessageKey={(key) => jumpToMessageRef.current?.(key)}
                />
              )}
              {threadPanelRoot ? (
                <ThreadMessagesPanel
                  rootMessage={threadPanelRoot}
                  onClose={() => setThreadPanelRoot(null)}
                  setSelectedMessage={setSelectedMessage}
                  selectedMessage={selectedMessage}
                  selectedMessages={selectedMessages}
                  setSelectedMessages={setSelectedMessages}
                  msgToReply={msgToReply}
                  setMsgToReply={setMsgToReply}
                  setShowImages={setShowImages}
                  onJumpToMessageReady={(fn) => {
                    threadJumpRef.current = fn;
                  }}
                />
              ) : (
                <MessageList
                  scrollViewRef={scrollViewRef}
                  setSelectedMessage={setSelectedMessage}
                  selectedMessage={selectedMessage}
                  selectedMessages={selectedMessages}
                  setSelectedMessages={setSelectedMessages}
                  msgToReply={msgToReply}
                  setMsgToReply={setMsgToReply}
                  setShowImages={setShowImages}
                  onLatestPositionChange={setIsScrollAtBottom}
                  onJumpToMessageReady={(fn) => {
                    jumpToMessageRef.current = fn;
                  }}
                  showUnreadDivider={showUnreadDivider}
                  onOpenThread={
                    chatFlags.threadsEnabled ? setThreadPanelRoot : undefined
                  }
                />
              )}
              </View>

              {!threadPanelRoot &&
                !isScrollAtBottom &&
                actualUnreadMessages.length > 0 && (
                <View
                  style={{
                    position: "absolute",
                    right: 12,
                    bottom: 74,
                    zIndex: 15,
                  }}
                >
                  <TouchableOpacity
                    onPress={() => {
                      scrollToEnd();
                    }}
                    style={{
                      backgroundColor: "#0ea5e9",
                      borderRadius: 999,
                      paddingHorizontal: 14,
                      paddingVertical: 9,
                      flexDirection: "row",
                      alignItems: "center",
                      shadowColor: "#0ea5e9",
                      shadowOpacity: 0.35,
                      shadowRadius: 10,
                      shadowOffset: { width: 0, height: 4 },
                    }}
                  >
                    <FeIcon name="arrow-down" size={16} color="#fff" />
                    <Text
                      style={{
                        color: "#fff",
                        marginLeft: 8,
                        fontWeight: "600",
                        fontSize: 12,
                      }}
                    >
                      {unreadPreviewText ||
                        `${actualUnreadMessages.length} ${
                          actualUnreadMessages.length === 1 ? "new" : "new"
                        }`}
                    </Text>
                  </TouchableOpacity>
                </View>
              )}

              <Footer
                setToggleCamera={setToggleCamera}
                toggleCamera={toggleCamera}
                setSelectedMessage={setSelectedMessage}
                message={message}
                setMessage={setMessageAndDraft}
                handleTextChange={handleTextChange}
                msgToReply={msgToReply}
                setMsgToReply={setMsgToReply}
                scrollToEnd={scrollToEnd}
                onJumpToQuotedMessage={(key) =>
                  threadPanelRoot
                    ? threadJumpRef.current?.(key)
                    : jumpToMessageRef.current?.(key)
                }
                activeThreadRootId={
                  threadPanelRoot
                    ? String(
                        threadPanelRoot.threadRoot || threadPanelRoot._id
                      )
                    : null
                }
              />
            </ImageBackground>
          </>
        )}
      </View>
    </>
  );
};

export default ChatScreen;
