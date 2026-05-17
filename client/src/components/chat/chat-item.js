import { View, Text, TouchableOpacity } from "react-native";
import React, { useContext, useEffect, useState, startTransition } from "react";
import UserImage from "../user-image";
import { UserDisplay } from "../user";
import trimMessage from "../../utils/trimMessage";
import moment from "moment";

import { useDispatch, useSelector } from "react-redux";
import { setRoom } from "../../redux/chatSlice";
import MDIcon from "react-native-vector-icons/MaterialIcons";
import ImagePlaceholder from "../image-placeholder";
import { SocketContext } from "../../contexts/socket.context"; // Import your icons as needed
import PdfIcon from "../../../assets/icons/pdf.svg";
import DocIcon from "../../../assets/icons/doc.svg";
import XlsIcon from "../../../assets/icons/xls.svg";
import TxtIcon from "../../../assets/icons/txt.svg";
import PptXIcon from "../../../assets/icons/pptx.svg";
import PptIcon from "../../../assets/icons/ppt.svg";

import AudioIcon from "../../../assets/icons/audio.svg";
import VideoIcon from "../../../assets/icons/video.svg";
import ZipIcon from "../../../assets/icons/zip.svg";
// import ExeIcon from "../../../assets/icons/exe.svg";
import IsoIcon from "../../../assets/icons/iso.svg";
import ApkIcon from "../../../assets/icons/apk.svg";
import JpgIcon from "../../../assets/icons/jpg.svg";
import WhiteLogo from "../../../assets/white-logo.svg";
import DarkLogo from "../../../assets/dark-logo.svg";
import { useTranslation } from "react-i18next";
import getFullName from "../../utils/getFullName";
import { useColorScheme } from "../../../lib/useColorScheme";
import { router } from "expo-router";
import FeIcon from "react-native-vector-icons/Feather";

// ["text", "image", "video", "audio", "document", "location", "reply", "forwarded", "linker"],
const getFileIconSource = (path) => {
  const extension = path?.split(".")?.pop();
  switch (extension) {
    case "pdf":
      return <PdfIcon width={20} height={20} />;
    case "doc":
    case "docx":
    case "docm":
    case "document":
      return <DocIcon width={20} height={20} />;
    case "xls":
    case "xlsx":
    case "sheet":
      return <ZipIcon width={20} height={20} />;
    case "ppt":
      return <PptIcon width={20} height={20} />;
    case "pptx":
      return <PptXIcon width={20} height={20} />;
    case "txt":
      return <TxtIcon width={20} height={20} />;
    case "mp3":
    case "wav":
    case "ogg":
    case "mp4a":
    case "webm":
      return <AudioIcon width={20} height={20} />;
    case "mp4":
    case "mov":
    case "avi":
      return <VideoIcon width={20} height={20} />;
    case "zip":
    case "rar":
    case "7z":
      return <ZipIcon width={20} height={20} />;
    case "exe":
      return <TxtIcon width={20} height={20} />;
    case "iso":
      return <IsoIcon width={20} height={20} />;
    case "apk":
      return <ApkIcon width={20} height={20} />;
    case "jpg":
    case "jpeg":
    case "png":
      return <JpgIcon width={20} height={20} />;
    default:
      return <TxtIcon width={20} height={20} />;
  }
};
const ChatItem = ({
  otherMember,
  lastMessage,
  room,
  setSelectedRooms,
  selectedRooms,
  isGroup,
  setLockModal,
}) => {
  const { user } = useSelector((state) => state.users);
  const { usersTyping } = useSelector((state) => state.chats);
  const { socket } = useContext(SocketContext);
  const { t } = useTranslation();
  const dispatch = useDispatch();
  const [e2eeLastPreview, setE2eeLastPreview] = useState(null);

  useEffect(() => {
    let cancelled = false;
    if (!lastMessage?.e2ee?.ciphertext || !room?._id) {
      startTransition(() => setE2eeLastPreview(null));
      return undefined;
    }
    (async () => {
      try {
        const [{ loadOrCreateDeviceKeys }, { getCachedRoomKey, ensureRoomKeyFromServer }, { tryDecryptChatMessage }] =
          await Promise.all([
            import("../../crypto/e2eeDevice"),
            import("../../crypto/e2eeRoom"),
            import("../../crypto/e2eeMessageHelpers"),
          ]);
        const keys = await loadOrCreateDeviceKeys();
        let cached = getCachedRoomKey(room._id);
        if (!cached?.key && socket && user?._id) {
          await ensureRoomKeyFromServer(socket, room._id, keys.x25519Priv, user._id);
          cached = getCachedRoomKey(room._id);
        }
        if (cancelled) return;
        if (!cached?.key) {
          startTransition(() => setE2eeLastPreview("🔒"));
          return;
        }
        const dm = await tryDecryptChatMessage(
          lastMessage,
          room._id,
          room?.e2ee,
          socket,
          user._id,
          keys
        );
        if (!cancelled) {
          startTransition(() => setE2eeLastPreview(dm?.text || "🔒"));
        }
      } catch {
        if (!cancelled) {
          startTransition(() => setE2eeLastPreview("🔒"));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    lastMessage?._id,
    lastMessage?.uuId,
    lastMessage?.e2ee?.ciphertext,
    room?._id,
    room?.e2ee?.keyVersion,
    socket,
    user?._id,
  ]);

  // const youBlockedUser = user?.blockedUsers?.includes(room?.members?.[0]?._id);
  // const userBlockedYou = room?.members?.[0]?.blockedUsers?.includes(user?._id);

  // Function to get typing indicator text
  const getTypingIndicator = () => {
    if (isGroup) {
      // Check which group members are typing
      const members = Array.isArray(room?.members) ? room.members : [];
      const typingMembers = members
        .filter((member) => usersTyping?.[`${member._id}_${room?._id}`])
        .map((member) => member?.firstName || t("general.user"));

      if (typingMembers?.length > 0) {
        return (
          <Text className={`text-sm text-chatAccent font-medium`}>
            {`${typingMembers.join(", ")} ${t("header.typingIndicator")}`}
          </Text>
        );
      }
    } else {
      // For one-on-one chat
      if (usersTyping?.[`${otherMember?._id}_${room?._id}`]) {
        return (
          <Text className={`text-sm text-chatAccent font-medium`}>
            {t("header.typingIndicator")}
          </Text>
        );
      }
    }
    return null;
  };
  const { isDarkColorScheme } = useColorScheme();
  const getCallEventPreview = () => {
    if (lastMessage?.type !== "call_event") return null;
    let callMeta = lastMessage?.callEvent || null;
    if (!callMeta && lastMessage?.content) {
      try {
        callMeta =
          typeof lastMessage.content === "string"
            ? JSON.parse(lastMessage.content)
            : lastMessage.content;
      } catch {
        callMeta = null;
      }
    }
    const status = callMeta?.eventKind || callMeta?.status || "answered";
    const isVideo = Boolean(callMeta?.isVideoCall);
    const duration = Number(callMeta?.duration || 0);
    const mins = Math.floor(duration / 60);
    const secs = duration % 60;
    const durationText = `${mins}:${secs.toString().padStart(2, "0")}`;
    const title = t(`call.events.${status}.title`);
    const mediaType = isVideo ? t("call.events.videoLabel") : t("call.events.voiceLabel");
    const summary =
      status === "answered" && duration > 0
        ? `${mediaType} • ${t("call.events.durationSummary", { duration: durationText })}`
        : mediaType;
    return (
      <View className="flex-row items-center gap-x-1">
        <FeIcon
          name={isVideo ? "video" : "phone"}
          size={14}
          color={isDarkColorScheme ? "#94a3b8" : "#64748b"}
        />
        <Text className="text-xs text-slate-600 dark:text-slate-400" numberOfLines={1}>
          {`${title} • ${summary}`}
        </Text>
      </View>
    );
  };
  return (
    <>
      <TouchableOpacity
        className={`w-full h-16 rounded-2xl relative
          bg-chatSurfaceLight dark:bg-chatSurfaceDark active:opacity-90
          ${
            selectedRooms?.includes(room?._id)
              ? "bg-slate-100 dark:bg-slate-800"
              : "hover:bg-slate-50 dark:hover:bg-slate-800/90"
          }
           mb-1 flex-row items-center justify-start px-2`}
        // ref={menuButtonRef}
        key={room?._id}
        onPress={async () => {
          if (selectedRooms.length > 0) {
            if (selectedRooms?.includes(room?._id)) {
              setSelectedRooms(
                selectedRooms.filter(
                  (selectedRoom) => selectedRoom !== room?._id
                )
              );
            } else {
              setSelectedRooms([...selectedRooms, room?._id]);
            }
            return;
          }
          if (
            room?.passwords?.find((password) => password?.user === user?._id)
          ) {
            setLockModal("enter");
            dispatch(setRoom(room));
          } else {
            await dispatch(setRoom(room));
            if (socket) {
              await socket.emit("getMessages", {
                room: room?._id,
                override: true,
              });
            }
            router.push({
              pathname: `/chats/${room?._id}`,
              params: { from: "chats" },
            });
          }
        }}
        onLongPress={() => {
          if (selectedRooms.length === 0) {
            setSelectedRooms([...selectedRooms, room?._id]);
          }
        }}
      >
        {isGroup ? (
          room?.image ? (
            <UserImage
              size="h-12 w-12"
              border="border-0"
              user={{
                images: [{ path: room?.image }],
              }}
              showStatus={false}
            />
          ) : (
            <ImagePlaceholder
              size="h-12 w-12"
              border="border-0"
                roomName={room?.name ?? t("general.groupChat")}
              isGroup
            />
          )
        ) : (
          <UserImage
            size="h-12 w-12"
            border="border-0"
            user={otherMember}
            onPress={async () => {
              router.push({
                pathname: `/profile/${otherMember?._id}`,
                params: { from: "chats" },
              });
            }}
          />
        )}
        <View className={`flex-row h-full py-1 items-end flex-1 w-full`}>
          <View
            className={`flex h-full items-start justify-between w-full px-2`}
          >
            {isGroup ? (
              <Text
                className="text-center text-slate-800 dark:text-slate-200"
              >
                {room?.name ?? t("general.groupChat")}
              </Text>
            ) : (
              <UserDisplay
                user={otherMember}
                showAvatar={false}
                showStatusDot={false}
                variant="compact"
                className="p-0 bg-transparent"
                primaryClassName="text-slate-800 dark:text-slate-200"
              />
            )}

            {getTypingIndicator()}
            {lastMessage && (
              <View className={`flex-row items-center justify-start w-full`}>
                {lastMessage?.type !== "linker" && (
                  <Text
                    className="text-xs text-slate-800 dark:text-slate-200"
                  >
                    {lastMessage?.user === user?._id
                      ? t("general.you")
                      : lastMessage?.user === otherMember?._id
                      ? ` ${getFullName(otherMember, true)} `
                      : ""}
                  </Text>
                )}
                {lastMessage.type === "call_event" ? (
                  getCallEventPreview()
                ) : lastMessage.type === "location" ? (
                  <View className={`flex-row items-center`}>
                    <MDIcon
                      name="location-pin"
                      size={18}
                      color={isDarkColorScheme ? "#EDF6F9" : "#023047"}
                    />
                    <Text
                      className="text-xs text-slate-600 dark:text-slate-400"
                    >
                      {t("chat.preview.location")}
                    </Text>
                  </View>
                ) : lastMessage?.type === "audio" ||
                  lastMessage?.type === "image" ? (
                  <View className={`flex-row items-center gap-x-1`}>
                    {lastMessage?.type === "audio" ? (
                      <AudioIcon width={18} height={18} />
                    ) : (
                      <JpgIcon width={18} height={18} />
                    )}
                    <Text
                      className="text-xs text-slate-600 dark:text-slate-400"
                    >
                      {lastMessage?.type === "audio"
                        ? t("chat.preview.audio")
                        : t("chat.preview.image")}
                    </Text>
                  </View>
                ) : lastMessage?.type === "file" ||
                  lastMessage?.type === "document" ||
                  lastMessage?.type === "video" ? (
                  <View className={`flex-row items-center gap-x-1`}>
                    {getFileIconSource(JSON.parse(lastMessage?.content)?.path)}
                    <Text
                      className="text-xs text-slate-600 dark:text-slate-400"
                    >
                      {JSON.parse(
                        lastMessage?.content
                      )?.originalname?.substring(0, 15) || t("general.unnamedFile")}
                    </Text>
                  </View>
                ) : lastMessage?.type === "linker" ? (
                  <View className={`flex-row items-center`}>
                    <View className={`flex-row items-center mr-1 mt-1`}>
                      {isDarkColorScheme ? (
                        <WhiteLogo width={25} height={14} />
                      ) : (
                        <DarkLogo width={25} height={14} />
                      )}
                    </View>

                    {lastMessage?.content &&
                      JSON.parse(lastMessage?.content) && (
                        <>
                          <Text
                            className="text-xs text-slate-600 dark:text-slate-400"
                          >
                            {JSON.parse(
                              lastMessage?.content
                            )?.userName.substring(0, 10)}
                          </Text>
                          <Text
                            className="text-xs text-slate-700 dark:text-slate-300"
                          >
                            {" "}
                          </Text>
                          <Text
                            className="text-xs text-slate-700 dark:text-slate-300"
                          >
                            {t(
                              `general.${
                                JSON.parse(lastMessage?.content)?.message
                              }`
                            )}
                          </Text>
                          {JSON.parse(lastMessage?.content)?.targetUserName && (
                            <>
                              <Text
                                className="text-xs text-slate-600 dark:text-slate-400"
                              >
                                {" "}
                                {
                                  JSON.parse(lastMessage?.content)
                                    ?.targetUserName
                                }
                              </Text>
                            </>
                          )}
                        </>
                      )}
                  </View>
                ) : (
                  <Text
                    className="text-xs text-slate-600 dark:text-slate-400"
                    numberOfLines={1}
                    ellipsizeMode="tail"
                  >
                    {trimMessage(
                      lastMessage?.e2ee?.ciphertext
                        ? e2eeLastPreview ?? "🔒"
                        : lastMessage.text,
                      10
                    )}
                  </Text>
                )}
              </View>
            )}
            {lastMessage && (
              <Text
                className="text-xs absolute right-0 top-1 text-slate-600 dark:text-slate-400"
              >
                {`${moment(lastMessage?.createdAt).format("HH:mm")} (${moment(
                  lastMessage?.createdAt
                ).fromNow()})`}
              </Text>
            )}
            {room?.passwords?.find(
              (password) => password?.user === user?._id
            ) && (
              <View
                className={`flex-row items-center absolute right-0 bottom-0`}
              >
                <FeIcon
                  name="lock"
                  size={18}
                  color={isDarkColorScheme ? "#EDF6F9" : "#023047"}
                />
              </View>
            )}
          </View>
        </View>
        {room?.unreadMessagesCount > 0 && (
          <View
            className={`absolute flex-row items-center justify-center w-6 h-6 ml-2 rounded-full bg-chatAccent right-1 bottom-1`}
          >
            <Text className={`text-[14px] text-center text-slate-100`}>
              {room?.unreadMessagesCount}
            </Text>
          </View>
        )}
        {/* <Dropdown
          showModal={menuVisible}
          setShowModal={setMenuVisible}
          menuPosition={menuPosition}
          options={[
            {
              name: "View Profile",
              // onPress: () => handleMenuOption("visitProfile"),
              onPress: () => {
              },
            },
            // {
            //   name: "Delete",
            //   onPress: () => handleMenuOption("deleteChat"),
            // },
            {
              name: "Clear",
              // onPress: () => handleMenuOption("clearChat"),
              onPress: () => {
              },
            },
            {
              name: youBlockedUser ? "Unblock" : "Block",
              // onPress: () => handleMenuOption("blockUser"),
              onPress: () => {
              },
            },

            {
              name: "Cancel",
              // onPress: () => setMenuVisible(false),
              onPress: () => {
              },
            },
          ]}
        /> */}
      </TouchableOpacity>
    </>
  );
};

export default ChatItem;
