import {
  View,
  Text,
  TouchableOpacity,
  BackHandler,
  I18nManager,
  Animated,
} from "react-native";
import React, {
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  useMemo,
} from "react";
import { useDispatch, useSelector } from "react-redux";
import { addRoom, clearRoom, deleteRoom, setRoom } from "../../redux/chatSlice";
import { SocketContext } from "../../contexts/socket.context";
import Clipboard from "@react-native-clipboard/clipboard";
import { useTranslatedAttributes } from "../../constants";
import { addAlert } from "../../redux/alertSlice";
import { useTranslation } from "react-i18next";
import { postFile } from "../../api/files";
import { useColorScheme } from "../../../lib/useColorScheme";
import * as ImagePicker from "expo-image-picker";
import useSelectedRoom from "../../hooks/use-selected-room";
import useHeaderForwardList from "../../hooks/useHeaderForwardList";
import { MediasoupContext } from "../../contexts/mediasoup.context";
import { router, useLocalSearchParams } from "expo-router";
import logger from "../../utils/logger";
import {
  canPinInRoom,
  checkChatPermission,
  getUserRoleInRoom,
  isRoomOwner,
} from "../../utils/permissions";
import { shouldShowHeaderCallPulse } from "../../utils/roomActiveCall";
import useScheduledMessages from "../../hooks/useScheduledMessages";
import { buildHeaderMenuOptions } from "./header/buildHeaderMenuOptions";
import ChatHeaderBar from "./header/ChatHeaderBar";
import ChatHeaderModals from "./header/ChatHeaderModals";

const Header = React.memo(
  ({
    selectedMessages,
    setSelectedMessages,
    isInitialRender,
    onJumpToMessageKey,
  }) => {
    const {
      socket,
      sendMessage,
      emitWithAck,
      editMessage,
      pinRoomMessage,
      unpinRoomMessage,
      getScheduledMessages,
      cancelScheduledMessage,
      rescheduleScheduledMessage,
      retryAllFailedMessages,
      getChatSummary,
    } = useContext(SocketContext);
    const {
      startCall,
      isJoined,
      roomId: joinedCallRoomId,
      runPreCallReadiness,
    } =
      useContext(MediasoupContext);
    const { user } = useSelector((state) => state.users);
    const { usersTyping, rooms, roomId } = useSelector((state) => state.chats);
    const room = useSelectedRoom(); // Use the custom hook to get the selected room
    const { t, i18n } = useTranslation();
    const { PAGE_SIZE } = useTranslatedAttributes();

    const [forward, setForward] = useState(false);
    const [deleteModal, setDeleteModal] = useState(false);
    const [blockModal, setBlockModal] = useState(false);
    const [reportModal, setReportModal] = useState(false);
    const [inChatSearchOpen, setInChatSearchOpen] = useState(false);
    const [scheduledMessagesOpen, setScheduledMessagesOpen] = useState(false);
    const {
      messages: scheduledMessages,
      setMessages: setScheduledMessages,
      loading: scheduledMessagesLoading,
      e2eePlaintext: scheduledE2eePlaintext,
      decryptDone: scheduledDecryptDone,
    } = useScheduledMessages({
      open: scheduledMessagesOpen,
      room,
      socket,
      user,
      getScheduledMessages,
    });
    const [chatSummaryOpen, setChatSummaryOpen] = useState(false);
    const [chatSummaryData, setChatSummaryData] = useState(null);
    const [rescheduleMessage, setRescheduleMessage] = useState(null);
    const [editingMessage, setEditingMessage] = useState(null);
    const [clearChatModal, setClearChatModal] = useState(false);
    const [deleteChatModal, setDeleteChatModal] = useState(false);
    const [addMember, setAddMember] = useState(false);
    const [groupDetailsModal, setGroupDetailsModal] = useState(false); // New state for group details popup
    const [groupSettingsModal, setGroupSettingsModal] = useState(false); // New state for group settings popup
    const [callSettingsModal, setCallSettingsModal] = useState(false); // New state for call settings popup
    const [chatSettingsModal, setChatSettingsModal] = useState(false); // New state for chat settings popup
    const [showConfirmRole, setShowConfirmRole] = useState(false); // State for change role confirmation
    const [showDeleteMember, setShowDeleteMember] = useState(false); // State for delete member confirmation
    const [selectedMember, setSelectedMember] = useState(null); // State for selected member
    const [selectedNewRole, setSelectedNewRole] = useState(null); // State for selected new role in role change popup
    const [wasGroupDetailsModalOpen, setWasGroupDetailsModalOpen] = useState(false); // Track if group details modal was open
    const [showMuteModal, setShowMuteModal] = useState(false); // State for mute duration picker
    const [isChatMuted, setIsChatMuted] = useState(false); // State to track if chat is muted
    const [autoDeleteTimer, setAutoDeleteTimer] = useState(room?.autoDeleteTimer || null); // State for disappearing messages
    const [groupName, setGroupName] = useState(room?.name ?? ""); // State to handle group name
    const [returnToGroupDetails, setReturnToGroupDetails] = useState(false);
    const [lockModal, setLockModal] = useState(null);
    const [password, setPassword] = useState("");
    const [rejoinPanelOpen, setRejoinPanelOpen] = useState(false);
    const headerCallPulseAnim = useRef(new Animated.Value(1)).current;
    const { isDarkColorScheme } = useColorScheme();
    const dispatch = useDispatch();

    const forwardList = useHeaderForwardList({
      socket,
      PAGE_SIZE,
      selectedMessages,
      setSelectedMessages,
      sendMessage,
      rooms,
      user,
      setForward,
      t,
    });

    const buildChatSummary = useCallback(() => {
      const messages = Object.values(room?.messages || {})
        .filter((m) => m && !m.deletedForAll)
        .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
      const recentText = messages
        .filter((m) => m.type === "text" && typeof m.text === "string")
        .slice(-40);
      const recentCalls = messages
        .filter((m) => m.type === "call_event")
        .slice(-25);
      const totalText = recentText.length;
      const totalCalls = recentCalls.length;
      const combinedText = recentText.map((m) => String(m.text || "")).join(" ");
      const words = combinedText
        .toLowerCase()
        .replace(/[^a-z0-9\u0600-\u06ff\s]/gi, " ")
        .split(/\s+/)
        .filter((w) => w.length >= 4);
      const stopWords = new Set([
        "this",
        "that",
        "with",
        "from",
        "have",
        "will",
        "your",
        "about",
        "there",
        "would",
        "could",
        "please",
        "thanks",
      ]);
      const freq = new Map();
      words.forEach((w) => {
        if (stopWords.has(w)) return;
        freq.set(w, (freq.get(w) || 0) + 1);
      });
      const topTopics = [...freq.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([word]) => word);
      const actionItems = recentText
        .map((m) => String(m.text || "").trim())
        .filter((txt) => /(\?|please|todo|follow up|check|fix|review|action)/i.test(txt))
        .slice(-5);
      const callStatuses = recentCalls.reduce(
        (acc, m) => {
          const status = String(m?.metadata?.eventKind || m?.metadata?.status || "unknown");
          acc[status] = (acc[status] || 0) + 1;
          return acc;
        },
        {}
      );
      const answeredCount = Number(callStatuses.answered || 0);
      const missedCount = Number(callStatuses.missed || 0);
      const rejectedCount = Number(callStatuses.rejected || 0);
      const healthScoreBase = answeredCount + missedCount + rejectedCount;
      const callHealthScore =
        healthScoreBase > 0
          ? Math.max(
              0,
              Math.min(
                100,
                Math.round((answeredCount / healthScoreBase) * 100)
              )
            )
          : null;
      const callInsight = callHealthScore == null
        ? "No recent call trend."
        : callHealthScore >= 70
        ? "Call completion is healthy."
        : callHealthScore >= 40
        ? "Call completion is moderate; monitor rejected/missed calls."
        : "Call completion is low; check readiness and notification flow.";
      const callRecommendation =
        callHealthScore == null
          ? null
          : callHealthScore < 70
          ? "Consider running pre-call checks and review participant availability."
          : "Current call flow is stable.";
      return {
        generatedAt: new Date().toISOString(),
        textCount: totalText,
        callCount: totalCalls,
        topTopics,
        actionItems,
        callStatuses,
        callHealthScore,
        callInsight,
        callRecommendation,
      };
    }, [room?.messages]);

    const openChatSummary = useCallback(async () => {
      let summary = null;
      if (room?._id && getChatSummary) {
        const response = await getChatSummary({ room: room._id, windowSize: 240 });
        if (response?.type === "success" && response?.summary) {
          summary = response.summary;
          logger.chatEvent("chatSummaryFetchedFromServer", {
            roomId: String(room?._id || ""),
            cached: Boolean(response?.cached),
          });
        }
      }
      if (!summary) {
        summary = buildChatSummary();
        logger.chatEvent("chatSummaryFallbackLocal", {
          roomId: String(room?._id || ""),
        });
      }
      setChatSummaryData(summary);
      setChatSummaryOpen(true);
      logger.chatEvent("chatSummaryGenerated", {
        roomId: String(room?._id || ""),
        textCount: Number(summary?.textCount || 0),
        callCount: Number(summary?.callCount || 0),
      });
    }, [buildChatSummary, getChatSummary, room?._id]);

    const youBlockedUser = user?.blockedUsers?.includes(
      room?.members?.[0]?._id
    );
    const userBlockedYou = room?.members?.[0]?.blockedUsers?.includes(
      user?._id
    );
    const isRTL = I18nManager.isRTL; // || getLocales()[0].textDirection === "rtl";

    // Get other user's data for permission checking (for non-group chats)
    // Use useMemo to ensure re-evaluation when room.members changes
    const otherUser = useMemo(() => {
      if (!room || room?.isGroup) return null;
      const member = room?.members?.[0];
      // Return a new object reference to ensure re-evaluation
      // Include privacySettings.defaultChatSettings in the object to ensure re-evaluation
      return member ? { 
        ...member,
        privacySettings: member.privacySettings ? {
          ...member.privacySettings,
          defaultChatSettings: member.privacySettings.defaultChatSettings ? {
            ...member.privacySettings.defaultChatSettings,
          } : undefined,
        } : undefined,
      } : null;
    }, [
      room?.isGroup, 
      room?.members, 
      room?._id,
      room?.members?.[0]?._id,
      room?.members?.[0]?.privacySettings?.defaultChatSettings,
    ]);
    
    const otherUserRole = room?.isGroup ? getUserRoleInRoom(user?._id, room) : "member";
    const isFriend = user?.friends?.some(
      (friendId) => friendId?.toString() === otherUser?._id?.toString()
    ) || false;

    // Initialize selectedNewRole with current role when popup opens
    useEffect(() => {
      if (showConfirmRole && selectedMember && room) {
        const currentRole = room?.roles?.find(
          (role) => String(role.user) === String(selectedMember._id)
        )?.role || "member";
        setSelectedNewRole(currentRole);
      }
    }, [showConfirmRole, selectedMember, room]);

    // Auto-reopen group details modal when child modals close
    useEffect(() => {
      if (!showConfirmRole && !showDeleteMember && wasGroupDetailsModalOpen) {
        requestAnimationFrame(() => {
          setGroupDetailsModal(true);
          setWasGroupDetailsModalOpen(false);
        });
      }
    }, [showConfirmRole, showDeleteMember, wasGroupDetailsModalOpen]);

    const canEditSelectedMessage = useMemo(() => {
      if (selectedMessages?.length !== 1) return false;
      const msg = selectedMessages[0];
      if (!msg?._id || String(msg.user) !== String(user?._id)) return false;
      if (msg.type !== "text") return false;
      if (msg.deletedForAll) return false;
      if (msg.e2ee?.ciphertext) return false;
      const created = new Date(msg.createdAt).getTime();
      if (Number.isNaN(created)) return false;
      if (Date.now() - created > 15 * 60 * 1000) return false;
      return true;
    }, [selectedMessages, user?._id]);

    const pinEligible = useMemo(() => {
      if (selectedMessages?.length !== 1) return false;
      if (!canPinInRoom(user?._id, room)) return false;
      const msg = selectedMessages[0];
      if (!msg?._id || msg.deletedForAll) return false;
      return true;
    }, [selectedMessages, user?._id, room]);

    const selectedMessageIsPinned = useMemo(() => {
      if (selectedMessages?.length !== 1) return false;
      const id = String(selectedMessages[0]._id);
      const pins = room?.pinnedMessages || [];
      return pins.some((p) => String(p) === id);
    }, [selectedMessages, room?.pinnedMessages]);

    const failedMessagesCount = useMemo(() => {
      const myId = user?._id;
      if (!myId) return 0;
      return Object.values(room?.messages || {}).filter(
        (msg) =>
          String(msg?.user) === String(myId) && String(msg?.status) === "failed"
      ).length;
    }, [room?.messages, user?._id]);

    const handleRetryAllFailed = useCallback(async () => {
      if (!room?._id || !retryAllFailedMessages) return;
      const result = await retryAllFailedMessages({ roomId: room._id });
      if (result?.type !== "success") {
        dispatch(
          addAlert({
            type: "error",
            message: result?.message || t("chat.retryAllFailedError", {
              defaultValue: "Failed to retry messages.",
            }),
          })
        );
        return;
      }
      if (result.retried === 0) {
        dispatch(
          addAlert({
            type: "info",
            message: t("chat.retryAllFailedNone", {
              defaultValue: "No failed messages to retry.",
            }),
          })
        );
        return;
      }
      dispatch(
        addAlert({
          type: "success",
          message: t("chat.retryAllFailedSuccess", {
            defaultValue: "Retried {{count}} failed message(s).",
            count: result.retried,
          }),
        })
      );
    }, [dispatch, retryAllFailedMessages, room?._id, t]);

    const handlePinToggle = useCallback(async () => {
      if (!pinEligible || selectedMessages?.length !== 1) return;
      const msg = selectedMessages[0];
      const payload = { room: room._id, messageId: msg._id };
      const res = selectedMessageIsPinned
        ? await unpinRoomMessage(payload)
        : await pinRoomMessage(payload);
      if (res?.type === "success") {
        setSelectedMessages([]);
        dispatch(
          addAlert({
            type: "success",
            message: t(
              selectedMessageIsPinned ? "chat.unpinSuccess" : "chat.pinSuccess"
            ),
          })
        );
      } else {
        let errMsg = res?.message || "";
        if (
          /maximum pinned/i.test(errMsg) ||
          errMsg.includes("Maximum pinned")
        ) {
          errMsg = t("chat.maxPinsReached");
        } else if (!errMsg) {
          errMsg = t("chat.pinFailed");
        }
        dispatch(addAlert({ type: "error", message: errMsg }));
      }
    }, [
      pinEligible,
      selectedMessages,
      selectedMessageIsPinned,
      room?._id,
      pinRoomMessage,
      unpinRoomMessage,
      dispatch,
      t,
      setSelectedMessages,
    ]);

    // Debug: Log privacy settings (for both private and group chats)
    useEffect(() => {
      if (room?.isGroup) {
        // Group chat: log group settings and member settings
        logger.debug("Group chat settings:", {
          roomId: room?._id,
          isGroup: room?.isGroup,
          chatSettings: room?.chatSettings,
          membersCount: room?.members?.length,
          currentUserRole: otherUserRole,
        });
      } else if (otherUser) {
        // Private chat: log other user's privacy settings
        logger.debug("Other user privacy settings:", {
          userId: otherUser?._id,
          hasPrivacySettings: !!otherUser?.privacySettings,
          hasDefaultChatSettings: !!otherUser?.privacySettings?.defaultChatSettings,
          defaultChatSettings: otherUser?.privacySettings?.defaultChatSettings,
          videoCall: otherUser?.privacySettings?.defaultChatSettings?.videoCall,
          audioCall: otherUser?.privacySettings?.defaultChatSettings?.audioCall,
          sendFiles: otherUser?.privacySettings?.defaultChatSettings?.sendFiles,
          sendMedia: otherUser?.privacySettings?.defaultChatSettings?.sendMedia,
          roomMembersLength: room?.members?.length,
        });
      }
    }, [
      otherUser, 
      room?.isGroup, 
      otherUser?.privacySettings?.defaultChatSettings,
      room?.members,
      room?.members?.[0]?.privacySettings?.defaultChatSettings,
      room?.chatSettings,
      otherUserRole,
    ]);

    // Check permissions for video call
    // Uses checkChatPermission with the new signature
    // For private chats: checks otherUser.privacySettings.defaultChatSettings
    // For group chats: checks room.chatSettings
    const canVideoCall = useMemo(() => {
      if (room?.isGroup) {
        // Group chats: check room.chatSettings
        return checkChatPermission(
          user?._id?.toString(),
          room,
          "videoCall",
          { currentUser: user, otherUser: null }
        );
      }
      if (!otherUser) return false;
      
      // Private chats: check otherUser.privacySettings.defaultChatSettings
      return checkChatPermission(
        user?._id?.toString(),
        room,
        "videoCall",
        { currentUser: user, otherUser }
      );
    }, [
      room,
      room?.isGroup,
      room?.chatSettings,
      otherUser,
      otherUser?.privacySettings?.defaultChatSettings?.videoCall,
      otherUser?.privacySettings?.defaultChatSettings?.videoCallAllowedUsers,
      user?._id,
      user?.friends,
    ]);

    // Check permissions for audio call
    // Uses checkChatPermission with the new signature
    // For private chats: checks otherUser.privacySettings.defaultChatSettings
    // For group chats: checks room.chatSettings
    const canAudioCall = useMemo(() => {
      if (room?.isGroup) {
        // Group chats: check room.chatSettings
        return checkChatPermission(
          user?._id?.toString(),
          room,
          "audioCall",
          { currentUser: user, otherUser: null }
        );
      }
      if (!otherUser) return false;
      
      // Private chats: check otherUser.privacySettings.defaultChatSettings
      return checkChatPermission(
        user?._id?.toString(),
        room,
        "audioCall",
        { currentUser: user, otherUser }
      );
    }, [
      room,
      room?.isGroup,
      room?.chatSettings,
      otherUser,
      otherUser?.privacySettings?.defaultChatSettings?.audioCall,
      otherUser?.privacySettings?.defaultChatSettings?.audioCallAllowedUsers,
      user?._id,
      user?.friends,
    ]);

    const showHeaderCallPulse = useMemo(
      () => shouldShowHeaderCallPulse(room, isJoined, joinedCallRoomId),
      [room, isJoined, joinedCallRoomId]
    );

    useEffect(() => {
      if (!showHeaderCallPulse) {
        headerCallPulseAnim.setValue(1);
        return;
      }
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(headerCallPulseAnim, {
            toValue: 1.035,
            duration: 900,
            useNativeDriver: true,
          }),
          Animated.timing(headerCallPulseAnim, {
            toValue: 1,
            duration: 900,
            useNativeDriver: true,
          }),
        ])
      );
      loop.start();
      return () => {
        loop.stop();
        headerCallPulseAnim.setValue(1);
      };
    }, [showHeaderCallPulse, headerCallPulseAnim]);

    const blockedForCalls =
      youBlockedUser || userBlockedYou;
    const audioHeaderDisabled =
      blockedForCalls || (!showHeaderCallPulse && !canAudioCall);
    const videoHeaderDisabled =
      blockedForCalls || (!showHeaderCallPulse && !canVideoCall);

    const handleHeaderAudioPress = useCallback(async () => {
      if (blockedForCalls) return;
      if (showHeaderCallPulse) {
        setRejoinPanelOpen(true);
        return;
      }
      if (!canAudioCall) return;
      try {
        const readiness = await runPreCallReadiness?.({
          expectVideo: false,
        });
        if (!readiness?.ok) {
          dispatch(
            addAlert({
              type: "error",
              message: t("call.noMicrophoneAvailable", {
                defaultValue:
                  "No microphone detected. Please connect a microphone first.",
              }),
            })
          );
          return;
        }
        logger.debug("Starting audio call", { userId: user?._id });
        await startCall({
          roomId: room?._id,
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
          isVideoCall: false,
        });
      } catch (error) {
        logger.error("Failed to start audio call:", error);
      }
    }, [
      blockedForCalls,
      showHeaderCallPulse,
      canAudioCall,
      runPreCallReadiness,
      dispatch,
      t,
      startCall,
      room?._id,
      user,
    ]);

    const handleHeaderVideoPress = useCallback(async () => {
      if (blockedForCalls) return;
      if (showHeaderCallPulse) {
        setRejoinPanelOpen(true);
        return;
      }
      if (!canVideoCall) return;
      try {
        const readiness = await runPreCallReadiness?.({
          expectVideo: true,
        });
        if (!readiness?.ok) {
          dispatch(
            addAlert({
              type: "error",
              message: t("call.noMicrophoneAvailable", {
                defaultValue:
                  "No microphone detected. Please connect a microphone first.",
              }),
            })
          );
          return;
        }
        const allowVideo = Boolean(readiness?.joinWithVideo);
        if (!allowVideo) {
          dispatch(
            addAlert({
              type: "warning",
              message: t("call.videoUnavailableAcceptedAudio", {
                defaultValue:
                  "No camera was found, so the call will continue as audio.",
              }),
            })
          );
        }
        await startCall({
          roomId: room?._id,
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
          isVideoCall: allowVideo,
        });
      } catch (error) {
        logger.error("Failed to start video call:", error);
      }
    }, [
      blockedForCalls,
      showHeaderCallPulse,
      canVideoCall,
      runPreCallReadiness,
      dispatch,
      t,
      startCall,
      room?._id,
      user,
    ]);

    const handleCreateRoomWithMember = useCallback(
      (member) => {
        if (!socket || !member?._id) return;
        setGroupDetailsModal(false);
        dispatch(clearRoom());
        socket.emit(
          "createRoom",
          { receiverId: member._id },
          async (res) => {
            if (res?.type === "success") {
              dispatch(setRoom(res?.data));
              if (!rooms.find((r) => r._id === res?.data._id)) {
                dispatch(addRoom(res?.data));
              }
              if (
                res?.data?.passwords?.find(
                  (p) => p?.user === user?._id
                )
              ) {
                setLockModal("enter");
              } else {
                socket.emit("getMessages", {
                  room: res?.data._id,
                  override: true,
                });
                router.push(`/chats/${res?.data?._id}`);
              }
            } else {
              dispatch(
                addAlert({
                  type: "error",
                  message: res?.message || t("general.connectionError"),
                })
              );
            }
          }
        );
      },
      [socket, rooms, user?._id, dispatch, t]
    );

    const onDeleteMessage = async (forEveryOne = false) => {
      if (!selectedMessages.length) return;

      selectedMessages.forEach(async (message) => {
        if (socket) {
          await socket.emit("deleteMessage", {
            message: message?._id,
            room: room?._id,
            forEveryOne,
          });
        }
      });
      setSelectedMessages([]);
      setDeleteModal(false);
      dispatch(
        addAlert({
          message: t("header.deleteSuccess", {
            count: selectedMessages.length,
            plural: selectedMessages.length > 1 ? "s" : "",
          }),
          type: "success",
        })
      );
    };

    const copyMessages = async () => {
      const messagesText = selectedMessages
        .map((msg) => msg.text)
        .join("\r\n\r\n");

      Clipboard.setString(messagesText);
      setSelectedMessages([]);
      dispatch(
        addAlert({
          message: t("header.copySuccess", {
            count: selectedMessages.length,
            plural: selectedMessages.length > 1 ? "s" : "",
          }),
          type: "success",
        })
      );
    };

    // ✅ Mute/Unmute handlers
    const handleMuteChat = useCallback((duration = null) => {
      if (!socket || !room?._id) return;
      
      socket.emit("muteChat", {
        roomId: room._id,
        duration, // null = forever, or ms (3600000 = 1hr, 28800000 = 8hr, 86400000 = 1day, 604800000 = 1week)
      });
      
      setIsChatMuted(true);
      setShowMuteModal(false);
      dispatch(
        addAlert({
          message: t("header.chatMuted") || "Chat muted",
          type: "success",
        })
      );
    }, [socket, room?._id, dispatch, t]);

    const handleUnmuteChat = useCallback(() => {
      if (!socket || !room?._id) return;
      
      socket.emit("unmuteChat", {
        roomId: room._id,
      });
      
      setIsChatMuted(false);
      dispatch(
        addAlert({
          message: t("header.chatUnmuted") || "Chat unmuted",
          type: "success",
        })
      );
    }, [socket, room?._id, dispatch, t]);

    // Check if chat is muted on room change
    useEffect(() => {
      // Check if current room is in user's mutedChats
      const mutedEntry = user?.mutedChats?.find(
        (m) => m.roomId?.toString() === room?._id?.toString()
      );
      
      if (mutedEntry) {
        // Check if mute has expired
        if (mutedEntry.until && new Date(mutedEntry.until) < new Date()) {
          setIsChatMuted(false);
        } else {
          setIsChatMuted(true);
        }
      } else {
        setIsChatMuted(false);
      }
    }, [room?._id, user?.mutedChats]);

    // Mute durations for the picker
    const muteDurations = useMemo(() => [
      { label: t("header.mute1Hour") || "1 hour", value: 3600000 },
      { label: t("header.mute8Hours") || "8 hours", value: 28800000 },
      { label: t("header.mute1Day") || "1 day", value: 86400000 },
      { label: t("header.mute1Week") || "1 week", value: 604800000 },
      { label: t("header.muteForever") || "Until I turn it back on", value: null },
    ], [t]);

    // Auto delete timer options (Disappearing Messages)
    const autoDeleteOptions = useMemo(() => [
      { label: t("chatSettingsScreen.autoDelete.off") || "Off", value: null },
      { label: t("chatSettingsScreen.autoDelete.24hours") || "24 hours", value: 86400 },
      { label: t("chatSettingsScreen.autoDelete.7days") || "7 days", value: 604800 },
      { label: t("chatSettingsScreen.autoDelete.90days") || "90 days", value: 7776000 },
    ], [t]);

    // Update autoDeleteTimer
    const updateAutoDeleteTimer = useCallback((value) => {
      setAutoDeleteTimer(value);
      
      if (socket && room?._id) {
        socket.emit("updateRoom", {
          room: room._id,
          data: { autoDeleteTimer: value },
        });
        dispatch(
          addAlert({
            message: t("header.disappearingMessagesUpdated") || "Disappearing messages updated",
            type: "success",
          })
        );
      }
    }, [socket, room?._id, dispatch, t]);

    // Get display text for autoDeleteTimer
    const getAutoDeleteDisplayText = useMemo(() => {
      const option = autoDeleteOptions.find(opt => opt.value === autoDeleteTimer);
      return option?.label || (t("chatSettingsScreen.autoDelete.off") || "Off");
    }, [autoDeleteTimer, autoDeleteOptions, t]);

    // Sync autoDeleteTimer with room changes
    useEffect(() => {
      setAutoDeleteTimer(room?.autoDeleteTimer || null);
    }, [room?.autoDeleteTimer]);

    // ✅ Check if user can modify disappearing messages
    const canModifyDisappearingMessages = useMemo(() => {
      // Owner can always modify
      if (isRoomOwner(user?._id, room)) return true;
      
      // Check chatSettings.disappearingMessages permission (pass currentUser for friends check)
      return checkChatPermission(user?._id, room, "disappearingMessages", { currentUser: user });
    }, [user?._id, room, user]);

    // ✅ Check if user can add members
    const canAddMembers = useMemo(() => {
      // Owner can always add members
      if (isRoomOwner(user?._id, room)) return true;
      
      // Check chatSettings.addMembers permission
      return checkChatPermission(user?._id, room, "addMembers", { currentUser: user });
    }, [user?._id, room, user]);

    const handleMenuOption = useCallback(
      (option) => {
        switch (option) {
          case "clearChat":
            setClearChatModal(true);
            break;
          case "deleteChat":
            setDeleteChatModal(true);
            break;
          case "blockUser":
            setBlockModal(true);
            break;
          case "addMember":
            setAddMember(true);
            break;
          case "visitProfile":
            router.push({
              pathname: `/profile/${room?.members?.[0]?._id}`,
              params: {
                from: `chats/${room?._id}`,
              },
            });
            break;
          case "scheduledMessages":
            setScheduledMessagesOpen(true);
            break;
          default:
            break;
        }
      },
      [dispatch, router, room]
    );

    const handleAddMember = async (item) => {
      if (socket) {
        socket.emit("addMemberToRoom", {
          room: room?._id,
          newMember: item?._id,
        });
      } else {
        dispatch(
          addAlert({
            message: t("general.connectionError"),
            type: "error",
          })
        );
      }
      setAddMember(false);
    };
    const { from } = useLocalSearchParams();
    logger.debug("Navigation from", { from });

    const getSafeFromRoute = useCallback((rawFrom) => {
      const fromValue = Array.isArray(rawFrom) ? rawFrom[0] : rawFrom;
      if (typeof fromValue !== "string") return null;
      const normalized = fromValue.trim().replace(/^\/+/, "");
      if (!normalized) return null;

      // Guard against invalid pseudo-routes injected from call flows.
      if (normalized.toLowerCase() === "incomingcall") return null;

      const allowedRoots = ["chats", "explore", "swiper", "live-streams", "user", "profile"];
      const root = normalized.split("/")[0];
      if (!allowedRoots.includes(root)) return null;
      return `/${normalized}`;
    }, []);

    const navigateBackSafely = useCallback(() => {
      const safeFromRoute = getSafeFromRoute(from);
      if (safeFromRoute) {
        router.push(safeFromRoute);
        return;
      }
      if (router.canGoBack()) {
        router.back();
      } else {
        router.push("/chats");
      }
    }, [from, getSafeFromRoute, router]);

    const headerMenuOptions = useMemo(
      () =>
        buildHeaderMenuOptions({
          t,
          room,
          handleMenuOption,
          handleRetryAllFailed,
          failedMessagesCount,
          openChatSummary,
          setInChatSearchOpen,
          onJumpToMessageKey,
          setGroupSettingsModal,
          setGroupDetailsModal,
          setCallSettingsModal,
          setChatSettingsModal,
          canAddMembers,
          isChatMuted,
          handleUnmuteChat,
          setShowMuteModal,
          getAutoDeleteDisplayText,
          autoDeleteOptions,
          updateAutoDeleteTimer,
          autoDeleteTimer,
          canModifyDisappearingMessages,
          youBlockedUser,
          setReportModal,
          socket,
          setSelectedMessages,
          navigateBackSafely,
          router,
        }),
      [
        t,
        room,
        handleMenuOption,
        handleRetryAllFailed,
        failedMessagesCount,
        openChatSummary,
        onJumpToMessageKey,
        canAddMembers,
        isChatMuted,
        handleUnmuteChat,
        getAutoDeleteDisplayText,
        autoDeleteOptions,
        updateAutoDeleteTimer,
        autoDeleteTimer,
        canModifyDisappearingMessages,
        youBlockedUser,
        socket,
        navigateBackSafely,
      ]
    );

    const getGroupTypingIndicator = () => {
      const members = Array.isArray(room?.members) ? room.members : [];
      const typingMembers = members
        .filter((member) => usersTyping?.[`${member._id}_${room?._id}`])
        .map((member) => member?.firstName || t("general.user"));

      if (typingMembers.length > 0) {
        return (
          <Text className={`ml-2 text-sm text-chatAccent`}>
            {`${typingMembers.join(", ")} ${t("header.typingIndicator")}`}
          </Text>
        );
      } else {
        return (
          <TouchableOpacity
            onPress={() => setGroupDetailsModal(true)}
            activeOpacity={0.7}
          >
            <Text
              className="ml-2 text-sm text-slate-600 dark:text-slate-300"
            >
              {members.length + 1}
              {members.length > 1
                ? ` ${t("general.members")}`
                : ` ${t("general.member")}`}
            </Text>
          </TouchableOpacity>
        );
      }
    };

    const handleGroupImageClick = () => {
      setGroupSettingsModal(true);
    };
    const [editRoom, setEditeRoom] = useState(false);
    const handleSaveGroupName = async () => {
      try {
        if (socket) {
          socket.emit("updateRoom", {
            room: room?._id,
            data: { name: groupName },
          });
          // dispatch(setRoom({ ...room, name: groupName }));
        } else {
          dispatch(
            addAlert({
              message: t("general.connectionError"),
              type: "error",
            })
          );
        }
      } catch (error) {
        logger.error("Error updating group name:", error);
      }
    };
    const pickImage = async () => {
      // No permissions request is necessary for launching the image library
      let result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.All,
        allowsEditing: true,
        aspect: [4, 3],
        quality: 1,
        base64: true,
      });

      if (!result.assets?.[0]?.uri) return;
      const res = await postFile(result.assets[0].uri);

      if (res.type === "success") {
        if (socket) {
          socket.emit("updateRoom", {
            room: room?._id,
            data: { image: res.data.path },
          });
          // dispatch(setRoom({ ...room, image: res.data.path }));
        } else {
          dispatch(
            addAlert({
              message: t("general.connectionError"),
              type: "error",
            })
          );
        }
      }
    };

    return (
      <>
        <ChatHeaderModals
          forward={forward}
          setForward={setForward}
          forwardList={forwardList}
          deleteModal={deleteModal}
          setDeleteModal={setDeleteModal}
              selectedMessages={selectedMessages}
              onDeleteMessage={onDeleteMessage}
          addMember={addMember}
          setAddMember={setAddMember}
              handleAddMember={handleAddMember}
          blockModal={blockModal}
          setBlockModal={setBlockModal}
              youBlockedUser={youBlockedUser}
          reportModal={reportModal}
          setReportModal={setReportModal}
          inChatSearchOpen={inChatSearchOpen}
          setInChatSearchOpen={setInChatSearchOpen}
          onJumpToMessageKey={onJumpToMessageKey}
          scheduledMessagesOpen={scheduledMessagesOpen}
          setScheduledMessagesOpen={setScheduledMessagesOpen}
          scheduledMessages={scheduledMessages}
          setScheduledMessages={setScheduledMessages}
          scheduledMessagesLoading={scheduledMessagesLoading}
          scheduledE2eePlaintext={scheduledE2eePlaintext}
          scheduledDecryptDone={scheduledDecryptDone}
          setRescheduleMessage={setRescheduleMessage}
          cancelScheduledMessage={cancelScheduledMessage}
          chatSummaryOpen={chatSummaryOpen}
          setChatSummaryOpen={setChatSummaryOpen}
          chatSummaryData={chatSummaryData}
          openChatSummary={openChatSummary}
          rescheduleMessage={rescheduleMessage}
          rescheduleScheduledMessage={rescheduleScheduledMessage}
          editingMessage={editingMessage}
          setEditingMessage={setEditingMessage}
          setSelectedMessages={setSelectedMessages}
          clearChatModal={clearChatModal}
          setClearChatModal={setClearChatModal}
          deleteChatModal={deleteChatModal}
          setDeleteChatModal={setDeleteChatModal}
          showMuteModal={showMuteModal}
          setShowMuteModal={setShowMuteModal}
          muteDurations={muteDurations}
          handleMuteChat={handleMuteChat}
          lockModal={lockModal}
          setLockModal={setLockModal}
              password={password}
          setPassword={setPassword}
          rooms={rooms}
          roomId={roomId}
          groupDetailsModal={groupDetailsModal}
              setGroupDetailsModal={setGroupDetailsModal}
          showConfirmRole={showConfirmRole}
              setShowConfirmRole={setShowConfirmRole}
          showDeleteMember={showDeleteMember}
              setShowDeleteMember={setShowDeleteMember}
          selectedMember={selectedMember}
              setSelectedMember={setSelectedMember}
          selectedNewRole={selectedNewRole}
          setSelectedNewRole={setSelectedNewRole}
              setWasGroupDetailsModalOpen={setWasGroupDetailsModalOpen}
          handleCreateRoomWithMember={handleCreateRoomWithMember}
          returnToGroupDetails={returnToGroupDetails}
          setReturnToGroupDetails={setReturnToGroupDetails}
          groupSettingsModal={groupSettingsModal}
          setGroupSettingsModal={setGroupSettingsModal}
              groupName={groupName}
              setGroupName={setGroupName}
              editRoom={editRoom}
          setEditeRoom={setEditeRoom}
              pickImage={pickImage}
              handleSaveGroupName={handleSaveGroupName}
          callSettingsModal={callSettingsModal}
          setCallSettingsModal={setCallSettingsModal}
          chatSettingsModal={chatSettingsModal}
          setChatSettingsModal={setChatSettingsModal}
          rejoinPanelOpen={rejoinPanelOpen}
          setRejoinPanelOpen={setRejoinPanelOpen}
          room={room}
          user={user}
          socket={socket}
          dispatch={dispatch}
          emitWithAck={emitWithAck}
          editMessage={editMessage}
          t={t}
          i18n={i18n}
          isDarkColorScheme={isDarkColorScheme}
          addAlert={addAlert}
        />

        <ChatHeaderBar
                room={room}
          user={user}
          usersTyping={usersTyping}
          isRTL={isRTL}
          isDarkColorScheme={isDarkColorScheme}
          t={t}
          socket={socket}
          dispatch={dispatch}
          deleteRoom={deleteRoom}
          clearRoom={clearRoom}
          isInitialRender={isInitialRender}
          setSelectedMessages={setSelectedMessages}
          navigateBackSafely={navigateBackSafely}
          handleGroupImageClick={handleGroupImageClick}
          getGroupTypingIndicator={getGroupTypingIndicator}
          selectedMessages={selectedMessages}
          copyMessages={copyMessages}
          canEditSelectedMessage={canEditSelectedMessage}
          setEditingMessage={setEditingMessage}
          pinEligible={pinEligible}
          handlePinToggle={handlePinToggle}
          selectedMessageIsPinned={selectedMessageIsPinned}
          setForward={setForward}
          forward={forward}
          setDeleteModal={setDeleteModal}
          headerMenuOptions={headerMenuOptions}
          showHeaderCallPulse={showHeaderCallPulse}
          headerCallPulseAnim={headerCallPulseAnim}
          audioHeaderDisabled={audioHeaderDisabled}
          videoHeaderDisabled={videoHeaderDisabled}
          handleHeaderAudioPress={handleHeaderAudioPress}
          handleHeaderVideoPress={handleHeaderVideoPress}
        />
      </>
    );
  }
);

export default Header;
