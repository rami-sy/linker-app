import {
  View,
  Text,
  TouchableOpacity,
  BackHandler,
  I18nManager,
  Animated,
  ScrollView,
  Platform,
  ActivityIndicator,
} from "react-native";
import React, {
  lazy,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  useMemo,
} from "react";
import { useDispatch, useSelector } from "react-redux";
import UserImage from "../user-image";
import { UserDisplay } from "../user";
import FeIcon from "react-native-vector-icons/Feather";
import Icon from "react-native-vector-icons/Ionicons";

import _, { uniqBy, debounce } from "lodash";
import { addRoom, clearRoom, deleteRoom, setRoom } from "../../redux/chatSlice";
import { SocketContext } from "../../contexts/socket.context";
import Clipboard from "@react-native-clipboard/clipboard";
import { useTranslatedAttributes } from "../../constants";
import { addAlert } from "../../redux/alertSlice";
import ImagePlaceholder from "../image-placeholder";
import { useTranslation } from "react-i18next";
import { postFile } from "../../api/files";
import { useColorScheme } from "../../../lib/useColorScheme";
import * as ImagePicker from "expo-image-picker";
import useSelectedRoom from "../../hooks/use-selected-room";
import { MediasoupContext } from "../../contexts/mediasoup.context";
import SuspenseWrapper from "../../hoc/suspense-wrapper";
import TimeAgo from "../time-ago";
import Privacy from "../privacy";
import { router, useLocalSearchParams } from "expo-router";
import { getLocales } from "expo-localization";
import ContextMenu from "../context-menu";
import logger from "../../utils/logger";
import Popup from "../popup";
import Input from "../input";
import Button from "../button";
import DateTimePicker from "@react-native-community/datetimepicker";
import {
  canPinInRoom,
  checkChatPermission,
  getUserRoleInRoom,
  isRoomOwner,
} from "../../utils/permissions";
import { shouldShowHeaderCallPulse } from "../../utils/roomActiveCall";
import { formatFriendlyScheduledAt } from "../../utils/friendlyScheduledAt";
import {
  findScheduledMessageInRoomMap,
  scheduledMessagePlainBody,
} from "../../utils/scheduledMessagePreview";
import { tryDecryptChatMessage } from "../../crypto/e2eeMessageHelpers";
import { loadOrCreateDeviceKeys } from "../../crypto/e2eeDevice";
import ChatLockPasswordModal from "./chat-lock-password-modal";

const DeleteChatPopup = lazy(() => import("./delete-chat-popup"));
const ForwardPopup = lazy(() => import("./forward-popup"));
const DeleteModalPopup = lazy(() => import("./delete-modal-popup"));
const AddMemberPopup = lazy(() => import("./add-member-popup"));
const BlockUserPopup = lazy(() => import("./block-user-popup"));
const ReportUserPopup = lazy(() => import("./report-user-popup"));
const InChatSearchPopup = lazy(() => import("./in-chat-search-popup"));
const ClearChatPopup = lazy(() => import("./clear-chat-popup"));
const GroupDetailsPopup = lazy(() => import("./group-details-popup"));
const GroupSettingsPopup = lazy(() => import("./group-settings-popup"));
const CallSettingsPopup = lazy(() => import("./call-settings-popup"));
const ChatSettingsPopup = lazy(() => import("./chat-settings-popup"));
const CallRejoinPanel = lazy(() => import("../call-rejoin-panel"));

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
    const [scheduledMessages, setScheduledMessages] = useState([]);
    const [scheduledMessagesLoading, setScheduledMessagesLoading] = useState(false);
    const [scheduledE2eePlaintext, setScheduledE2eePlaintext] = useState({});
    const [scheduledDecryptDone, setScheduledDecryptDone] = useState(false);
    const [chatSummaryOpen, setChatSummaryOpen] = useState(false);
    const [chatSummaryData, setChatSummaryData] = useState(null);
    const [rescheduleMessage, setRescheduleMessage] = useState(null);
    const [rescheduleDate, setRescheduleDate] = useState("");
    const [rescheduleTime, setRescheduleTime] = useState("");
    const [showRescheduleDatePicker, setShowRescheduleDatePicker] = useState(false);
    const [showRescheduleTimePicker, setShowRescheduleTimePicker] = useState(false);
    const [editingMessage, setEditingMessage] = useState(null);
    const [editDraft, setEditDraft] = useState("");
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
    const [loading, setLoading] = useState(false);
    const [hasMore, setHasMore] = useState(true);
    const [search, setSearch] = useState("");
    const [page, setPage] = useState(1);
    const [searching, setSearching] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [list, setList] = useState([]);
    const [returnToGroupDetails, setReturnToGroupDetails] = useState(false);
    const [lockModal, setLockModal] = useState(null);
    const [password, setPassword] = useState("");
    const [rejoinPanelOpen, setRejoinPanelOpen] = useState(false);
    const headerCallPulseAnim = useRef(new Animated.Value(1)).current;
    const { prevScreens } = useSelector((state) => state.app);
    const { isDarkColorScheme } = useColorScheme();
    const dispatch = useDispatch();

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

    useEffect(() => {
      if (editingMessage) {
        setEditDraft(editingMessage.text || "");
      } else {
        setEditDraft("");
      }
    }, [editingMessage]);

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

    const getFriendsNRecentChats = (page, search) => {
      setLoading(true);
      socket.emit(
        "getFriendsNRecentChats",
        {
          page,
          size: PAGE_SIZE,
          search,
        },
        handleGetFriendsNRecentChats
      );
    };

    const handleGetFriendsNRecentChats = (res) => {
      setLoading(false);
      if (res?.type === "error") {
        return;
      }
      const newFriends = [
        ...(res?.data?.recentRooms?.length > 0 ? res?.data?.recentRooms : []),
        ...(res?.data?.friends?.length > 0 ? res?.data?.friends : []),
      ];
      const uniqueFriends = uniqBy([...list, ...newFriends], "_id");

      setList(page === 1 ? newFriends : uniqueFriends);
      setHasMore(
        res?.data?.friends?.length > 0 || res?.data?.recentRooms?.length > 0
      );
    };

    const debouncedSearch = useCallback(
      debounce(async (text) => {
        await getFriendsNRecentChats(1, text);
        setPage(1);
        setSearching(false);
      }, 1500),
      []
    );

    const handleSearch = (text) => {
      setList([]);
      setSearching(true);
      setSearch(text);
      debouncedSearch(text);
    };

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

    const handlePress = async (item) => {
      await dispatch(clearRoom());

      socket.emit(
        "createRoom",
        {
          receiverId: item?._id,
        },
        async (res) => {
          logger.debug("Create room response", { res });
          if (res?.type === "success") {
            dispatch(setRoom(res?.data));
            if (!rooms.find((r) => r._id === res?.data._id)) {
              dispatch(addRoom(res?.data));
            }
            router.replace(`/chats/${res?.data?._id}`);
            await selectedMessages.forEach((message) => {
              sendMessage({
                room: res?.data._id,
                text: message?.text,
                type: message?.type ?? "text",
                content: message?.content,
                members: res?.data?.members,
                forwardedFrom: message?.user,
                forwardedAt: new Date(),
              });
            });

            await socket.emit("getMessages", {
              room: res?.data._id,
              override: true,
            });
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
            setForward(false);
          }
        }
      );
    };

    const handleLoadMore = () => {
      if (loading || !hasMore) return;
      setPage((prev) => prev + 1);
    };

    const onRefresh = () => {
      setRefreshing(true);
      setPage(1);
      setTimeout(() => {
        setRefreshing(false);
      }, 1000);
    };

    useEffect(() => {
      if (!socket) return;
      if (!searching) {
        getFriendsNRecentChats(page, search);
      }
    }, [page, search, searching, socket]);

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

    useEffect(() => {
      if (!scheduledMessagesOpen || !room?._id || !getScheduledMessages) return;
      let cancelled = false;
      setScheduledMessagesLoading(true);
      (async () => {
        const res = await getScheduledMessages({ room: room._id });
        if (cancelled) return;
        if (res?.type === "success" && Array.isArray(res?.messages)) {
          setScheduledMessages(res.messages);
        } else {
          setScheduledMessages([]);
        }
        setScheduledMessagesLoading(false);
      })();
      return () => {
        cancelled = true;
      };
    }, [scheduledMessagesOpen, room?._id, getScheduledMessages]);

    useEffect(() => {
      if (!scheduledMessagesOpen) {
        setScheduledE2eePlaintext({});
        setScheduledDecryptDone(false);
        return;
      }
      if (
        !room?._id ||
        !socket ||
        !user?._id ||
        !(scheduledMessages || []).length
      ) {
        setScheduledDecryptDone(true);
        return;
      }
      let cancelled = false;
      setScheduledE2eePlaintext({});
      setScheduledDecryptDone(false);
      (async () => {
        let dk;
        try {
          dk = await loadOrCreateDeviceKeys();
        } catch {
          if (!cancelled) setScheduledDecryptDone(true);
          return;
        }
        const roomMsgs = room?.messages || {};
        const additions = {};
        await Promise.all(
          (scheduledMessages || []).map(async (msg) => {
            const local = findScheduledMessageInRoomMap(msg, roomMsgs);
            const plain = scheduledMessagePlainBody(msg, local);
            if (plain || !msg?.e2ee?.ciphertext) return;
            try {
              const dec = await tryDecryptChatMessage(
                msg,
                room._id,
                room?.e2ee,
                socket,
                user._id,
                dk
              );
              const raw = dec?.text != null ? String(dec.text) : "";
              const body = raw.replace(/^💬\s*/, "").trim();
              if (body && !/^🔒/u.test(body)) {
                additions[String(msg._id)] = body;
              }
            } catch {
              /* ignore */
            }
          })
        );
        if (!cancelled) {
          setScheduledE2eePlaintext(additions);
          setScheduledDecryptDone(true);
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [
      scheduledMessagesOpen,
      scheduledMessages,
      room?._id,
      room?.e2ee,
      socket,
      user?._id,
    ]);

    const toDateInputValue = useCallback((date) => {
      const y = date.getFullYear();
      const m = String(date.getMonth() + 1).padStart(2, "0");
      const d = String(date.getDate()).padStart(2, "0");
      return `${y}-${m}-${d}`;
    }, []);

    const toTimeInputValue = useCallback((date) => {
      const hh = String(date.getHours()).padStart(2, "0");
      const mm = String(date.getMinutes()).padStart(2, "0");
      return `${hh}:${mm}`;
    }, []);

    const openRescheduleModal = useCallback(
      (msg) => {
        const base = msg?.scheduledAt ? new Date(msg.scheduledAt) : new Date();
        const safeBase =
          Number.isNaN(base.getTime()) ? new Date(Date.now() + 10 * 60 * 1000) : base;
        setRescheduleDate(toDateInputValue(safeBase));
        setRescheduleTime(toTimeInputValue(safeBase));
        setRescheduleMessage(msg);
      },
      [toDateInputValue, toTimeInputValue]
    );

    const applyReschedulePreset = useCallback(
      (preset) => {
        const now = new Date();
        let target = new Date(now);
        if (preset === "in1h") {
          target = new Date(now.getTime() + 60 * 60 * 1000);
        } else if (preset === "tonight") {
          target = new Date(now);
          target.setHours(20, 0, 0, 0);
          if (target.getTime() <= now.getTime()) {
            target.setDate(target.getDate() + 1);
          }
        } else if (preset === "tomorrowMorning") {
          target = new Date(now);
          target.setDate(target.getDate() + 1);
          target.setHours(9, 0, 0, 0);
        }
        setRescheduleDate(toDateInputValue(target));
        setRescheduleTime(toTimeInputValue(target));
      },
      [toDateInputValue, toTimeInputValue]
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
      setLoading(true);
      try {
        // await updateRoomName(room?._id, { name: groupName });
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
      } finally {
        setLoading(false);
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
        <SuspenseWrapper>
          {forward && (
            <ForwardPopup
              showModal={forward}
              setShowModal={setForward}
              list={list}
              handlePress={handlePress}
              handleSearch={handleSearch}
              handleLoadMore={handleLoadMore}
              onRefresh={onRefresh}
              refreshing={refreshing}
              loading={loading}
              search={search}
              PAGE_SIZE={PAGE_SIZE}
              setPage={setPage}
            />
          )}

          {deleteModal && (
            <DeleteModalPopup
              showModal={deleteModal}
              setShowModal={setDeleteModal}
              selectedMessages={selectedMessages}
              onDeleteMessage={onDeleteMessage}
            />
          )}

          {addMember && (
            <AddMemberPopup
              showModal={addMember}
              setShowModal={setAddMember}
              list={list}
              handleAddMember={handleAddMember}
              handleSearch={handleSearch}
              handleLoadMore={handleLoadMore}
              loading={loading}
              search={search}
              PAGE_SIZE={PAGE_SIZE}
              onRefresh={onRefresh}
              returnToGroupDetails={returnToGroupDetails}
              setReturnToGroupDetails={setReturnToGroupDetails}
              setGroupDetailsModal={setGroupDetailsModal}
            />
          )}

          {blockModal && (
            <BlockUserPopup
              showModal={blockModal}
              setShowModal={setBlockModal}
              youBlockedUser={youBlockedUser}
              room={room}
              user={user}
              socket={socket}
              dispatch={dispatch}
              t={t}
            />
          )}

          {reportModal && (
            <ReportUserPopup
              showModal={reportModal}
              setShowModal={setReportModal}
              room={room}
            />
          )}

          {inChatSearchOpen && onJumpToMessageKey && (
            <InChatSearchPopup
              showModal={inChatSearchOpen}
              setShowModal={setInChatSearchOpen}
              roomId={room?._id}
              emitWithAck={emitWithAck}
              onSelectMessageKey={onJumpToMessageKey}
            />
          )}

          {scheduledMessagesOpen && (
            <Popup
              showModal={scheduledMessagesOpen}
              setShowModal={setScheduledMessagesOpen}
              withActions={false}
              title={t("chat.scheduledMessagesTitle", {
                defaultValue: "Scheduled messages",
              })}
              subtitle={t("chat.scheduledMessagesHint", {
                defaultValue: "Only messages scheduled by you are shown.",
              })}
              w="w-[90%] max-w-[520px]"
            >
              <View className="w-full py-1">
                {scheduledMessagesLoading ? (
                  <View className="py-10 items-center justify-center gap-2">
                    <ActivityIndicator
                      size="small"
                      color={
                        isDarkColorScheme ? "#fbbf24" : "#0a97b9"
                      }
                    />
                    <Text className="text-sm text-slate-500 dark:text-slate-400">
                      {t("general.loading", { defaultValue: "Loading..." })}
                    </Text>
                  </View>
                ) : (
                  <ScrollView
                    style={{ maxHeight: 440 }}
                    showsVerticalScrollIndicator
                    contentContainerStyle={{ paddingBottom: 4 }}
                  >
                    {(scheduledMessages || []).length === 0 ? (
                      <View className="rounded-2xl border border-dashed border-slate-300/80 dark:border-slate-600 bg-chatSurfaceLight dark:bg-chatSurfaceDark px-5 py-10 items-center">
                        <View className="w-14 h-14 rounded-full bg-slate-200/80 dark:bg-slate-800 items-center justify-center mb-3">
                          <FeIcon
                            name="clock"
                            size={26}
                            color={isDarkColorScheme ? "#94a3b8" : "#64748b"}
                          />
                        </View>
                        <Text className="text-base font-medium text-slate-700 dark:text-slate-200 text-center">
                          {t("chat.scheduledMessagesEmpty", {
                            defaultValue: "No scheduled messages.",
                          })}
                        </Text>
                      </View>
                    ) : (
                      (scheduledMessages || []).map((msg, schedIdx) => {
                        const rowKey = String(
                          msg?._id || msg?.uuId || `sched-${schedIdx}`
                        );
                        const id = msg?._id != null ? String(msg._id) : "";
                        const local = findScheduledMessageInRoomMap(
                          msg,
                          room?.messages || {}
                        );
                        const body =
                          scheduledMessagePlainBody(msg, local) ||
                          (id ? scheduledE2eePlaintext[id] : "") ||
                          "";
                        const computedBody =
                          body ||
                          (msg?.type === "call_event"
                            ? t("chat.scheduledCallSystemText", {
                                defaultValue: "Scheduled call reminder",
                              })
                            : "");
                        const hasCipher = !!msg?.e2ee?.ciphertext;
                        const waitingDecrypt =
                          hasCipher && !computedBody && !scheduledDecryptDone;
                        const lockedEncrypted =
                          hasCipher && !computedBody && scheduledDecryptDone;
                        const emptyPlain = !hasCipher && !computedBody;

                        const friendlyTime = msg?.scheduledAt
                          ? formatFriendlyScheduledAt(msg.scheduledAt, {
                              t,
                              locale: i18n.language,
                            })
                          : "";
                        const timeLine =
                          friendlyTime ||
                          t("chat.scheduledMessageLabel", {
                            defaultValue: "Scheduled",
                          });

                        return (
                          <View
                            key={rowKey}
                            className="mb-3.5 rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-700/85 bg-chatSurfaceLight dark:bg-chatSurfaceDark"
                            style={
                              Platform.OS === "web"
                                ? {
                                    boxShadow: isDarkColorScheme
                                      ? "0 8px 24px rgba(0,0,0,0.35)"
                                      : "0 4px 20px rgba(15,23,42,0.08)",
                                  }
                                : undefined
                            }
                          >
                            <View className="px-4 pt-3.5 pb-3">
                              <Text className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
                                {t("chat.scheduledListSectionMessage", {
                                  defaultValue: "Message",
                                })}
                              </Text>
                              {computedBody ? (
                                <Text
                                  className="text-base leading-6 text-slate-900 dark:text-slate-50 break-words"
                                  numberOfLines={8}
                                >
                                  {computedBody}
                                </Text>
                              ) : waitingDecrypt ? (
                                <View className="flex-row items-center py-2">
                                  <ActivityIndicator
                                    size="small"
                                    color={
                                      isDarkColorScheme ? "#fbbf24" : "#0a97b9"
                                    }
                                  />
                                  <Text className="text-sm text-slate-600 dark:text-slate-300 ml-3 flex-1">
                                    {t("chat.scheduledMessageDecryptingLabel", {
                                      defaultValue:
                                        "Unlocking encrypted message…",
                                    })}
                                  </Text>
                                </View>
                              ) : lockedEncrypted || emptyPlain ? (
                                <Text className="text-sm leading-5 text-slate-500 dark:text-slate-400 italic">
                                  {lockedEncrypted
                                    ? t(
                                        "chat.scheduledMessageEncryptedNoPreview",
                                        {
                                          defaultValue:
                                            "This scheduled message is encrypted and could not be unlocked on this device.",
                                        }
                                      )
                                    : t("chat.scheduledMessageEmptyBody", {
                                        defaultValue: "No text in this message.",
                                      })}
                                </Text>
                              ) : null}
                            </View>

                            <View className="px-4 py-2.5 bg-slate-100/90 dark:bg-slate-900/50 border-t border-slate-200/90 dark:border-slate-700/70">
                              <View className="flex-row items-center flex-wrap">
                                <FeIcon
                                  name="clock"
                                  size={15}
                                  color={isDarkColorScheme ? "#fbbf24" : "#d97706"}
                                  style={{ marginRight: 8 }}
                                />
                                <Text className="text-[13px] font-medium text-slate-700 dark:text-amber-100/90 flex-1 min-w-0">
                                  {timeLine}
                                </Text>
                              </View>
                            </View>

                            <View className="flex-row px-4 pb-3.5 pt-3">
                              <TouchableOpacity
                                className="flex-1 mr-2 py-2.5 px-2 rounded-xl items-center justify-center bg-[#0a97b9]/12 dark:bg-[#0a97b9]/22 border border-[#0a97b9]/35 dark:border-[#22d3ee]/25"
                                onPress={() => openRescheduleModal(msg)}
                                accessibilityRole="button"
                              >
                                <Text
                                  className="text-xs font-semibold text-[#067a96] dark:text-sky-300 text-center"
                                  numberOfLines={2}
                                >
                                  {t("chat.rescheduleScheduledMessage", {
                                    defaultValue: "Reschedule",
                                  })}
                                </Text>
                              </TouchableOpacity>
                              <TouchableOpacity
                                className="flex-1 py-2.5 px-2 rounded-xl items-center justify-center bg-red-500/[0.08] dark:bg-red-950/40 border border-red-500/30 dark:border-red-500/35"
                                onPress={async () => {
                                  const res = await cancelScheduledMessage?.({
                                    room: room._id,
                                    messageId: msg?._id,
                                  });
                                  if (res?.type === "success") {
                                    setScheduledMessages((prev) =>
                                      (prev || []).filter(
                                        (item) =>
                                          String(item?._id) !==
                                          String(msg?._id)
                                      )
                                    );
                                  }
                                }}
                                accessibilityRole="button"
                              >
                                <Text
                                  className="text-xs font-semibold text-red-600 dark:text-red-400 text-center"
                                  numberOfLines={2}
                                >
                                  {t("chat.cancelScheduledMessage", {
                                    defaultValue: "Cancel",
                                  })}
                                </Text>
                              </TouchableOpacity>
                            </View>
                          </View>
                        );
                      })
                    )}
                  </ScrollView>
                )}
              </View>
            </Popup>
          )}
          {chatSummaryOpen && (
            <Popup
              showModal={chatSummaryOpen}
              setShowModal={setChatSummaryOpen}
              withActions={false}
              title={t("chat.aiSummaryTitle", { defaultValue: "Chat summary" })}
              subtitle={t("chat.aiSummarySubtitle", {
                defaultValue: "Quick summary of recent messages and calls.",
              })}
              w="w-[90%] max-w-[560px]"
            >
              <View className="w-full py-2">
                <Text className="text-sm text-slate-600 dark:text-slate-300">
                  {t("chat.aiSummaryStats", {
                    defaultValue: "Messages: {{messages}} | Call events: {{calls}}",
                    messages: chatSummaryData?.textCount || 0,
                    calls: chatSummaryData?.callCount || 0,
                  })}
                </Text>
                <Text className="text-sm font-semibold mt-3 text-slate-800 dark:text-slate-100">
                  {t("chat.aiSummaryCallInsight", { defaultValue: "Call insight" })}
                </Text>
                <Text className="text-sm text-slate-600 dark:text-slate-300 mt-1">
                  {chatSummaryData?.callInsight ||
                    t("chat.aiSummaryNoCallInsight", {
                      defaultValue: "No recent call trend.",
                    })}
                </Text>
                {typeof chatSummaryData?.callHealthScore === "number" && (
                  <Text className="text-xs text-slate-500 dark:text-slate-300 mt-1">
                    {t("chat.aiSummaryCallHealthScore", {
                      defaultValue: "Call health score: {{score}}/100",
                      score: chatSummaryData.callHealthScore,
                    })}
                  </Text>
                )}
                {chatSummaryData?.callRecommendation ? (
                  <Text className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                    {t("chat.aiSummaryCallRecommendation", {
                      defaultValue: "{{text}}",
                      text: chatSummaryData.callRecommendation,
                    })}
                  </Text>
                ) : null}
                <Text className="text-sm font-semibold mt-3 text-slate-800 dark:text-slate-100">
                  {t("chat.aiSummaryTopics", { defaultValue: "Top topics" })}
                </Text>
                <Text className="text-sm text-slate-600 dark:text-slate-300 mt-1">
                  {(chatSummaryData?.topTopics || []).length > 0
                    ? chatSummaryData.topTopics.join(", ")
                    : t("chat.aiSummaryNoTopics", { defaultValue: "No dominant topics yet." })}
                </Text>
                <Text className="text-sm font-semibold mt-3 text-slate-800 dark:text-slate-100">
                  {t("chat.aiSummaryActions", { defaultValue: "Action items" })}
                </Text>
                {(chatSummaryData?.actionItems || []).length > 0 ? (
                  (chatSummaryData?.actionItems || []).map((item, idx) => (
                    <Text
                      key={`${idx}-${item.slice(0, 8)}`}
                      className="text-sm text-slate-600 dark:text-slate-300 mt-1"
                    >
                      {`\u2022 ${item}`}
                    </Text>
                  ))
                ) : (
                  <Text className="text-sm text-slate-600 dark:text-slate-300 mt-1">
                    {t("chat.aiSummaryNoActions", {
                      defaultValue: "No explicit action items detected.",
                    })}
                  </Text>
                )}
                <View className="mt-3 flex-row justify-end">
                  <Button
                    label={t("chat.aiSummaryRefresh", { defaultValue: "Refresh summary" })}
                    onPress={openChatSummary}
                  />
                </View>
              </View>
            </Popup>
          )}
          {rescheduleMessage && (
            <Popup
              showModal={!!rescheduleMessage}
              setShowModal={(open) => {
                if (!open) setRescheduleMessage(null);
              }}
              withActions={false}
              title={t("chat.rescheduleScheduledMessage", {
                defaultValue: "Reschedule message",
              })}
              w="w-[90%] max-w-[440px]"
            >
              <View className="w-full py-2">
                <Text className="text-sm text-slate-600 dark:text-slate-300 mb-2">
                  {t("chat.scheduleSendPickerHint", {
                    defaultValue: "Choose date and time for sending this message.",
                  })}
                </Text>
                <View className="flex-row items-center gap-2 mb-3">
                  <TouchableOpacity
                    className="px-3 py-1 rounded-full bg-slate-500/20"
                    onPress={() => applyReschedulePreset("in1h")}
                  >
                    <Text className="text-xs text-slate-700 dark:text-slate-200">
                      {t("chat.quickScheduleIn1Hour", { defaultValue: "In 1 hour" })}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    className="px-3 py-1 rounded-full bg-slate-500/20"
                    onPress={() => applyReschedulePreset("tonight")}
                  >
                    <Text className="text-xs text-slate-700 dark:text-slate-200">
                      {t("chat.quickScheduleTonight", { defaultValue: "Tonight 20:00" })}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    className="px-3 py-1 rounded-full bg-slate-500/20"
                    onPress={() => applyReschedulePreset("tomorrowMorning")}
                  >
                    <Text className="text-xs text-slate-700 dark:text-slate-200">
                      {t("chat.quickScheduleTomorrowMorning", {
                        defaultValue: "Tomorrow 09:00",
                      })}
                    </Text>
                  </TouchableOpacity>
                </View>
                <View className="flex-row items-center gap-2 mb-4">
                  {Platform.OS === "web" ? (
                    <>
                      <Input
                        value={rescheduleDate}
                        onChange={setRescheduleDate}
                        placeholder="YYYY-MM-DD"
                        containerStyle="flex-1"
                        widthLabel={false}
                      />
                      <Input
                        value={rescheduleTime}
                        onChange={setRescheduleTime}
                        placeholder="HH:mm"
                        containerStyle="w-[120px]"
                        widthLabel={false}
                      />
                    </>
                  ) : (
                    <View className="w-full">
                      <View className="flex-row items-center gap-2 mb-2">
                        <TouchableOpacity
                          className="flex-1 rounded-xl border border-slate-300 dark:border-slate-700 px-3 py-2"
                          onPress={() => setShowRescheduleDatePicker(true)}
                        >
                          <Text className="text-slate-900 dark:text-slate-100">
                            {rescheduleDate || "YYYY-MM-DD"}
                          </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          className="w-[120px] rounded-xl border border-slate-300 dark:border-slate-700 px-3 py-2"
                          onPress={() => setShowRescheduleTimePicker(true)}
                        >
                          <Text className="text-slate-900 dark:text-slate-100">
                            {rescheduleTime || "HH:mm"}
                          </Text>
                        </TouchableOpacity>
                      </View>
                      {showRescheduleDatePicker && (
                        <DateTimePicker
                          mode="date"
                          minimumDate={new Date()}
                          value={
                            new Date(
                              `${rescheduleDate || toDateInputValue(new Date())}T${
                                rescheduleTime || "12:00"
                              }:00`
                            )
                          }
                          onChange={(_, selectedDate) => {
                            setShowRescheduleDatePicker(false);
                            if (!selectedDate) return;
                            setRescheduleDate(toDateInputValue(selectedDate));
                          }}
                        />
                      )}
                      {showRescheduleTimePicker && (
                        <DateTimePicker
                          mode="time"
                          value={
                            new Date(
                              `${rescheduleDate || toDateInputValue(new Date())}T${
                                rescheduleTime || "12:00"
                              }:00`
                            )
                          }
                          onChange={(_, selectedDate) => {
                            setShowRescheduleTimePicker(false);
                            if (!selectedDate) return;
                            setRescheduleTime(toTimeInputValue(selectedDate));
                          }}
                        />
                      )}
                    </View>
                  )}
                </View>
                <View className="flex-row justify-end items-center gap-3">
                  <TouchableOpacity onPress={() => setRescheduleMessage(null)}>
                    <Text className="text-base text-slate-600 dark:text-slate-300">
                      {t("general.cancel")}
                    </Text>
                  </TouchableOpacity>
                  <Button
                    label={t("chat.saveEdit", { defaultValue: "Save" })}
                    onPress={async () => {
                      if (!rescheduleMessage || !rescheduleDate || !rescheduleTime) return;
                      const targetDate = new Date(`${rescheduleDate}T${rescheduleTime}:00`);
                      if (Number.isNaN(targetDate.getTime())) {
                        dispatch(
                          addAlert({
                            type: "error",
                            message: t("chat.scheduleSendFailedBody", {
                              defaultValue:
                                "We could not schedule your message. Please try again.",
                            }),
                          })
                        );
                        return;
                      }
                      if (targetDate.getTime() - Date.now() < 15 * 1000) {
                        dispatch(
                          addAlert({
                            type: "error",
                            message: t("chat.scheduleSendTooSoon", {
                              defaultValue:
                                "Please choose a time at least a few seconds ahead.",
                            }),
                          })
                        );
                        return;
                      }
                      const res = await rescheduleScheduledMessage?.({
                        room: room?._id,
                        messageId: rescheduleMessage?._id,
                        scheduledAt: targetDate.toISOString(),
                      });
                      if (res?.type === "success") {
                        setScheduledMessages((prev) =>
                          (prev || []).map((item) =>
                            String(item?._id) === String(rescheduleMessage?._id)
                              ? { ...item, scheduledAt: targetDate.toISOString() }
                              : item
                          )
                        );
                        setRescheduleMessage(null);
                      } else {
                        dispatch(
                          addAlert({
                            type: "error",
                            message:
                              res?.message || t("general.somethingWentWrong"),
                          })
                        );
                      }
                    }}
                  />
                </View>
              </View>
            </Popup>
          )}

          {editingMessage && (
            <Popup
              showModal={!!editingMessage}
              setShowModal={(open) => {
                if (!open) setEditingMessage(null);
              }}
              withActions={false}
              title={t("chat.editMessageTitle")}
              w="w-[90%] max-w-[440px]"
            >
              <View className="w-full py-2">
                <Input
                  value={editDraft}
                  onChange={setEditDraft}
                  placeholder={t("chat.editMessagePlaceholder")}
                  multiline
                  numberOfLines={5}
                  inputStyle="min-h-[100px]"
                  containerStyle="w-full mb-4"
                  widthLabel={false}
                />
                <View className="flex-row justify-end items-center gap-3">
                  <TouchableOpacity onPress={() => setEditingMessage(null)}>
                    <Text className="text-base text-slate-600 dark:text-slate-300">
                      {t("general.cancel")}
                    </Text>
                  </TouchableOpacity>
                  <Button
                    label={t("chat.saveEdit")}
                    onPress={async () => {
                      const trimmed = editDraft.trim();
                      if (!trimmed || !editingMessage) return;
                      const res = await editMessage({
                        room: room?._id,
                        messageId: editingMessage._id,
                        uuId: editingMessage.uuId,
                        text: trimmed,
                        clientVersion: editingMessage.stateVersion,
                      });
                      if (res?.type === "success") {
                        setEditingMessage(null);
                        setSelectedMessages([]);
                        dispatch(
                          addAlert({
                            type: "success",
                            message: t("chat.messageEditedSuccess"),
                          })
                        );
                      } else {
                        dispatch(
                          addAlert({
                            type: "error",
                            message:
                              res?.message || t("general.somethingWentWrong"),
                          })
                        );
                      }
                    }}
                  />
                </View>
              </View>
            </Popup>
          )}

          {clearChatModal && (
            <ClearChatPopup
              showModal={clearChatModal}
              setShowModal={setClearChatModal}
              room={room}
              user={user}
              socket={socket}
              dispatch={dispatch}
              t={t}
            />
          )}

          {deleteChatModal && (
            <DeleteChatPopup
              showModal={deleteChatModal}
              setShowModal={setDeleteChatModal}
              room={room}
              user={user}
              socket={socket}
            />
          )}

          {/* Mute Duration Picker Modal */}
          <Popup
            showModal={showMuteModal}
            setShowModal={setShowMuteModal}
            title={t("header.muteDuration") || "Mute notifications"}
            w="w-[320px]"
          >
            <View className="py-2">
              {muteDurations.map((duration, index) => (
                <TouchableOpacity
                  key={index}
                  onPress={() => handleMuteChat(duration.value)}
                  className="py-3 px-4 border-b border-gray-200 dark:border-gray-700"
                >
                  <Text className="text-base text-gray-900 dark:text-gray-100">
                    {duration.label}
                  </Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity
                onPress={() => setShowMuteModal(false)}
                className="py-3 px-4"
              >
                <Text className="text-base text-gray-500 dark:text-gray-400 text-center">
                  {t("header.cancel")}
                </Text>
              </TouchableOpacity>
            </View>
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
                if (lockModal !== "enter") return;
                const targetRoom = rooms.find((r) => r._id === roomId);
                const userPassword = targetRoom?.passwords?.find(
                  (p) => p?.user === user?._id
                );
                if (password !== userPassword?.password) {
                  setPassword("");
                  dispatch(
                    addAlert({
                      message: t("general.passwordIsNotCorrect"),
                      type: "error",
                    })
                  );
                  return;
                }
                socket.emit("getMessages", {
                  room: roomId,
                  override: true,
                });
                router.push(`/chats/${roomId}`);
                setLockModal(null);
                setPassword("");
              }}
            />
          )}

          {groupDetailsModal && (
            <GroupDetailsPopup
              showModal={groupDetailsModal}
              setShowModal={setGroupDetailsModal}
              room={room}
              user={user}
              setAddMember={setAddMember}
              setGroupDetailsModal={setGroupDetailsModal}
              setReturnToGroupDetails={setReturnToGroupDetails}
              dispatch={dispatch}
              setShowConfirmRole={setShowConfirmRole}
              setShowDeleteMember={setShowDeleteMember}
              setSelectedMember={setSelectedMember}
              setWasGroupDetailsModalOpen={setWasGroupDetailsModalOpen}
              onCreateRoomWithMember={handleCreateRoomWithMember}
            />
          )}

          {/* Change Role Selection Modal - Outside groupDetailsModal condition */}
          <Popup
            showModal={showConfirmRole}
            setShowModal={(val) => {
              setShowConfirmRole(val);
              if (!val) {
                setSelectedNewRole(null);
              }
              // Modal reopening is handled by useEffect
            }}
            withActions={true}
            justify="justify-center"
            items="items-center"
            title={t("header.changeRole") || "Change Role"}
            z="z-[100]"
            opacity="90"
            w="w-[350px]"
            closeOnBackdrop={true}
            onCancel={() => {
              setShowConfirmRole(false);
              setSelectedNewRole(null);
              // Modal reopening is handled by useEffect
            }}
            onClick={() => {
              if (socket && selectedMember && selectedNewRole) {
                const currentRole = room?.roles?.find(
                  (role) => String(role.user) === String(selectedMember._id)
                )?.role || "member";
                
                // Only emit if role is actually changing
                if (selectedNewRole !== currentRole) {
                  socket.emit("changeUserRole", {
                    room: room?._id,
                    member: selectedMember?._id,
                    newRole: selectedNewRole,
                  });
                }
                setSelectedNewRole(null);
              } else if (!selectedNewRole) {
                dispatch(
                  addAlert({
                    message: t("general.selectRole") || "Please select a role",
                    type: "warning",
                  })
                );
                return; // Don't close the popup
              } else {
                dispatch(
                  addAlert({
                    message: t("general.connectionError"),
                    type: "error",
                  })
                );
              }
            }}
            confirmLabel={t("general.confirm") || "Confirm"}
            cancelLabel={t("general.cancel") || "Cancel"}
            confirmColor="#3b82f6"
          >
            <View className="w-full px-2">
              <Text className="text-sm text-center text-slate-600 dark:text-slate-400 mb-4">
                {t("general.selectNewRole") || "Select new role for"} {selectedMember?.firstName || selectedMember?.userName}
              </Text>
              
              {/* Role Selection Options */}
              <View className="gap-y-2">
                {/* Admin Option - Only owner can assign admin */}
                {String(room?.user) === String(user?._id) && (
                  <TouchableOpacity
                    onPress={() => setSelectedNewRole("admin")}
                    className={`flex-row items-center p-3 rounded-lg border ${
                      selectedNewRole === "admin"
                        ? "border-blue-500 bg-blue-50 dark:bg-blue-900/30"
                        : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                    }`}
                  >
                    <View className={`w-5 h-5 rounded-full border-2 mr-3 items-center justify-center ${
                      selectedNewRole === "admin"
                        ? "border-blue-500 bg-blue-500"
                        : "border-slate-300 dark:border-slate-600"
                    }`}>
                      {selectedNewRole === "admin" && (
                        <FeIcon name="check" size={12} color="#fff" />
                      )}
                    </View>
                    <View className="flex-1">
                      <Text className={`font-medium ${
                        selectedNewRole === "admin"
                          ? "text-blue-600 dark:text-blue-400"
                          : "text-slate-700 dark:text-slate-300"
                      }`}>
                        {t("general.admin") || "Admin"}
                      </Text>
                      <Text className="text-xs text-slate-500 dark:text-slate-400">
                        {t("general.adminDescription") || "Full permissions to manage group"}
                      </Text>
                    </View>
                  </TouchableOpacity>
                )}
                
                {/* Moderator Option */}
                <TouchableOpacity
                  onPress={() => setSelectedNewRole("moderator")}
                  className={`flex-row items-center p-3 rounded-lg border ${
                    selectedNewRole === "moderator"
                      ? "border-blue-500 bg-blue-50 dark:bg-blue-900/30"
                      : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                  }`}
                >
                  <View className={`w-5 h-5 rounded-full border-2 mr-3 items-center justify-center ${
                    selectedNewRole === "moderator"
                      ? "border-blue-500 bg-blue-500"
                      : "border-slate-300 dark:border-slate-600"
                  }`}>
                    {selectedNewRole === "moderator" && (
                      <FeIcon name="check" size={12} color="#fff" />
                    )}
                  </View>
                  <View className="flex-1">
                    <Text className={`font-medium ${
                      selectedNewRole === "moderator"
                        ? "text-blue-600 dark:text-blue-400"
                        : "text-slate-700 dark:text-slate-300"
                    }`}>
                      {t("general.moderator") || "Moderator"}
                    </Text>
                    <Text className="text-xs text-slate-500 dark:text-slate-400">
                      {t("general.moderatorDescription") || "Can manage members"}
                    </Text>
                  </View>
                </TouchableOpacity>
                
                {/* Member Option */}
                <TouchableOpacity
                  onPress={() => setSelectedNewRole("member")}
                  className={`flex-row items-center p-3 rounded-lg border ${
                    selectedNewRole === "member"
                      ? "border-blue-500 bg-blue-50 dark:bg-blue-900/30"
                      : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                  }`}
                >
                  <View className={`w-5 h-5 rounded-full border-2 mr-3 items-center justify-center ${
                    selectedNewRole === "member"
                      ? "border-blue-500 bg-blue-500"
                      : "border-slate-300 dark:border-slate-600"
                  }`}>
                    {selectedNewRole === "member" && (
                      <FeIcon name="check" size={12} color="#fff" />
                    )}
                  </View>
                  <View className="flex-1">
                    <Text className={`font-medium ${
                      selectedNewRole === "member"
                        ? "text-blue-600 dark:text-blue-400"
                        : "text-slate-700 dark:text-slate-300"
                    }`}>
                      {t("general.member") || "Member"}
                    </Text>
                    <Text className="text-xs text-slate-500 dark:text-slate-400">
                      {t("general.memberDescription") || "Basic group permissions"}
                    </Text>
                  </View>
                </TouchableOpacity>
              </View>
              
              {/* Current Role Indicator */}
              <Text className="text-xs text-center text-slate-400 dark:text-slate-500 mt-3">
                {t("general.currentRole") || "Current role"}: {(() => {
                  const currentRole = room?.roles?.find(
                    (role) => String(role.user) === String(selectedMember?._id)
                  )?.role || "member";
                  return t(`general.${currentRole}`) || currentRole;
                })()}
              </Text>
            </View>
          </Popup>

          {/* Remove Member Confirmation Modal - Outside groupDetailsModal condition */}
          <Popup
            showModal={showDeleteMember}
            setShowModal={(val) => {
              setShowDeleteMember(val);
              // Modal reopening is handled by useEffect
            }}
            withActions={true}
            justify="justify-center"
            items="items-center"
            title={t("header.removeMember") || "Remove Member"}
            z="z-[100]"
            opacity="90"
            closeOnBackdrop={true}
            onCancel={() => {
              setShowDeleteMember(false);
              // Modal reopening is handled by useEffect
            }}
            onClick={() => {
              if (socket && selectedMember) {
                socket.emit("removeMemberFromRoom", {
                  room: room?._id,
                  member: selectedMember?._id,
                });
              } else {
                dispatch(
                  addAlert({
                    message: t("general.connectionError"),
                    type: "error",
                  })
                );
              }
              // setShowModal will be called automatically by Popup component after onClick
            }}
            confirmLabel={t("general.yes") || "Yes"}
            cancelLabel={t("general.no") || "No"}
            confirmColor="#ef4444"
          >
            <Text className="text-base text-center text-placehoder dark:text-papaya">
              {t("general.removeMemberConfirmation")}
            </Text>
          </Popup>

          {groupSettingsModal && (
            <GroupSettingsPopup
              showModal={groupSettingsModal}
              setShowModal={setGroupSettingsModal}
              room={room}
              groupName={groupName}
              setGroupName={setGroupName}
              setEditeRoom={setEditeRoom}
              editRoom={editRoom}
              pickImage={pickImage}
              handleSaveGroupName={handleSaveGroupName}
            />
          )}

          {/* Call Settings Modal */}
          {callSettingsModal && (
            <SuspenseWrapper>
              <CallSettingsPopup
                showModal={callSettingsModal}
                setShowModal={setCallSettingsModal}
              />
            </SuspenseWrapper>
          )}

          {/* Chat Settings Modal */}
          {chatSettingsModal && (
            <SuspenseWrapper>
              <ChatSettingsPopup
                showModal={chatSettingsModal}
                setShowModal={setChatSettingsModal}
              />
            </SuspenseWrapper>
          )}

          {rejoinPanelOpen && room?._id && (
            <SuspenseWrapper>
              <CallRejoinPanel
                visible={rejoinPanelOpen}
                onClose={() => setRejoinPanelOpen(false)}
                room={room}
              />
            </SuspenseWrapper>
          )}

        </SuspenseWrapper>

        <View
          className="flex-row items-center justify-between h-16 px-2 py-1.5 bg-chatSurfaceLight dark:bg-chatSurfaceDark"
        >
          <View className={`flex-row items-center gap-x-2`}>
            <TouchableOpacity
              className="mx-1"
              onPress={() => {
                if (socket) {
                  socket.emit("leaveRoom", {
                    room: room?._id,
                  });
                }
                if (!Object.values(room?.messages || {}).length) {
                  dispatch(deleteRoom(room?._id));
                }
                isInitialRender.current = true;
                setSelectedMessages([]);
                dispatch(clearRoom());
                // const prev = prevScreens.filter(
                //   (screen) =>
                //     ![
                //       "Profile",
                //       "Chat",
                //       "User",
                //       "UpdateProfile",
                //       "UserInfo",
                //       "Visibility",
                //       "Content",
                //       "Interaction",
                //       "Network",
                //       "Password",
                //       "Email",
                //       "Phone",
                //       "Main",
                //       "Notifications",
                //       "Settings",
                //       "VerifyPhone",
                //       "VerifyEmail",
                //       "ForgotPassword",
                //       "PhoneAuth",
                //       "Login",
                //       "Signup",
                //       "Welcome",
                //       "ResetPassword",
                //       "Auth",
                //       "Init",
                //     ].includes(screen)
                // );
                // const prevScreen = prev[prev?.length - 1];
                // get the previous screen with router

                if (router.canGoBack()) {
                  logger.debug("Navigation", { canGoBack: true });
                  navigateBackSafely();
                } else {
                  logger.debug("Navigation", { canGoBack: false });
                  router.push("/chats");
                }
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
            </TouchableOpacity>
            {!room?.isGroup ? (
              <UserImage
                size="h-12 w-12"
                border="border-0"
                user={room?.members?.[0]}
                onPress={() => {
                  router.push({
                    pathname: `/profile/${room?.members?.[0]?._id}`,
                    params: {
                      from: `chats/${room?._id}`,
                    },
                  });
                }}
              />
            ) : (
              <TouchableOpacity onPress={handleGroupImageClick}>
                {room?.image ? (
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
                    roomName={room?.name ?? "Group Chat"}
                    isGroup
                  />
                )}
              </TouchableOpacity>
            )}
            {!room?.isGroup ? (
              <View className={`items-start justify-start flex-col`}>
                {room?.members?.[0] && (
                  <UserDisplay
                    user={room?.members?.[0]}
                    onPress={() => {
                      router.push({
                        pathname: `/profile/${room?.members?.[0]?._id}`,
                        params: {
                          from: `chats/${room?._id}`,
                        },
                      });
                    }}
                    showAvatar={false}
                    showStatusDot={false}
                    variant="compact"
                    className="p-0 bg-transparent"
                  />
                )}
                {usersTyping?.[`${room?.members?.[0]?._id}_${room?._id}`] ? (
                  <Text className={`text-sm text-chatAccent mt-1`}>
                    {t("header.typingIndicator")}
                  </Text>
                ) : room?.members?.[0]?.status === "online" ? (
                  <Text className={`text-xs text-emerald-500 mt-1`}>
                    {t("profileScreen.activeNow")}
                  </Text>
                ) : room?.members?.[0]?.lastSeen ? (
                  <TimeAgo
                    date={room?.members?.[0]?.lastSeen}
                    className={`mt-1`}
                  />
                ) : (
                  <Text
                    className={`text-xs mt-1
                    ${isDarkColorScheme ? "text-[#EDF6F9]" : "text-[#023047]"}`}
                  >
                    {t("profileScreen.lastSeenLongTimeAgo")}
                  </Text>
                )}
              </View>
            ) : (
              <>
                <View className={`flex-col items-start`}>
                  <Text
                    className="ml-2 text-lg text-slate-900 dark:text-slate-100"
                  >
                    {room?.name ?? t("general.groupChat")}
                  </Text>

                  {getGroupTypingIndicator()}
                </View>
              </>
            )}
          </View>

          {selectedMessages?.length > 0 ? (
            <View className={`flex-row items-center`}>
              <TouchableOpacity onPress={copyMessages}>
                <FeIcon
                  name="copy"
                  size={24}
                  color={isDarkColorScheme ? "#dee4e6" : "#2D2D37"}
                />
              </TouchableOpacity>
              {canEditSelectedMessage && (
                <TouchableOpacity
                  className="ml-3"
                  onPress={() => setEditingMessage(selectedMessages[0])}
                >
                  <FeIcon
                    name="edit-2"
                    size={24}
                    color={isDarkColorScheme ? "#dee4e6" : "#2D2D37"}
                  />
                </TouchableOpacity>
              )}
              {pinEligible && (
                <TouchableOpacity className="ml-3" onPress={handlePinToggle}>
                  <FeIcon
                    name="bookmark"
                    size={24}
                    color={
                      selectedMessageIsPinned
                        ? "#d97706"
                        : isDarkColorScheme
                        ? "#dee4e6"
                        : "#2D2D37"
                    }
                  />
                </TouchableOpacity>
              )}
              <TouchableOpacity
                className={`ml-3`}
                onPress={() => {
                  setForward(!forward);
                }}
              >
                <Icon
                  name="return-up-forward"
                  size={24}
                  color={isDarkColorScheme ? "#dee4e6" : "#2D2D37"}
                />
              </TouchableOpacity>
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

              <ContextMenu
                options={[
                  {
                    name: t("header.viewProfile"),
                    onPress: () => handleMenuOption("visitProfile"),
                    hide: room?.isGroup,
                  },
                  {
                    name: t("chat.retryAllFailed", {
                      defaultValue: "Retry all failed",
                    }),
                    onPress: handleRetryAllFailed,
                    hide: failedMessagesCount <= 0,
                  },
                  {
                    name: t("chat.aiSummaryTitle", { defaultValue: "Chat summary" }),
                    onPress: openChatSummary,
                  },
                  {
                    name: t("chat.searchInChat"),
                    onPress: () => setInChatSearchOpen(true),
                    hide: !onJumpToMessageKey,
                  },
                  {
                    name: t("chat.scheduledMessagesTitle", {
                      defaultValue: "Scheduled messages",
                    }),
                    onPress: () => handleMenuOption("scheduledMessages"),
                  },
                  {
                    name: t("header.groupSettings"),
                    onPress: () => setGroupSettingsModal(true),
                    hide: !room?.isGroup,
                  },
                  {
                    name: t("general.members"),
                    onPress: () => setGroupDetailsModal(true),
                    hide: !room?.isGroup,
                  },
                  {
                    name: t("user.settings") || "الإعدادات",
                    submenu: [
                      {
                        name: t("callSettingsScreen.title") || "إعدادات المكالمة",
                        onPress: () => {
                          setCallSettingsModal(true);
                        },
                      },
                      {
                        name: t("chatSettingsScreen.title") || "إعدادات الدردشة",
                        onPress: () => {
                          setChatSettingsModal(true);
                        },
                      },
                    ],
                    hide: !room?.isGroup,
                  },
                  {
                    name: t("header.addMember"),
                    onPress: () => handleMenuOption("addMember"),
                    hide: !room?.isGroup || !canAddMembers, // ✅ Hide based on addMembers permission
                  },
                  {
                    name: isChatMuted 
                      ? (t("header.unmuteChat") || "Unmute")
                      : (t("header.muteChat") || "Mute"),
                    onPress: () => {
                      if (isChatMuted) {
                        handleUnmuteChat();
                      } else {
                        setShowMuteModal(true);
                      }
                    },
                  },
                  {
                    name: `${t("chatSettingsScreen.autoDelete.title") || "Disappearing Messages"} (${getAutoDeleteDisplayText})`,
                    submenu: autoDeleteOptions.map((option) => ({
                      name: option.label,
                      onPress: () => updateAutoDeleteTimer(option.value),
                      selected: autoDeleteTimer === option.value,
                    })),
                    hide: !canModifyDisappearingMessages, // ✅ Hide if user doesn't have permission
                  },
                  {
                    name: t("header.clearChat"),
                    onPress: () => handleMenuOption("clearChat"),
                  },
                  {
                    name: youBlockedUser
                      ? t("header.unblockUser")
                      : t("header.blockUser"),
                    onPress: () => handleMenuOption("blockUser"),
                    hide: room?.isGroup,
                  },
                  {
                    name: "Report user",
                    onPress: () => setReportModal(true),
                    hide: room?.isGroup,
                  },
                  {
                    name: t("header.exitGroup"),
                    onPress: () => {
                      if (socket) {
                        socket.emit("exitRoom", {
                          room: room?._id,
                        });
                      }
                      setSelectedMessages([]);
                      const prev = prevScreens.filter(
                        (screen) =>
                          ![
                            "Profile",
                            "Chat",
                            "User",
                            "UpdateProfile",
                            "UserInfo",
                            "Visibility",
                            "Content",
                            "Interaction",
                            "Network",
                            "Password",
                            "Email",
                            "Phone",
                            "Main",
                            "Notifications",
                            "Settings",
                            "VerifyPhone",
                            "VerifyEmail",
                            "ForgotPassword",
                            "PhoneAuth",
                            "Login",
                            "Signup",
                            "Welcome",
                            "ResetPassword",
                            "Auth",
                            "Init",
                          ].includes(screen)
                      );
                      const prevScreen = prev[prev?.length - 1];
                      if (router.canGoBack()) {
                        navigateBackSafely();
                      } else {
                        router.push("/chats");
                      }
                    },
                    hide: !room?.isGroup,
                  },
                  {
                    name: t("header.cancel"),
                    onPress: () => {},
                  },
                ]}
                placement="bottom"
                width={220}
              >
                <Icon
                  name="ellipsis-vertical"
                  size={24}
                  color={isDarkColorScheme ? "#dee4e6" : "#2D2D37"}
                />
              </ContextMenu>
            </View>
          ) : (
            <View className={`flex-row items-center`}>
              {/* Audio: normal start call, or open rejoin panel when a call is already active */}
              <Animated.View
                style={{ transform: [{ scale: headerCallPulseAnim }] }}
              >
                <TouchableOpacity
                  disabled={audioHeaderDisabled}
                  className="ml-1 h-10 w-10 rounded-full items-center justify-center bg-slate-100/80 dark:bg-slate-800/90 active:opacity-80"
                  onPress={handleHeaderAudioPress}
                  accessibilityRole="button"
                  accessibilityLabel={
                    showHeaderCallPulse
                      ? "Active call — join"
                      : "Voice call"
                  }
                >
                  <Icon
                    name="call"
                    size={28}
                    color={
                      audioHeaderDisabled
                        ? isDarkColorScheme
                          ? "#666666"
                          : "#CCCCCC"
                        : showHeaderCallPulse
                          ? "#ef4444"
                          : "#0ea5e9"
                    }
                  />
                </TouchableOpacity>
              </Animated.View>

              <Animated.View
                style={{ transform: [{ scale: headerCallPulseAnim }] }}
              >
                <TouchableOpacity
                  disabled={videoHeaderDisabled}
                  className="ml-2 h-10 w-10 rounded-full items-center justify-center bg-slate-100/80 dark:bg-slate-800/90 active:opacity-80"
                  onPress={handleHeaderVideoPress}
                  accessibilityRole="button"
                  accessibilityLabel={
                    showHeaderCallPulse
                      ? "Active call — join"
                      : "Video call"
                  }
                >
                  <Icon
                    name="videocam"
                    size={28}
                    color={
                      videoHeaderDisabled
                        ? isDarkColorScheme
                          ? "#666666"
                          : "#CCCCCC"
                        : showHeaderCallPulse
                          ? "#ef4444"
                          : "#0ea5e9"
                    }
                  />
                </TouchableOpacity>
              </Animated.View>

              <ContextMenu
                options={[
                  {
                    name: t("header.viewProfile"),
                    onPress: () => handleMenuOption("visitProfile"),
                    hide: room?.isGroup,
                  },
                  {
                    name: t("chat.retryAllFailed", {
                      defaultValue: "Retry all failed",
                    }),
                    onPress: handleRetryAllFailed,
                    hide: failedMessagesCount <= 0,
                  },
                  {
                    name: t("chat.aiSummaryTitle", { defaultValue: "Chat summary" }),
                    onPress: openChatSummary,
                  },
                  {
                    name: t("chat.searchInChat"),
                    onPress: () => setInChatSearchOpen(true),
                    hide: !onJumpToMessageKey,
                  },
                  {
                    name: t("chat.scheduledMessagesTitle", {
                      defaultValue: "Scheduled messages",
                    }),
                    onPress: () => handleMenuOption("scheduledMessages"),
                  },
                  {
                    name: t("header.groupSettings"),
                    onPress: () => setGroupSettingsModal(true),
                    hide: !room?.isGroup,
                  },
                  {
                    name: t("general.members"),
                    onPress: () => setGroupDetailsModal(true),
                    hide: !room?.isGroup,
                  },
                  {
                    name: t("user.settings") || "الإعدادات",
                    submenu: [
                      {
                        name: t("callSettingsScreen.title") || "إعدادات المكالمة",
                        onPress: () => {
                          setCallSettingsModal(true);
                        },
                      },
                      {
                        name: t("chatSettingsScreen.title") || "إعدادات الدردشة",
                        onPress: () => {
                          setChatSettingsModal(true);
                        },
                      },
                    ],
                    hide: !room?.isGroup,
                  },
                  {
                    name: t("header.addMember"),
                    onPress: () => handleMenuOption("addMember"),
                    hide: !room?.isGroup || !canAddMembers, // ✅ Hide based on addMembers permission
                  },
                  {
                    name: isChatMuted 
                      ? (t("header.unmuteChat") || "Unmute")
                      : (t("header.muteChat") || "Mute"),
                    onPress: () => {
                      if (isChatMuted) {
                        handleUnmuteChat();
                      } else {
                        setShowMuteModal(true);
                      }
                    },
                  },
                  {
                    name: `${t("chatSettingsScreen.autoDelete.title") || "Disappearing Messages"} (${getAutoDeleteDisplayText})`,
                    submenu: autoDeleteOptions.map((option) => ({
                      name: option.label,
                      onPress: () => updateAutoDeleteTimer(option.value),
                      selected: autoDeleteTimer === option.value,
                    })),
                    hide: !canModifyDisappearingMessages, // ✅ Hide if user doesn't have permission
                  },
                  {
                    name: t("header.clearChat"),
                    onPress: () => handleMenuOption("clearChat"),
                  },
                  {
                    name: youBlockedUser
                      ? t("header.unblockUser")
                      : t("header.blockUser"),
                    onPress: () => handleMenuOption("blockUser"),
                    hide: room?.isGroup,
                  },
                  {
                    name: "Report user",
                    onPress: () => setReportModal(true),
                    hide: room?.isGroup,
                  },
                  {
                    name: t("header.exitGroup"),
                    onPress: () => {
                      if (socket) {
                        socket.emit("exitRoom", {
                          room: room?._id,
                        });
                      }
                      setSelectedMessages([]);
                      const prev = prevScreens.filter(
                        (screen) =>
                          ![
                            "Profile",
                            "Chat",
                            "User",
                            "UpdateProfile",
                            "UserInfo",
                            "Visibility",
                            "Content",
                            "Interaction",
                            "Network",
                            "Password",
                            "Email",
                            "Phone",
                            "Main",
                            "Notifications",
                            "Settings",
                            "VerifyPhone",
                            "VerifyEmail",
                            "ForgotPassword",
                            "PhoneAuth",
                            "Login",
                            "Signup",
                            "Welcome",
                            "ResetPassword",
                            "Auth",
                            "Init",
                          ].includes(screen)
                      );
                      const prevScreen = prev[prev?.length - 1];
                      if (router.canGoBack()) {
                        navigateBackSafely();
                      } else {
                        router.push("/chats");
                      }
                    },
                    hide: !room?.isGroup,
                  },
                  {
                    name: t("header.cancel"),
                    onPress: () => {},
                  },
                ]}
                placement="bottom"
                width={220}
              >
                <Icon
                  name="ellipsis-vertical"
                  size={24}
                  color={isDarkColorScheme ? "#dee4e6" : "#2D2D37"}
                />
              </ContextMenu>
            </View>
          )}
        </View>
      </>
    );
  }
);

export default Header;
