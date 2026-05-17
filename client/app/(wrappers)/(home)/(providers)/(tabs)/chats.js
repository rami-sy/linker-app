import {
  FlatList,
  RefreshControl,
  Text,
  TouchableOpacity,
  View,
  I18nManager,
  Platform,
} from "react-native";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useDispatch, useSelector } from "react-redux";
import { useColorScheme } from "~/lib/useColorScheme";
import { useContext } from "react";
import { SocketContext } from "../../../../../src/contexts/socket.context";
import { MediasoupContext } from "../../../../../src/contexts/mediasoup.context";
import Layout from "../../../../../src/components/layout";
import FeIcon from "react-native-vector-icons/Feather";
import ChatItem from "../../../../../src/components/chat/chat-item";
import SearchBar from "../../../../../src/components/search-bar";
import CallHistoryItem from "../../../../../src/components/call/call-history-item";
import CallHistoryFilters from "../../../../../src/components/call/call-history-filters"; // ✅ Enhanced filters
import ContextMenu from "../../../../../src/components/context-menu";
import accessibility from "../../../../../src/utils/accessibility"; // ✅ Accessibility support
import { debounce, uniqBy } from "lodash";
import moment from "moment";
import { PAGE_SIZE } from "../../../../../src/constants";
import {
  setRooms,
  removeUserTyping,
  addUserTyping,
  updateRoom,
  setRoom,
  setFirstLoad,
  updateOrSetRooms,
} from "../../../../../src/redux/chatSlice";
// import Popup from "../../../components/popup";
import { useTranslation } from "react-i18next";
import Popup from "../../../../../src/components/popup";
import { Link, router } from "expo-router";
import { getLocales } from "expo-localization";
import * as Haptics from "expo-haptics";
import ChatLockPasswordModal from "../../../../../src/components/chat/chat-lock-password-modal";
import { addAlert } from "../../../../../src/redux/alertSlice";
import Head from "expo-router/head";

const ITEM_HEIGHT = 68; // قم بتحديد ارتفاع العنصر بشكل ثابت

const ChatList = ({}) => {
  const { t } = useTranslation();
  const { socket, searchGlobalMessages } = useContext(SocketContext);
  const { startCall } = useContext(MediasoupContext);
  const { user } = useSelector((state) => state.users);

  const { rooms, usersTyping, roomId, firstLoad } = useSelector(
    (state) => state.chats
  );
  const dispatch = useDispatch();
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [searching, setSearching] = useState(false);
  const [globalMessageMode, setGlobalMessageMode] = useState(false);
  const [globalMessageResults, setGlobalMessageResults] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedRooms, setSelectedRooms] = useState([]);
  const [deleteModal, setDeleteModal] = useState(false);
  const [lockModal, setLockModal] = useState(null);
  const isRTL = I18nManager.isRTL; // || getLocales()[0].textDirection === "rtl";

  const [password, setPassword] = useState("");
  
  // Call History State
  const [showCallHistory, setShowCallHistory] = useState(false);
  const [callHistory, setCallHistory] = useState([]);
  const [callHistoryLoading, setCallHistoryLoading] = useState(false);
  const [callHistoryPage, setCallHistoryPage] = useState(1);
  const [callHistoryHasMore, setCallHistoryHasMore] = useState(true);
  const [selectedCalls, setSelectedCalls] = useState([]);
  const [deleteCallModal, setDeleteCallModal] = useState(false);
  
  // Call History Search & Filter State
  const [callHistorySearch, setCallHistorySearch] = useState("");
  const [callHistoryQuery, setCallHistoryQuery] = useState("");
  const [callHistorySearching, setCallHistorySearching] = useState(false);
  const [callHistoryFilter, setCallHistoryFilter] = useState({
    type: "all", // "all", "video", "audio"
    status: "all", // "all", "answered", "missed", "rejected", "cancelled"
    direction: "all", // "all", "outgoing", "incoming"
  });
  const [groupByDate, setGroupByDate] = useState(true);

  // Debounced search for call history
  const debouncedCallHistorySearch = useCallback(
    debounce(async (text) => {
      setCallHistoryQuery(String(text || "").trim());
      setCallHistorySearching(false);
    }, 300),
    []
  );
  const getMyRooms = async (page, search) => {
    setLoading(true);
    if (socket) {
      socket.emit(
        "getMyRooms",
        {
          page,
          size: PAGE_SIZE,
          search,
        },
        handleGetRooms
      );
    }
  };

  const roomById = useMemo(() => {
    const map = new Map();
    (rooms || []).forEach((r) => {
      map.set(String(r?._id || ""), r);
    });
    return map;
  }, [rooms]);

  const handleGetRooms = (res) => {
    if (res.type === "success") {
      const newRooms = [...(res.data.length > 0 ? res.data : [])];
      const uniqueRooms = uniqBy([...rooms, ...newRooms], "_id");
      dispatch(updateOrSetRooms(page === 1 ? newRooms : uniqueRooms));
      setHasMore(res.data.length > 0);
      dispatch(setFirstLoad(true));
      setLoading(false);
    } else {
      setLoading(false);
    }
  };

  // ✅ جلب سجلات المكالمات (محسّن)
  const getCallHistory = (pageNum = 1) => {
    setCallHistoryLoading(true);
    if (socket) {
      socket.emit(
        "getCallHistory",
        {
          page: pageNum,
          limit: PAGE_SIZE,
          search: callHistoryQuery,
          includeTotal: pageNum === 1, // ✅ حساب total فقط في الصفحة الأولى
          filters: callHistoryFilter,
        },
        (res) => {
          if (res.type === "success") {
            const newCalls = res.data || [];
            if (pageNum === 1) {
              setCallHistory(newCalls);
            } else {
              setCallHistory((prev) => [...prev, ...newCalls]);
            }
            // ✅ استخدام hasMore من الـ response بدلاً من حسابها محلياً
            setCallHistoryHasMore(res.pagination?.hasMore ?? (newCalls.length === PAGE_SIZE));
            setCallHistoryLoading(false);
          } else {
            setCallHistoryLoading(false);
            dispatch(
              addAlert({
                message: res.message || "Failed to load call history",
                type: "error",
              })
            );
          }
        }
      );
    }
  };

  // عند فتح نافذة سجلات المكالمات
  useEffect(() => {
    if (!showCallHistory || callHistoryLoading) return;
    setCallHistoryPage(1);
    getCallHistory(1);
  }, [
    showCallHistory,
    callHistoryFilter.type,
    callHistoryFilter.status,
    callHistoryFilter.direction,
    callHistoryQuery,
  ]);

  useEffect(() => {
    if (!socket) return;
    const callEvents = [
      "callEnded",
      "callCancelled",
      "callRejected",
      "callMissed",
      "callInviteSummary",
      "roomUpdated",
      "callParticipantsSnapshot",
    ];
    const handlers = callEvents.map((eventName) => {
      const handler = () => {
        if (showCallHistory && !callHistoryLoading) {
          setCallHistoryPage(1);
          getCallHistory(1);
        }
      };
      socket.on(eventName, handler);
      return { eventName, handler };
    });

    return () => {
      handlers.forEach(({ eventName, handler }) => socket.off(eventName, handler));
    };
  }, [
    socket,
    showCallHistory,
    callHistoryLoading,
    callHistoryFilter,
    callHistoryQuery,
  ]);

  const handleCallHistoryLoadMore = () => {
    if (callHistoryLoading || !callHistoryHasMore) return;
    setCallHistoryPage((prev) => {
      const nextPage = prev + 1;
      getCallHistory(nextPage);
      return nextPage;
    });
  };

  // إعادة المكالمة
  const handleRedialCall = async (call) => {
    try {
      if (Platform.OS !== "web") {
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }

      if (!call?.room?._id) {
        dispatch(
          addAlert({
            message: "Cannot redial: Room information missing",
            type: "error",
          })
        );
        return;
      }

      const isCaller = call?.caller?._id === user?._id;
      const otherParticipants = call?.participants?.filter(
        (p) => p.user?._id !== user?._id
      ) || [];
      const displayUser = isCaller 
        ? (otherParticipants[0]?.user || call?.room?.members?.[0])
        : call?.caller;

      if (!displayUser) {
        dispatch(
          addAlert({
            message: "Cannot redial: User information missing",
            type: "error",
          })
        );
        return;
      }

      await startCall({
        roomId: call.room._id,
        userId: user?._id,
        userData: {
          images: user?.images,
          firstName: user?.firstName,
          lastName: user?.lastName,
          colors: user?.colors,
          _id: user?._id,
          email: user?.email,
          phoneNumber: user?.phoneNumber,
        },
        isVideoCall: call.isVideoCall || false,
      });
    } catch (error) {
      console.error('Error redialing call:', error);
      dispatch(
        addAlert({
          message: error.message || "Failed to redial call",
          type: "error",
        })
      );
    }
  };

  // الانتقال للدردشة من المكالمة
  const handleGoToChat = (call) => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }

    const rid = call?.room?._id;
    if (!rid) return;

    // call.room من سجل المكالمات بدون messages؛ setRoom بدون merge يمسح Redux messages.
    const { messages: _ignoreMessages, ...roomMeta } = call.room || {};
    dispatch(setRoom({ ...roomMeta, add: true }));
    if (socket) {
      socket.emit("getMessages", {
        room: rid,
        override: true,
      });
    }
    router.push({
      pathname: `/chats/${rid}`,
      params: { from: "callHistory" },
    });
  };

  // فلترة وبحث المكالمات
  const getFilteredCallHistory = () => {
    let filtered = [...callHistory];

    // البحث
    if (callHistorySearch.trim()) {
      const searchLower = callHistorySearch.toLowerCase();
      filtered = filtered.filter((call) => {
        const callerName = call?.caller?.firstName || call?.caller?.lastName || "";
        const roomName = call?.room?.name || "";
        const participantNames = call?.participants
          ?.map((p) => p.user?.firstName || p.user?.lastName || "")
          .join(" ") || "";
        
        return (
          callerName.toLowerCase().includes(searchLower) ||
          roomName.toLowerCase().includes(searchLower) ||
          participantNames.toLowerCase().includes(searchLower)
        );
      });
    }

    // فلترة حسب النوع
    if (callHistoryFilter.type !== "all") {
      filtered = filtered.filter((call) => {
        const isVideo =
          call?.isVideoCall === true || String(call?.isVideoCall) === "true";
        if (callHistoryFilter.type === "video") {
          return isVideo;
        } else if (callHistoryFilter.type === "audio") {
          return !isVideo;
        }
        return true;
      });
    }

    // فلترة حسب الحالة
    if (callHistoryFilter.status !== "all") {
      filtered = filtered.filter((call) => call.status === callHistoryFilter.status);
    }

    // فلترة حسب الاتجاه
    if (callHistoryFilter.direction !== "all") {
      filtered = filtered.filter((call) => {
        const isOutgoing =
          String(call?.caller?._id || "") === String(user?._id || "");
        if (callHistoryFilter.direction === "outgoing") {
          return isOutgoing;
        } else if (callHistoryFilter.direction === "incoming") {
          return !isOutgoing;
        }
        return true;
      });
    }

    return filtered;
  };

  // تجميع المكالمات حسب التاريخ
  const getGroupedCallHistory = () => {
    const filtered = getFilteredCallHistory();
    
    if (!groupByDate) {
      return { all: filtered };
    }

    const grouped = {};
    const today = moment().startOf('day');
    const thisWeek = moment().startOf('week');
    const thisMonth = moment().startOf('month');

    filtered.forEach((call) => {
      const callDate = moment(call.startedAt);
      let groupKey = "older";

      if (callDate.isSame(today, 'day')) {
        groupKey = "today";
      } else if (callDate.isAfter(thisWeek)) {
        groupKey = "thisWeek";
      } else if (callDate.isAfter(thisMonth)) {
        groupKey = "thisMonth";
      }

      if (!grouped[groupKey]) {
        grouped[groupKey] = [];
      }
      grouped[groupKey].push(call);
    });

    return grouped;
  };

  // console.log({ socket });

  useEffect(() => {
    if (!searching && !globalMessageMode) {
      getMyRooms(page, search);
    }
  }, [page, search, searching, socket, globalMessageMode]);

  const debouncedSearch = useCallback(
    debounce(async (text) => {
      const raw = String(text || "").trim();
      if (/^msg:/i.test(raw)) {
        const q = raw.replace(/^msg:/i, "").trim();
        setGlobalMessageMode(true);
        setPage(1);
        if (q.length < 2) {
          setGlobalMessageResults([]);
          setSearching(false);
          return;
        }
        if (searchGlobalMessages) {
          const res = await searchGlobalMessages({ query: q, limit: 30 });
          if (res?.type === "success" && Array.isArray(res?.messages)) {
            setGlobalMessageResults(res.messages);
          } else {
            setGlobalMessageResults([]);
          }
        }
      } else {
        setGlobalMessageMode(false);
        setGlobalMessageResults([]);
        getMyRooms(1, text);
      }
      setPage(1);
      setSearching(false);
    }, 1500),
    [getMyRooms, searchGlobalMessages]
  );

  const handleLoadMore = () => {
    if (loading || !hasMore) return;
    setPage((prev) => prev + 1);
  };

  const onRefresh = () => {
    setRefreshing(true);
    setPage(1);
    setTimeout(() => {
      setRefreshing(false);
    }, 1000); // Refresh indicator will be visible for at least 1 second
  };

  const pendingRemoveTimeoutsRef = useRef({});

  useEffect(() => {
    if (!socket) return;

    const handleTyping = (data) => {
      const key = `${data.userId}_${data.roomId}`;

      if (pendingRemoveTimeoutsRef.current[key]) {
        clearTimeout(pendingRemoveTimeoutsRef.current[key]);
        delete pendingRemoveTimeoutsRef.current[key];
      }

      dispatch((dispatch, getState) => {
        const state = getState();
        const stateKey = `${data.userId}_${data.roomId}`;

        if (state.chats.usersTyping[stateKey]?.timeoutId) {
          clearTimeout(state.chats.usersTyping[stateKey].timeoutId);
        }

        if (!data.isTyping) {
          const removeTimeoutId = setTimeout(() => {
            dispatch(
              removeUserTyping({ userId: data.userId, roomId: data.roomId })
            );
            delete pendingRemoveTimeoutsRef.current[key];
          }, 2000);
          pendingRemoveTimeoutsRef.current[key] = removeTimeoutId;
          return;
        }

        const timeoutId = setTimeout(() => {
          dispatch(
            removeUserTyping({ userId: data.userId, roomId: data.roomId })
          );
        }, 3000);

        dispatch(addUserTyping({ ...data, timeoutId }));
      });
    };

    socket.on("userTyping", handleTyping);
    return () => {
      socket.off("userTyping", handleTyping);
      Object.values(pendingRemoveTimeoutsRef.current).forEach(clearTimeout);
      pendingRemoveTimeoutsRef.current = {};
    };
  }, [rooms, socket, dispatch]);

  const setList = (e) => {
    dispatch(setRooms(e));
  };

  const { isDarkColorScheme } = useColorScheme();
  const visibleRooms =
    rooms.filter((room) => !room?.deletedForUsers?.includes(user?._id)) || [];
  return (
    <>
      <Head>
        <title>Chats | Linker</title>
        <meta
          name="description"
          content="Connect and chat with your friends on Linker. Enjoy seamless messaging and real-time conversations."
        />
      </Head>
      <Popup
        showModal={deleteModal}
        setShowModal={setDeleteModal}
        justify="justify-center"
        items="items-center"
        onCancel={() => setDeleteModal(false)}
        onClick={() => {
          setDeleteModal(false);
          selectedRooms.map((room) => {
            socket.emit("clearChat", {
              room: room,
            });
          });

          dispatch(
            setRooms(rooms.filter((room) => !selectedRooms.includes(room?._id)))
          );

          setSelectedRooms([]);
        }}
      >
        <Text className="text-base text-center text-slate-700 dark:text-slate-200">
          {t("general.deleteConfirmation")}
          {selectedRooms.length > 1
            ? " " + t("general.theseChats")
            : " " + t("general.thisChat")}
        </Text>
      </Popup>
      <Popup
        showModal={deleteCallModal}
        setShowModal={setDeleteCallModal}
        justify="justify-center"
        items="items-center"
        onCancel={() => setDeleteCallModal(false)}
        onClick={() => {
          setDeleteCallModal(false);
          let deletedCount = 0;
          const callsToDelete = [...selectedCalls];
          
          callsToDelete.forEach((callId) => {
            socket.emit("deleteCall", {
              callId: callId,
            }, (res) => {
              if (res.type === 'success') {
                deletedCount++;
                // تحديث القائمة بعد الحذف
                if (deletedCount === callsToDelete.length) {
                  setCallHistory(callHistory.filter((call) => !callsToDelete.includes(call?._id)));
                  setSelectedCalls([]);
                }
              } else {
                dispatch(
                  addAlert({
                    message: res.message || "Failed to delete call",
                    type: "error",
                  })
                );
              }
            });
          });
          
          // تحديث القائمة فوراً (optimistic update)
          setCallHistory(callHistory.filter((call) => !callsToDelete.includes(call?._id)));
          setSelectedCalls([]);
        }}
      >
        <Text className="text-base text-center text-slate-700 dark:text-slate-200">
          {t("general.deleteConfirmation")}
          {selectedCalls.length > 1
            ? " " + t("general.theseCalls") || " these calls"
            : " " + t("general.thisCall") || " this call"}
        </Text>
      </Popup>
      {lockModal && (
        <ChatLockPasswordModal
          mode={lockModal}
          password={password}
          onPasswordChange={setPassword}
          onClose={() => {
            setLockModal(null);
            setPassword("");
          }}
          onConfirm={async () => {
            if (lockModal === "add" || lockModal === "remove") {
              if (
                lockModal === "remove" &&
                password !==
                  rooms
                    .find((room) => room._id === selectedRooms[0])
                    ?.passwords?.find(
                      (password) => password?.user === user?._id
                    )?.password
              ) {
                setPassword("");
                dispatch(
                  addAlert({
                    message: t("general.passwordIsNotCorrect"),
                    type: "error",
                  })
                );
                return;
              }

              socket.emit(
                "setPassword",
                {
                  room: selectedRooms[0],
                  password,
                  type: lockModal,
                },
                (res) => {
                  if (res.type === "success") {
                    setLockModal(null);
                    dispatch(
                      updateRoom({
                        _id: res.data._id,
                        passwords: res.data.passwords,
                      })
                    );
                    setSelectedRooms([]);
                    setPassword("");
                    if (lockModal === "add") {
                      dispatch(
                        addAlert({
                          message: t("general.passwordAddedSuccessfully"),
                          type: "success",
                        })
                      );
                    }
                    if (lockModal === "remove") {
                      dispatch(
                        addAlert({
                          message: t("general.passwordRemovedSuccessfully"),
                          type: "success",
                        })
                      );
                    }
                  }
                }
              );
            } else if (lockModal === "enter") {
              if (
                password !==
                rooms
                  .find((room) => room._id === roomId)
                  ?.passwords?.find((password) => password?.user === user?._id)
                  ?.password
              ) {
                setPassword("");
                dispatch(
                  addAlert({
                    message: t("general.passwordIsNotCorrect"),
                    type: "error",
                  })
                );
                return;
              }
              if (socket) {
                await socket.emit("getMessages", {
                  room: roomId,
                  override: true,
                });
              }
              router.push({
                pathname: `/chats/${roomId}`,
                params: { from: "chats" },
              });
              setLockModal(null);
              setPassword("");
              setSelectedRooms([]);
            }
          }}
        />
      )}
      <Layout
        className="flex-1 w-full md:w-1/2 lg:w-1/2 bg-chatBgLight dark:bg-chatBgDark"
        navBar={
          <>
            {selectedRooms.length ? (
              <View className={`flex-row items-center justify-between w-full`}>
                <TouchableOpacity
                  className={`flex-row`}
                  onPress={() => {
                    setSelectedRooms([]);
                  }}
                >
                  {isRTL ? (
                    <FeIcon
                      name="chevron-right"
                      size={35}
                      color={isDarkColorScheme ? "#dee4e6" : "#2D2D37"}
                    />
                  ) : (
                    <FeIcon
                      name="chevron-left"
                      size={35}
                      color={isDarkColorScheme ? "#dee4e6" : "#2D2D37"}
                    />
                  )}
                  <Text className="text-lg text-placehoder dark:text-papaya">
                    {selectedRooms.length} {t("general.selected")}
                  </Text>
                </TouchableOpacity>
                <View className={`flex-row items-center`}>
                  {selectedRooms.length > 0 && selectedRooms.length < 2 && (
                    <TouchableOpacity
                      className={`ml-3`}
                      onPress={() => {
                        setLockModal(
                          rooms
                            .find((room) => room._id === selectedRooms[0])
                            ?.passwords?.find(
                              (password) => password?.user === user?._id
                            )
                            ? "remove"
                            : "add"
                        );
                      }}
                    >
                      <FeIcon
                        name={
                          rooms
                            .find((room) => room._id === selectedRooms[0])
                            ?.passwords?.find(
                              (password) => password?.user === user?._id
                            )
                            ? "unlock"
                            : "lock"
                        }
                        size={24}
                        color={isDarkColorScheme ? "#dee4e6" : "#2D2D37"}
                      />
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity
                    className={`ml-3`}
                    onPress={() => {
                      setDeleteModal(true);
                    }}
                  >
                    <FeIcon
                      name="trash"
                      size={24}
                      color={isDarkColorScheme ? "#dee4e6" : "#2D2D37"}
                    />
                  </TouchableOpacity>
                </View>
              </View>
            ) : selectedCalls.length > 0 && showCallHistory ? (
              <View className={`flex-row items-center justify-between w-full`}>
                <TouchableOpacity
                  className={`flex-row`}
                  onPress={() => {
                    setSelectedCalls([]);
                  }}
                >
                  {isRTL ? (
                    <FeIcon
                      name="chevron-right"
                      size={35}
                      color={isDarkColorScheme ? "#dee4e6" : "#2D2D37"}
                    />
                  ) : (
                    <FeIcon
                      name="chevron-left"
                      size={35}
                      color={isDarkColorScheme ? "#dee4e6" : "#2D2D37"}
                    />
                  )}
                  <Text className="text-lg text-placehoder dark:text-papaya">
                    {selectedCalls.length} {t("general.selected")}
                  </Text>
                </TouchableOpacity>
                <View className={`flex-row items-center`}>
                  <TouchableOpacity
                    className={`ml-3`}
                    onPress={() => {
                      setDeleteCallModal(true);
                    }}
                  >
                    <FeIcon
                      name="trash"
                      size={24}
                      color={isDarkColorScheme ? "#dee4e6" : "#2D2D37"}
                    />
                  </TouchableOpacity>
                </View>
              </View>
            ) : showCallHistory ? (
              <View className="flex-row items-center justify-between w-full">
                  <SearchBar
                    label={t("callHistory.searchPlaceholder")}
                    handleSearch={(text) => {
                      setCallHistorySearching(true);
                      setCallHistorySearch(text);
                      debouncedCallHistorySearch(text);
                    }}
                    search={callHistorySearch}
                    setSearch={setCallHistorySearch}
                    setList={() => {}}
                    searching={callHistorySearching}
                    setSearching={setCallHistorySearching}
                  />
                <View className="flex-row items-center gap-2">
                  <TouchableOpacity
                    onPress={() => {
                      router.push("/(wrappers)/(home)/(providers)/(tabs)/recordings");
                    }}
                    className="bg-chatAccent rounded-full h-10 w-10 items-center justify-center shadow-sm active:opacity-85"
                    accessibilityLabel={t("call.recording.title")}
                  >
                    <FeIcon name="mic" size={20} color="white" />
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => {
                      setShowCallHistory(false);
                      setSelectedCalls([]);
                      setCallHistorySearch("");
                      setCallHistoryQuery("");
                    }}
                    className="ml-1 bg-chatAccent rounded-full h-10 w-10 items-center justify-center shadow-sm active:opacity-85"
                  >
                    <FeIcon name="message-circle" size={22} color="white" />
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <View className="flex-row items-center justify-between w-full">
                <SearchBar
                  label={t("general.chats")}
                  handleSearch={debouncedSearch}
                  search={search}
                  setSearch={setSearch}
                  setList={setList}
                  searching={searching}
                  setSearching={setSearching}
                />
                <View className="flex-row items-center gap-2">
                  <TouchableOpacity
                    onPress={() => {
                      setShowCallHistory(true);
                      if (callHistory.length === 0) {
                        getCallHistory(1);
                      }
                    }}
                    className="ml-1 bg-chatAccent rounded-full h-10 w-10 items-center justify-center shadow-sm active:opacity-85"
                  >
                    <FeIcon name="phone" size={22} color="white" />
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </>
        }
      >
        {showCallHistory ? (
          // Call History View
          <>
            <CallHistoryFilters
              filter={callHistoryFilter}
              setFilter={setCallHistoryFilter}
            />

            {/* Call List */}
            {(() => {
              const filtered = getFilteredCallHistory();
              
              if (filtered.length === 0 && !callHistoryLoading) {
                return (
                  <View className={`items-center justify-center flex-1 py-20`}>
                    <FeIcon 
                      name="phone-off" 
                      size={48} 
                      color={isDarkColorScheme ? "#475569" : "#94a3b8"} 
                    />
                    <Text
                      className="w-9/12 text-base text-center mt-4 text-slate-600 dark:text-slate-400"
                    >
                      {callHistorySearch ||
                      callHistoryFilter.type !== "all" ||
                      callHistoryFilter.status !== "all" ||
                      callHistoryFilter.direction !== "all"
                        ? t("callHistory.noCallsMatchFilters")
                        : t("callHistory.noCalls")}
                    </Text>
                  </View>
                );
              }

              return (
                <FlatList
                  data={filtered}
                  className={`w-full p-0`}
                  contentContainerStyle={{ paddingHorizontal: 6, paddingBottom: 16 }}
                  keyExtractor={(item) => item?._id?.toString()}
                  renderItem={({ item }) => {
                    return (
                      <CallHistoryItem
                        call={item}
                        onPress={() => {
                          if (selectedCalls.length > 0) {
                            if (selectedCalls.includes(item._id)) {
                              setSelectedCalls(selectedCalls.filter(id => id !== item._id));
                            } else {
                              setSelectedCalls([...selectedCalls, item._id]);
                            }
                          } else {
                            handleRedialCall(item);
                          }
                        }}
                        onLongPress={() => {
                          if (Platform.OS !== "web") {
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                          }
                          if (selectedCalls.length === 0) {
                            setSelectedCalls([item._id]);
                          }
                        }}
                        selectedCalls={selectedCalls}
                        onGoToChat={() => handleGoToChat(item)}
                        onAvatarPress={() => handleGoToChat(item)}
                      />
                    );
                  }}
                  onEndReachedThreshold={0.1}
                  initialNumToRender={PAGE_SIZE}
                  onEndReached={handleCallHistoryLoadMore}
                  refreshControl={
                    <RefreshControl
                      refreshing={callHistoryLoading && callHistoryPage === 1}
                      onRefresh={() => {
                        setCallHistoryPage(1);
                        getCallHistory(1);
                      }}
                    />
                  }
                  ListFooterComponent={
                    callHistoryLoading && callHistoryPage > 1 ? (
                      <View className="py-4 items-center">
                        <Text
                          className="text-sm text-slate-600 dark:text-slate-400"
                        >
                          {t("callHistory.loadingMore")}
                        </Text>
                      </View>
                    ) : null
                  }
                />
              );
            })()}
          </>
        ) : (
          // Chats View
          <>
            {!searching &&
              !loading &&
              ((globalMessageMode && globalMessageResults.length === 0) ||
                (!globalMessageMode && visibleRooms.length === 0)) && (
                <View className={`items-center justify-center flex-1`}>
                  <FeIcon
                    name={globalMessageMode ? "search" : "message-circle"}
                    size={44}
                    color={isDarkColorScheme ? "#64748b" : "#94a3b8"}
                  />
                  <Text
                    className="w-9/12 mt-3 text-base text-center text-slate-800 dark:text-slate-200"
                  >
                    {globalMessageMode
                      ? t("chat.globalSearchNoResults", {
                          defaultValue: "No messages matched this query.",
                        })
                      : t("general.noChats")}
                  </Text>
                  {globalMessageMode ? (
                    <Text className="w-10/12 mt-2 text-sm text-center text-slate-600 dark:text-slate-400">
                      {t("chat.globalSearchHint", {
                        defaultValue:
                          "Use msg: before your text to search messages across all chats.",
                      })}
                    </Text>
                  ) : (
                    <>
                      <Text className="w-9/12 mt-2 text-sm text-center text-slate-600 dark:text-slate-400">
                        {t("chat.emptyHint")}
                      </Text>
                      <Text>{"\n"}</Text>
                      <Link href="/friends-list">
                        <Text
                          className="text-placehoder dark:text-papaya font-semibold"
                        >
                          {t("general.clickToGoToFriendsList")}
                        </Text>
                      </Link>
                    </>
                  )}
                </View>
              )}
            {loading && !globalMessageMode && visibleRooms.length === 0 && (
              <View className="w-full px-2 pt-2">
                {Array.from({ length: 6 }).map((_, idx) => (
                  <View
                    key={`chat-skeleton-${idx}`}
                    className="w-full h-16 rounded-2xl mb-2 bg-chatSurfaceLight dark:bg-chatSurfaceDark"
                  />
                ))}
              </View>
            )}
            <FlatList
              data={globalMessageMode ? globalMessageResults : visibleRooms}
              className={`w-full p-0`}
              keyExtractor={(item) =>
                String(item?._id || item?.uuId || `${item?.room}-${item?.createdAt}`)
              }
              renderItem={({ item }) => {
                if (globalMessageMode) {
                  const room = roomById.get(String(item?.room || ""));
                  const roomName =
                    room?.name ||
                    room?.members?.[0]?.userName ||
                    room?.members?.[0]?.firstName ||
                    t("general.chats");
                  const messageText = String(item?.text || "").trim();
                  return (
                    <TouchableOpacity
                      className="mx-2 mb-2 rounded-2xl px-3 py-2.5 border border-slate-200 dark:border-slate-700 bg-chatSurfaceLight dark:bg-chatSurfaceDark"
                      onPress={() => {
                        if (!item?.room) return;
                        router.push({
                          pathname: `/chats/${item.room}`,
                          params: {
                            highlightMessageId: String(item?._id || item?.uuId || ""),
                          },
                        });
                      }}
                    >
                      <Text className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                        {roomName}
                      </Text>
                      <Text
                        className="text-sm mt-1 text-slate-700 dark:text-slate-300"
                        numberOfLines={2}
                      >
                        {messageText ||
                          t("chat.scheduledMessageEmptyBody", {
                            defaultValue: "No text in this message.",
                          })}
                      </Text>
                      <Text className="text-[11px] mt-1 text-slate-500 dark:text-slate-400">
                        {moment(item?.createdAt).fromNow()}
                      </Text>
                    </TouchableOpacity>
                  );
                }
                const otherMember = item?.members?.[0];
                return (
                  <ChatItem
                    room={item}
                    otherMember={otherMember}
                    lastMessage={item?.lastMessage}
                    socket={socket}
                    setSelectedRooms={setSelectedRooms}
                    selectedRooms={selectedRooms}
                    isGroup={item?.isGroup}
                    setLockModal={setLockModal}
                  />
                );
                // } else {
                //   return (
                //     <View className={`flex-row items-center`}>
                //       <Text className={`text-lg font-bold text-slate-200`}>
                //         {t("general.groupChat")}
                //       </Text>
                //       {lastMessage && (
                //         <View className={`flex-row`}>
                //           <Text className={`text-base text-slate-400`}>
                //             {lastMessageSender}: {lastMessage}
                //           </Text>
                //           <Text className={`ml-2 text-base text-slate-400`}>
                //             {moment(lastMessageTime).fromNow()}
                //           </Text>
                //         </View>
                //       )}
                //     </View>
                //   );
                // }
              }}
              onEndReachedThreshold={0.1}
              initialNumToRender={PAGE_SIZE}
              onEndReached={handleLoadMore}
              refreshControl={
                <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
              }
              getItemLayout={(data, index) => ({
                length: ITEM_HEIGHT,
                offset: ITEM_HEIGHT * index,
                index,
              })}
            />
          </>
        )}
        <TouchableOpacity
          className={`absolute items-center justify-center w-12 h-12 rounded-full bg-emerald-700 bottom-20 right-5`}
          onPress={() => {
            router.push("/friends-list");
            if (socket) {
              socket.off("getMyRooms", handleGetRooms);
            }
          }}
        >
          <FeIcon
            name="plus"
            size={30}
            color="#dee4e6"
          />
        </TouchableOpacity>
      </Layout>
    </>
  );
};

export default ChatList;
