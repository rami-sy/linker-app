/**
 * MediaSoup Call Component
 * مكون بسيط لعرض المكالمة باستخدام MediaSoup
 * يدعم المكالمات الفردية والجماعية
 */

import React, {
  useEffect,
  useRef,
  useContext,
  useState,
  useMemo,
  useCallback,
} from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Platform,
  Animated,
  Easing,
  useWindowDimensions,
  TextInput,
} from "react-native";
import { RTCView } from "../components/chat/web-rtc";
import { useSelector } from "react-redux";
import FeIcon from "react-native-vector-icons/Feather";
import MdIcon from "react-native-vector-icons/MaterialCommunityIcons";
import Icon from "react-native-vector-icons/Ionicons";
import OIcon from "react-native-vector-icons/Octicons";
import { MediasoupContext } from "../contexts/mediasoup.context";
import DeviceSettings from "./call/DeviceSettings";
import DeviceErrorHandler from "./call/DeviceErrorHandler";
import AudioLevelIndicator from "./call/AudioLevelIndicator";
import logger from "../utils/logger";
import {
  getUserFriendlyError,
  getSimpleErrorMessage,
} from "../utils/userFriendlyErrors";
import ImagePlaceholder from "./image-placeholder";
import getFullName from "../utils/getFullName";
import { UserImage, UserName } from "./user";
import RoleBadge from "./chat/role-badge";
import useSelectedRoom from "../hooks/use-selected-room";
import Box from "./box";
import ContextMenu from "./context-menu";
import Button from "./button";
import Tooltip from "./tooltip";
import { SocketContext } from "../contexts/socket.context";
import NetworkQualityIndicator from "./network-quality-indicator";
import Modal from "./modal";
import { ACTIVE_SPEAKER } from "../constants/mediasoup.constants";
import { useDispatch } from "react-redux";
import { addAlert } from "../redux/alertSlice";
import {
  updateRoom,
  addUserTyping,
  removeUserTyping,
} from "../redux/chatSlice";
import Popup from "./popup";
import { useTranslation } from "react-i18next";
import { router } from "expo-router";
import StreamChatOverlay from "./stream-chat-overlay"; // ✅ Import StreamChatOverlay
import StreamChatInputField from "./stream-chat-input-field"; // ✅ Import StreamChatInputField
import CategoryPicker from "./category-picker"; // ✅ Import CategoryPicker
import MediasoupCallDuration from "./mediasoup-call-duration";
import { setMe } from "../redux/userSlice"; // ✅ Import setMe
import { useColorScheme } from "~/lib/useColorScheme";
import CallSettingsPopup from "./chat/call-settings-popup";
// import StreamChatInput from "./stream-chat-input"; // ✅ Import StreamChatInput

// ✅ Control Icons with Auto-Hide Animation Component
const ControlIconsWithAutoHide = ({ 
  children, 
  tileId, 
  onTilePress,
  controlsOpacityRef,
  controlsTimeoutRef 
}) => {
  // ✅ Initialize opacity animation for this tile if not exists
  if (!controlsOpacityRef.current[tileId]) {
    controlsOpacityRef.current[tileId] = new Animated.Value(1);
  }
  const opacityAnim = controlsOpacityRef.current[tileId];

  // ✅ Function to show controls with animation
  const showControls = useCallback(() => {
    // Clear existing timeout
    if (controlsTimeoutRef.current[tileId]) {
      clearTimeout(controlsTimeoutRef.current[tileId]);
    }
    
    // Show with animation
    Animated.timing(opacityAnim, {
      toValue: 1,
      duration: 300,
      easing: Easing.out(Easing.ease),
      useNativeDriver: true,
    }).start();

    // Hide after 3 seconds
    controlsTimeoutRef.current[tileId] = setTimeout(() => {
      Animated.timing(opacityAnim, {
        toValue: 0,
        duration: 300,
        easing: Easing.in(Easing.ease),
        useNativeDriver: true,
      }).start();
    }, 3000);
  }, [tileId, opacityAnim]);

  // ✅ Auto-hide after initial display
  useEffect(() => {
    const timer = setTimeout(() => {
      Animated.timing(opacityAnim, {
        toValue: 0,
        duration: 300,
        easing: Easing.in(Easing.ease),
        useNativeDriver: true,
      }).start();
    }, 3000);

    return () => clearTimeout(timer);
  }, [tileId, opacityAnim]);

  // ✅ Attach showControls to onTilePress
  useEffect(() => {
    if (onTilePress) {
      // Store the showControls function so it can be called from parent
      onTilePress.current = showControls;
    }
  }, [showControls, onTilePress]);

  return (
    <Animated.View style={{ opacity: opacityAnim }}>
      {children}
    </Animated.View>
  );
};

// ✅ Raised Hand Icon Component with Animation
const RaisedHandIconWithAnimation = ({ isDarkColorScheme, size = 16 }) => {
  const shakeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Start continuous shake animation
    const shakeAnimation = Animated.loop(
      Animated.sequence([
        Animated.timing(shakeAnim, {
          toValue: 1,
          duration: 200,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(shakeAnim, {
          toValue: 0,
          duration: 200,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );
    shakeAnimation.start();

    return () => {
      shakeAnimation.stop();
    };
  }, [shakeAnim]);

  return (
    <Animated.View
      style={{
        transform: [
          {
            rotate: shakeAnim.interpolate({
              inputRange: [0, 0.5, 1],
              outputRange: ["-15deg", "15deg", "-15deg"],
            }),
          },
        ],
      }}
    >
      <MdIcon
        name="hand-back-left"
        size={size}
        color="#fbbf24" // ✅ لون أصفر ثابت للأيقونة
      />
    </Animated.View>
  );
};

// ✅ Speaking Indicator Component with Animation (3 bars like audio visualizer)
const SpeakingIndicator = () => {
  const bar1Anim = useRef(new Animated.Value(0.4)).current;
  const bar2Anim = useRef(new Animated.Value(0.7)).current;
  const bar3Anim = useRef(new Animated.Value(0.5)).current;

  useEffect(() => {
    // Animate bars with different timings for natural effect
    const animateBar = (anim, duration, delay = 0) => {
      return Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(anim, {
            toValue: 1,
            duration: duration,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(anim, {
            toValue: 0.3,
            duration: duration,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ])
      );
    };

    const anim1 = animateBar(bar1Anim, 300, 0);
    const anim2 = animateBar(bar2Anim, 250, 100);
    const anim3 = animateBar(bar3Anim, 350, 50);

    anim1.start();
    anim2.start();
    anim3.start();

    return () => {
      anim1.stop();
      anim2.stop();
      anim3.stop();
    };
  }, [bar1Anim, bar2Anim, bar3Anim]);

  return (
    <View className="flex-row items-end gap-x-0.5 h-3">
      <Animated.View
        className="w-1 bg-emerald-500 rounded-full"
        style={{
          height: 12,
          transform: [{ scaleY: bar1Anim }],
        }}
      />
      <Animated.View
        className="w-1 bg-emerald-500 rounded-full"
        style={{
          height: 12,
          transform: [{ scaleY: bar2Anim }],
        }}
      />
      <Animated.View
        className="w-1 bg-emerald-500 rounded-full"
        style={{
          height: 12,
          transform: [{ scaleY: bar3Anim }],
        }}
      />
    </View>
  );
};

const MediasoupCall = ({
  roomId,
  isVideoCall = true,
  onClose,
  isViewer = false,
  isRecorder = false, // ✅ New prop for recorder mode
}) => {
  // ✅ Debug: التأكد من أن isViewer يتم تمريره بشكل صحيح (لوغ واحد فقط عند التغيير)
  useEffect(() => {
    // لوغ واحد فقط عند تغيير isViewer
    if (isViewer) {
      logger.callEvent(
        "MediasoupCall: isViewer is true - hiding controls for viewer",
        { roomId }
      );
    }
  }, [isViewer, roomId]);

  const { user: currentUser } = useSelector((state) => state.users);
  const { isDarkColorScheme } = useColorScheme();
  const theme = isDarkColorScheme ? "dark" : "light";
  
  // ✅ Call Settings Modal state (must be defined before useCallback that uses it)
  const [showCallSettingsModal, setShowCallSettingsModal] = useState(false);
  const [callSettingsData, setCallSettingsData] = useState({});
  const { usersTyping } = useSelector((state) => state.chats); // ✅ للحصول على typing indicators
  const { socket: currentSocket } = useContext(SocketContext);
  const dispatch = useDispatch();
  const { t } = useTranslation();

  const {
    localStream,
    remoteStreams,
    peers,
    rejectedParticipantsByRoom,
    isJoined,
    isAudioEnabled,
    isVideoEnabled,
    isCaller,
    callStatus, // ✅ حالة المكالمة: 'connecting' | 'ringing' | null
    isCallOnHold, // ✅ حالة المكالمة (On Hold)
    resumeCall, // ✅ استئناف المكالمة المحفوظة
    isRecording, // ✅ حالة التسجيل
    recordingId, // ✅ ID التسجيل
    callId, // ✅ Call ID للمكالمة الحالية
    isRemoteRinging, // ✅ حالة رنين الطرف الآخر
    startRecording, // ✅ بدء التسجيل
    stopRecording, // ✅ إيقاف التسجيل
    joinRoom,
    leaveRoom,
    endCallForAll,
    toggleAudio,
    toggleVideo,
    selectedAudioDevice,
    selectedVideoDevice,
    setSelectedAudioDevice,
    setSelectedVideoDevice,
    startScreenShare,
    stopScreenShare,
    requestScreenShareFromParticipant,
    respondToScreenShareRequest,
    isScreenSharing: isScreenSharingFromContext,
    screenStream,
    isReconnecting,
    reconnectAttempts,
    getConnectionStatistics,
    startLiveStream, // ✅ إضافة startLiveStream من context
    requestLiveStream, // ✅ طلب تحويل المكالمة إلى ستريم
    respondToLiveStreamRequest, // ✅ الرد على طلب تحويل المكالمة إلى ستريم
    startCall, // ✅ إضافة startCall لتحويل نوع المكالمة
    transferCall, // ✅ Call Transfer function
    removeGroupCallParticipant,
    muteAllGroupCallParticipants,
    setGroupCallModerator,
    raiseHand, // ✅ Raise Hand function
    lowerHand, // ✅ Lower Hand function
    raisedHands, // ✅ Set of userIds who raised their hand
    speakingLocksByUserId,
    handRaisePriorityByUserId,
    setParticipantSpeakingLock,
    setParticipantHandRaisePriority,
    hasAudio, // ✅ Device availability
    hasVideo, // ✅ Device availability
    initialCallSettings, // ✅ Call settings received when joining
    initialCallAdmins, // ✅ Call admins received when joining
  } = useContext(MediasoupContext);

  const connectedPeerUserIds = useMemo(() => {
    const ids = new Set();
    (Array.isArray(peers) ? peers : []).forEach((peer) => {
      const userId =
        peer?.userId ||
        peer?.metadata?.userId ||
        peer?.userData?._id ||
        peer?.metadata?.user?._id ||
        null;
      if (userId) ids.add(String(userId));
    });
    return ids;
  }, [peers]);

  const rejectedMemberIds = useMemo(() => {
    if (!roomId) return new Set();
    const roomKey = String(roomId);
    const raw = Array.isArray(rejectedParticipantsByRoom?.[roomKey])
      ? rejectedParticipantsByRoom[roomKey]
      : [];
    return new Set(raw.map((value) => String(value)));
  }, [rejectedParticipantsByRoom, roomId]);

  const getMemberCallState = useCallback(
    (member) => {
      const memberId = member?._id ? String(member._id) : null;
      if (memberId && rejectedMemberIds.has(memberId)) {
        return { text: t("call.rejected") || "Rejected", tone: "rejected" };
      }
      if (memberId && connectedPeerUserIds.has(memberId)) {
        return { text: t("call.inCall") || "In call", tone: "inCall" };
      }
      return { text: t("call.ringingUser") || "Ringing...", tone: "ringing" };
    },
    [connectedPeerUserIds, rejectedMemberIds, t]
  );

  // ✅ Find caller userData from peers or room
  const callerUserData = useMemo(() => {
    if (isCaller) {
      // If current user is caller, use their settings
      return currentUser;
    }
    // Find caller from peers (the one who started the call)
    // In a call, the caller is typically the first peer or the one with isCaller flag
    // For now, we'll use the first peer that's not the current user
    const callerPeer = peers.find((p) => 
      p.userData?._id?.toString() !== currentUser?._id?.toString()
    );
    return callerPeer?.userData || null;
  }, [isCaller, peers, currentUser]);

  // ✅ Create activeCallData from available data for permission checking
  const activeCallData = useMemo(() => {
    return {
      _id: callId,
      caller: isCaller ? currentUser?._id : callerUserData?._id,
      callSettings: callSettingsData,
      callAdmins: initialCallAdmins || [], // ✅ Populated from server when joining
    };
  }, [callId, isCaller, currentUser?._id, callerUserData?._id, callSettingsData, initialCallAdmins]);

  // ✅ Helper function to check call permissions based on activeCallData.callSettings
  // Now reads from Call.callSettings instead of User.privacySettings.callSettings
  // MUST be defined after activeCallData and callerUserData
  // ✅ checkCallPermission is defined here after room data is available

  // ✅ Initialize callSettingsData from initialCallSettings when joining a call
  useEffect(() => {
    if (initialCallSettings && Object.keys(callSettingsData).length === 0) {
      // Convert string values to arrays for backward compatibility
      const convertedSettings = {};
      Object.keys(initialCallSettings).forEach((key) => {
        if (key.endsWith("AllowedUsers") || key.endsWith("ExceptUsers")) {
          convertedSettings[key] = initialCallSettings[key];
        } else {
          const value = initialCallSettings[key];
          convertedSettings[key] = Array.isArray(value) ? value : (value ? [value] : []);
        }
      });
      
      setCallSettingsData(convertedSettings);
      logger.callEvent("Call settings initialized from joinRoom callback", { callSettings: convertedSettings });
    }
  }, [initialCallSettings]);

  // ✅ Load call settings when modal opens
  // Now uses Call.callSettings (activeCallData.callSettings)
  useEffect(() => {
    if (showCallSettingsModal) {
      // ✅ Use activeCallData.callSettings from the current call
      const settingsToUse = activeCallData?.callSettings || {};
      
      // Convert string values to arrays for backward compatibility
      const convertedSettings = {};
      Object.keys(settingsToUse).forEach((key) => {
        if (key.endsWith("AllowedUsers") || key.endsWith("ExceptUsers")) {
          convertedSettings[key] = settingsToUse[key];
        } else {
          const value = settingsToUse[key];
          convertedSettings[key] = Array.isArray(value) ? value : (value ? [value] : []);
        }
      });
      
      setCallSettingsData(convertedSettings);
    }
  }, [showCallSettingsModal, activeCallData?.callSettings]);

  // ✅ Listen for call settings updates from other participants
  useEffect(() => {
    if (!currentSocket || !roomId) return;

    const handleCallSettingsUpdated = ({ callId: updatedCallId, callSettings, updatedBy }) => {
      logger.callEvent("Call settings updated received", { callId: updatedCallId, callSettings, updatedBy });
      
      // ✅ Update local callSettingsData if it's for the current call
      const incoming = String(updatedCallId ?? "");
      const currentFromActive = String(activeCallData?._id ?? "");
      const currentFromState = String(callId ?? "");
      if (incoming && (incoming === currentFromActive || incoming === currentFromState)) {
        const normalizedSettings = {};
        Object.keys(callSettings || {}).forEach((key) => {
          if (key.endsWith("AllowedUsers") || key.endsWith("ExceptUsers")) {
            normalizedSettings[key] = callSettings[key];
          } else {
            const value = callSettings[key];
            normalizedSettings[key] = Array.isArray(value) ? value : (value ? [value] : []);
          }
        });
        setCallSettingsData(normalizedSettings);
      }
    };

    currentSocket.on("callSettingsUpdated", handleCallSettingsUpdated);

    return () => {
      currentSocket.off("callSettingsUpdated", handleCallSettingsUpdated);
    };
  }, [currentSocket, roomId, activeCallData, callId]);

  // ✅ Listen for media toggle requests (mute/unmute, enable/disable camera)
  useEffect(() => {
    if (!currentSocket || !currentUser?._id) return;

    const handleMediaToggleRequest = ({ targetUserId, mediaType, action, requestedBy, requestedByName }) => {
      // Only process if this request is for the current user
      if (targetUserId !== currentUser._id?.toString() && targetUserId !== currentUser._id) return;

      const actionText = action === "disable" 
        ? (mediaType === "audio" ? t("call.disableMicrophone") : t("call.disableCamera"))
        : (mediaType === "audio" ? t("call.enableMicrophone") : t("call.enableCamera"));
      
      const mediaText = mediaType === "audio" ? t("call.yourMicrophone") : t("call.yourCamera");

      // Show notification to user
      dispatch(
        addAlert({
          type: "info",
          message: t("call.mediaToggleRequest", { 
            name: requestedByName || "Admin", 
            action: actionText,
            media: mediaText 
          }),
          duration: 5000,
        })
      );

      // Auto-toggle the media based on request
      if (mediaType === "audio") {
        if (action === "disable" && isAudioEnabled) {
          toggleAudio();
        } else if (action === "enable" && !isAudioEnabled) {
          toggleAudio();
        }
      } else if (mediaType === "video") {
        if (action === "disable" && isVideoEnabled) {
          toggleVideo();
        } else if (action === "enable" && !isVideoEnabled) {
          toggleVideo();
        }
      }
    };

    currentSocket.on("mediaToggleRequest", handleMediaToggleRequest);

    return () => {
      currentSocket.off("mediaToggleRequest", handleMediaToggleRequest);
    };
  }, [currentSocket, currentUser, dispatch, t, isAudioEnabled, isVideoEnabled, toggleAudio, toggleVideo]);

  // Device Settings Modal
  const [showDeviceSettings, setShowDeviceSettings] = useState(false);
  const [showDeviceError, setShowDeviceError] = useState(false);
  const [deviceError, setDeviceError] = useState(null);
  const [isContextMenuOpen, setIsContextMenuOpen] = useState(false);
  // Participants Modal
  const [showParticipantsModal, setShowParticipantsModal] = useState(false);
  const [optimisticModeratorsByUserId, setOptimisticModeratorsByUserId] = useState(
    {}
  );
  const [pendingModeratorOpsByUserId, setPendingModeratorOpsByUserId] = useState(
    {}
  );
  const [
    optimisticallyRemovedParticipantsByUserId,
    setOptimisticallyRemovedParticipantsByUserId,
  ] = useState({});
  const [pendingRemoveParticipantOpsByUserId, setPendingRemoveParticipantOpsByUserId] =
    useState({});
  const [pendingSpeakingLockOpsByUserId, setPendingSpeakingLockOpsByUserId] =
    useState({});
  const [pendingHandPriorityOpsByUserId, setPendingHandPriorityOpsByUserId] =
    useState({});
  const [moderationActivityFeed, setModerationActivityFeed] = useState([]);
  const [showScreenShareSettings, setShowScreenShareSettings] = useState(false);
  // Call Quality Metrics Modal
  const [showQualityMetrics, setShowQualityMetrics] = useState(false);
  const [qualityMetrics, setQualityMetrics] = useState(null);
  const qualityMetricsIntervalRef = useRef(null);
  const typingTimeoutsRef = useRef({}); // ✅ لتتبع typing timeouts

  // Loading States
  const [isJoining, setIsJoining] = useState(false);
  const [isSwitchingDevice, setIsSwitchingDevice] = useState(false);
  const [isStartingScreenShare, setIsStartingScreenShare] = useState(false);
  const [isConvertingToStream, setIsConvertingToStream] = useState(false);
  
  // ✅ Control icons visibility state (لإخفاء/إظهار الأيقونات تدريجياً)
  const controlsOpacityRef = useRef({}); // { tileId: Animated.Value }
  const controlsTimeoutRef = useRef({}); // { tileId: timeout }
  
  // ✅ Stream ended state (للمشاهدين - لمنع عرض "Calling..." عند انتهاء الستريم)
  const [streamEnded, setStreamEnded] = useState(false);

  // Live Stream Request Modal
  const [showLiveStreamRequestModal, setShowLiveStreamRequestModal] =
    useState(false);
  const [liveStreamRequest, setLiveStreamRequest] = useState(null);
  const [isWaitingForResponse, setIsWaitingForResponse] = useState(false);

  // ✅ Call Transfer Modal
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [transferSearchQuery, setTransferSearchQuery] = useState("");
  const [isTransferring, setIsTransferring] = useState(false);

  // UX: pin a tile (speaker view scaffolding)
  const [pinnedId, setPinnedId] = useState(null);
  // ترتيب العناصر: العنصر المثبت يكون في الأول
  const [pinnedForOrderId, setPinnedForOrderId] = useState(null);
  const [isMinimized, setIsMinimized] = useState(false);
  // Active speaker detection
  const [activeSpeakerId, setActiveSpeakerId] = useState(null);
  // Audio levels for each peer (for visual indicator)
  const [audioLevels, setAudioLevels] = useState({}); // { peerId: level (0-255) }
  const [viewerComment, setViewerComment] = useState("");
  const [isSendingViewerComment, setIsSendingViewerComment] = useState(false);
  const [showBroadcasterChatInput, setShowBroadcasterChatInput] = useState(false); // ✅ State for broadcaster chat input visibility
  const [broadcasterComment, setBroadcasterComment] = useState(""); // ✅ State for broadcaster comment text
  const [isSendingBroadcasterComment, setIsSendingBroadcasterComment] = useState(false); // ✅ State for broadcaster comment sending status
  const [localViewersCount, setLocalViewersCount] = useState(null); // ✅ Local state for viewers count (for viewers who don't have room in Redux)
  // Auto-hide UI controls
  const [showUI, setShowUI] = useState(true);
  const uiHideTimerRef = useRef(null);
  const topBarSlideAnim = useRef(new Animated.Value(0)).current; // 0 = visible, -100 = hidden up
  const controlsSlideAnim = useRef(new Animated.Value(0)).current; // 0 = visible, 100 = hidden down
  const audioAnalysersRef = useRef({});
  const audioContextRef = useRef(null);
  const animationFrameRef = useRef(null);
  const speakerStateRef = useRef({
    lastSpeakerId: null,
    speakerStartTime: null,
    lastUpdateTime: 0,
    audioLevels: {}, // لتخزين المستويات الحالية
  }); // لتجنب إعادة render المتكررة

  // Refs لتخزين video/audio elements للتنظيف
  const videoRefs = useRef({}); // Map<peerId, HTMLVideoElement>
  const audioRefs = useRef({}); // Map<peerId, HTMLAudioElement>

  // ✅ استخدام roomId من props إذا كان متوفراً، وإلا من Redux state
  const room = useSelectedRoom(roomId);

  useEffect(() => {
    setOptimisticModeratorsByUserId({});
    setPendingModeratorOpsByUserId({});
    setOptimisticallyRemovedParticipantsByUserId({});
    setPendingRemoveParticipantOpsByUserId({});
  }, [roomId, callId]);

  useEffect(() => {
    if (!room?.isGroup) return;
    setOptimisticModeratorsByUserId((prev) => {
      const keys = Object.keys(prev || {});
      if (keys.length === 0) return prev;
      const ownerId =
        room?.user?._id?.toString?.() ||
        room?.user?.toString?.() ||
        String(room?.user || "");
      let changed = false;
      const next = { ...prev };
      keys.forEach((userIdKey) => {
        const normalizedUserId = String(userIdKey || "");
        const role = room?.roles?.find((r) => {
          const roleUserId =
            r?.user?._id?.toString?.() ||
            r?.user?.toString?.() ||
            String(r?.user || "");
          return roleUserId === normalizedUserId;
        })?.role;
        const actualIsModerator =
          normalizedUserId !== ownerId && role === "moderator";
        if (Boolean(prev[userIdKey]) === actualIsModerator) {
          delete next[userIdKey];
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [room?.isGroup, room?.roles, room?.user]);

  useEffect(() => {
    setOptimisticallyRemovedParticipantsByUserId((prev) => {
      const keys = Object.keys(prev || {});
      if (keys.length === 0) return prev;
      let changed = false;
      const next = { ...prev };
      keys.forEach((userIdKey) => {
        const normalizedUserId = String(userIdKey || "");
        const isPending = Boolean(
          pendingRemoveParticipantOpsByUserId?.[normalizedUserId]
        );
        const isStillConnected = connectedPeerUserIds.has(normalizedUserId);
        if (!isPending && !isStillConnected) {
          delete next[normalizedUserId];
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [connectedPeerUserIds, pendingRemoveParticipantOpsByUserId]);

  // ✅ checkCallPermission - defined here after room is available for role checking
  const checkCallPermission = useCallback((setting, userId, userData) => {
    const callerId = activeCallData?.caller?.toString() || callerUserData?._id?.toString();
    const ownerId =
      room?.user?._id?.toString?.() ||
      room?.user?.toString?.() ||
      String(room?.user ?? "");

    // ✅ Use active call's callSettings (Call.callSettings)
    const callSettings = activeCallData?.callSettings || callSettingsData || {};
    const permission = callSettings?.[setting];
    const rawAllowedUsers = callSettings?.[`${setting}AllowedUsers`] || [];
    const rawExceptUsers = callSettings?.[`${setting}ExceptUsers`] || [];
    const allowedUsers = Array.isArray(rawAllowedUsers)
      ? rawAllowedUsers
      : rawAllowedUsers
        ? [rawAllowedUsers]
        : [];
    const exceptUsers = Array.isArray(rawExceptUsers)
      ? rawExceptUsers
      : rawExceptUsers
        ? [rawExceptUsers]
        : [];
    const normalizedUserId = String(userId ?? "");
    const isExcluded = exceptUsers.some(
      (id) => String(id ?? "") === normalizedUserId
    );

    const permissionArray = Array.isArray(permission) ? permission : [permission];
    const isOwner = normalizedUserId === String(ownerId ?? "");

    const logDecision = (result) => {
      return result;
    };

    // ✅ Room owner is the privileged "Me" for group call controls
    if (isOwner) {
      return logDecision(true, "room_owner_override");
    }

    // Exclusions apply for non-owner users
    if (isExcluded) {
      return logDecision(false, "excluded_by_except_users");
    }

    // If no settings, use legacy-safe defaults by action
    if (!permission || (Array.isArray(permission) && permission.length === 0)) {
      if (setting === "screenShare") {
        return logDecision(true, "default_fallback_screen_share");
      }
      if (setting === "endCallForAll") {
        return logDecision(false, "default_fallback_end_for_all_denied");
      }
      return logDecision(false, "default_fallback_denied");
    }
    
    // If "noOne", only the caller can use it (already checked above)
    if (permissionArray.includes("noOne")) {
      return logDecision(false, "no_one");
    }
    
    // If "everyone", all users can use it
    if (permissionArray.includes("everyone")) {
      return logDecision(true, "everyone");
    }
    
    // ✅ If "admin", check if user is room admin (from room.roles)
    if (permissionArray.includes("admin")) {
      const isRoomAdmin = room?.roles?.some(
        (r) => r.role === "admin" && r.user?.toString() === userId
      );
      if (isRoomAdmin) return logDecision(true, "admin_role");
      
      // Also check callAdmins
      const callAdmins = activeCallData?.callAdmins || [];
      if (callAdmins.some(id => id?.toString() === userId)) {
        return logDecision(true, "call_admin");
      }
    }
    
    // ✅ If "moderator", check if user is room moderator (from room.roles)
    if (permissionArray.includes("moderator")) {
      const isRoomModerator = room?.roles?.some(
        (r) => r.role === "moderator" && r.user?.toString() === userId
      );
      if (isRoomModerator) return logDecision(true, "moderator_role");
    }
    
    // ✅ If "friends", check if current user is a friend of the caller
    if (permissionArray.includes("friends")) {
      // Check if userId is in caller's friends list
      const callerFriends = callerUserData?.friends || [];
      const isFriendOfCaller = callerFriends.some(
        (friendId) => friendId?.toString() === userId?.toString()
      );
      if (isFriendOfCaller) return logDecision(true, "friends_caller_has_user");
      
      // Also check if caller is in user's friends list (bidirectional)
      const userFriends = currentUser?.friends || [];
      const callerIsFriend = userFriends.some(
        (friendId) => friendId?.toString() === callerId
      );
      if (callerIsFriend) return logDecision(true, "friends_user_has_caller");
    }
    
    // If "specific", check if user is in allowedUsers
    if (permissionArray.includes("specific") && allowedUsers.length > 0) {
      if (allowedUsers.some(id => id?.toString() === userId)) {
        return logDecision(true, "specific_allowed_users");
      }
    }
    
    return logDecision(false, "no_matching_permission");
  }, [currentUser, activeCallData, callSettingsData, callerUserData, room]);

  /**
   * حساب hash بسيط لـ metadata لتجنب استخدام JSON.stringify المكلف
   */
  const metadataHash = useMemo(() => {
    return peers
      .map(
        (p) =>
          `${p.peerId || "unknown"}-${p.metadata?.isAudioEnabled ? "1" : "0"}-${p.metadata?.isVideoEnabled ? "1" : "0"}-${p.metadata?.isScreenSharing ? "1" : "0"}`
      )
      .join("|");
  }, [peers]);

  // حساب entries مع useMemo لضمان إعادة الحساب عند تغيير metadata
  const entries = useMemo(() => {
    if (peers.length === 0) return [];

    // معالجة remote streams (video/audio عادي + screen share)
    const validRemote = [];
    const screenShareEntries = [];

    Object.entries(remoteStreams).forEach(([streamKey, stream]) => {
      if (!stream) return;

      const hasTracks =
        (stream.getVideoTracks()?.length || 0) > 0 ||
        (stream.getAudioTracks()?.length || 0) > 0;
      if (!hasTracks) return;

      // التحقق إذا كان stream key يحتوي على "-screen" (screen share stream)
      const isScreenShare = streamKey.endsWith("-screen");
      const peerId = isScreenShare
        ? streamKey.replace("-screen", "")
        : streamKey;
        const peer = peers.find((p) => p.peerId === peerId);

      if (!peer) return;

      // ✅ فلترة viewers: في الستريم، فقط broadcasters يجب أن يظهروا
      // إذا كان المستخدم viewer، لا نعرضه في قائمة المشاركين
      if (
        room?.liveStreamSettings?.isLive &&
        peer.metadata?.role === "viewer"
      ) {
        return; // تخطي viewers في الستريم
      }

        const displayName = getFullName(peer?.userData, false, 12);
      const entry = {
        id: streamKey, // استخدام streamKey كـ id فريد
          stream,
        name: isScreenShare ? `${displayName}'s Screen` : displayName, // إضافة "Screen" للاسم
          isLocal: false,
          userData: peer?.userData,
        userId: peer?.userId,
        peerId: peerId, // حفظ peerId الأصلي
        isScreenShare: isScreenShare, // علامة للتمييز
        metadata: isScreenShare
          ? {
              isAudioEnabled: false,
              isVideoEnabled: true,
              isScreenSharing: true,
            } // screen share لا يحتوي على audio
          : peer?.metadata || {
              isAudioEnabled: true,
              isVideoEnabled: true,
              isScreenSharing: false,
            },
      };

      if (isScreenShare) {
        screenShareEntries.push(entry);
      } else {
        validRemote.push(entry);
      }
    });

    // إضافة local screen share entry إذا كان موجوداً
    const localScreenShareEntry = screenStream
      ? {
          id: "local-screen",
          stream: screenStream,
          name: "Your Screen",
          isLocal: true,
          userData: currentUser,
          userId: currentUser?._id,
          peerId: "local",
          isScreenShare: true,
          metadata: {
            isAudioEnabled: false,
            isVideoEnabled: true,
            isScreenSharing: true,
          },
        }
      : null;

    // ✅ في الستريم، إذا كان المستخدم viewer، لا نعرض local stream
    // ✅ أيضاً، لا نعرض local stream إذا كان null أو غير موجود
    const shouldShowLocal =
      !isViewer && localStream !== null && localStream !== undefined;

    const allEntries = [
      // إضافة local entry فقط إذا لم يكن viewer وكان localStream موجوداً
      ...(shouldShowLocal
        ? [
      {
              id: "local",
        stream: localStream,
              name: getFullName(currentUser, false, 12) || "You",
        isLocal: true,
        userData: currentUser,
              userId: currentUser?._id,
              peerId: "local",
              isScreenShare: false,
              metadata: {
                isAudioEnabled,
                isVideoEnabled,
                isScreenSharing: isScreenSharingFromContext,
              },
            },
          ]
        : []),
      ...validRemote,
      ...(localScreenShareEntry && shouldShowLocal
        ? [localScreenShareEntry]
        : []),
      ...screenShareEntries, // إضافة screen share entries في النهاية
    ];

    // ترتيب العناصر: إذا كان هناك pinnedForOrderId، نضعه في الأول
    if (pinnedForOrderId) {
      const pinnedIndex = allEntries.findIndex(
        (e) => e.id === pinnedForOrderId
      );
      if (pinnedIndex > 0) {
        const pinnedEntry = allEntries[pinnedIndex];
        const otherEntries = allEntries.filter((_, idx) => idx !== pinnedIndex);
        return [pinnedEntry, ...otherEntries];
      }
    }

    return allEntries;
  }, [
    peers,
    remoteStreams,
    localStream,
    screenStream, // إضافة screenStream للـ dependencies
    currentUser,
    isAudioEnabled,
    isVideoEnabled,
    isScreenSharingFromContext,
    pinnedForOrderId, // إضافة dependency على pinnedForOrderId
    // استخدام metadataHash بدلاً من JSON.stringify لتوفير الأداء
    metadataHash,
  ]);

  // Reset UI visibility timer on any interaction
  const resetUIHideTimer = useCallback(() => {
    if (uiHideTimerRef.current) {
      clearTimeout(uiHideTimerRef.current);
    }

    // Show UI immediately
    setShowUI(true);
    Animated.parallel([
      Animated.timing(topBarSlideAnim, {
        toValue: 0,
        duration: 300,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
      Animated.timing(controlsSlideAnim, {
        toValue: 0,
        duration: 300,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
    ]).start();

    // إذا كان screen sharing نشطاً أو القائمة مفتوحة، لا نخفي البار السفلي أبداً
    if (isScreenSharingFromContext || isContextMenuOpen) {
      // إبقاء البار السفلي ظاهر دائماً
      return;
    }

    // Hide after 6 seconds of inactivity (only if call is active and not screen sharing and menu is closed)
    if (peers.length > 0) {
      uiHideTimerRef.current = setTimeout(() => {
        setShowUI(false);
        Animated.parallel([
          Animated.timing(topBarSlideAnim, {
            toValue: -100,
            duration: 300,
            easing: Easing.in(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(controlsSlideAnim, {
            toValue: 100,
            duration: 300,
            easing: Easing.in(Easing.ease),
            useNativeDriver: true,
          }),
        ]).start();
      }, 6000);
    }
  }, [
    peers.length,
    topBarSlideAnim,
    controlsSlideAnim,
    isScreenSharingFromContext,
    isContextMenuOpen,
  ]);

  // Initialize and reset timer on peers change
  useEffect(() => {
    if (peers.length > 0) {
      resetUIHideTimer();
    } else {
      // Show UI immediately when no peers (waiting state)
      setShowUI(true);
      Animated.parallel([
        Animated.timing(topBarSlideAnim, {
          toValue: 0,
          duration: 0,
          useNativeDriver: true,
        }),
        Animated.timing(controlsSlideAnim, {
          toValue: 0,
          duration: 0,
          useNativeDriver: true,
        }),
      ]).start();
    }

    // إذا كان screen sharing نشطاً، تأكد من أن البار السفلي ظاهر دائماً
    if (isScreenSharingFromContext) {
      setShowUI(true);
      Animated.parallel([
        Animated.timing(topBarSlideAnim, {
          toValue: 0,
          duration: 300,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(controlsSlideAnim, {
          toValue: 0,
          duration: 300,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
      ]).start();

      // إلغاء أي timer موجود لمنع إخفاء البار
      if (uiHideTimerRef.current) {
        clearTimeout(uiHideTimerRef.current);
        uiHideTimerRef.current = null;
      }
    }

    return () => {
      if (uiHideTimerRef.current) {
        clearTimeout(uiHideTimerRef.current);
      }
    };
  }, [
    peers.length,
    resetUIHideTimer,
    topBarSlideAnim,
    controlsSlideAnim,
    isScreenSharingFromContext,
  ]);

  // Handle clicks/touches anywhere on screen to show UI
  const handleScreenInteraction = useCallback(() => {
    resetUIHideTimer();
  }, [resetUIHideTimer]);

  const handleSendViewerComment = useCallback(() => {
    // ✅ Use callId or room._id for streamId, and check callId instead of room?.liveStreamSettings?.isLive
    if (
      !isViewer ||
      (!room?._id && !callId) ||
      (!callId && !room?.liveStreamSettings?.isLive) ||
      !viewerComment.trim() ||
      isSendingViewerComment ||
      !currentSocket
    ) {
      logger.debug("Cannot send viewer comment - missing requirements", {
        isViewer,
        hasRoomId: !!room?._id,
        hasCallId: !!callId,
        hasLiveStream: !!room?.liveStreamSettings?.isLive,
        hasComment: !!viewerComment.trim(),
        isSending: isSendingViewerComment,
        hasSocket: !!currentSocket,
      });
      return;
    }

    const pendingComment = viewerComment.trim();
    const streamId = callId || room?._id; // ✅ Use callId if available, otherwise room._id
    
    setViewerComment("");
    setIsSendingViewerComment(true);

    const timeoutId = setTimeout(() => {
      setIsSendingViewerComment(false);
    }, 4000);

    logger.debug("Sending stream comment", {
      streamId,
      commentLength: pendingComment.length,
      callId,
      roomId: room?._id,
    });

    currentSocket.emit(
      "sendStreamComment",
      {
        streamId: streamId, // ✅ Use callId or room._id
        comment: pendingComment,
      },
      (response) => {
        clearTimeout(timeoutId);
        if (!response?.success) {
          logger.error("Error sending viewer comment:", response?.error);
          setViewerComment(pendingComment);
        } else {
          logger.debug("Stream comment sent successfully", { streamId });
        }
        setIsSendingViewerComment(false);
      }
    );

    handleScreenInteraction();
  }, [
    currentSocket,
    handleScreenInteraction,
    isSendingViewerComment,
    isViewer,
    room?._id,
    callId, // ✅ Add callId to dependencies
    room?.liveStreamSettings?.isLive,
    viewerComment,
  ]);

  // ✅ Handle sending broadcaster comment (same logic as viewer comment)
  const handleSendBroadcasterComment = useCallback(() => {
    if (
      isViewer ||
      (!room?._id && !callId) ||
      (!callId && !room?.liveStreamSettings?.isLive) ||
      !broadcasterComment.trim() ||
      isSendingBroadcasterComment ||
      !currentSocket
    ) {
      logger.debug("Cannot send broadcaster comment - missing requirements", {
        isViewer,
        hasRoomId: !!room?._id,
        hasCallId: !!callId,
        hasLiveStream: !!room?.liveStreamSettings?.isLive,
        hasComment: !!broadcasterComment.trim(),
        isSending: isSendingBroadcasterComment,
        hasSocket: !!currentSocket,
      });
      return;
    }

    const pendingComment = broadcasterComment.trim();
    const streamId = callId || room?._id;
    
    setBroadcasterComment("");
    setIsSendingBroadcasterComment(true);

    const timeoutId = setTimeout(() => {
      setIsSendingBroadcasterComment(false);
    }, 4000);

    logger.debug("Sending broadcaster comment", {
      streamId,
      commentLength: pendingComment.length,
      callId,
      roomId: room?._id,
    });

    currentSocket.emit(
      "sendStreamComment",
      {
        streamId: streamId,
        comment: pendingComment,
      },
      (response) => {
        clearTimeout(timeoutId);
        if (!response?.success) {
          logger.error("Error sending broadcaster comment:", response?.error);
          setBroadcasterComment(pendingComment);
        } else {
          logger.debug("Broadcaster comment sent successfully", { streamId });
        }
        setIsSendingBroadcasterComment(false);
      }
    );

    handleScreenInteraction();
  }, [
    currentSocket,
    handleScreenInteraction,
    isSendingBroadcasterComment,
    isViewer,
    room?._id,
    callId,
    room?.liveStreamSettings?.isLive,
    broadcasterComment,
  ]);

  const ringAnim = useRef(new Animated.Value(0)).current;
  const ringAnim2 = useRef(new Animated.Value(0)).current;
  const [dots, setDots] = useState("");
  const [connectingDelayed, setConnectingDelayed] = useState(false);
  const RING_TIMEOUT_SEC = 30;
  const [ringSecondsLeft, setRingSecondsLeft] = useState(RING_TIMEOUT_SEC);
  const { width: winW } = useWindowDimensions();
  const avatarSize = useMemo(() => {
    if (winW >= 1200) return "h-28 w-28";
    if (winW >= 768) return "h-24 w-24";
    return "h-20 w-20";
  }, [winW]);

  /**
   * معالجة تغيير الأجهزة
   */
  const handleDeviceChange = (devices) => {
    logger.deviceEvent("Device changed:", devices);
    if (devices.audio) {
      setSelectedAudioDevice(devices.audio);
    }
    if (devices.video) {
      setSelectedVideoDevice(devices.video);
    }
    // يمكن إضافة منطق إعادة تشغيل الـ stream هنا
  };

  /**
   * مشاركة الشاشة
   */
  const handleScreenShare = async () => {
    if (isStartingScreenShare) return; // Prevent multiple simultaneous operations

      if (isScreenSharingFromContext) {
      // Stopping screen share is usually fast, no need for loading state
      try {
        await stopScreenShare();
      } catch (error) {
        logger.error("Error stopping screen share:", error);
        const friendlyError = getUserFriendlyError(error);
        dispatch(
          addAlert({
            type: "error",
            message: `${friendlyError.title}: ${friendlyError.message}`,
          })
        );
      }
      } else {
      setIsStartingScreenShare(true);
      try {
        await startScreenShare();
    } catch (error) {
        logger.error("Error starting screen share:", error);
        const friendlyError = getUserFriendlyError(error);
        dispatch(
          addAlert({
            type: "error",
            message: `${friendlyError.title}: ${friendlyError.message}`,
          })
        );
      } finally {
        setIsStartingScreenShare(false);
      }
    }
  };

  /**
   * تصغير المكالمة
   * المكالمة ستستمر في الخلفية
   */
  const minimizeCall = () => {
    setIsMinimized(true);
    logger.callEvent("Call minimized, continuing in background");
  };

  /**
   * تكبير المكالمة
   */
  const maximizeCall = () => {
    setIsMinimized(false);
    logger.callEvent("Call maximized");
  };

  /**
   * الانضمام للغرفة عند تحميل المكون
   * ✅ تحسين: إذا كان viewer، لا نستدعي joinRoom (لأن live-stream-viewer.js يستدعي joinAsViewer)
   */
  useEffect(() => {
    // ✅ إذا كان viewer، لا نستدعي joinRoom (live-stream-viewer.js يستدعي joinAsViewer بالفعل)
    if (isViewer) {
      logger.callEvent(
        "MediasoupCall: Skipping joinRoom for viewer (joinAsViewer already called)",
        { roomId }
      );
      return;
    }

    if (roomId && currentUser && !isJoined) {
      handleJoinRoom();
    }
  }, [roomId, currentUser, isViewer]); // ✅ إزالة isJoined و leaveRoom من dependencies

  // ✅ Cleanup منفصل: فقط عند unmount أو تغيير roomId
  // ✅ استخدام useRef لتتبع isJoined و isViewer في cleanup
  const isJoinedRef = useRef(isJoined);
  const isViewerRef = useRef(isViewer);

  useEffect(() => {
    isJoinedRef.current = isJoined;
    isViewerRef.current = isViewer;
  }, [isJoined, isViewer]);

  // ✅ Listen for participantRaisedHand notifications (for moderators)
  useEffect(() => {
    if (!currentSocket || !roomId || !callId) return;

    const handleParticipantRaisedHand = ({
      callId: notificationCallId,
      roomId: notificationRoomId,
      userId,
      userData,
    }) => {
      // Only show notification if it's for the current call
      if (notificationCallId === callId && notificationRoomId === roomId) {
        const userName = getFullName(userData, false, 20);
        dispatch(
          addAlert({
            type: "info",
            message: t("call.raiseHand.notification", { name: userName }) || `${userName} raised their hand`,
          })
        );
      }
    };

    // ✅ Listen for handRaised event (for all participants)
    const handleHandRaised = ({
      callId: raisedCallId,
      roomId: raisedRoomId,
      userId,
      userData,
    }) => {
      // Only process if it's for the current call and not the current user
      if (raisedCallId === callId && raisedRoomId === roomId && userId !== currentUser?._id) {
        const userName = getFullName(userData, false, 20);
        dispatch(
          addAlert({
            type: "info",
            message: t("call.raiseHand.notification", { name: userName }) || `${userName} raised their hand`,
          })
        );
      }
    };

    currentSocket.on("participantRaisedHand", handleParticipantRaisedHand);
    currentSocket.on("handRaised", handleHandRaised);

    return () => {
      currentSocket.off("participantRaisedHand", handleParticipantRaisedHand);
      currentSocket.off("handRaised", handleHandRaised);
    };
  }, [currentSocket, roomId, callId, dispatch, t, currentUser?._id]);

  // ✅ Listen for liveStreamStarted to get initial viewersCount (for viewers)
  useEffect(() => {
    if (!currentSocket || !roomId || !isViewer) {
      logger.streamEvent("Skipping liveStreamStarted listener setup", {
        hasSocket: !!currentSocket,
        roomId,
        isViewer,
      });
      return;
    }

    logger.streamEvent("Setting up liveStreamStarted listener for viewer", {
      roomId,
      callId,
    });

    const handleLiveStreamStarted = ({ roomId: eventRoomId, settings, callId: eventCallId }) => {
      logger.streamEvent("liveStreamStarted event received for viewer in MediasoupCall", {
        eventRoomId,
        roomId,
        eventCallId,
        hasSettings: !!settings,
        viewersCount: settings?.viewersCount,
        callId,
        settingsKeys: settings ? Object.keys(settings) : [],
      });
      
      // ✅ Check if this event is for our room
      if (eventRoomId === roomId || eventCallId === callId) {
        // ✅ Set viewersCount from settings if available
        if (settings?.viewersCount !== undefined && settings?.viewersCount !== null) {
          logger.streamEvent("Setting localViewersCount from liveStreamStarted settings", {
            roomId,
            viewersCount: settings.viewersCount,
          });
          setLocalViewersCount(settings.viewersCount);
        } else {
          // ✅ If viewersCount not in settings, set to 1 (the current viewer)
          logger.streamEvent("Setting localViewersCount to 1 (fallback)", {
            roomId,
          });
          setLocalViewersCount(1);
        }
      } else {
        logger.streamEvent("liveStreamStarted event ignored - wrong room", {
          eventRoomId,
          roomId,
          eventCallId,
          callId,
        });
      }
    };

    // ✅ Setup listener immediately
    currentSocket.on("liveStreamStarted", handleLiveStreamStarted);
    
    logger.streamEvent("liveStreamStarted listener registered", {
      roomId,
      callId,
    });

    return () => {
      logger.streamEvent("Cleaning up liveStreamStarted listener", {
        roomId,
      });
      currentSocket.off("liveStreamStarted", handleLiveStreamStarted);
    };
  }, [currentSocket, roomId, isViewer, callId]);

  // ✅ Fallback: Update localViewersCount from Redux when callId is available (for viewers)
  // This handles the case where viewerJoined/liveStreamStarted events arrive before listeners are set up
  useEffect(() => {
    if (!isViewer || !callId || !roomId) return;
    
    // ✅ Check if we have viewersCount in Redux (from useMediasoup hook)
    // This is a fallback in case liveStreamStarted/viewerJoined events were missed
    if (room?.activeStreamViewersCount !== undefined && localViewersCount === null) {
      logger.streamEvent("Setting localViewersCount from Redux activeStreamViewersCount (fallback)", {
        roomId,
        callId,
        viewersCount: room.activeStreamViewersCount,
      });
      setLocalViewersCount(room.activeStreamViewersCount);
    } else if (room?.liveStreamSettings?.viewersCount !== undefined && localViewersCount === null) {
      logger.streamEvent("Setting localViewersCount from liveStreamSettings (fallback)", {
        roomId,
        callId,
        viewersCount: room.liveStreamSettings.viewersCount,
      });
      setLocalViewersCount(room.liveStreamSettings.viewersCount);
    }
  }, [isViewer, callId, roomId, room?.activeStreamViewersCount, room?.liveStreamSettings?.viewersCount, localViewersCount]);
  
  // ✅ Final fallback: If viewer has callId but localViewersCount is still null, set to 1
  useEffect(() => {
    if (isViewer && callId && localViewersCount === null) {
      // Small delay to allow other effects to run first
      const timeoutId = setTimeout(() => {
        if (localViewersCount === null) {
          logger.streamEvent("Setting localViewersCount to 1 (final fallback - callId exists)", {
            roomId,
            callId,
          });
          setLocalViewersCount(1);
        }
      }, 200);
      
      return () => clearTimeout(timeoutId);
    }
  }, [isViewer, callId, localViewersCount, roomId]);

  // ✅ Listen for viewerJoined/viewerLeft notifications (for all participants including viewers)
  useEffect(() => {
    if (!currentSocket || !roomId) {
      logger.streamEvent("Skipping viewerJoined/viewerLeft listener setup", {
        hasSocket: !!currentSocket,
        roomId,
      });
      return;
    }

    logger.streamEvent("Setting up viewerJoined/viewerLeft listeners", {
      roomId,
      isViewer,
    });

    const handleViewerJoined = ({ peerId, userId, userData, viewersCount }) => {
      logger.streamEvent("viewerJoined event received in MediasoupCall", {
        roomId,
        peerId,
        userId,
        viewersCount,
        isViewer,
        currentUserId: currentUser?._id?.toString(),
        isCurrentUser: userId === currentUser?._id?.toString(),
      });
      
      // ✅ Update localViewersCount for viewers (who don't have room in Redux)
      // Update for ALL viewers when any viewer joins (to get updated count)
      if (isViewer && viewersCount !== undefined && viewersCount !== null) {
        logger.streamEvent("Viewer joined - updating localViewersCount", {
          roomId,
          viewersCount,
          isViewer,
          isCurrentUser: userId === currentUser?._id?.toString(),
          previousCount: localViewersCount,
        });
        setLocalViewersCount(viewersCount);
      }

      // ✅ Only show notification for broadcasters
      if (!isViewer) {
        const viewerName =
          userData?.firstName ||
          userData?.userName ||
          userData?.lastName ||
          "A viewer";
        const fullName =
          userData?.firstName && userData?.lastName
            ? `${userData.firstName} ${userData.lastName}`
            : viewerName;

        dispatch(
          addAlert({
            type: "success",
            message:
              t("stream.viewerJoined", {
                name: fullName,
                count: viewersCount || 0,
              }) ||
              `${fullName} joined the stream (${viewersCount || 0} viewers)`,
          })
        );

        logger.streamEvent("Viewer joined notification shown to broadcaster", {
          roomId,
          userId,
          viewersCount,
        });
      }
    };

    const handleViewerLeft = ({ peerId, userId, viewersCount }) => {
      logger.streamEvent("viewerLeft event received in MediasoupCall", {
        roomId,
        peerId,
        userId,
        viewersCount,
        isViewer,
        currentUserId: currentUser?._id,
      });
      
      // ✅ Update localViewersCount for viewers (who don't have room in Redux)
      // Update for ALL viewers when any viewer leaves
      if (isViewer && viewersCount !== undefined && viewersCount !== null) {
        logger.streamEvent("Viewer left - updating localViewersCount", {
          roomId,
          viewersCount,
          isViewer,
          isCurrentUser: userId === currentUser?._id?.toString(),
        });
        setLocalViewersCount(viewersCount);
      }

      // ✅ Only show notification for broadcasters
      if (!isViewer) {
        dispatch(
          addAlert({
            type: "info",
            message:
              t("stream.viewerLeft", {
                count: viewersCount || 0,
              }) || `A viewer left (${viewersCount || 0} viewers remaining)`,
          })
        );

        logger.streamEvent("Viewer left notification shown to broadcaster", {
          roomId,
          userId,
          viewersCount,
        });
      }
    };

    currentSocket.on("viewerJoined", handleViewerJoined);
    currentSocket.on("viewerLeft", handleViewerLeft);
    
    logger.streamEvent("viewerJoined/viewerLeft listeners registered", {
      roomId,
      isViewer,
    });

    return () => {
      logger.streamEvent("Cleaning up viewerJoined/viewerLeft listeners", {
        roomId,
      });
      currentSocket.off("viewerJoined", handleViewerJoined);
      currentSocket.off("viewerLeft", handleViewerLeft);
    };
  }, [currentSocket, roomId, isViewer, dispatch, t, currentUser?._id, localViewersCount]);

  // ✅ استخدام ref لتخزين leaveRoom لتجنب re-run عند تغيير function reference
  const leaveRoomRef = useRef(leaveRoom);
  useEffect(() => {
    leaveRoomRef.current = leaveRoom;
  }, [leaveRoom]);

  useEffect(() => {
    return () => {
      // ✅ فقط عند unmount أو تغيير roomId، نستدعي leaveRoom
      // ✅ استخدام refs لتجنب stale closure
      if (isJoinedRef.current && !isViewerRef.current && roomId) {
        logger.callEvent("MediasoupCall: Cleanup - leaving room", {
          roomId,
          isJoined: isJoinedRef.current,
        });
        leaveRoomRef.current().catch((err) => {
          logger.error("Error leaving room on cleanup:", err);
        });
      }
    };
  }, [roomId]); // ✅ فقط roomId في dependencies - leaveRoom في ref

  // Show small "connecting" badge if joining takes > 3s
  useEffect(() => {
    if (isJoined) {
      setConnectingDelayed(false);
      return;
    }
    let t;
    if (!isJoined) {
      t = setTimeout(() => setConnectingDelayed(true), 3000);
    }
    return () => {
      if (t) clearTimeout(t);
    };
  }, [isJoined]);

  // Ringing animation and dots while waiting
  useEffect(() => {
    if (!isJoined || peers.length > 0) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(ringAnim, {
          toValue: 1,
          duration: 900,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(ringAnim, {
          toValue: 0,
          duration: 900,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
      ])
    );
    const loop2 = Animated.loop(
      Animated.sequence([
        Animated.timing(ringAnim2, {
          toValue: 1,
          duration: 1400,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(ringAnim2, {
          toValue: 0,
          duration: 1400,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    loop2.start();
    const intv = setInterval(
      () => setDots((p) => (p.length >= 3 ? "" : p + ".")),
      500
    );
    return () => {
      loop.stop();
      loop2.stop();
      clearInterval(intv);
    };
  }, [isJoined, peers.length]);

  // Ring timeout countdown: auto-cancel when it reaches zero
  useEffect(() => {
    if (!isJoined || peers.length > 0) {
      setRingSecondsLeft(RING_TIMEOUT_SEC);
      return;
    }
    setRingSecondsLeft(RING_TIMEOUT_SEC);
    const iv = setInterval(() => {
      setRingSecondsLeft((s) => {
        if (s <= 1) {
          clearInterval(iv);
          // Auto cancel
          handleLeaveRoom();
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(iv);
  }, [isJoined, peers.length]);

  /**
   * كشف المتحدث الحالي (Active Speaker Detection)
   * يستخدم Web Audio API لتحليل مستويات الصوت
   */
  useEffect(() => {
    if (Platform.OS !== "web" || !isJoined || peers.length === 0) {
      // إيقاف الكشف إذا لم تكن المكالمة نشطة
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      setActiveSpeakerId(null);
      return;
    }

    // إنشاء AudioContext إذا لم يكن موجوداً
    if (!audioContextRef.current) {
      try {
        const AudioContextClass =
          window.AudioContext || window.webkitAudioContext;
        audioContextRef.current = new AudioContextClass();
      } catch (error) {
        logger.error("Failed to create AudioContext:", error);
        return;
      }
    }

    const audioContext = audioContextRef.current;
    const analysers = {};
    const sources = {};

    // إعداد تحليل الصوت لجميع الـ streams (remote + local)
    const allStreams = [
      ...Object.entries(remoteStreams).map(([peerId, stream]) => ({
        id: peerId,
        stream,
        isLocal: false,
      })),
      ...(localStream
        ? [{ id: "local", stream: localStream, isLocal: true }]
        : []),
    ];

    allStreams.forEach(({ id, stream, isLocal }) => {
      if (!stream) return;

      const audioTracks = stream.getAudioTracks();
      if (audioTracks.length === 0) return;

      try {
        // إنشاء MediaStreamSource من الـ stream
        const source = audioContext.createMediaStreamSource(stream);
        sources[id] = source;

        // إنشاء AnalyserNode
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.8;
        analysers[id] = analyser;

        // ربط Source بالـ Analyser
        source.connect(analyser);
      } catch (error) {
        logger.error(`Failed to setup audio analyser for ${id}:`, error);
      }
    });

    audioAnalysersRef.current = analysers;

    // إعداد متغيرات الـ debouncing
    speakerStateRef.current = {
      lastSpeakerId: activeSpeakerId,
      speakerStartTime: null,
      lastUpdateTime: Date.now(),
    };

    // استخدام constants من ملف constants
    const SPEAKING_MIN_DURATION = ACTIVE_SPEAKER.MIN_SPEAKING_DURATION;
    const SILENCE_DURATION = ACTIVE_SPEAKER.SILENCE_DURATION || 1000;
    const UPDATE_INTERVAL = ACTIVE_SPEAKER.UPDATE_INTERVAL;
    const SPEAKING_THRESHOLD = ACTIVE_SPEAKER.SPEAKING_THRESHOLD;

    // دالة لتحليل مستويات الصوت مع تحسين الأداء
    const analyzeAudioLevels = () => {
      const levels = {};
      let maxLevel = 0;
      let maxSpeakerId = null;
      const now = Date.now();

      // تخطي التحليل إذا مر وقت قصير جداً منذ آخر تحديث
      if (now - speakerStateRef.current.lastUpdateTime < UPDATE_INTERVAL) {
        scheduleNextAnalysis();
        return;
      }

      const analysers = audioAnalysersRef.current;

      Object.entries(analysers).forEach(([id, analyser]) => {
        try {
          const dataArray = new Uint8Array(analyser.frequencyBinCount);
          analyser.getByteFrequencyData(dataArray);

          // حساب متوسط مستوى الصوت بدون sort كامل (أخف على CPU)
          const sortedWindowSize = Math.max(
            1,
            Math.floor(dataArray.length * 0.4)
          );
          let runningTopSum = 0;
          let topCount = 0;
          for (let i = 0; i < dataArray.length; i += 1) {
            const value = dataArray[i];
            if (topCount < sortedWindowSize) {
              runningTopSum += value;
              topCount += 1;
              continue;
            }
            const currentAverage = runningTopSum / topCount;
            if (value > currentAverage) {
              runningTopSum += value - currentAverage;
            }
          }
          const average = topCount > 0 ? runningTopSum / topCount : 0;
          levels[id] = average;

          // تحديث المتحدث الحالي إذا كان المستوى أعلى من العتبة
          if (average > SPEAKING_THRESHOLD && average > maxLevel) {
            maxLevel = average;
            maxSpeakerId = id;
          }
        } catch (error) {
          logger.error(`Error analyzing audio for ${id}:`, error);
        }
      });

      // ✅ تحديث audio levels في state للـ visual indicator
      speakerStateRef.current.audioLevels = levels;
      setAudioLevels({ ...levels }); // نسخة جديدة لإعادة render

      // منطق التحديث مع debouncing محسّن
      const state = speakerStateRef.current;
      const hasActiveSpeaker = maxSpeakerId !== null;

      if (maxSpeakerId && maxSpeakerId === state.lastSpeakerId) {
        // نفس المتحدث - تأكد من أنه يتحدث لفترة كافية
        if (state.speakerStartTime === null) {
          state.speakerStartTime = now;
        } else if (now - state.speakerStartTime >= SPEAKING_MIN_DURATION) {
          // تحديث فقط إذا تغير المتحدث فعلياً
          if (maxSpeakerId !== activeSpeakerId) {
            state.lastUpdateTime = now;
            setActiveSpeakerId(maxSpeakerId);
          }
        }
      } else if (maxSpeakerId && maxSpeakerId !== state.lastSpeakerId) {
        // متحدث جديد - إعادة تعيين المؤقت
        state.lastSpeakerId = maxSpeakerId;
        state.speakerStartTime = now;
      } else if (!maxSpeakerId && activeSpeakerId) {
        // لا يوجد متحدث - انتظر فترة الصمت قبل الإزالة
        if (state.speakerStartTime === null) {
          state.speakerStartTime = now;
        } else if (now - state.speakerStartTime >= SILENCE_DURATION) {
          state.lastUpdateTime = now;
          setActiveSpeakerId(null);
          state.lastSpeakerId = null;
          state.speakerStartTime = null;
        }
      } else {
        // لا يوجد متحدث ولا مؤشر نشط
        state.lastSpeakerId = null;
        state.speakerStartTime = null;
      }

      // تحديد interval ديناميكي بناءً على وجود متحدث نشط
      // استخدام setTimeout بدلاً من requestAnimationFrame لتوفير الموارد
      const nextInterval = hasActiveSpeaker
        ? ACTIVE_SPEAKER.ACTIVE_INTERVAL
        : ACTIVE_SPEAKER.INACTIVE_INTERVAL;

      // حفظ interval للاستخدام في scheduleNextAnalysis
      state.currentInterval = nextInterval;

      scheduleNextAnalysis(nextInterval);
    };

    // دالة لجدولة التحليل التالي
    const scheduleNextAnalysis = (interval = null) => {
      if (animationFrameRef.current) {
        clearTimeout(animationFrameRef.current);
      }

      const nextInterval =
        interval ||
        speakerStateRef.current.currentInterval ||
        ACTIVE_SPEAKER.UPDATE_INTERVAL;
      animationFrameRef.current = setTimeout(() => {
        if (Object.keys(analysers).length > 0) {
          analyzeAudioLevels();
        }
      }, nextInterval);
    };

    // بدء التحليل
    if (Object.keys(analysers).length > 0) {
      analyzeAudioLevels();
    }

    // Cleanup
    return () => {
      if (animationFrameRef.current) {
        clearTimeout(animationFrameRef.current);
        animationFrameRef.current = null;
      }

      // قطع الاتصالات
      Object.values(sources).forEach((source) => {
        try {
          source.disconnect();
        } catch (e) {}
      });

      // إعادة تعيين
      audioAnalysersRef.current = {};
      setActiveSpeakerId(null);
    };
  }, [isJoined, peers.length, remoteStreams, localStream, isAudioEnabled]);

  /**
   * جمع إحصائيات جودة المكالمة بشكل دوري عند فتح الـ modal
   */
  useEffect(() => {
    if (!showQualityMetrics || !isJoined || Platform.OS !== "web") {
      if (qualityMetricsIntervalRef.current) {
        clearInterval(qualityMetricsIntervalRef.current);
        qualityMetricsIntervalRef.current = null;
      }
      return;
    }

    const updateMetrics = async () => {
      try {
        const stats = await getConnectionStatistics();
        if (stats) {
          setQualityMetrics(stats);
        }
      } catch (error) {
        logger.error("Error updating quality metrics:", error);
      }
    };

    // تحديث فوري
    updateMetrics();

    // تحديث كل 2 ثانية
    qualityMetricsIntervalRef.current = setInterval(updateMetrics, 2000);

    return () => {
      if (qualityMetricsIntervalRef.current) {
        clearInterval(qualityMetricsIntervalRef.current);
        qualityMetricsIntervalRef.current = null;
      }
    };
  }, [showQualityMetrics, isJoined, getConnectionStatistics]);

  const handleJoinRoom = async () => {
    if (isJoining) return; // Prevent multiple simultaneous joins

    // ✅ إذا كان viewer، لا نستدعي joinRoom (live-stream-viewer.js يستدعي joinAsViewer بالفعل)
    if (isViewer) {
      logger.callEvent("MediasoupCall: handleJoinRoom skipped for viewer", {
        roomId,
      });
      return;
    }

    setIsJoining(true);
    try {
      await joinRoom({
        roomId,
        userId: currentUser._id,
        userData: {
          images: currentUser?.images,
          _id: currentUser?._id,
          email: currentUser?.email,
          phoneNumber: currentUser?.phoneNumber,
          firstName: currentUser?.firstName,
          lastName: currentUser?.lastName,
          colors: currentUser?.colors,
        },
        isVideoCall,
      });
    } catch (error) {
      logger.error("Error joining room:", error);

      const friendlyError = getUserFriendlyError(error);

      // Show device error if it's a device-related error
      if (friendlyError.category === "device") {
        logger.deviceEvent("Setting device error:", error);
        setDeviceError(error);
        setShowDeviceError(true);
      } else {
        logger.error("Non-device error:", error);
        // استخدام Redux alert بدلاً من alert()
        dispatch(
          addAlert({
            type: "error",
            message: `${friendlyError.title}: ${friendlyError.message}`,
          })
        );
      }
    } finally {
      setIsJoining(false);
    }
  };

  const handleConvertToStream = async () => {
    if (!room?._id || !currentUser?._id) {
      dispatch(
        addAlert({
          type: "error",
          message: "Cannot convert to stream: Missing room or user information",
        })
      );
      return;
    }

    // ✅ إزالة التحقق من room?.liveStreamSettings?.isLive
    // السيرفر سيتحقق من وجود ستريم نشط من Call model (endedAt === null)
    // وهذا أكثر دقة من الاعتماد على room object في Redux

    try {
      setIsConvertingToStream(true);
      setIsWaitingForResponse(true);

      // ✅ إرسال طلب تحويل المكالمة إلى ستريم (يتطلب موافقة الطرف الآخر)
      // السيرفر سيتحقق من وجود ستريم نشط قبل المعالجة
      await requestLiveStream({
        roomId: room._id,
        userData: {
          images: currentUser?.images,
          _id: currentUser?._id,
          email: currentUser?.email,
          phoneNumber: currentUser?.phoneNumber,
          firstName: currentUser?.firstName,
          lastName: currentUser?.lastName,
          colors: currentUser?.colors,
          userName: currentUser?.userName,
        },
        settings: {
          allowAnonymousViewers: true,
          maxViewers: 1000,
          allowViewersToSpeak: false,
        },
      });

      dispatch(
        addAlert({
          type: "info",
          message: "Live stream request sent. Waiting for approval...",
        })
      );

      logger.callEvent("Live stream request sent", { roomId: room._id });
    } catch (error) {
      logger.error("Error requesting live stream:", error);
      dispatch(
        addAlert({
          type: "error",
          message: error.message || "Failed to request live stream conversion",
        })
      );
      setIsWaitingForResponse(false);
    } finally {
      setIsConvertingToStream(false);
    }
  };

  // ✅ معالجة طلب تحويل المكالمة إلى ستريم من الطرف الآخر
  const handleLiveStreamRequest = useCallback(
    (data) => {
      logger.callEvent("Live stream request received", {
        roomId: data.roomId,
        currentRoomId: roomId,
        requesterData: data.requesterData,
      });
      if (data.roomId === roomId) {
        logger.callEvent("Setting live stream request", { data });
        setLiveStreamRequest(data);
        setShowLiveStreamRequestModal(true);
      }
    },
    [roomId]
  );

  // ✅ معالجة الرد على طلب تحويل المكالمة إلى ستريم
  const handleLiveStreamRequestResponse = useCallback(
    (data) => {
      if (data.roomId === roomId) {
        setIsWaitingForResponse(false);
        if (data.accepted) {
          dispatch(
            addAlert({
              type: "success",
              message: "Live stream request approved! Stream is now live.",
            })
          );
          // ✅ تحديث الـ room (فقط للأعضاء - المشاهدين لا يجب أن يتلقوا هذا الـ event)
          // ✅ لكن نضيف skipAddIfNotExists كإجراء احتياطي
          dispatch(
            updateRoom({
              _id: roomId,
              isLiveStream: true,
              liveStreamSettings: {
                isLive: true,
                startedAt: new Date(),
              },
              skipAddIfNotExists: true, // ✅ منع إضافة room جديد للمشاهدين (إجراء احتياطي)
            })
          );
        } else {
          dispatch(
            addAlert({
              type: "info",
              message: "Live stream request was declined.",
            })
          );
        }
      }
    },
    [roomId, dispatch]
  );

  // ✅ الموافقة على طلب تحويل المكالمة إلى ستريم
  const handleAcceptLiveStreamRequest = useCallback(async () => {
    logger.callEvent("handleAcceptLiveStreamRequest called", {
      hasLiveStreamRequest: !!liveStreamRequest,
      hasRoom: !!room,
      roomId: room?._id,
      liveStreamRequestRoomId: liveStreamRequest?.roomId,
    });

    if (!liveStreamRequest) {
      logger.error("No live stream request to accept");
      return;
    }

    const targetRoomId = liveStreamRequest.roomId || room?._id;
    if (!targetRoomId) {
      logger.error("No room ID available");
      dispatch(
        addAlert({
          type: "error",
          message: "Cannot accept: Room ID not found",
        })
      );
      return;
    }

    try {
      setShowLiveStreamRequestModal(false);

      logger.callEvent("Sending accept response", { roomId: targetRoomId });
      await respondToLiveStreamRequest({
        roomId: targetRoomId,
        accepted: true,
        settings: liveStreamRequest.settings || {
          allowAnonymousViewers: true,
          maxViewers: 1000,
          allowViewersToSpeak: false,
        },
      });

      setLiveStreamRequest(null);

      dispatch(
        addAlert({
          type: "success",
          message: "Live stream started successfully!",
        })
      );

      // تحديث الـ room
      dispatch(
        updateRoom({
          _id: targetRoomId,
          isLiveStream: true,
          liveStreamSettings: {
            isLive: true,
            startedAt: new Date(),
          },
        })
      );
    } catch (error) {
      logger.error("Error accepting live stream request:", error);
      dispatch(
        addAlert({
          type: "error",
          message: error.message || "Failed to accept live stream request",
        })
      );
    }
  }, [liveStreamRequest, room, respondToLiveStreamRequest, dispatch]);

  // ✅ رفض طلب تحويل المكالمة إلى ستريم
  const handleDeclineLiveStreamRequest = useCallback(async () => {
    logger.callEvent("handleDeclineLiveStreamRequest called", {
      hasLiveStreamRequest: !!liveStreamRequest,
      hasRoom: !!room,
      roomId: room?._id,
      liveStreamRequestRoomId: liveStreamRequest?.roomId,
    });

    if (!liveStreamRequest) {
      logger.error("No live stream request to decline");
      return;
    }

    const targetRoomId = liveStreamRequest.roomId || room?._id;
    if (!targetRoomId) {
      logger.error("No room ID available");
      dispatch(
        addAlert({
          type: "error",
          message: "Cannot decline: Room ID not found",
        })
      );
      return;
    }

    try {
      setShowLiveStreamRequestModal(false);

      logger.callEvent("Sending decline response", { roomId: targetRoomId });
      await respondToLiveStreamRequest({
        roomId: targetRoomId,
        accepted: false,
      });

      setLiveStreamRequest(null);

      dispatch(
        addAlert({
          type: "info",
          message: "Live stream request declined.",
        })
      );
    } catch (error) {
      logger.error("Error declining live stream request:", error);
      dispatch(
        addAlert({
          type: "error",
          message: error.message || "Failed to decline live stream request",
        })
      );
    }
  }, [liveStreamRequest, room, respondToLiveStreamRequest, dispatch]);

  /**
   * Cleanup function لتنظيف جميع video/audio refs عند unmount أو تغيير streams
   */
  const cleanupMediaRefs = useCallback(() => {
    if (Platform.OS === "web") {
      // تنظيف جميع video refs
      Object.entries(videoRefs.current || {}).forEach(([peerId, video]) => {
        if (video) {
          try {
            // إيقاف جميع tracks
            if (video.srcObject) {
              const tracks = video.srcObject.getTracks();
              tracks.forEach((track) => {
                track.stop();
                track.enabled = false;
              });
              video.srcObject = null;
            }
            // إيقاف التشغيل
            video.pause();
            video.load(); // إعادة تحميل العنصر
          } catch (error) {
            logger.warn(
              `Error cleaning up video ref for peer ${peerId}:`,
              error
            );
          }
        }
      });
      videoRefs.current = {};

      // تنظيف جميع audio refs
      Object.entries(audioRefs.current).forEach(([peerId, audio]) => {
        if (audio) {
          try {
            // إيقاف جميع tracks
            if (audio.srcObject) {
              const tracks = audio.srcObject.getTracks();
              tracks.forEach((track) => {
                track.stop();
                track.enabled = false;
              });
              audio.srcObject = null;
            }
            // إيقاف التشغيل
            audio.pause();
            audio.load(); // إعادة تحميل العنصر
          } catch (error) {
            logger.warn(
              `Error cleaning up audio ref for peer ${peerId}:`,
              error
            );
          }
        }
      });
      audioRefs.current = {};
    }
  }, []);

  // ✅ Socket listeners للـ live stream requests
  useEffect(() => {
    if (!currentSocket || typeof currentSocket.on !== "function") return;

    currentSocket.on("liveStreamRequested", handleLiveStreamRequest);
    currentSocket.on(
      "liveStreamRequestResponse",
      handleLiveStreamRequestResponse
    );

    return () => {
      currentSocket.off("liveStreamRequested", handleLiveStreamRequest);
      currentSocket.off(
        "liveStreamRequestResponse",
        handleLiveStreamRequestResponse
      );
    };
  }, [currentSocket, handleLiveStreamRequest, handleLiveStreamRequestResponse]);

  // ✅ Socket listener لـ liveStreamEnded (لإعادة توجيه المشاهدين عند انتهاء الستريم)
  useEffect(() => {
    if (!currentSocket || typeof currentSocket.on !== "function") return;
    if (!isViewer) return; // فقط للمشاهدين

    const handleLiveStreamEnded = ({ roomId: endedRoomId, callId }) => {
      logger.streamEvent("Live stream ended - showing Stream Ended screen", {
        roomId: endedRoomId,
        callId,
        currentRoomId: roomId,
      });

      // ✅ إذا كان الستريم المنتهي هو الستريم الحالي، عرض شاشة "Stream Ended"
      if (endedRoomId === roomId) {
        // ✅ تعيين streamEnded = true فوراً لمنع عرض "Calling..." screen
        // ✅ وعرض شاشة "Stream Ended" بدلاً من إعادة التوجيه المباشرة
        setStreamEnded(true);
        
        // ✅ تنظيف جميع video/audio refs
        cleanupMediaRefs();

        // ✅ إشعار المستخدم (اختياري)
        dispatch(
          addAlert({
            type: "info",
            message: t("stream.ended") || "The live stream has ended",
          })
        );

        // ✅ لا نعيد التوجيه مباشرة - سنعرض شاشة "Stream Ended" مع زر "Go Back"
        // ✅ leaveRoom سيتم استدعاؤه عند الضغط على "Go Back"
      }
    };

    currentSocket.on("liveStreamEnded", handleLiveStreamEnded);

    return () => {
      currentSocket.off("liveStreamEnded", handleLiveStreamEnded);
    };
  }, [
    currentSocket,
    isViewer,
    roomId,
    cleanupMediaRefs,
    leaveRoom,
    dispatch,
    t,
  ]);
  
  // ✅ Reset streamEnded عند تغيير roomId أو unmount
  useEffect(() => {
    return () => {
      setStreamEnded(false);
    };
  }, [roomId]);
  
  // ✅ Fallback: التحقق من حالة الستريم مباشرة من Redux (للمشاهدين)
  // ✅ إذا كان peers.length === 0 و isLive === false، نعرض شاشة "Stream Ended"
  useEffect(() => {
    if (!isViewer || streamEnded || !isJoined) return;
    
    // ✅ التحقق من أن الستريم كان نشطاً سابقاً (للمشاهدين فقط)
    // ✅ نتحقق من callId أو activeStreamId أو isLive
    const wasStreamActive = callId || 
                           room?.activeStreamId || 
                           room?.liveStreamSettings?.isLive === true;
    
    // ✅ إذا كان الستريم كان نشطاً سابقاً والآن peers.length === 0 و isLive === false
    if (wasStreamActive && peers.length === 0 && !isJoining) {
      // ✅ التحقق من أن الستريم لم يعد نشطاً
      // ✅ نتحقق من isLive === false أو عدم وجود activeStreamId
      const isStreamEnded = room?.liveStreamSettings?.isLive === false ||
                           (!room?.liveStreamSettings?.isLive && 
                            !room?.activeStreamId && 
                            wasStreamActive); // ✅ تأكيد أن الستريم كان نشطاً سابقاً
      
      if (isStreamEnded) {
        logger.streamEvent("Stream ended detected from Redux state (fallback)", {
          roomId,
          callId,
          isLive: room?.liveStreamSettings?.isLive,
          activeStreamId: room?.activeStreamId,
          peersCount: peers.length,
          wasStreamActive,
        });
        
        // ✅ تعيين streamEnded = true فوراً
        setStreamEnded(true);
        cleanupMediaRefs();
        
        // ✅ إشعار المستخدم
        dispatch(
          addAlert({
            type: "info",
            message: t("stream.ended") || "The live stream has ended",
          })
        );
      }
    }
  }, [
    isViewer,
    streamEnded,
    isJoined,
    peers.length,
    isJoining,
    room?.liveStreamSettings?.isLive,
    room?.activeStreamId,
    callId,
    roomId,
    cleanupMediaRefs,
    dispatch,
    t,
  ]);

  const handleLeaveRoom = async () => {
    try {
      // ✅ تنظيف جميع video/audio refs قبل leaveRoom
      cleanupMediaRefs();

      await leaveRoom();
    } catch (error) {
      logger.error("Error in leaveRoom:", error);
    }

    if (onClose) {
      onClose();
    }
  };

  /**
   * Cleanup عند unmount أو عند مغادرة الغرفة
   */
  useEffect(() => {
    return () => {
      cleanupMediaRefs();
    };
  }, [cleanupMediaRefs]);

  /**
   * Cleanup عند تغيير peers أو streams
   */
  useEffect(() => {
    if (!isJoined) {
      cleanupMediaRefs();
    }
  }, [isJoined, cleanupMediaRefs]);

  // Web: keyboard shortcuts A/V/H
  useEffect(() => {
    if (Platform.OS !== "web") return;
    const onKey = (e) => {
      const key = e.key?.toLowerCase?.();
      if (key === "a") {
        e.preventDefault();
        toggleAudio();
      } else if (key === "v") {
        e.preventDefault();
        toggleVideo();
      } else if (key === "h") {
        e.preventDefault();
        setShowDeviceSettings((s) => !s);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleAudio, toggleVideo, isVideoCall]);

  const isGroupOrStreamSession = Boolean(
    room?.isGroup || room?.members?.length > 2 || room?.liveStreamSettings?.isLive
  );
  const canUseEndForEveryoneAction =
    !isViewer &&
    isJoined &&
    isGroupOrStreamSession &&
    checkCallPermission("endCallForAll", currentUser?._id?.toString());
  const canUseMuteOthersAction =
    !isViewer &&
    isJoined &&
    Boolean(room?.isGroup) &&
    checkCallPermission("muteOthers", currentUser?._id?.toString());
  const canUseKickFromCallAction =
    !isViewer &&
    isJoined &&
    Boolean(room?.isGroup) &&
    checkCallPermission("kickFromCall", currentUser?._id?.toString());

  const pushModerationActivity = useCallback((message) => {
    if (!message) return;
    setModerationActivityFeed((prev) => {
      const next = [
        { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, message },
        ...(Array.isArray(prev) ? prev : []),
      ];
      return next.slice(0, 4);
    });
  }, []);

  if (!isJoined) {
    return (
      <View className="absolute top-0 left-0 right-0 bottom-0 z-[1600] justify-center items-center">
        <View
          className={`flex-1 justify-center items-center ${
            isDarkColorScheme ? "bg-main" : "bg-[#f6f8f9]"
          } w-full linker-w`}
        >
          {connectingDelayed && (
            <View className="absolute top-3 right-3 bg-black/60 rounded-2xl px-2.5 py-1.5 flex-row items-center gap-x-1.5">
              <FeIcon name="wifi" size={14} color="#f6f8f9" />
              <Text className="text-white text-xs">Connecting…</Text>
            </View>
          )}
          <Text className="text-white text-lg">{t("call.joiningRoom")}</Text>
        </View>
      </View>
    );
  }

  // عرض PIP عند التصغير
  if (isMinimized) {
    const callStartedAt = room?.activeCallStartedAt || null;
    const showDuration = !!callStartedAt;

    return (
      <View className="w-full linker-w self-center px-3 pt-2 pb-1">
        <View
          className="w-full rounded-2xl px-3 py-2 shadow-lg"
          style={{
            backgroundColor: isDarkColorScheme
              ? "rgba(24, 32, 45, 0.96)"
              : "rgba(255, 255, 255, 0.95)",
            borderWidth: 1,
            borderColor: isDarkColorScheme
              ? "rgba(100, 116, 139, 0.35)"
              : "rgba(148, 163, 184, 0.25)",
          }}
        >
          <View className="flex-row items-center gap-x-2">
            <View className="relative">
              {room?.isGroup ? (
                room?.image ? (
                  <UserImage
                    user={{ images: [{ path: room?.image }] }}
                    size="h-10 w-10"
                    border="border-0"
                    rounded="rounded-full"
                    showStatus={false}
                  />
                ) : (
                  <UserImage
                    user={
                      room?.members?.find((m) => m?._id !== currentUser?._id) || null
                    }
                    size="h-10 w-10"
                    border="border-0"
                    rounded="rounded-full"
                    showStatus={false}
                  />
                )
              ) : (
                <UserImage
                  user={room?.members?.find((m) => m?._id !== currentUser?._id)}
                  size="h-10 w-10"
                  border="border-0"
                  rounded="rounded-full"
                  showStatus={false}
                />
              )}
              <View className="absolute -bottom-1 -right-1 w-3.5 h-3.5 rounded-full bg-emerald-500 border border-white dark:border-[#1a202d]" />
            </View>

            <View className="flex-1 min-w-0">
              <Text
                className="text-sm font-semibold text-slate-900 dark:text-slate-100"
                numberOfLines={1}
              >
                {room?.name || "Call"}
              </Text>
              <View className="mt-0.5 flex-row items-center gap-x-1.5">
                {!isAudioEnabled && (
                  <FeIcon name="mic-off" size={10} color="#ef4444" />
                )}
                {!isVideoEnabled && (
                  <FeIcon name="video-off" size={10} color="#ef4444" />
                )}
                <View className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                <Text className="text-xs text-emerald-600 dark:text-emerald-400">
                  {t("call.ongoing")}
                </Text>
                {showDuration && (
                  <>
                    <Text className="text-xs text-slate-400 dark:text-slate-500">
                      •
                    </Text>
                    <MediasoupCallDuration startedAt={callStartedAt} />
                  </>
                )}
                {room?.liveStreamSettings?.isLive &&
                  room?.activeStreamViewersCount !== undefined &&
                  room.activeStreamViewersCount > 0 && (
                    <View className="flex-row items-center gap-x-0.5 ml-1">
                      <FeIcon name="eye" size={10} color="#10b981" />
                      <Text className="text-xs text-emerald-500">
                        {room.activeStreamViewersCount}
                      </Text>
                    </View>
                  )}
              </View>
            </View>

            <View className="flex-row items-center gap-x-1.5">
              <TouchableOpacity
                className="h-9 px-3 rounded-xl bg-danger items-center justify-center"
                onPress={() => {
                  handleLeaveRoom();
                }}
                accessibilityLabel="Leave call"
              >
                <FeIcon name="phone-off" size={14} color="#f6f8f9" />
              </TouchableOpacity>

              <TouchableOpacity
                className="h-9 w-9 rounded-xl bg-primary items-center justify-center"
                onPress={maximizeCall}
                accessibilityLabel="Open call"
              >
                <FeIcon name="maximize-2" size={15} color="#f6f8f9" />
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>
    );
  }

  return (
    <TouchableOpacity
      className="absolute top-0 left-0 right-0 bottom-0 z-[1600] justify-center items-center"
      activeOpacity={1}
      onPress={handleScreenInteraction}
      style={{ flex: 1, zIndex: 1600, elevation: 1600 }}
    >
      <View
        className={`flex-1 flex justify-center items-center w-full linker-w relative ${
          isDarkColorScheme ? "bg-[#12141b]" : "bg-[#dee4e6]"
        }`}
      >
        {/* Network Quality Indicator with Call Duration - Top (with slide animation) */}
        {/* ✅ Hide Network Quality Indicator when stream has ended (for viewers) */}
        {!(streamEnded && isViewer) && (
        <Animated.View
          style={{
            transform: [{ translateY: topBarSlideAnim }],
            opacity: topBarSlideAnim.interpolate({
              inputRange: [-100, 0],
              outputRange: [0, 1],
            }),
            zIndex: 50,
              position: "absolute",
            top: 0,
              justifyContent: "center",
              alignItems: "center",
              display: "flex",
            }}
          >
            <NetworkQualityIndicator
              peers={peers}
              startedAt={room?.activeCallStartedAt || null}
              onShowMetrics={() => setShowQualityMetrics(true)}
            />
        </Animated.View>
        )}

        {/* Loading indicator when joining */}
        {isJoining && (
          <View className="absolute top-20 left-0 right-0 z-50 items-center">
            <View className="bg-black/80 rounded-lg px-4 py-2 flex-row items-center gap-x-2">
              <View
                style={{
                  width: 16,
                  height: 16,
                  borderWidth: 2,
                  borderColor: "#f6f8f9",
                  borderTopColor: "transparent",
                  borderRadius: 8,
                  ...(Platform.OS === "web"
                    ? {
                        animation: "spin 1s linear infinite",
                      }
                    : {}),
                }}
              />
              <Text className="text-white text-sm font-medium">
                {t("call.joiningCall")}
              </Text>
            </View>
          </View>
        )}

        {/* Reconnection indicator */}
        {isReconnecting && (
          <View className="absolute top-20 left-0 right-0 z-50 items-center">
            <View className="bg-amber-600/90 rounded-lg px-4 py-2 flex-row items-center gap-x-2">
              <View
                style={{
                  width: 16,
                  height: 16,
                  borderWidth: 2,
                  borderColor: "#f6f8f9",
                  borderTopColor: "transparent",
                  borderRadius: 8,
                  ...(Platform.OS === "web"
                    ? {
                        animation: "spin 1s linear infinite",
                      }
                    : {}),
                }}
              />
              <Text className="text-white text-sm font-medium">
                {reconnectAttempts > 0
                  ? t("call.reconnectAttempt", { attempt: reconnectAttempts })
                  : t("call.reconnecting")}
              </Text>
            </View>
          </View>
        )}

        {/* ✅ Stream Ended Screen (للمشاهدين فقط) */}
        {streamEnded && isViewer && (
          <View className="flex-1 w-full items-center justify-center px-6 absolute inset-0 z-50">
            <View
              className={`items-center justify-center w-24 h-24 rounded-full mb-6 ${
                isDarkColorScheme ? "bg-red-500/20" : "bg-red-100"
              }`}
            >
              <FeIcon
                name="radio"
                size={48}
                color={isDarkColorScheme ? "#ef4444" : "#dc2626"}
              />
            </View>

            <Text
              className={`text-2xl font-bold mb-2 ${
                isDarkColorScheme ? "text-white" : "text-gray-900"
              }`}
            >
              {t("stream.ended", "Stream Ended")}
            </Text>

            <Text
              className={`text-base text-center mb-8 max-w-sm ${
                isDarkColorScheme ? "text-slate-400" : "text-slate-600"
              }`}
            >
              {t("stream.endedMessage", "This stream has ended or is no longer available.")}
            </Text>

            <Button
              onPress={() => {
                // ✅ تنظيف قبل إعادة التوجيه
                cleanupMediaRefs();
                leaveRoom().catch((error) => {
                  logger.error("Error leaving room after stream ended:", error);
                });
                router.push("/live-streams");
              }}
              label={t("stream.goBack", "Go Back")}
            />
          </View>
        )}

        {/* Waiting screen before anyone joins (hide local preview) */}
        {/* ✅ لا نعرض "Calling..." screen إذا انتهى الستريم (للمشاهدين) */}
        {peers.length === 0 && !isJoining && !streamEnded && (
          <View className="flex-1 w-full items-center justify-center p-6">
            <View className="mb-4 relative items-center justify-center">
              <Animated.View
                pointerEvents="none"
                style={{
                  position: "absolute",
                  width: 112,
                  height: 112,
                  borderRadius: 56,
                  backgroundColor:
                    isDarkColorScheme
                      ? "rgba(0,178,202,0.15)"
                      : "rgba(45,45,55,0.5)",
                  transform: [
                    {
                      scale: ringAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [1, 1.2],
                      }),
                    },
                  ],
                  opacity: ringAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.4, 0.1],
                  }),
                }}
              />
              <Animated.View
                pointerEvents="none"
                style={{
                  position: "absolute",
                  width: 140,
                  height: 140,
                  borderRadius: 70,
                  backgroundColor:
                    isDarkColorScheme
                      ? "rgba(0,178,202,0.10)"
                      : "rgba(45,45,55,0.35)",
                  transform: [
                    {
                      scale: ringAnim2.interpolate({
                        inputRange: [0, 1],
                        outputRange: [1, 1.25],
                      }),
                    },
                  ],
                  opacity: ringAnim2.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.3, 0.08],
                  }),
                }}
              />
              {room?.isGroup || room?.members?.length > 2 ? (
                room?.image ? (
                  <UserImage
                    size={avatarSize}
                    border="border-0"
                    user={{ images: [{ path: room?.image }] }}
                    showStatus={false}
                    rounded="rounded-full"
                    text="text-4xl font-bold"
                  />
                ) : (
                  // ✅ استخدام UserImage بدلاً من ImagePlaceholder للأشخاص في الـ offline stream
                  <UserImage
                    user={room?.members?.find((m) => m?._id !== currentUser?._id) || null}
                    size={avatarSize}
                    border="border-0"
                    rounded="rounded-full"
                    showStatus={false}
                    text="text-4xl font-bold"
                  />
                )
              ) : (
                <UserImage
                  user={room?.members?.find?.(
                    (m) => m?._id !== currentUser?._id
                  )}
                  size={avatarSize}
                  border="border-0"
                  rounded="rounded-full"
                  showStatus={false}
                  text="text-4xl font-bold"
                />
              )}
            </View>
            {room?.isGroup || room?.members?.length > 2 ? (
              <>
                <Text
                  className={`text-xl font-semibold ${
                    callStatus === "busy" || callStatus === "queued" || callStatus === "connecting"
                      ? "text-amber-500"
                      : "text-emerald-500"
                  }`}
                >
                  {(() => {
                    if (isCaller && callStatus && peers.length === 0 && roomId && isJoined) {
                      if (callStatus === "connecting") {
                        return `${t("call.connectingFriendly") || "Checking availability"}${dots}`;
                      }
                      if (callStatus === "queued") {
                        return `${t("call.queued") || "User is in another call"}${dots}`;
                      }
                      if (callStatus === "busy") {
                        return t("call.busyFriendly") || "User is unavailable right now";
                      }
                    }
                    return isVideoCall
                      ? room?.name
                        ? `${t("call.callingMembers", { name: room?.name })}${dots}`
                        : `${t("call.callingGroupChat")}${dots}`
                      : room?.name
                        ? `${t("call.ringingMembers", { name: room?.name })}${dots}`
                        : `${t("call.ringingGroupChat")}${dots}`;
                  })()}
                </Text>
                {/* Hidden countdown text (auto-cancel still active) */}
                <View className="mt-3 w-full max-w-md">
                  <View
                    className="absolute top-0 left-0 right-0 h-4"
                    pointerEvents="none"
                  />
                  <ScrollView>
                    {(room?.members || [])
                      .filter((m) => m?._id !== currentUser?._id)
                      .map((member) => (
                        <Box key={member?._id} h="h-14" mb="mb-1">
                          {(() => {
                            const memberState = getMemberCallState(member);
                            const statusClass =
                              memberState.tone === "rejected"
                                ? isDarkColorScheme
                                  ? "text-xs font-medium text-rose-400"
                                  : "text-xs font-medium text-rose-600"
                                : memberState.tone === "inCall"
                                  ? isDarkColorScheme
                                    ? "text-xs font-medium text-emerald-400"
                                    : "text-xs font-medium text-emerald-600"
                                  : isDarkColorScheme
                                    ? "text-xs font-medium text-emerald-300"
                                    : "text-xs font-medium text-emerald-600";
                            return (
                              <>
                          <UserImage
                            size="h-10 w-10"
                            border="border-0"
                            user={member}
                            showStatus={false}
                          />
                          <View className="flex-1 w-full ml-2">
                            <View className="flex-row items-center flex-wrap gap-x-2">
                              <RoleBadge
                                role={(() => {
                                  // Check if this member is the room owner
                                  const memberId = member._id?.toString() || String(member._id);
                                  const ownerId =
                                    room?.user?._id?.toString() ||
                                    room?.user?.toString() ||
                                    String(room?.user);
                                  if (ownerId === memberId) return "owner";

                                  const role = room?.roles?.find((r) => {
                                    const roleUserId =
                                      r.user?._id?.toString() ||
                                      r.user?.toString() ||
                                      String(r.user);
                                    return roleUserId === memberId;
                                  })?.role;
                                  return role === "admin"
                                    ? "admin"
                                    : role === "moderator"
                                      ? "moderator"
                                      : "member";
                                })()}
                                size="sm"
                              />
                              <UserName
                                className="text-slate-700 dark:text-slate-300"
                                user={member}
                                onlyFirst={true}
                              />
                            </View>
                            <Text className={statusClass}>{memberState.text}</Text>
                          </View>
                              </>
                            );
                          })()}
                        </Box>
                      ))}
                  </ScrollView>
                  <View
                    className="absolute bottom-0 left-0 right-0 h-4"
                    style={{
                      opacity: 0.25,
                      backgroundColor: isDarkColorScheme ? "#0f131a" : "#eef1f4",
                    }}
                    pointerEvents="none"
                  />
                </View>
              </>
            ) : (
              <>
                <Text
                  className={`text-xl font-semibold ${
                    callStatus === "busy" || callStatus === "queued" || callStatus === "connecting"
                      ? "text-amber-500"
                      : "text-emerald-500"
                  }`}
                >
                  {(() => {
                    // ✅ استخدام callStatus فقط إذا:
                    // 1. المتصل هو caller
                    // 2. callStatus موجود (connecting/queued/ringing/busy)
                    // 3. لم ينضم peers بعد (peers.length === 0)
                    // 4. المكالمة لا تزال نشطة (roomId موجود - إذا لم يكن موجوداً، المكالمة مغلقة)
                    // 5. isJoined = true (المستخدم انضم للغرفة)
                    if (
                      isCaller &&
                      callStatus &&
                      peers.length === 0 &&
                      roomId &&
                      isJoined
                    ) {
                      if (callStatus === "connecting") {
                        return `${t("call.connectingFriendly") || "Checking availability"}${dots}`;
                      } else if (callStatus === "queued") {
                        return `${t("call.queued")}${dots}`;
                      } else if (callStatus === "ringing") {
                        return isVideoCall
                          ? `${t("call.ringing")}${dots}`
                          : `${t("call.ringing")}${dots}`;
                      } else if (callStatus === "busy") {
                        return t("call.busyFriendly") || "User is unavailable right now";
                      }
                    }
                    // ✅ Fallback للنص القديم (إذا لم يكن هناك callStatus أو انضم peers أو تم إغلاق المكالمة)
                    // إذا لم يكن هناك roomId، لا نعرض أي شيء (المكالمة مغلقة)
                    if (!roomId) {
                      return "";
                    }
                    return isVideoCall
                      ? `${t("call.calling")}${dots}`
                      : `${t("call.ringing")}${dots}`;
                  })()}
                </Text>
                <Text
                  className="mt-1 text-lg text-slate-700 dark:text-slate-300"
                  numberOfLines={1}
                >
                  {getFullName(
                    room?.members?.find?.((m) => m?._id !== currentUser?._id),
                    false,
                    28
                  ) || t("call.participant")}
                </Text>
                <Text
                  className="mt-1 text-sm text-slate-500 dark:text-slate-400"
                >
                  {isVideoCall ? t("call.videoCall") : t("call.audioCall")}
                    </Text>
                {/* ✅ Recording Indicator */}
                {isRecording && (
                  <View className="mt-2 flex-row items-center justify-center">
                    <View className="bg-danger/20 rounded-full px-3 py-1.5 flex-row items-center">
                      <View className="w-2 h-2 bg-danger rounded-full mr-2" />
                      <Text className="text-danger text-xs font-semibold">
                        {t("call.recording.recording")}
                      </Text>
                </View>
                  </View>
                )}
              </>
            )}
          </View>
        )}

        {/* ✅ Viewers Count Badge (for all participants including viewers) */}
        {(() => {
          // ✅ Get viewers count with priority:
          // 1. room.activeStreamViewersCount (for broadcasters who have room in Redux)
          // 2. localViewersCount (for viewers who don't have room in Redux)
          // 3. room.liveStreamSettings.viewersCount (fallback)
          const viewersCount = 
            room?.activeStreamViewersCount !== undefined
              ? room.activeStreamViewersCount
              : (localViewersCount !== null && localViewersCount !== undefined
                  ? localViewersCount 
                  : (room?.liveStreamSettings?.viewersCount !== undefined
                      ? room.liveStreamSettings.viewersCount
                      : null));
          
          // ✅ Check if stream is live - ONLY check room.liveStreamSettings.isLive (not callId alone)
          // ✅ Also check if the stream data is stale (older than 24 hours = not a real active stream)
          const streamStartedAt = room?.liveStreamSettings?.startedAt ? new Date(room.liveStreamSettings.startedAt) : null;
          const isStaleStreamData = streamStartedAt && (Date.now() - streamStartedAt.getTime() > 24 * 60 * 60 * 1000);
          const isLive = room?.liveStreamSettings?.isLive === true && !isStaleStreamData;
          
          // ✅ For viewers: show badge if they're in a stream (have callId), even if viewersCount is not set yet
          // For broadcasters: show only if we have actual viewers (viewersCount > 0)
          // ✅ Hide badge if stream has ended (for viewers)
          // ✅ Hide badge in regular calls - only show in live streams (must have liveStreamSettings.isLive === true)
          const shouldShow = !streamEnded && isLive && (
            (isViewer && callId) || // ✅ Viewers: show if in stream (callId exists)
            (!isViewer && viewersCount !== null && viewersCount !== undefined && viewersCount > 0) // ✅ Broadcasters: show only if there are actual viewers
          );
          
          // ✅ Debug logging for viewers - تم إزالة اللوغ المتكرر لتقليل الضغط على console
          // if (isViewer && callId && shouldShow) {
          //   logger.streamEvent("Viewers badge should show for viewer", {
          //     roomId,
          //     callId,
          //     isLive,
          //     viewersCount,
          //     localViewersCount,
          //     roomActiveStreamViewersCount: room?.activeStreamViewersCount,
          //     roomLiveStreamSettings: room?.liveStreamSettings?.viewersCount,
          //     shouldShow,
          //   });
          // }
          
          if (shouldShow) {
            // ✅ For viewers: if viewersCount is null but we have callId, show 1 (at least the current viewer)
            // For broadcasters: show actual count or 0
            const displayCount = 
              isViewer && viewersCount === null && callId
                ? 1 // ✅ Viewers: show 1 if count not set yet (will update when events arrive)
                : (viewersCount !== null && viewersCount !== undefined ? viewersCount : 0);
            
            return (
              <View
                className="absolute top-3 left-3 bg-black/60 rounded-2xl px-3 py-1.5 flex-row items-center gap-x-2"
                style={{ zIndex: 60 }} // ✅ أعلى من NetworkQualityIndicator (z-50)
              >
                <FeIcon name="eye" size={16} color="#f6f8f9" />
                <Text className="text-white text-sm font-semibold">
                  {displayCount}
                </Text>
              </View>
            );
          }
          return null;
        })()}

        {/* Unified grid (local + remote) */}
        {peers.length > 0 &&
          entries.length > 0 &&
          (() => {
          const count = entries.length;

          // Dynamic grid configuration
          // 1 person: 1 column, 2 people: 1 column (2 rows stacked), 3+: 2 columns
          const gridCols = count === 1 ? 1 : count === 2 ? 1 : 2;
          const needsScroll = count > 6; // Scroll for more than 6 participants

          // Use Grid on web for all cases, flexbox for native
            const containerIsGrid = Platform.OS === "web";

          // Calculate container height (full height minus control bar ~80px)
            const containerHeight =
              Platform.OS === "web"
                ? {
                    height: needsScroll ? "calc(100vh)" : "calc(100vh)",
                    overflowY: needsScroll ? "auto" : "hidden",
                  }
                : {};

            const gridStyle = containerIsGrid
              ? {
                  display: "grid",
            gridTemplateColumns: `repeat(${gridCols}, minmax(0, 1fr))`,
                  gridAutoRows:
                    count === 1
                      ? "1fr"
                      : count === 2
                        ? "1fr"
                        : "minmax(0, 1fr)",
                  gap: 4,
                  alignContent: count >= 5 && count <= 6 ? "center" : "stretch",
                  justifyContent:
                    count >= 5 && count <= 6 ? "center" : "stretch",
            ...containerHeight,
                  minHeight: 0, // مهم للـ grid
                }
              : {};

          const tiles = entries.map((p) => {
            const hasVideo = p.stream?.getVideoTracks().length > 0;
            const hasAudio = p.stream?.getAudioTracks().length > 0;
            // استخدام metadata للحالة الفعلية (أكثر دقة من stream tracks)
            // إذا كان metadata موجوداً، نستخدمه مباشرة (أولوية للـ metadata)
            // وإلا نستخدم hasAudio/hasVideo كـ fallback
              const isAudioEnabledForPeer =
                p.metadata?.isAudioEnabled !== undefined
              ? p.metadata.isAudioEnabled
              : (hasAudio ?? true); // افتراضي true إذا لم يكن هناك stream
              const isVideoEnabledForPeer =
                p.metadata?.isVideoEnabled !== undefined
              ? p.metadata.isVideoEnabled
              : (hasVideo ?? false);

            // تحديد ما إذا كان يجب عرض أيقونة video-off
            // تظهر عندما: الفيديو معطل أو لا يوجد video tracks متاحة
              const shouldShowVideoOffIcon =
                !isVideoEnabledForPeer || !hasVideo;
              const isScreenSharingForPeer = p.isScreenShare ?? false; // استخدام isScreenShare من entry
            const isActiveSpeaker = activeSpeakerId === p.id;
              // التحقق من مستوى الصوت الفعلي لتزامن الإطار مع المؤشر
              const isAudioActive = (audioLevels[p.peerId] || 0) > 30;
              const showActiveBorder = isActiveSpeaker && isAudioActive;

            // Dynamic tile classes: use aspect-ratio on web instead of fixed heights
              const tileBaseClass = `rounded-xl overflow-hidden relative`;
            const tileWebClass = containerIsGrid
              ? `${tileBaseClass} h-full`
              : tileBaseClass;
              const tileNativeClass =
                count === 1
                  ? "h-[60vh] md:h-[65vh] lg:h-[68vh]"
              : count === 2
                    ? "h-[45vh] md:h-[48vh] lg:h-[50vh]"
                    : "h-[28vh] md:h-[30vh] lg:h-[32vh]";

              const tileClass = containerIsGrid
                ? tileWebClass
                : `${tileBaseClass} ${tileNativeClass}`;

            // Style for web tiles in grid:
            // - Grid يدير الحجم تلقائياً، نستخدم height: 100% فقط
            // - لا نستخدم aspectRatio لأن grid يدير الحجم
              const tileStyle = containerIsGrid
                ? {
                    width: "100%",
                    height: "100%",
                    minHeight: 0, // مهم للـ grid items
                  }
                : {};

            // ✅ Initialize opacity animation for this tile if not exists
            if (!controlsOpacityRef.current[p.id]) {
              controlsOpacityRef.current[p.id] = new Animated.Value(1);
            }
            const opacityAnim = controlsOpacityRef.current[p.id];

            // ✅ Function to show controls with animation
            const showControls = () => {
              // ✅ إظهار البار التحت وإشارة الشبكة أيضاً
              handleScreenInteraction();
              
              // Clear existing timeout
              if (controlsTimeoutRef.current[p.id]) {
                clearTimeout(controlsTimeoutRef.current[p.id]);
              }
              
              // Show with animation
              Animated.timing(opacityAnim, {
                toValue: 1,
                duration: 300,
                easing: Easing.out(Easing.ease),
                useNativeDriver: true,
              }).start();

              // Hide after 3 seconds
              controlsTimeoutRef.current[p.id] = setTimeout(() => {
                Animated.timing(opacityAnim, {
                  toValue: 0,
                  duration: 300,
                  easing: Easing.in(Easing.ease),
                  useNativeDriver: true,
                }).start();
              }, 3000);
            };

            // ✅ Auto-hide after initial display (using a flag to track if already initialized)
            const autoHideKey = `auto-hide-${p.id}`;
            if (!controlsTimeoutRef.current[autoHideKey]) {
              controlsTimeoutRef.current[autoHideKey] = setTimeout(() => {
                Animated.timing(opacityAnim, {
                  toValue: 0,
                  duration: 300,
                  easing: Easing.in(Easing.ease),
                  useNativeDriver: true,
                }).start();
              }, 3000);
            }

            // ✅ Track previous state to detect changes
            const stateKey = `state-${p.id}`;
            const previousState = controlsTimeoutRef.current[stateKey];
            const currentState = {
              isAudioEnabled: isAudioEnabledForPeer,
              isVideoEnabled: isVideoEnabledForPeer,
              isScreenSharing: isScreenSharingForPeer,
            };
            
            // ✅ If state changed, show controls automatically
            if (previousState) {
              const stateChanged = 
                previousState.isAudioEnabled !== currentState.isAudioEnabled ||
                previousState.isVideoEnabled !== currentState.isVideoEnabled ||
                previousState.isScreenSharing !== currentState.isScreenSharing;
              
              if (stateChanged) {
                // State changed - show controls immediately
                showControls();
              }
            }
            
            // ✅ Update previous state
            controlsTimeoutRef.current[stateKey] = currentState;

            return (
              <TouchableOpacity
                  key={`${p.id}-${p.metadata?.isAudioEnabled ? "1" : "0"}-${p.metadata?.isVideoEnabled ? "1" : "0"}-${p.metadata?.isScreenSharing ? "1" : "0"}`}
                  className={`${containerIsGrid ? "w-full h-full" : "w-full"} ${Platform.OS === "web" ? "group" : ""}`}
                  style={containerIsGrid ? { height: "100%" } : {}}
                activeOpacity={1}
                onPress={showControls}
              >
                <View
                  className={tileClass}
                  style={{
                    ...tileStyle,
                    }}
                  >
                  {/* Unified control column - أعلى اليسار لكل تايل */}
                  <Animated.View 
                    className="flex-col gap-y-2"
                    style={{ 
                      opacity: opacityAnim,
                      position: "absolute",
                      top: "50%",
                      left: 8,
                      transform: [{ translateY: -50 }],
                      zIndex: 20,
                    }}
                  >
                    {/* زر التكبير */}
                  {count > 1 && (
                    <TouchableOpacity
                      onPress={(e) => {
                        if (e && typeof e.stopPropagation === "function") {
                          e.stopPropagation();
                        }
                        setPinnedId(p.id);
                        handleScreenInteraction();
                      }}
                        activeOpacity={0.8}
                        className="w-8 h-8 rounded-full bg-black/60 items-center justify-center backdrop-blur-sm"
                    >
                        <FeIcon name="maximize-2" size={16} color="#f6f8f9" />
                    </TouchableOpacity>
                  )}

                    {/* زر التثبيت (Pin) */}
                  {count > 1 && (
                    <TouchableOpacity
                      onPress={(e) => {
                        if (e && typeof e.stopPropagation === "function") {
                          e.stopPropagation();
                        }
                        // تبديل حالة pin للترتيب
                        if (pinnedForOrderId === p.id) {
                          setPinnedForOrderId(null);
                        } else {
                          setPinnedForOrderId(p.id);
                        }
                        handleScreenInteraction();
                      }}
                        activeOpacity={0.8}
                        className="w-8 h-8 rounded-full bg-black/60 items-center justify-center backdrop-blur-sm"
                    >
                        <OIcon
                          name="pin"
                        size={16} 
                          color={pinnedForOrderId === p.id ? "#10b981" : "#f6f8f9"}
                      />
                    </TouchableOpacity>
                  )}

                    {/* حالة المايك للمشارك */}
                    {!isAudioEnabledForPeer && (
                      <View className="w-8 h-8 rounded-full bg-black/60 items-center justify-center backdrop-blur-sm">
                        <FeIcon name="mic-off" size={14} color="#f6f8f9" />
                      </View>
                    )}

                    {/* حالة الكاميرا للمشارك */}
                    {shouldShowVideoOffIcon && (
                      <View className="w-8 h-8 rounded-full bg-black/60 items-center justify-center backdrop-blur-sm">
                        <FeIcon name="video-off" size={14} color="#f6f8f9" />
                      </View>
                    )}
                  </Animated.View>
                  {/* Remote/Local audio for web (skip local audio) */}
                    {!p.isLocal && hasAudio && Platform.OS === "web" && (
                    <audio
                      ref={(audio) => {
                          if (audio) {
                            // حفظ reference للتنظيف
                            audioRefs.current[p.id] = audio;

                            if (p.stream) {
                              // تنظيف srcObject السابق إذا كان موجوداً
                              if (
                                audio.srcObject &&
                                audio.srcObject !== p.stream
                              ) {
                                try {
                                  audio.srcObject
                                    .getTracks()
                                    .forEach((track) => {
                                      track.stop();
                                      track.enabled = false;
                                    });
                                } catch (e) {
                                  logger.warn(
                                    "Error cleaning previous audio stream:",
                                    e
                                  );
                                }
                              }

                          audio.srcObject = p.stream;
                          audio.autoplay = true;
                          audio.volume = 1.0;
                          audio.muted = false;
                              audio.play().catch(() => {});
                            } else {
                              // تنظيف إذا لم يكن هناك stream
                              if (audio.srcObject) {
                                try {
                                  audio.srcObject
                                    .getTracks()
                                    .forEach((track) => {
                                      track.stop();
                                      track.enabled = false;
                                    });
                                  audio.srcObject = null;
                                } catch (e) {
                                  logger.warn(
                                    "Error cleaning audio stream:",
                                    e
                                  );
                                }
                              }
                              audio.pause();
                            }
                          } else {
                            // إزالة reference عند unmount
                            delete audioRefs.current[p.id];
                        }
                      }}
                      autoPlay
                        style={{ display: "none" }}
                    />
                  )}

                  {/* عرض الفيديو أو Screen Share أو Avatar */}
                    {p.isScreenShare && hasVideo ? (
                      // Screen Share entry - عرض screen share stream
                      Platform.OS === "web" ? (
                      <video
                        key={`screen-${p.id}-${isScreenSharingForPeer}`}
                        ref={(video) => {
                            if (video) {
                              // حفظ reference للتنظيف
                              const refKey = `screen-${p.id}`;
                              videoRefs.current[refKey] = video;

                              if (p.stream && isScreenSharingForPeer) {
                                // تنظيف srcObject السابق إذا كان موجوداً
                                if (
                                  video.srcObject &&
                                  video.srcObject !== p.stream
                                ) {
                                  try {
                                    video.srcObject
                                      .getTracks()
                                      .forEach((track) => {
                                        track.stop();
                                        track.enabled = false;
                                      });
                                  } catch (e) {
                                    logger.warn(
                                      "Error cleaning previous screen share stream:",
                                      e
                                    );
                                  }
                                }

                                // ✅ تحسين: تجنب إعادة تعيين srcObject إذا كان نفس الـ stream
                                if (video.srcObject !== p.stream) {
                            video.autoplay = true;
                            video.playsInline = true;
                            video.muted = true;
                            video.srcObject = p.stream;
                                  // ✅ استخدام await بدلاً من setTimeout لضمان smooth playback
                                  (async () => {
                                    try {
                                      await video.play();
                                    } catch (e) {
                                      // Ignore play errors
                                    }
                                  })();
                                } else {
                                  // ✅ إذا كان نفس الـ stream، فقط تأكد من أن الفيديو يعمل
                                  if (video.paused) {
                                    (async () => {
                                      try {
                                        await video.play();
                                      } catch (e) {
                                        // Ignore play errors
                                      }
                                    })();
                                  }
                                }
                              } else {
                                // تنظيف عند إغلاق screen sharing
                                if (video.srcObject) {
                                  try {
                                    video.srcObject
                                      .getTracks()
                                      .forEach((track) => {
                                        track.stop();
                                        track.enabled = false;
                                      });
                                    video.srcObject = null;
                                  } catch (e) {
                                    logger.warn(
                                      "Error cleaning screen share stream:",
                                      e
                                    );
                                  }
                                }
                                video.pause();
                              }
                            } else {
                              // إزالة reference عند unmount
                              delete videoRefs.current[`screen-${p.id}`];
                          }
                        }}
                        autoPlay
                        playsInline
                        muted
                          style={{
                            display: "block",
                            width: "100%",
                            height: "100%",
                            objectFit: "contain",
                            backgroundColor: "#000",
                          }}
                      />
                    ) : (
                      <RTCView
                        key={`screen-${p.id}-${isScreenSharingForPeer}`}
                        streamURL={p.stream.toURL()}
                        className="w-full h-full"
                        objectFit="contain"
                        mirror={false}
                      />
                    )
                  ) : isVideoEnabledForPeer && hasVideo ? (
                    // Video عادي نشط - عرض video stream
                      Platform.OS === "web" ? (
                      <video
                        key={`video-${p.id}`}
                        ref={(video) => {
                            if (video) {
                              // حفظ reference للتنظيف
                              const refKey = `video-${p.id}`;
                              videoRefs.current[refKey] = video;

                              if (p.stream && isVideoEnabledForPeer) {
                                // تنظيف srcObject السابق إذا كان موجوداً
                                if (
                                  video.srcObject &&
                                  video.srcObject !== p.stream
                                ) {
                                  try {
                                    video.srcObject
                                      .getTracks()
                                      .forEach((track) => {
                                        track.stop();
                                        track.enabled = false;
                                      });
                                  } catch (e) {
                                    logger.warn(
                                      "Error cleaning previous video stream:",
                                      e
                                    );
                                  }
                                }

                                // ✅ تحسين: تجنب إعادة تعيين srcObject إذا كان نفس الـ stream
                                if (video.srcObject !== p.stream) {
                            video.autoplay = true;
                            video.playsInline = true;
                            video.muted = true;
                            video.srcObject = p.stream;

                            if (p.isLocal) {
                                    video.style.transform = "scaleX(-1)";
                                  }
                                  
                                  // ✅ FIX: للـ WebRTC MediaStream، استخدم play() مباشرة مع fallback
                                  const playVideo = async () => {
                                    try {
                                      await video.play();
                                    } catch (e) {
                                      // إذا فشل play()، انتظر canplay event وأعد المحاولة
                                      video.oncanplay = async () => {
                                        try {
                                          await video.play();
                                        } catch (err) {
                                          // تجاهل الأخطاء المتكررة
                                        }
                                      };
                                    }
                                  };
                                  
                                  // استدعاء play() مباشرة - WebRTC MediaStream يجب أن يكون جاهزاً
                                  playVideo();
                                } else {
                                  // ✅ إذا كان نفس الـ stream، فقط تأكد من أن الفيديو يعمل
                                  if (video.paused) {
                                    (async () => {
                                      try {
                                        await video.play();
                                      } catch (e) {
                                        // Ignore play errors
                                      }
                                    })();
                                  }
                                }
                              } else {
                                // تنظيف عند إغلاق الفيديو
                                if (video.srcObject) {
                                  try {
                                    video.srcObject
                                      .getTracks()
                                      .forEach((track) => {
                                        track.stop();
                                        track.enabled = false;
                                      });
                                    video.srcObject = null;
                                  } catch (e) {
                                    logger.warn(
                                      "Error cleaning video stream:",
                                      e
                                    );
                                  }
                                }
                                video.pause();
                              }
                            } else {
                              // إزالة reference عند unmount
                              delete videoRefs.current[`video-${p.id}`];
                          }
                        }}
                        autoPlay
                        playsInline
                        muted
                          style={{
                            display: "block",
                            width: "100%",
                            height: "100%",
                            objectFit: "contain",
                            backgroundColor: "#000",
                          }}
                      />
                    ) : (
                      <RTCView
                        key={`video-${p.id}`}
                        streamURL={p.stream.toURL()}
                        className="w-full h-full"
                          objectFit="contain"
                        mirror={p.isLocal}
                      />
                    )
                  ) : (
                    // لا يوجد فيديو أو screen share - عرض Avatar
                      <View
                        className="w-full h-full justify-center items-center bg-[#f6f8f9] dark:bg-sec"
                      >
                        <View style={{ position: "relative" }}>
                          <AudioLevelIndicator
                            audioLevel={audioLevels[p.peerId] || 0}
                            isActive={activeSpeakerId === p.peerId}
                            size={96}
                            color={isDarkColorScheme ? "#10b981" : "#059669"}
                          />
                      <UserImage
                        user={p.userData}
                        size="h-24 w-24"
                        border="border-0"
                        rounded="rounded-full"
                        showStatus={false}
                        text="text-4xl font-bold"
                      />
                    </View>
                      <View className="flex-row items-center justify-center gap-x-1.5 mt-2">
                        <View className="flex-row items-center gap-x-1.5">
                          <Text
                            className={`text-xl font-semibold text-center font-mono ${
                              isDarkColorScheme ? "text-white" : "text-slate-800"
                            }`}
                          >
                            {p.name || getFullName(p.userData, true, 12)}
                          </Text>
                          {/* ✅ (You) - بجانب الاسم */}
                  {p.isLocal && (
                            <Text
                              className={`text-xl font-semibold text-center font-mono ${
                                isDarkColorScheme ? "text-white" : "text-slate-800"
                              }`}
                            >
                              ({t("call.you")})
                            </Text>
                          )}
                        </View>
                        {/* ✅ Raise Hand Icon - بجانب الاسم في grid view */}
                        {raisedHands?.has(p.userData?._id) && (
                          <RaisedHandIconWithAnimation isDarkColorScheme={isDarkColorScheme} />
                        )}
                      </View>
                    </View>
                  )}
                </View>
              </TouchableOpacity>
            );
          });

          // Speaker View (Pin mode): عرض واحد كبير + صغرات
          if (pinnedId) {
              const pinnedEntry = entries.find((e) => e.id === pinnedId);
              const otherEntries = entries.filter((e) => e.id !== pinnedId);

            if (pinnedEntry) {
                const hasVideo =
                  pinnedEntry.stream?.getVideoTracks().length > 0;
                const hasAudio =
                  pinnedEntry.stream?.getAudioTracks().length > 0;
              // استخدام metadata للحالة الفعلية (أولوية للـ metadata)
                const isAudioEnabledForPinned =
                  pinnedEntry.metadata?.isAudioEnabled !== undefined
                ? pinnedEntry.metadata.isAudioEnabled
                : (hasAudio ?? true);
                const isVideoEnabledForPinned =
                  pinnedEntry.metadata?.isVideoEnabled !== undefined
                ? pinnedEntry.metadata.isVideoEnabled
                : (hasVideo ?? false);
              // تحديد ما إذا كان يجب عرض أيقونة video-off
                const shouldShowVideoOffIconPinned =
                  !isVideoEnabledForPinned || !hasVideo;
                const isScreenSharingForPinned =
                  pinnedEntry.isScreenShare ?? false; // استخدام isScreenShare من entry
                const isPinnedActiveSpeaker =
                  activeSpeakerId === pinnedEntry.id;

              return (
                <View className="flex-1 w-full relative">
                  {/* Pinned participant - full screen */}
                  {(() => {
                    // ✅ Initialize opacity animation for pinned view if not exists
                    const pinnedId = `pinned-${pinnedEntry.id}`;
                    if (!controlsOpacityRef.current[pinnedId]) {
                      controlsOpacityRef.current[pinnedId] = new Animated.Value(1);
                    }
                    const pinnedOpacityAnim = controlsOpacityRef.current[pinnedId];

                    // ✅ Function to show controls with animation
                    const showPinnedControls = () => {
                      // ✅ إظهار البار التحت وإشارة الشبكة أيضاً
                      handleScreenInteraction();
                      
                      // Clear existing timeout
                      if (controlsTimeoutRef.current[pinnedId]) {
                        clearTimeout(controlsTimeoutRef.current[pinnedId]);
                      }
                      
                      // Show with animation
                      Animated.timing(pinnedOpacityAnim, {
                        toValue: 1,
                        duration: 300,
                        easing: Easing.out(Easing.ease),
                        useNativeDriver: true,
                      }).start();

                      // Hide after 3 seconds
                      controlsTimeoutRef.current[pinnedId] = setTimeout(() => {
                        Animated.timing(pinnedOpacityAnim, {
                          toValue: 0,
                          duration: 300,
                          easing: Easing.in(Easing.ease),
                          useNativeDriver: true,
                        }).start();
                      }, 3000);
                    };

                    // ✅ Auto-hide after initial display (using a flag to track if already initialized)
                    const autoHideKey = `auto-hide-${pinnedId}`;
                    if (!controlsTimeoutRef.current[autoHideKey]) {
                      controlsTimeoutRef.current[autoHideKey] = setTimeout(() => {
                        Animated.timing(pinnedOpacityAnim, {
                          toValue: 0,
                          duration: 300,
                          easing: Easing.in(Easing.ease),
                          useNativeDriver: true,
                        }).start();
                      }, 3000);
                    }

                    // ✅ Track previous state to detect changes
                    const pinnedStateKey = `state-${pinnedId}`;
                    const previousPinnedState = controlsTimeoutRef.current[pinnedStateKey];
                    const currentPinnedState = {
                      isAudioEnabled: isAudioEnabledForPinned,
                      isVideoEnabled: isVideoEnabledForPinned,
                      isScreenSharing: isScreenSharingForPinned,
                    };
                    
                    // ✅ If state changed, show controls automatically
                    if (previousPinnedState) {
                      const pinnedStateChanged = 
                        previousPinnedState.isAudioEnabled !== currentPinnedState.isAudioEnabled ||
                        previousPinnedState.isVideoEnabled !== currentPinnedState.isVideoEnabled ||
                        previousPinnedState.isScreenSharing !== currentPinnedState.isScreenSharing;
                      
                      if (pinnedStateChanged) {
                        // State changed - show controls immediately
                        showPinnedControls();
                      }
                    }
                    
                    // ✅ Update previous state
                    controlsTimeoutRef.current[pinnedStateKey] = currentPinnedState;

                    return (
                      <TouchableOpacity 
                        className="absolute top-0 left-0 right-0 bottom-0"
                        activeOpacity={1}
                        onPress={showPinnedControls}
                      >
                        <View className="flex-1 w-full h-full overflow-hidden bg-sec relative">
                            {/* Unified control column - في المنتصف على اليسار (نفس ستايل grid view) */}
                            <Animated.View 
                              className="flex-col gap-y-2"
                              style={{ 
                                opacity: pinnedOpacityAnim,
                                position: "absolute",
                                top: "50%",
                                left: 8,
                                transform: [{ translateY: -50 }],
                                zIndex: 20,
                              }}
                            >
                            {/* Unpin icon - في المنتصف على اليسار */}
                            {entries.length > 1 && (
                              <TouchableOpacity
                                onPress={(e) => {
                                  logger.debug("Unpin icon pressed");
                                  if (e && typeof e.stopPropagation === "function") {
                                    e.stopPropagation(); // منع تفعيل onPress للـ TouchableOpacity الأب
                                  }
                                  setPinnedId(null);
                                  handleScreenInteraction();
                                }}
                                activeOpacity={0.8}
                                className="w-8 h-8 rounded-full bg-black/60 items-center justify-center backdrop-blur-sm"
                                style={{ zIndex: 60 }} // أعلى من NetworkQualityIndicator (z-50)
                              >
                                <FeIcon name="minimize-2" size={16} color="#f6f8f9" />
                              </TouchableOpacity>
                            )}

                            {/* Status badges - حالة المايك والكاميرا */}
                            {!isAudioEnabledForPinned && (
                              <View className="w-8 h-8 rounded-full bg-black/60 items-center justify-center backdrop-blur-sm">
                                <FeIcon name="mic-off" size={14} color="#f6f8f9" />
                              </View>
                            )}
                            {shouldShowVideoOffIconPinned && (
                              <View className="w-8 h-8 rounded-full bg-black/60 items-center justify-center backdrop-blur-sm">
                                <FeIcon name="video-off" size={14} color="#f6f8f9" />
                              </View>
                            )}
                          </Animated.View>
                      {/* Pin indicator */}
                        {/* <View className="absolute top-1 left-1 z-10 bg-emerald-500/80 rounded px-2 py-1 flex-row items-center gap-x-1">
                        <FeIcon name="maximize-2" size={10} color="#fff" />
                        <Text className="text-white text-xs font-semibold">Pinned</Text>
                      </View> */}

                      {/* Remote/Local audio for web */}
                        {!pinnedEntry.isLocal &&
                          hasAudio &&
                          Platform.OS === "web" && (
                        <audio
                          ref={(audio) => {
                                if (audio) {
                                  const refKey = `pinned-audio-${pinnedEntry.id}`;
                                  audioRefs.current[refKey] = audio;

                                  if (pinnedEntry.stream) {
                                    if (
                                      audio.srcObject &&
                                      audio.srcObject !== pinnedEntry.stream
                                    ) {
                                      try {
                                        audio.srcObject
                                          .getTracks()
                                          .forEach((track) => {
                                            track.stop();
                                            track.enabled = false;
                                          });
                                      } catch (e) {
                                        logger.warn(
                                          "Error cleaning previous pinned audio stream:",
                                          e
                                        );
                                      }
                                    }
                              audio.srcObject = pinnedEntry.stream;
                              audio.autoplay = true;
                              audio.volume = 1.0;
                              audio.muted = false;
                                    audio.play().catch(() => {});
                                  } else {
                                    if (audio.srcObject) {
                                      try {
                                        audio.srcObject
                                          .getTracks()
                                          .forEach((track) => {
                                            track.stop();
                                            track.enabled = false;
                                          });
                                        audio.srcObject = null;
                                      } catch (e) {
                                        logger.warn(
                                          "Error cleaning pinned audio stream:",
                                          e
                                        );
                                      }
                                    }
                                    audio.pause();
                                  }
                                } else {
                                  delete audioRefs.current[
                                    `pinned-audio-${pinnedEntry.id}`
                                  ];
                            }
                          }}
                          autoPlay
                              style={{ display: "none" }}
                        />
                      )}

                      {/* عرض الفيديو أو Screen Share أو Avatar */}
                        {pinnedEntry.isScreenShare &&
                        hasVideo ? (
                          // Screen Share entry
                          Platform.OS === "web" ? (
                          <video
                            key={`screen-pinned-${pinnedEntry.id}-${isScreenSharingForPinned}`}
                            ref={(video) => {
                                if (video) {
                                  const refKey = `screen-pinned-${pinnedEntry.id}`;
                                  videoRefs.current[refKey] = video;

                                  if (
                                    pinnedEntry.stream &&
                                    isScreenSharingForPinned
                                  ) {
                                    if (
                                      video.srcObject &&
                                      video.srcObject !== pinnedEntry.stream
                                    ) {
                                      try {
                                        video.srcObject
                                          .getTracks()
                                          .forEach((track) => {
                                            track.stop();
                                            track.enabled = false;
                                          });
                                      } catch (e) {
                                        logger.warn(
                                          "Error cleaning previous pinned screen share stream:",
                                          e
                                        );
                                      }
                                    }
                                    // ✅ تحسين: تجنب إعادة تعيين srcObject إذا كان نفس الـ stream
                                    if (
                                      video.srcObject !== pinnedEntry.stream
                                    ) {
                                video.autoplay = true;
                                video.playsInline = true;
                                video.muted = true;
                                video.srcObject = pinnedEntry.stream;
                                      // ✅ استخدام await بدلاً من setTimeout لضمان smooth playback
                                      (async () => {
                                        try {
                                          await video.play();
                                        } catch (e) {
                                          // Ignore play errors
                                        }
                                      })();
                                    } else {
                                      // ✅ إذا كان نفس الـ stream، فقط تأكد من أن الفيديو يعمل
                                      if (video.paused) {
                                        (async () => {
                                          try {
                                            await video.play();
                                          } catch (e) {
                                            // Ignore play errors
                                          }
                                        })();
                                      }
                                    }
                                  } else {
                                    if (video.srcObject) {
                                      try {
                                        video.srcObject
                                          .getTracks()
                                          .forEach((track) => {
                                            track.stop();
                                            track.enabled = false;
                                          });
                                        video.srcObject = null;
                                      } catch (e) {
                                        logger.warn(
                                          "Error cleaning pinned screen share stream:",
                                          e
                                        );
                                      }
                                    }
                                    video.pause();
                                  }
                                } else {
                                  delete videoRefs.current[
                                    `screen-pinned-${pinnedEntry.id}`
                                  ];
                              }
                            }}
                            autoPlay
                            playsInline
                            muted
                              style={{
                                display: "block",
                                width: "100%",
                                height: "100%",
                                objectFit: "contain",
                                backgroundColor: "#000",
                              }}
                          />
                        ) : (
                          <RTCView
                            key={`screen-pinned-${pinnedEntry.id}-${isScreenSharingForPinned}`}
                            streamURL={pinnedEntry.stream.toURL()}
                            className="w-full h-full"
                            objectFit="contain"
                            mirror={false}
                          />
                        )
                        ) : isVideoEnabledForPinned &&
                          hasVideo ? (
                        // Video عادي نشط
                          Platform.OS === "web" ? (
                          <video
                            key={`video-pinned-${pinnedEntry.id}-${isVideoEnabledForPinned}`}
                            ref={(video) => {
                                if (video) {
                                  const refKey = `video-pinned-${pinnedEntry.id}`;
                                  videoRefs.current[refKey] = video;

                                  if (
                                    pinnedEntry.stream &&
                                    isVideoEnabledForPinned
                                  ) {
                                    if (
                                      video.srcObject &&
                                      video.srcObject !== pinnedEntry.stream
                                    ) {
                                      try {
                                        video.srcObject
                                          .getTracks()
                                          .forEach((track) => {
                                            track.stop();
                                            track.enabled = false;
                                          });
                                      } catch (e) {
                                        logger.warn(
                                          "Error cleaning previous pinned video stream:",
                                          e
                                        );
                                      }
                                    }
                                    // ✅ تحسين: تجنب إعادة تعيين srcObject إذا كان نفس الـ stream
                                    if (
                                      video.srcObject !== pinnedEntry.stream
                                    ) {
                                video.autoplay = true;
                                video.playsInline = true;
                                video.muted = true;
                                video.srcObject = pinnedEntry.stream;
                                if (pinnedEntry.isLocal) {
                                        video.style.transform = "scaleX(-1)";
                                      }
                                      // ✅ استخدام await بدلاً من setTimeout لضمان smooth playback
                                      (async () => {
                                        try {
                                          await video.play();
                                        } catch (e) {
                                          // Ignore play errors
                                        }
                                      })();
                                    } else {
                                      // ✅ إذا كان نفس الـ stream، فقط تأكد من أن الفيديو يعمل
                                      if (video.paused) {
                                        (async () => {
                                          try {
                                            await video.play();
                                          } catch (e) {
                                            // Ignore play errors
                                          }
                                        })();
                                      }
                                    }
                                  } else {
                                    if (video.srcObject) {
                                      try {
                                        video.srcObject
                                          .getTracks()
                                          .forEach((track) => {
                                            track.stop();
                                            track.enabled = false;
                                          });
                                        video.srcObject = null;
                                      } catch (e) {
                                        logger.warn(
                                          "Error cleaning pinned video stream:",
                                          e
                                        );
                                      }
                                    }
                                    video.pause();
                                  }
                                } else {
                                  delete videoRefs.current[
                                    `video-pinned-${pinnedEntry.id}`
                                  ];
                              }
                            }}
                            autoPlay
                            playsInline
                            muted
                              style={{
                                display: "block",
                                width: "100%",
                                height: "100%",
                                objectFit: "contain",
                                backgroundColor: "#000",
                              }}
                          />
                        ) : (
                          <RTCView
                            key={`video-pinned-${pinnedEntry.id}-${isVideoEnabledForPinned}`}
                            streamURL={pinnedEntry.stream.toURL()}
                            className="w-full h-full"
                              objectFit="contain"
                            mirror={pinnedEntry.isLocal}
                          />
                        )
                      ) : (
                        // Avatar
                          <View
                            className="w-full h-full justify-center items-center bg-[#f6f8f9] dark:bg-sec"
                          >
                            <View style={{ position: "relative" }}>
                              <AudioLevelIndicator
                                audioLevel={
                                  audioLevels[pinnedEntry.peerId] || 0
                                }
                                isActive={
                                  activeSpeakerId === pinnedEntry.peerId
                                }
                                size={128} // حجم أكبر للشاشة المكبرة
                                color={isDarkColorScheme ? "#10b981" : "#059669"}
                              />
                          <UserImage
                            user={pinnedEntry.userData}
                            size="h-32 w-32"
                            border="border-0"
                            rounded="rounded-full"
                            showStatus={false}
                            text="text-5xl font-bold"
                          />
                        </View>
                            {/* ✅ Name and Raise Hand Icon - تحت الدائرة في pinned view */}
                            <View className="flex-row items-center justify-center gap-x-1.5 mt-4">
                              <View className="flex-row items-center gap-x-1.5">
                                <Text
                                  className={`text-xl font-semibold text-center ${
                                    isDarkColorScheme ? "text-white" : "text-slate-800"
                                  }`}
                                  numberOfLines={1}
                                >
                        {pinnedEntry.name}
                      </Text>
                                {/* ✅ (You) - بجانب الاسم */}
                                {pinnedEntry.isLocal && (
                                  <Text
                                    className={`text-xl font-semibold text-center ${
                                      isDarkColorScheme ? "text-white" : "text-slate-800"
                                    }`}
                                  >
                                    ({t("call.you")})
                                  </Text>
                                )}
                              </View>
                              {/* ✅ Raise Hand Icon - بجانب الاسم */}
                              {raisedHands?.has(pinnedEntry.userData?._id) && (
                                <RaisedHandIconWithAnimation theme={theme} size={20} />
                              )}
                            </View>
                        </View>
                      )}
                        </View>
                      </TouchableOpacity>
                    );
                  })()}

                  {/* Other participants - thumbnails at top */}
                  {otherEntries.length > 0 && (
                      // على الويب: استخدم View مع CSS overflow مباشرة
                      <View className="absolute top-12 left-2 right-2 z-40">
                        <ScrollView
                          horizontal
                          showsHorizontalScrollIndicator={false}
                          contentContainerStyle={{
                            flexDirection: "row",
                          gap: 8,
                          paddingRight: 8,
                          }}
                          style={{
                            width: "100%",
                            height: "100%",
                        }}
                      >
                        {otherEntries.map((entry, idx) => {
                            const hasVideoThumb =
                              entry.stream?.getVideoTracks().length > 0;
                            const hasAudioThumb =
                              entry.stream?.getAudioTracks().length > 0;
                          // استخدام metadata للحالة الفعلية (أولوية للـ metadata)
                            const isAudioEnabledForThumb =
                              entry.metadata?.isAudioEnabled !== undefined
                            ? entry.metadata.isAudioEnabled
                            : (hasAudioThumb ?? true);
                            const isVideoEnabledForThumb =
                              entry.metadata?.isVideoEnabled !== undefined
                            ? entry.metadata.isVideoEnabled
                            : (hasVideoThumb ?? false);
                          // تحديد ما إذا كان يجب عرض أيقونة video-off
                            const shouldShowVideoOffIconThumb =
                              !isVideoEnabledForThumb || !hasVideoThumb;
                            const isScreenSharingForThumb =
                              entry.isScreenShare ?? false; // استخدام isScreenShare من entry
                            const isThumbActiveSpeaker =
                              activeSpeakerId === entry.id;

                          // ✅ Initialize opacity animation for thumbnail if not exists
                          const thumbId = `thumb-${entry.id}`;
                          if (!controlsOpacityRef.current[thumbId]) {
                            controlsOpacityRef.current[thumbId] = new Animated.Value(1);
                          }
                          const thumbOpacityAnim = controlsOpacityRef.current[thumbId];

                          // ✅ Function to show controls with animation
                          const showThumbControls = () => {
                            // ✅ إظهار البار التحت وإشارة الشبكة أيضاً
                            handleScreenInteraction();
                            
                            // Clear existing timeout
                            if (controlsTimeoutRef.current[thumbId]) {
                              clearTimeout(controlsTimeoutRef.current[thumbId]);
                            }
                            
                            // Show with animation
                            Animated.timing(thumbOpacityAnim, {
                              toValue: 1,
                              duration: 300,
                              easing: Easing.out(Easing.ease),
                              useNativeDriver: true,
                            }).start();

                            // Hide after 3 seconds
                            controlsTimeoutRef.current[thumbId] = setTimeout(() => {
                              Animated.timing(thumbOpacityAnim, {
                                toValue: 0,
                                duration: 300,
                                easing: Easing.in(Easing.ease),
                                useNativeDriver: true,
                              }).start();
                            }, 3000);
                          };

                          // ✅ Auto-hide after initial display (using a flag to track if already initialized)
                          const autoHideKey = `auto-hide-${thumbId}`;
                          if (!controlsTimeoutRef.current[autoHideKey]) {
                            controlsTimeoutRef.current[autoHideKey] = setTimeout(() => {
                              Animated.timing(thumbOpacityAnim, {
                                toValue: 0,
                                duration: 300,
                                easing: Easing.in(Easing.ease),
                                useNativeDriver: true,
                              }).start();
                            }, 3000);
                          }

                          // ✅ Track previous state to detect changes
                          const thumbStateKey = `state-${thumbId}`;
                          const previousThumbState = controlsTimeoutRef.current[thumbStateKey];
                          const currentThumbState = {
                            isAudioEnabled: isAudioEnabledForThumb,
                            isVideoEnabled: isVideoEnabledForThumb,
                            isScreenSharing: isScreenSharingForThumb,
                          };
                          
                          // ✅ If state changed, show controls automatically
                          if (previousThumbState) {
                            const thumbStateChanged = 
                              previousThumbState.isAudioEnabled !== currentThumbState.isAudioEnabled ||
                              previousThumbState.isVideoEnabled !== currentThumbState.isVideoEnabled ||
                              previousThumbState.isScreenSharing !== currentThumbState.isScreenSharing;
                            
                            if (thumbStateChanged) {
                              // State changed - show controls immediately
                              showThumbControls();
                            }
                          }
                          
                          // ✅ Update previous state
                          controlsTimeoutRef.current[thumbStateKey] = currentThumbState;

                          return (
                            <TouchableOpacity
                              key={`${entry.id}-${idx}`}
                              className="rounded-lg overflow-hidden bg-sec border-2 relative"
                              style={{
                                  borderColor: "rgba(255, 255, 255, 0.2)",
                                  borderWidth: 2,
                                  width: Platform.OS === "web" ? 140 : 140,
                                  height: Platform.OS === "web" ? 140 : 140,
                                aspectRatio: 1,
                              }}
                              activeOpacity={1}
                              onPress={showThumbControls}
                            >
                              {/* Unified control column - في المنتصف على اليسار (نفس ستايل grid view) */}
                              <Animated.View 
                                className="flex-col gap-y-1 justify-center"
                                style={{ 
                                  opacity: thumbOpacityAnim,
                                  position: "absolute",
                                  top: 0,
                                  bottom: 0,
                                  left: 4,
                                  justifyContent: "center",
                                  zIndex: 20,
                                }}
                              >
                                {/* زر التكبير */}
                                <TouchableOpacity
                                  onPress={() => {
                                    setPinnedId(entry.id);
                                    handleScreenInteraction();
                                  }}
                                  activeOpacity={0.8}
                                  className="w-7 h-7 rounded-full bg-black/60 items-center justify-center backdrop-blur-sm"
                                >
                                  <FeIcon
                                    name="maximize-2"
                                    size={12}
                                    color="#f6f8f9"
                                  />
                                </TouchableOpacity>

                                {/* Status badges - حالة المايك والكاميرا */}
                                {!isAudioEnabledForThumb && (
                                  <View className="w-7 h-7 rounded-full bg-black/60 items-center justify-center backdrop-blur-sm">
                                    <FeIcon
                                      name="mic-off"
                                      size={12}
                                      color="#f6f8f9"
                                    />
                                  </View>
                                )}
                                {shouldShowVideoOffIconThumb && (
                                  <View className="w-7 h-7 rounded-full bg-black/60 items-center justify-center backdrop-blur-sm">
                                    <FeIcon
                                      name="video-off"
                                      size={12}
                                      color="#f6f8f9"
                                    />
                                  </View>
                                )}
                              </Animated.View>

                              {/* Video/Avatar */}
                                {entry.isScreenShare &&
                                hasVideoThumb ? (
                                  // Screen Share entry
                                  Platform.OS === "web" ? (
                                  <video
                                    key={`screen-thumb-${entry.id}-${isScreenSharingForThumb}`}
                                    ref={(video) => {
                                      if (video && entry.stream) {
                                        if (!isScreenSharingForThumb) {
                                          video.srcObject = null;
                                          return;
                                        }
                                          // ✅ تحسين: تجنب إعادة تعيين srcObject إذا كان نفس الـ stream
                                          if (
                                            video.srcObject !== entry.stream
                                          ) {
                                        video.autoplay = true;
                                        video.playsInline = true;
                                        video.muted = true;
                                        video.srcObject = entry.stream;
                                            // ✅ استخدام await بدلاً من setTimeout لضمان smooth playback
                                            (async () => {
                                              try {
                                                await video.play();
                                              } catch (e) {
                                                // Ignore play errors
                                              }
                                            })();
                                          } else if (video.paused) {
                                            // ✅ إذا كان نفس الـ stream، فقط تأكد من أن الفيديو يعمل
                                            (async () => {
                                              try {
                                                await video.play();
                                              } catch (e) {
                                                // Ignore play errors
                                              }
                                            })();
                                          }
                                      }
                                    }}
                                    autoPlay
                                    playsInline
                                    muted
                                      style={{
                                        display: "block",
                                        width: "100%",
                                        height: "100%",
                                        objectFit: "contain",
                                        backgroundColor: "#000",
                                      }}
                                  />
                                ) : (
                                  <RTCView
                                    key={`screen-thumb-${entry.id}-${isScreenSharingForThumb}`}
                                    streamURL={entry.stream.toURL()}
                                    className="w-full h-full"
                                    objectFit="contain"
                                    mirror={false}
                                  />
                                )
                                ) : isVideoEnabledForThumb &&
                                  hasVideoThumb ? (
                                // Video عادي نشط
                                  Platform.OS === "web" ? (
                                  <video
                                    key={`video-thumb-${entry.id}-${isVideoEnabledForThumb}`}
                                    ref={(video) => {
                                      if (video && entry.stream) {
                                        if (!isVideoEnabledForThumb) {
                                          video.srcObject = null;
                                          return;
                                        }
                                          // ✅ تحسين: تجنب إعادة تعيين srcObject إذا كان نفس الـ stream
                                          if (
                                            video.srcObject !== entry.stream
                                          ) {
                                        video.autoplay = true;
                                        video.playsInline = true;
                                        video.muted = true;
                                        video.srcObject = entry.stream;
                                        if (entry.isLocal) {
                                              video.style.transform =
                                                "scaleX(-1)";
                                            }
                                            // ✅ استخدام await بدلاً من setTimeout لضمان smooth playback
                                            (async () => {
                                              try {
                                                await video.play();
                                              } catch (e) {
                                                // Ignore play errors
                                              }
                                            })();
                                          } else if (video.paused) {
                                            // ✅ إذا كان نفس الـ stream، فقط تأكد من أن الفيديو يعمل
                                            (async () => {
                                              try {
                                                await video.play();
                                              } catch (e) {
                                                // Ignore play errors
                                              }
                                            })();
                                          }
                                      }
                                    }}
                                    autoPlay
                                    playsInline
                                    muted
                                      style={{
                                        display: "block",
                                        width: "100%",
                                        height: "100%",
                                        objectFit: "contain",
                                        backgroundColor: "#000",
                                      }}
                                  />
                                ) : (
                                  <RTCView
                                    key={`video-thumb-${entry.id}-${isVideoEnabledForThumb}`}
                                    streamURL={entry.stream.toURL()}
                                    className="w-full h-full"
                                      objectFit="contain"
                                    mirror={entry.isLocal}
                                  />
                                )
                              ) : (
                                // Avatar
                                  <View
                                    className="w-full h-full justify-center items-center bg-[#f6f8f9] dark:bg-sec"
                                  >
                                    <View style={{ position: "relative" }}>
                                      <AudioLevelIndicator
                                        audioLevel={
                                          audioLevels[entry.peerId] || 0
                                        }
                                        isActive={
                                          activeSpeakerId === entry.peerId
                                        }
                                        size={48} // حجم صغير للـ thumbnails
                                        color={
                                          isDarkColorScheme
                                            ? "#10b981"
                                            : "#059669"
                                        }
                                      />
                                  <UserImage
                                    user={entry.userData}
                                    size="h-14 w-14"
                                    border="border-0"
                                    rounded="rounded-full"
                                    showStatus={false}
                                    text="text-2xl font-bold"
                                  />
                                    </View>
                                </View>
                              )}
                                <View className="absolute bottom-0 left-0 right-0 flex-row items-center justify-center gap-x-0.5 bg-black/60 py-0.5 px-1">
                                  <View className="flex-row items-center gap-x-0.5 flex-1 justify-center">
                                    <Text
                                      className="text-white text-[10px] text-center"
                                      numberOfLines={1}
                                    >
                                {entry.name}
                              </Text>
                                    {/* ✅ (You) - بجانب الاسم في thumbnails */}
                                    {entry.isLocal && (
                                      <Text
                                        className="text-white text-[10px] text-center"
                                      >
                                        ({t("call.you")})
                                      </Text>
                                    )}
                                </View>
                                  {/* ✅ Raise Hand Icon - بجانب الاسم في thumbnails */}
                                  {raisedHands?.has(entry.userData?._id) && (
                                    <RaisedHandIconWithAnimation theme={theme} size={10} />
                                  )}
                                </View>
                            </TouchableOpacity>
                            );
                          })}
                        </ScrollView>
                      </View>
                  )}
                </View>
              );
            }
          }

          // Grid View (default): grid عادي لجميع المشاركين
          if (containerIsGrid) {
            return (
                <View className="flex-1 p-1 w-full" style={gridStyle}>
                {tiles}
              </View>
            );
          }

          // Native: use ScrollView for flexibility
          return (
            <ScrollView className="flex-1 p-2.5 w-full">
              <View className="flex-row flex-wrap justify-center gap-2.5">
                {tiles}
              </View>
            </ScrollView>
          );
        })()}

        {/* Controls (with slide animation) - Hidden for viewers and recorders */}
        {(() => {
          // ✅ إخفاء control bar للمشاهدين (معالجة string 'true' أيضاً)
          const isActuallyViewer = isViewer === true || isViewer === "true";

          if (isActuallyViewer || isRecorder) {
            // Hide for viewers and recorders
            return null; // إرجاع null للمشاهدين والمسجلين
          }

          return (
        <Animated.View
          className="w-full linker-w"
          style={[
            {
              transform: [
                { translateX: "-50%" },
                { translateY: controlsSlideAnim },
              ],
              opacity: controlsSlideAnim.interpolate({
                inputRange: [0, 100],
                outputRange: [1, 0],
              }),
              zIndex: 50,
                  position: "fixed",
              bottom: 10,
              left: "50%",
                  maxWidth: "100%",
                  display: "flex",
                  justifyContent: "center",
                  alignItems: "center",
              gap: 10,
              padding: 10,
                  backgroundColor: "rgba(0, 0, 0, 0.3)",
                  backdropFilter: "blur(5px)",
              elevation: 8,
                  flexDirection: "row",
              minHeight: 64,
              borderRadius: 10,
            },
          ]}
        >
              {/* Mute/Unmute Audio - Hidden for viewers and when chat input is shown */}
              {!isViewer && !showBroadcasterChatInput && (
                <Tooltip
                  text={
                    !hasAudio
                      ? t("call.noMicrophone") || "No microphone available"
                      : isAudioEnabled
                        ? t("call.muteMicrophone") || "Mute microphone (A)"
                        : t("call.unmuteMicrophone") || "Unmute microphone (A)"
                  }
                  placement="top"
                >
            <TouchableOpacity
                    className={`w-12 h-12 rounded-full justify-center items-center transition-all duration-200 ${
                      !hasAudio
                        ? "bg-drakGray" // Disabled state - no microphone
                        : !isAudioEnabled
                          ? "bg-drakGray"
                          : "bg-primary"
                    } ${
                      Platform.OS === "web" && hasAudio
                        ? "hover:scale-110 hover:shadow-lg active:scale-95"
                        : ""
                }`}
              onPress={() => {
                      if (hasAudio) {
                toggleAudio();
                handleScreenInteraction();
                      }
                    }}
                    disabled={!hasAudio}
                    accessibilityLabel={
                      !hasAudio
                        ? "No microphone available"
                        : isAudioEnabled
                          ? "Mute microphone (A)"
                          : "Unmute microphone (A)"
                    }
                    style={
                      Platform.OS === "web"
                        ? {
                            boxShadow:
                              !isAudioEnabled && hasAudio
                                ? "0 4px 12px rgba(239, 68, 68, 0.3)"
                                : undefined,
                            cursor: !hasAudio ? "not-allowed" : "pointer",
                          }
                        : {}
                    }
            >
              {!hasAudio || !isAudioEnabled ? (
                <FeIcon name="mic-off" size={24} color="#f6f8f9" />
              ) : (
                <FeIcon name="mic" size={24} color="#f6f8f9" />
              )}
            </TouchableOpacity>
          </Tooltip>
              )}

              {/* Enable/Disable Video - Visible in both audio and video calls, hidden for viewers and when chat input is shown */}
              {!isViewer && !showBroadcasterChatInput && (
                <Tooltip
                  text={
                    !hasVideo
                      ? t("call.noCamera") || "No camera available"
                      : isVideoEnabled
                        ? t("call.turnOffCamera") || "Turn off camera (V)"
                        : t("call.turnOnCamera") || "Turn on camera (V)"
                  }
                  placement="top"
                >
              <TouchableOpacity
                    className={`w-12 h-12 rounded-full justify-center items-center transition-all duration-200 ${
                      !hasVideo
                        ? "bg-drakGray" // Disabled state - no camera
                        : !isVideoEnabled
                          ? "bg-drakGray"
                          : "bg-primary"
                    } ${
                      Platform.OS === "web" && hasVideo
                        ? "hover:scale-110 hover:shadow-lg active:scale-95"
                        : ""
                  }`}
                onPress={() => {
                      if (hasVideo) {
                        toggleVideo();
                  handleScreenInteraction();
                      }
                    }}
                    disabled={!hasVideo}
                    accessibilityLabel={
                      !hasVideo
                        ? "No camera available"
                        : isVideoEnabled
                          ? "Turn off camera (V)"
                          : "Turn on camera (V)"
                    }
                    style={
                      Platform.OS === "web"
                        ? {
                            boxShadow:
                              (!hasVideo || !isVideoEnabled) && hasVideo
                                ? "0 4px 12px rgba(239, 68, 68, 0.3)"
                                : undefined,
                            cursor: !hasVideo ? "not-allowed" : "pointer",
                          }
                        : {}
                    }
                  >
                    {hasVideo && isVideoEnabled ? (
                  <FeIcon name="video" size={24} color="#f6f8f9" />
                ) : (
                  <FeIcon name="video-off" size={24} color="#f6f8f9" />
                )}
              </TouchableOpacity>
            </Tooltip>
          )}

              {/* Minimize Call (return to chat) - Available during ringing and active call */}
              {!isViewer &&
                !showBroadcasterChatInput &&
                (peers.length > 0 || (roomId && isJoined)) && (
                <Tooltip
                  text="Minimize call (continue in background)"
                  placement="top"
                >
            <TouchableOpacity
                    className={`w-12 h-12 rounded-full justify-center items-center bg-gray-600 transition-all duration-200 ${
                      Platform.OS === "web"
                        ? "hover:scale-110 hover:bg-gray-500 active:scale-95"
                        : ""
                }`}
              onPress={() => {
                      minimizeCall();
                handleScreenInteraction();
              }}
                    accessibilityLabel="Minimize call"
            >
                    <FeIcon name="minimize-2" size={24} color="#f6f8f9" />
            </TouchableOpacity>
          </Tooltip>
              )}

              {/* ✅ Broadcaster Chat Input - Show inside bottom bar when toggled */}
              {!isViewer && showBroadcasterChatInput && (callId || room?.liveStreamSettings?.isLive) && (
                <View
                  style={{
                    flex: 1,
                    minWidth: 200,
                    maxWidth: 400,
                    marginHorizontal: 8,
                    alignItems: "center",
                  }}
                >
                  <StreamChatInputField
                    value={broadcasterComment}
                    onChangeText={setBroadcasterComment}
                    onSend={handleSendBroadcasterComment}
                    placeholder="Type a message"
                    disabled={
                      isSendingBroadcasterComment ||
                      (!room?._id && !callId)
                    }
                    isSending={isSendingBroadcasterComment}
                    onFocus={handleScreenInteraction}
                    onSubmitEditing={handleSendBroadcasterComment}
                  />
                </View>
              )}

              {/* Message/Chat Button - Only for broadcasters in live streams */}
              {!isViewer && room?.liveStreamSettings?.isLive && (
                <Tooltip
                  text={showBroadcasterChatInput ? "Hide chat" : "Show chat"}
                  placement="top"
                >
              <TouchableOpacity
                    className={`w-12 h-12 rounded-full justify-center items-center transition-all duration-200 ${
                      showBroadcasterChatInput
                        ? "bg-primary"
                        : "bg-gray-600"
                    } ${
                      Platform.OS === "web"
                        ? "hover:scale-110 hover:bg-gray-500 active:scale-95"
                        : ""
                  }`}
                onPress={() => {
                      setShowBroadcasterChatInput(!showBroadcasterChatInput);
                  handleScreenInteraction();
                }}
                    accessibilityLabel={showBroadcasterChatInput ? "Hide chat" : "Show chat"}
              >
                    <FeIcon name="message-circle" size={24} color="#f6f8f9" />
              </TouchableOpacity>
            </Tooltip>
          )}

              {/* More Options Menu - Hidden for viewers */}
              {!isViewer && (
                <ContextMenu
                  width={230}
                  placement="top"
                  px="px-2"
                  itemClassName="rounded-lg"
                  onOpen={() => setIsContextMenuOpen(true)}
                  onClose={() => setIsContextMenuOpen(false)}
                  options={[
                    // ✅ When chat input is shown, add minimize, mic, and camera options to menu
                    ...(showBroadcasterChatInput
                      ? [
                          {
                            name: "Minimize call",
                            icon: (
                              <FeIcon name="minimize-2" size={18} color={isDarkColorScheme ? "#dee4e6" : "#2D2D37"} />
                            ),
                            onPress: () => {
                              minimizeCall();
                              handleScreenInteraction();
                            },
                            className: "bg-gray-600",
                          },
                          {
                            name: isAudioEnabled
                              ? t("call.muteMicrophone")
                              : t("call.unmuteMicrophone"),
                            icon: isAudioEnabled ? (
                              <FeIcon name="mic" size={18} color={isDarkColorScheme ? "#dee4e6" : "#2D2D37"} />
                            ) : (
                              <FeIcon name="mic-off" size={18} color={isDarkColorScheme ? "#dee4e6" : "#2D2D37"} />
                            ),
                            onPress: () => {
                              if (peers.length > 0) {
                                toggleAudio();
                                handleScreenInteraction();
                              }
                            },
                            disabled: peers.length === 0,
                            className: !isAudioEnabled
                              ? "bg-danger"
                              : "bg-primary",
                          },
                          {
                            name:
                              isVideoEnabled
                                ? t("call.turnOffCamera")
                                : t("call.turnOnCamera"),
                            icon:
                              isVideoEnabled ? (
                                <FeIcon name="video" size={18} color={isDarkColorScheme ? "#dee4e6" : "#2D2D37"} />
                              ) : (
                                <FeIcon name="video-off" size={18} color={isDarkColorScheme ? "#dee4e6" : "#2D2D37"} />
                              ),
                            onPress: () => {
                              if (peers.length > 0) {
                                toggleVideo();
                                handleScreenInteraction();
                              }
                            },
                            disabled: peers.length === 0,
                            className:
                              !isVideoEnabled
                                ? "bg-danger"
                                : "bg-primary",
                          },
                        ]
                      : []),
                    // Screen Share - في بداية القائمة (متاح في جميع المكالمات)
                    ...(!isViewer && isVideoCall && Platform.OS === "web"
                      ? [
                          {
                            name: isScreenSharingFromContext
                              ? t("call.stopShareScreen", { defaultValue: "Stop sharing screen" })
                              : t("call.startShareScreen", { defaultValue: "Share screen" }),
                            icon: isStartingScreenShare ? (
                              <View
                                style={{
                                  width: 18,
                                  height: 18,
                                  borderWidth: 2,
                                  borderColor: isDarkColorScheme ? "#dee4e6" : "#2D2D37",
                                  borderTopColor: "transparent",
                                  borderRadius: 9,
                                }}
                              />
                            ) : (
                              <MdIcon
                                name={
                                  isScreenSharingFromContext
                                    ? "monitor-off"
                                    : "monitor-share"
                                }
                                size={18}
                                color={isDarkColorScheme ? "#dee4e6" : "#2D2D37"}
                              />
                            ),
                            onPress: () => {
                              if (peers.length > 0) {
                                handleScreenShare();
                                handleScreenInteraction();
                              }
                            },
                            disabled:
                              isStartingScreenShare || 
                              peers.length === 0 ||
                              // ✅ Check Call.callSettings via checkCallPermission
                              !checkCallPermission("screenShare", currentUser?._id?.toString()),
                            disabledReason:
                              peers.length === 0
                                ? t("call.actionRequiresParticipants", {
                                    defaultValue: "Requires active participants",
                                  })
                                : !checkCallPermission(
                                      "screenShare",
                                      currentUser?._id?.toString()
                                    )
                                  ? t("call.actionNotAllowed", {
                                      defaultValue: "Not allowed by call settings",
                                    })
                                  : null,
                            className: isScreenSharingFromContext
                              ? "bg-primary"
                              : "bg-gray-600",
                          },
                        ]
                      : []),
                    // Resume Call (if on hold)
                    ...(isCallOnHold && resumeCall
                      ? [
                          {
                            name: t("call.callWaiting.resumeCall"),
                            icon: (
                              <FeIcon name="play" size={18} color={isDarkColorScheme ? "#dee4e6" : "#2D2D37"} />
                            ),
                            onPress: async () => {
                              try {
                                await resumeCall();
                                handleScreenInteraction();
                              } catch (error) {
                                logger.error("Error resuming call:", error);
                              }
                            },
                            className: "bg-amber-500",
                          },
                        ]
                      : []),
                    // Transfer Call
                    ...(isJoined && callId && room
                      ? [
                          {
                            name: t("call.transfer"),
                            icon: (
                              <FeIcon
                                name="user-plus"
                                size={18}
                                color={isDarkColorScheme ? "#dee4e6" : "#2D2D37"}
                              />
                            ),
                            onPress: () => {
                              setShowTransferModal(true);
                              handleScreenInteraction();
                            },
                            disabled:
                              // ✅ Check Call.callSettings via checkCallPermission
                              !checkCallPermission("callTransfer", currentUser?._id?.toString()),
                            disabledReason: !checkCallPermission(
                              "callTransfer",
                              currentUser?._id?.toString()
                            )
                              ? t("call.actionNotAllowed", {
                                  defaultValue: "Not allowed by call settings",
                                })
                              : null,
                            className: "bg-gray-600",
                          },
                        ]
                      : []),
                    // Call Recording
                    ...(startRecording && stopRecording
                      ? [
                          {
                            name: isRecording
                              ? t("call.recording.stop")
                              : t("call.recording.start"),
                            icon: isRecording ? (
                              <FeIcon name="square" size={18} color={isDarkColorScheme ? "#dee4e6" : "#2D2D37"} />
                            ) : (
                              <FeIcon name="circle" size={18} color={isDarkColorScheme ? "#dee4e6" : "#2D2D37"} />
                            ),
                            onPress: async () => {
                              try {
                                handleScreenInteraction();
                                if (isRecording) {
                                  const recording = await stopRecording();
                                  dispatch(
                                    addAlert({
                                      type: "success",
                                      message:
                                        t("call.recording.saved", {
                                          duration: recording?.duration || 0,
                                        }) +
                                        ". " +
                                        t("call.recording.viewInHistory"),
                                    })
                                  );
                                } else {
                                  await startRecording();
                                  dispatch(
                                    addAlert({
                                      type: "info",
                                      message: t("call.recording.started"),
                                    })
                                  );
                                }
                              } catch (error) {
                                logger.error(
                                  "Error toggling recording:",
                                  error
                                );
                                dispatch(
                                  addAlert({
                                    type: "error",
                                    message:
                                      error.message ||
                                      t("call.recording.error"),
                                  })
                                );
                              }
                            },
                            disabled:
                              peers.length === 0 ||
                              // ✅ Check Call.callSettings via checkCallPermission
                              !checkCallPermission("recording", currentUser?._id?.toString()),
                            disabledReason:
                              peers.length === 0
                                ? t("call.actionRequiresParticipants", {
                                    defaultValue: "Requires active participants",
                                  })
                                : !checkCallPermission(
                                      "recording",
                                      currentUser?._id?.toString()
                                    )
                                  ? t("call.actionNotAllowed", {
                                      defaultValue: "Not allowed by call settings",
                                    })
                                  : null,
                            className: isRecording
                              ? "bg-danger"
                              : "bg-gray-600",
                          },
                        ]
                      : []),
                    // Convert to Live Stream - متاح للجميع (ليس فقط للمكالمات التي بدأها المستخدم)
                    // ✅ Check if stream is actually live (not stale data) - if startedAt is older than 1 hour, consider it stale
                    ...(startLiveStream && room && (() => {
                      const isStreamActuallyLive = room?.liveStreamSettings?.isLive === true;
                      const streamStartedAt = room?.liveStreamSettings?.startedAt ? new Date(room.liveStreamSettings.startedAt) : null;
                      const isStaleData = streamStartedAt && (Date.now() - streamStartedAt.getTime() > 24 * 60 * 60 * 1000); // More than 24 hours = stale
                      return !isStreamActuallyLive || isStaleData;
                    })()
                      ? [
                          {
                            name: t("call.convertToStream"),
                            icon: (
                              <FeIcon name="radio" size={18} color={isDarkColorScheme ? "#dee4e6" : "#2D2D37"} />
                            ),
                            onPress: () => {
                              handleConvertToStream();
                              handleScreenInteraction();
                            },
                            disabled:
                              isConvertingToStream || 
                              peers.length === 0 ||
                              // ✅ Check Call.callSettings via checkCallPermission
                              !checkCallPermission("liveStream", currentUser?._id?.toString()),
                            disabledReason:
                              peers.length === 0
                                ? t("call.actionRequiresParticipants", {
                                    defaultValue: "Requires active participants",
                                  })
                                : !checkCallPermission(
                                      "liveStream",
                                      currentUser?._id?.toString()
                                    )
                                  ? t("call.actionNotAllowed", {
                                      defaultValue: "Not allowed by call settings",
                                    })
                                  : null,
                            className:
                              peers.length === 0 ? "bg-drakGray" : "bg-gray-600",
                          },
                        ]
                      : []),
                    // ✅ Raise Hand (for group calls) - قبل Participants
                    ...(room?.isGroup && callId && isJoined && !isViewer
                      ? [
                          {
                            name: raisedHands?.has(currentUser?._id)
                              ? t("call.raiseHand.lowerHand")
                              : t("call.raiseHand.raiseHand"),
                            icon: (
                              <MdIcon
                                name="hand-back-left"
                                size={18}
                                color={isDarkColorScheme ? "#dee4e6" : "#2D2D37"}
                              />
                            ),
                            onPress: async () => {
                              try {
                                handleScreenInteraction();
                                if (!isJoined || !roomId || !callId) {
                                  dispatch(
                                    addAlert({
                                      type: "error",
                                      message: t("call.raiseHand.error") || "Not in a group call",
                                    })
                                  );
                                  return;
                                }
                                const isHandRaised = raisedHands?.has(currentUser?._id);
                                if (isHandRaised) {
                                  await lowerHand();
                                  dispatch(
                                    addAlert({
                                      type: "success",
                                      message: t("call.raiseHand.lowerHand") || "Hand lowered",
                                    })
                                  );
                                } else {
                                  await raiseHand();
                                  dispatch(
                                    addAlert({
                                      type: "success",
                                      message: t("call.raiseHand.raiseHand") || "Hand raised",
                                    })
                                  );
                                }
                              } catch (error) {
                                logger.error("Error toggling hand:", error);
                                dispatch(
                                  addAlert({
                                    type: "error",
                                    message:
                                      error.message ||
                                      t("call.raiseHand.error") ||
                                      "Failed to toggle hand",
                                  })
                                );
                              }
                            },
                            disabled: !isJoined || !roomId || !callId || isViewer,
                            className: raisedHands?.has(currentUser?._id)
                              ? "bg-emerald-500"
                              : "bg-gray-600",
                          },
                        ]
                      : []),
                    // ✅ Participants (أعضاء الكروب) - قبل إعدادات الأجهزة
                    {
                      name: t("call.participants") || "Participants",
                      icon: (
                        <FeIcon name="users" size={18} color={isDarkColorScheme ? "#dee4e6" : "#2D2D37"} />
                      ),
                      onPress: () => {
                        setShowParticipantsModal(true);
                        handleScreenInteraction();
                      },
                      className: "bg-gray-600",
                    },
                    // ✅ Call Settings (إعدادات المكالمة) - قبل إعدادات الأجهزة
                    {
                      name: t("call.callSettings") || "Call Settings",
                      icon: (
                        <FeIcon name="settings" size={18} color={isDarkColorScheme ? "#dee4e6" : "#2D2D37"} />
                      ),
                      onPress: () => {
                        setShowCallSettingsModal(true);
                        handleScreenInteraction();
                      },
                      className: "bg-gray-600",
                    },
                    // Device Settings - في آخر القائمة
                    {
                      name: t("call.deviceSettings.title") || t("call.deviceSettings") || "Device settings",
                      icon: (
                        <Icon name="settings-sharp" size={18} color={isDarkColorScheme ? "#dee4e6" : "#2D2D37"} />
                      ),
                      onPress: () => {
                        setShowDeviceSettings(true);
                        handleScreenInteraction();
                      },
                      className: "bg-gray-600",
                    },
                    // End for everyone - always visible, disabled by permission
                    {
                      name: room?.liveStreamSettings?.isLive
                        ? t("call.endStreamForEveryone", {
                            defaultValue: "End stream for everyone",
                          })
                        : t("call.endForEveryone", {
                            defaultValue: "End for everyone",
                          }),
                      icon: (
                        <Icon
                          name="call"
                          size={18}
                          color="#ffffff"
                          style={{ transform: [{ rotate: "135deg" }] }}
                        />
                      ),
                      onPress: async () => {
                        try {
                          await endCallForAll();
                          handleScreenInteraction();
                        } catch (error) {
                          dispatch(
                            addAlert({
                              type: "error",
                              message:
                                error?.message ||
                                t("call.endForEveryoneError", {
                                  defaultValue:
                                    "You are not allowed to end the call for everyone",
                                }),
                            })
                          );
                        }
                      },
                      disabled: !canUseEndForEveryoneAction,
                      disabledReason: !canUseEndForEveryoneAction
                        ? t("call.actionNotAllowed", {
                            defaultValue: "Not allowed by call settings",
                          })
                        : null,
                      className: "bg-danger",
                    },
                  ]}
                  renderItem={({ option, close }) => {
                    // استخراج لون الخلفية من className إذا كان موجوداً
                    const bgColor = option.className?.includes("bg-amber-500")
                      ? "bg-amber-500"
                      : option.className?.includes("bg-purple-500")
                        ? "bg-purple-500"
                        : option.className?.includes("bg-red-600")
                          ? "bg-red-600"
                          : option.className?.includes("bg-danger")
                            ? "bg-danger"
                            : option.className?.includes("bg-drakGray")
                              ? "bg-drakGray"
                              : null;

                    return (
              <TouchableOpacity
                        className={`flex-row items-center justify-between p-1 gap-x-2 rounded-lg mb-1 ${
                          option.disabled ? "opacity-50" : ""
                  }`}
                onPress={() => {
                          if (!option.disabled) {
                            try {
                              option.onPress?.();
                            } finally {
                              close();
                            }
                          }
                        }}
                        disabled={option.disabled}
                      >
                        <View className="flex-row items-center gap-x-3 flex-1">
                          {bgColor ? (
                            <View
                              className={`w-8 h-8 rounded-full justify-center items-center ${bgColor}`}
                            >
                              {option.icon}
                            </View>
                          ) : (
                            <View className="w-8 h-8 rounded-full justify-center items-center">
                              {option.icon}
                            </View>
                          )}
                          <View className="flex-1">
                            <Text className={`text-sm font-medium ${
                              isDarkColorScheme ? "text-papaya" : "text-placeholder"
                            }`}>
                              {option.name}
                            </Text>
                            {option.disabled && option.disabledReason ? (
                              <Text
                                className={`text-[11px] ${
                                  isDarkColorScheme ? "text-slate-400" : "text-slate-500"
                                }`}
                              >
                                {option.disabledReason}
                              </Text>
                            ) : null}
                          </View>
                        </View>
              </TouchableOpacity>
                    );
                  }}
                >
                  <View
                    className={`w-12 h-12 rounded-full justify-center items-center bg-gray-600 transition-all duration-200 ${
                      Platform.OS === "web"
                        ? "hover:scale-110 hover:bg-gray-500 active:scale-95"
                        : ""
                    }`}
                    accessibilityLabel="More options"
                  >
                    <FeIcon name="more-vertical" size={24} color="#f6f8f9" />
                  </View>
                </ContextMenu>
              )}

              {/* Leave Call - Only for non-viewers */}
              {!isViewer && (
                <Tooltip text="Leave call" placement="top">
                  <TouchableOpacity
                    className={`w-12 h-12 rounded-full justify-center items-center bg-danger transition-all duration-200 ${
                      Platform.OS === "web"
                        ? "hover:scale-110 hover:shadow-lg active:scale-95"
                        : ""
                    }`}
                    onPress={() => {
                      handleLeaveRoom();
                      handleScreenInteraction();
                    }}
                    accessibilityLabel="Leave call"
                  >
                    <Icon
                      name="call"
                      size={24}
                      color="#f6f8f9"
                      style={{ transform: [{ rotate: "135deg" }] }}
                    />
                  </TouchableOpacity>
                </Tooltip>
              )}

          {/* ✅ Participants Count - تم حذفه بناءً على طلب المستخدم */}
        </Animated.View>
          );
        })()}
        {/* ✅ Stream Chat Overlay - Display messages over video during live stream */}
        {/* {room?.liveStreamSettings?.isLive && ( */}
        <StreamChatOverlay roomId={roomId} isViewer={isViewer} />
        {/* )} */}

        {/* ✅ Stream Chat Input - Allow viewers to send messages */}
        {/* {isViewer && room?.liveStreamSettings?.isLive && (
          <StreamChatInput roomId={roomId} />
        )} */}

        {/* ✅ Broadcaster Chat Input - Show when chat input is toggled (inside bottom bar) */}
        {/* Note: This is handled inside the bottom controls bar */}

        {/* ✅ Viewer Controls - Always visible */}
        {isViewer && (
          <>
            {/* Top-right buttons: Minimize and Close - Hidden when stream has ended */}
            {!streamEnded && (
              <View
                style={{
                  position: "absolute",
                  top: 20,
                  right: 20,
                  flexDirection: "row",
                  gap: 12,
                  zIndex: 9999, // ✅ Very high z-index to ensure visibility
                }}
              >
                {/* Minimize Button */}
          <TouchableOpacity
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: 24,
                    justifyContent: "center",
                    alignItems: "center",
                    backgroundColor: "rgba(75, 85, 99, 0.9)",
                  }}
            onPress={() => {
                    minimizeCall();
              handleScreenInteraction();
            }}
                  accessibilityLabel="Minimize stream"
                >
                  <FeIcon name="minimize-2" size={24} color="#f6f8f9" />
          </TouchableOpacity>

                {/* Close Button */}
                <TouchableOpacity
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: 24,
                    justifyContent: "center",
                    alignItems: "center",
                    backgroundColor: "rgba(220, 38, 38, 0.9)",
                  }}
                  onPress={async () => {
                    try {
                      await leaveRoom();
                      // ✅ Redirect to live streams page for viewers
                      if (isViewer) {
                        router.push("/live-streams");
                      } else if (onClose) {
                        onClose();
                      }
                      handleScreenInteraction();
                    } catch (e) {
                      logger.error("Error leaving stream:", e);
                    }
                  }}
                  accessibilityLabel="Leave stream"
                >
                  <FeIcon name="x" size={24} color="#f6f8f9" />
                </TouchableOpacity>
              </View>
            )}

            {/* Bottom chat input - Footer style */}
            {/* ✅ Show input if viewer is in an active stream (check callId or room.liveStreamSettings) */}
            {/* ✅ Hide input if stream has ended */}
            {!streamEnded && (callId || room?.liveStreamSettings?.isLive) && (
              <View
                style={{
                  position: "absolute",
                  bottom: 20,
                  left: 16,
                  right: 16,
                  zIndex: 50,
                }}
              >
                <StreamChatInputField
                  value={viewerComment}
                  onChangeText={setViewerComment}
                  onSend={handleSendViewerComment}
                  placeholder="Type a message"
                  disabled={
                    isSendingViewerComment ||
                    (!room?._id && !callId)
                  }
                  isSending={isSendingViewerComment}
                  onFocus={handleScreenInteraction}
                  onSubmitEditing={handleSendViewerComment}
                />
              </View>
            )}
          </>
        )}

        {/* Device Settings Modal */}
        <DeviceSettings
          isVisible={showDeviceSettings}
          onClose={() => setShowDeviceSettings(false)}
          onDeviceChange={handleDeviceChange}
          currentAudioDevice={selectedAudioDevice}
          currentVideoDevice={selectedVideoDevice}
          isAudioEnabled={isAudioEnabled}
          isVideoEnabled={isVideoEnabled}
          onToggleAudio={toggleAudio}
          onToggleVideo={toggleVideo}
          isVideoCall={isVideoCall}
        />

        {/* Device Error Handler */}
        <DeviceErrorHandler
          isVisible={showDeviceError}
          error={deviceError}
          onRetry={() => {
            setShowDeviceError(false);
            setDeviceError(null);
            handleJoinRoom();
          }}
          onClose={() => {
            setShowDeviceError(false);
            setDeviceError(null);
          }}
          onOpenDeviceSettings={() => {
            setShowDeviceError(false);
            setShowDeviceSettings(true);
          }}
        />

        {/* Participants Modal */}
        <Modal
          showModal={showParticipantsModal}
          setShowModal={setShowParticipantsModal}
          opacity="70"
          animationType="slide"
        >
          <View
            className={`w-11/12 linker-w rounded-2xl pt-4 px-4 pb-4 ${
              isDarkColorScheme ? "bg-main" : "bg-[#dee4e6]"
            }`}
            style={
              Platform.OS === "web"
                ? {
                    maxHeight: "95vh",
                  }
                : {
                    maxHeight: "90%",
                  }
            }
          >
            {/* Header */}
            <View className="flex-row items-center justify-between mb-4">
              <View className="flex-col">
                <Text
                  className={`text-xl font-bold ${
                    isDarkColorScheme ? "text-papaya" : "text-placeholder"
                  }`}
                >
                  {(() => {
                    // ✅ حساب عدد المشتركين (broadcasters/members) فقط
                    const participantsCount =
                      peers.filter(
                        (p) =>
                          !room?.liveStreamSettings?.isLive ||
                          (p.metadata?.role !== "viewer" &&
                            p.metadata?.role !== undefined)
                      ).length + 1; // +1 للـ current user

                    // ✅ إذا كان ستريم، نعرض عدد المشاهدين أيضاً
                    if (
                      room?.liveStreamSettings?.isLive &&
                      room?.activeStreamViewersCount !== undefined
                    ) {
                      return `Participants (${participantsCount}) • Viewers (${room.activeStreamViewersCount || 0})`;
                    }
                    return `Participants (${participantsCount})`;
                  })()}
              </Text>
                {/* ✅ Viewers count subtitle for streams */}
                {room?.liveStreamSettings?.isLive &&
                  room?.activeStreamViewersCount !== undefined &&
                  room.activeStreamViewersCount > 0 && (
                    <Text
                      className={`text-xs mt-1 ${
                        isDarkColorScheme ? "text-slate-400" : "text-slate-500"
                      }`}
                    >
                      {t("stream.viewersWatching") ||
                        `${room.activeStreamViewersCount} viewer${
                          room.activeStreamViewersCount !== 1 ? "s" : ""
                        } watching`}
                    </Text>
                  )}
              </View>
              <View className="flex-row items-center gap-x-2">
                {canUseMuteOthersAction && callId ? (
                  <Tooltip text={t("call.muteAllParticipants", { defaultValue: "Mute all participants" })}>
                    <TouchableOpacity
                      onPress={async () => {
                        try {
                          await muteAllGroupCallParticipants({ callId });
                          dispatch(
                            addAlert({
                              type: "success",
                              message: t("call.muteAllParticipantsSuccess", {
                                defaultValue: "All participants were muted",
                              }),
                            })
                          );
                          pushModerationActivity(
                            t("call.muteAllParticipantsSuccess", {
                              defaultValue: "All participants were muted",
                            })
                          );
                        } catch (error) {
                          dispatch(
                            addAlert({
                              type: "error",
                              message:
                                error?.message ||
                                t("call.muteAllParticipantsError", {
                                  defaultValue: "Failed to mute participants",
                                }),
                            })
                          );
                        }
                      }}
                      className={`items-center justify-center w-10 h-10 rounded-lg ${
                        isDarkColorScheme ? "bg-slate-700" : "bg-slate-200"
                      }`}
                    >
                      <FeIcon
                        name="mic-off"
                        size={16}
                        color={isDarkColorScheme ? "#dee4e6" : "#2D2D37"}
                      />
                    </TouchableOpacity>
                  </Tooltip>
                ) : null}
              <TouchableOpacity
                onPress={() => setShowParticipantsModal(false)}
                  className="items-center justify-center w-12 h-12 p-2"
              >
                <FeIcon
                  name="x"
                  size={30}
                    color={isDarkColorScheme ? "#dee4e6" : "#2D2D37"}
                />
              </TouchableOpacity>
              </View>
            </View>

            {moderationActivityFeed.length > 0 && (
              <View
                className={`mx-2 mb-2 rounded-xl px-3 py-2 ${
                  isDarkColorScheme ? "bg-slate-800/70" : "bg-slate-100"
                }`}
              >
                <Text
                  className={`text-[11px] mb-1 ${
                    isDarkColorScheme ? "text-slate-400" : "text-slate-500"
                  }`}
                >
                  {t("call.moderationActivity", { defaultValue: "Moderation activity" })}
                </Text>
                {moderationActivityFeed.map((activity) => (
                  <Text
                    key={activity.id}
                    className={`text-xs mb-0.5 ${
                      isDarkColorScheme ? "text-slate-200" : "text-slate-700"
                    }`}
                    numberOfLines={1}
                  >
                    {`- ${activity.message}`}
                  </Text>
                ))}
              </View>
            )}

            {/* Participants List */}
            <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
              {(() => {
                // Build participants list from entries
                const validRemote = Object.entries(remoteStreams)
                  .filter(([peerId, stream]) => {
                    if (!stream) return false;
                    const hasTracks =
                      (stream.getVideoTracks()?.length || 0) > 0 ||
                      (stream.getAudioTracks()?.length || 0) > 0;
                    const hasPeer = peers.some((p) => p.peerId === peerId);
                    if (!hasTracks || !hasPeer) return false;

                    // ✅ فلترة viewers: في الستريم، فقط broadcasters يجب أن يظهروا
                    const peer = peers.find((p) => p.peerId === peerId);
                    if (
                      room?.liveStreamSettings?.isLive &&
                      peer?.metadata?.role === "viewer"
                    ) {
                      return false; // تخطي viewers في الستريم
                    }

                    return true;
                  })
                  .map(([peerId, stream]) => {
                    const peer = peers.find((p) => p.peerId === peerId);
                    const displayName = getFullName(peer?.userData, false, 12);
                    
                    // ✅ تحديد حالة الـ audio/video من الـ stream tracks إذا لم تكن metadata متوفرة
                    const hasAudioTrack = stream?.getAudioTracks()?.some(t => t.enabled && t.readyState === 'live');
                    const hasVideoTrack = stream?.getVideoTracks()?.some(t => t.enabled && t.readyState === 'live');
                    
                    return {
                      id: peerId,
                      stream,
                      name: displayName,
                      isLocal: false,
                      userData: peer?.userData,
                      metadata: {
                        // استخدام metadata من peer إذا متوفرة، وإلا استخدام حالة الـ tracks
                        isAudioEnabled: peer?.metadata?.isAudioEnabled ?? hasAudioTrack ?? false,
                        isVideoEnabled: peer?.metadata?.isVideoEnabled ?? hasVideoTrack ?? false,
                        isScreenSharing: peer?.metadata?.isScreenSharing ?? false,
                      },
                    };
                  });

                // ✅ في الستريم، إذا كان المستخدم viewer، لا نعرض local stream
                // ✅ أيضاً، لا نعرض local stream إذا كان null أو غير موجود
                const shouldShowLocalInModal =
                  !isViewer &&
                  localStream !== null &&
                  localStream !== undefined;

                const entries = [
                  // إضافة local entry فقط إذا لم يكن viewer وكان localStream موجوداً
                  ...(shouldShowLocalInModal
                    ? [
                  {
                          id: "local",
                    stream: localStream,
                          name: getFullName(currentUser, false, 12) || "You",
                    isLocal: true,
                    userData: currentUser,
                          metadata: {
                            isAudioEnabled,
                            isVideoEnabled,
                            isScreenSharing: isScreenSharingFromContext,
                  },
                        },
                      ]
                    : []),
                  ...validRemote,
                ];

                return entries.map((entry) => {
                  const hasVideo = entry.stream?.getVideoTracks().length > 0;
                  const hasAudio = entry.stream?.getAudioTracks().length > 0;
                  const targetUserId =
                    entry?.userData?._id?.toString?.() || String(entry?.userData?._id || "");
                  const ownerId =
                    room?.user?._id?.toString?.() ||
                    room?.user?.toString?.() ||
                    String(room?.user || "");
                  const roomRole = room?.roles?.find((r) => {
                    const roleUserId =
                      r?.user?._id?.toString?.() ||
                      r?.user?.toString?.() ||
                      String(r?.user || "");
                    return roleUserId === targetUserId;
                  })?.role;
                  const targetRoomRole =
                    ownerId === targetUserId
                      ? "owner"
                      : roomRole === "admin"
                        ? "admin"
                        : roomRole === "moderator"
                          ? "moderator"
                          : "member";
                  const targetIsModerator = targetRoomRole === "moderator";
                  const hasOptimisticModeratorValue = Object.prototype.hasOwnProperty.call(
                    optimisticModeratorsByUserId,
                    targetUserId
                  );
                  const effectiveIsModerator = hasOptimisticModeratorValue
                    ? Boolean(optimisticModeratorsByUserId[targetUserId])
                    : targetIsModerator;
                  const displayRole =
                    targetRoomRole === "owner" || targetRoomRole === "admin"
                      ? targetRoomRole
                      : effectiveIsModerator
                        ? "moderator"
                        : "member";
                  const isModeratorUpdatePending = Boolean(
                    pendingModeratorOpsByUserId[targetUserId]
                  );
                  const isParticipantRemovePending = Boolean(
                    pendingRemoveParticipantOpsByUserId[targetUserId]
                  );
                  const isSpeakingLockUpdatePending = Boolean(
                    pendingSpeakingLockOpsByUserId[targetUserId]
                  );
                  const isHandPriorityUpdatePending = Boolean(
                    pendingHandPriorityOpsByUserId[targetUserId]
                  );
                  const isOptimisticallyRemoved = Boolean(
                    optimisticallyRemovedParticipantsByUserId[targetUserId]
                  );
                  const isCurrentUserTarget =
                    targetUserId === currentUser?._id?.toString?.();
                  const canModerateTargetParticipant =
                    canUseMuteOthersAction &&
                    Boolean(targetUserId) &&
                    !isCurrentUserTarget &&
                    targetRoomRole !== "owner";
                  const moderationDisabledReason = !canUseMuteOthersAction
                    ? t("call.moderationNoPermission", {
                        defaultValue: "You do not have moderation permission.",
                      })
                    : isCurrentUserTarget
                    ? t("call.moderationCannotTargetSelf", {
                        defaultValue: "You cannot moderate your own participant entry.",
                      })
                    : targetRoomRole === "owner"
                    ? t("call.moderationCannotTargetOwner", {
                        defaultValue: "Owner cannot be changed by this action.",
                      })
                    : "";
                  if (isOptimisticallyRemoved) return null;
                  // استخدام metadata للحالة الفعلية (أولوية للـ metadata)
                  const isAudioEnabledForEntry = entry.isLocal
                    ? isAudioEnabled
                    : entry.metadata?.isAudioEnabled !== undefined
                      ? entry.metadata.isAudioEnabled
                      : (hasAudio ?? true);
                  const isVideoEnabledForEntry = entry.isLocal
                    ? isVideoEnabled
                    : entry.metadata?.isVideoEnabled !== undefined
                      ? entry.metadata.isVideoEnabled
                      : (hasVideo ?? false);
                  const isActiveSpeaker = activeSpeakerId === entry.id;

                  return (
                    <Box key={entry.id} mb="mb-1">
                      <UserImage
                        size="h-12 w-12"
                        border="border-0"
                        user={entry.userData}
                        showStatus={false}
                      />
                      <View className="flex-row items-center justify-between flex-1 w-full mx-2">
                        <View className="flex-col items-start justify-center flex-1">
                          <View className="flex-row items-center gap-x-2 flex-wrap">
                            <View className="flex-row items-center gap-x-1.5">
                            <UserName
                                className={`${
                                  isDarkColorScheme
                                    ? "text-slate-300"
                                    : "text-slate-600"
                                }`}
                              user={entry.userData}
                              onlyFirst={true}
                            />
                              {/* ✅ (You) - بجانب الاسم */}
                            {entry.isLocal && (
                                <Text
                                  className={`${
                                    isDarkColorScheme
                                      ? "text-slate-300"
                                      : "text-slate-600"
                                  }`}
                                >
                                  ({t("call.you")})
                              </Text>
                            )}
                              {/* ✅ Speaking Indicator - بجانب الاسم مع أنيميشن */}
                              {isActiveSpeaker && <SpeakingIndicator />}
                              {/* ✅ Raise Hand Icon - بجانب الاسم مع تأثير اهتزاز */}
                              {raisedHands?.has(entry.userData?._id) && (
                                <RaisedHandIconWithAnimation
                                  isDarkColorScheme={isDarkColorScheme}
                                />
                              )}
                              {/* ✅ Role Badge - بجانب الاسم */}
                              {room?.isGroup && entry.userData && (
                                <RoleBadge
                                  role={displayRole}
                                  size="sm"
                                />
                              )}
                            </View>
                          </View>
                          <View className="flex-row items-center gap-x-2 mt-0.5">
                            {/* Audio/Video Status - Icons only */}
                            <FeIcon
                              name={hasAudio && isAudioEnabledForEntry ? "mic" : "mic-off"}
                              size={14}
                              color={
                                hasAudio && isAudioEnabledForEntry
                                  ? (isDarkColorScheme ? "#10b981" : "#059669")
                                  : (isDarkColorScheme ? "#ef4444" : "#dc2626")
                              }
                            />
                            {isVideoCall && (
                              <FeIcon
                                name={hasVideo && isVideoEnabledForEntry ? "video" : "video-off"}
                                size={14}
                                color={
                                  hasVideo && isVideoEnabledForEntry
                                    ? (isDarkColorScheme ? "#10b981" : "#059669")
                                    : (isDarkColorScheme ? "#ef4444" : "#dc2626")
                                }
                              />
                            )}
                            {/* ✅ Typing Indicator */}
                            {usersTyping?.[
                              `${entry.userData?._id}_${roomId}`
                            ] && (
                              <View className="flex-row items-center">
                                <Text
                                  className={`text-xs ${
                                    isDarkColorScheme
                                      ? "text-blue-400"
                                      : "text-blue-600"
                                  }`}
                                >
                                  {t("header.typingIndicator") || "typing..."}
                                </Text>
                              </View>
                            )}
                          </View>
                        </View>

                        {/* ✅ Action Buttons for other participants */}
                        {!entry.isLocal && Platform.OS === "web" && (
                            <View className="flex-row items-center gap-x-2">
                              {/* ✅ Mute/Unmute Microphone Button */}
                              {canUseMuteOthersAction && (
                                <Tooltip text={entry.isAudioMuted ? t("call.requestUnmute") : t("call.muteMic")}>
                                  <TouchableOpacity
                                    onPress={() => {
                                      if (currentSocket && roomId) {
                                        currentSocket.emit("requestToggleMedia", {
                                          callId,
                                          roomId,
                                          targetUserId: entry.userData?._id,
                                          mediaType: "audio",
                                          action: entry.isAudioMuted ? "enable" : "disable",
                                          requestedBy: currentUser?._id,
                                        });
                                        dispatch(
                                          addAlert({
                                            type: "info",
                                            message: entry.isAudioMuted
                                              ? t("call.unmuteMicRequestSent", { name: getFullName(entry.userData, false) })
                                              : t("call.muteMicRequestSent", { name: getFullName(entry.userData, false) }),
                                          })
                                        );
                                      }
                                    }}
                                    className={`p-2 rounded-lg ${
                                      entry.isAudioMuted
                                        ? "bg-red-500/20"
                                        : isDarkColorScheme
                                          ? "bg-slate-700"
                                          : "bg-slate-200"
                                    }`}
                                  >
                                    <FeIcon
                                      name={entry.isAudioMuted ? "mic-off" : "mic"}
                                      size={18}
                                      color={
                                        entry.isAudioMuted
                                          ? "#ef4444"
                                          : isDarkColorScheme ? "#dee4e6" : "#2D2D37"
                                      }
                                    />
                                  </TouchableOpacity>
                                </Tooltip>
                              )}

                              {/* ✅ Set/Unset moderator (group host only) */}
                              {room?.isGroup &&
                                targetUserId &&
                                targetRoomRole !== "owner" &&
                                targetUserId !== currentUser?._id?.toString?.() &&
                                canUseMuteOthersAction && (
                                <Tooltip
                                  text={
                                    effectiveIsModerator
                                      ? t("call.removeModerator")
                                      : t("call.makeModerator")
                                  }
                                >
                                  <TouchableOpacity
                                    onPress={async () => {
                                      try {
                                        if (!targetUserId || !callId) return;
                                        if (isModeratorUpdatePending) return;
                                        const nextModeratorState = !effectiveIsModerator;
                                        const previousModeratorState = effectiveIsModerator;
                                        setPendingModeratorOpsByUserId((prev) => ({
                                          ...prev,
                                          [targetUserId]: true,
                                        }));
                                        setOptimisticModeratorsByUserId((prev) => ({
                                          ...prev,
                                          [targetUserId]: nextModeratorState,
                                        }));
                                        await setGroupCallModerator({
                                          callId,
                                          participantId: targetUserId,
                                          isModerator: nextModeratorState,
                                        });
                                        dispatch(
                                          addAlert({
                                            type: "success",
                                            message: previousModeratorState
                                              ? t("call.moderatorRemoved")
                                              : t("call.moderatorGranted"),
                                          })
                                        );
                                        pushModerationActivity(
                                          previousModeratorState
                                            ? t("call.moderatorRemoved", {
                                                defaultValue: "Moderator access removed",
                                              })
                                            : t("call.moderatorGranted", {
                                                defaultValue: "Moderator access granted",
                                              })
                                        );
                                      } catch (error) {
                                        setOptimisticModeratorsByUserId((prev) => ({
                                          ...prev,
                                          [targetUserId]: effectiveIsModerator,
                                        }));
                                        dispatch(
                                          addAlert({
                                            type: "error",
                                            message: error?.message || t("call.moderatorUpdateError"),
                                          })
                                        );
                                      } finally {
                                        setPendingModeratorOpsByUserId((prev) => {
                                          const next = { ...prev };
                                          delete next[targetUserId];
                                          return next;
                                        });
                                      }
                                    }}
                                    className={`p-2 rounded-lg ${
                                      effectiveIsModerator
                                        ? "bg-amber-500/20"
                                        : isDarkColorScheme
                                          ? "bg-slate-700"
                                          : "bg-slate-200"
                                    }`}
                                    disabled={isModeratorUpdatePending}
                                    style={
                                      isModeratorUpdatePending ? { opacity: 0.65 } : undefined
                                    }
                                  >
                                    <FeIcon
                                      name="shield"
                                      size={18}
                                      color={
                                        effectiveIsModerator
                                          ? "#f59e0b"
                                          : isDarkColorScheme
                                            ? "#dee4e6"
                                            : "#2D2D37"
                                      }
                                    />
                                  </TouchableOpacity>
                                </Tooltip>
                              )}
                              
                              {/* Advanced moderation: lock/unlock speaking */}
                              {room?.isGroup && (
                                <Tooltip
                                  text={canModerateTargetParticipant
                                    ? speakingLocksByUserId?.[targetUserId]
                                      ? t("call.unlockSpeaking", {
                                          defaultValue: "Unlock speaking",
                                        })
                                      : t("call.lockSpeaking", {
                                          defaultValue: "Lock speaking",
                                        })
                                    : moderationDisabledReason}
                                >
                                  <TouchableOpacity
                                    onPress={async () => {
                                      try {
                                        if (!targetUserId || !callId) return;
                                        if (!canModerateTargetParticipant) return;
                                        if (isSpeakingLockUpdatePending) return;
                                        const nextLockedState = !Boolean(
                                          speakingLocksByUserId?.[targetUserId]
                                        );
                                        setPendingSpeakingLockOpsByUserId((prev) => ({
                                          ...prev,
                                          [targetUserId]: true,
                                        }));
                                        await setParticipantSpeakingLock({
                                          participantId: targetUserId,
                                          locked: nextLockedState,
                                        });
                                        pushModerationActivity(
                                          nextLockedState
                                            ? t("call.lockSpeaking", {
                                                defaultValue: "Lock speaking",
                                              })
                                            : t("call.unlockSpeaking", {
                                                defaultValue: "Unlock speaking",
                                              })
                                        );
                                      } catch (error) {
                                        dispatch(
                                          addAlert({
                                            type: "error",
                                            message:
                                              error?.message ||
                                              t("call.lockSpeakingError", {
                                                defaultValue:
                                                  "Unable to update speaking lock.",
                                              }),
                                          })
                                        );
                                      } finally {
                                        setPendingSpeakingLockOpsByUserId((prev) => {
                                          const next = { ...prev };
                                          delete next[targetUserId];
                                          return next;
                                        });
                                      }
                                    }}
                                    className={`p-2 rounded-lg ${
                                      speakingLocksByUserId?.[targetUserId]
                                        ? "bg-red-500/20"
                                        : isDarkColorScheme
                                          ? "bg-slate-700"
                                          : "bg-slate-200"
                                    }`}
                                    disabled={
                                      !canModerateTargetParticipant ||
                                      isSpeakingLockUpdatePending
                                    }
                                    style={
                                      !canModerateTargetParticipant ||
                                      isSpeakingLockUpdatePending
                                        ? { opacity: 0.6 }
                                        : undefined
                                    }
                                  >
                                    <FeIcon
                                      name={
                                        speakingLocksByUserId?.[targetUserId]
                                          ? "mic-off"
                                          : "mic"
                                      }
                                      size={18}
                                      color={
                                        speakingLocksByUserId?.[targetUserId]
                                          ? "#ef4444"
                                          : isDarkColorScheme
                                            ? "#dee4e6"
                                            : "#2D2D37"
                                      }
                                    />
                                  </TouchableOpacity>
                                </Tooltip>
                              )}

                              {/* Advanced moderation: bump hand raise priority */}
                              {room?.isGroup && (
                                <Tooltip
                                  text={
                                    canModerateTargetParticipant
                                      ? t("call.increaseRaisePriority", {
                                          defaultValue: "Increase raise-hand priority",
                                        })
                                      : moderationDisabledReason
                                  }
                                >
                                  <TouchableOpacity
                                    onPress={async () => {
                                      try {
                                        if (!targetUserId || !callId) return;
                                        if (!canModerateTargetParticipant) return;
                                        if (isHandPriorityUpdatePending) return;
                                        const nextPriority =
                                          Number(
                                            handRaisePriorityByUserId?.[targetUserId] || 0
                                          ) + 1;
                                        setPendingHandPriorityOpsByUserId((prev) => ({
                                          ...prev,
                                          [targetUserId]: true,
                                        }));
                                        await setParticipantHandRaisePriority({
                                          participantId: targetUserId,
                                          priority: nextPriority,
                                        });
                                        pushModerationActivity(
                                          t("call.raisePriorityUpdated", {
                                            defaultValue:
                                              "Raise-hand priority increased to {{priority}}",
                                            priority: nextPriority,
                                          })
                                        );
                                      } catch (error) {
                                        dispatch(
                                          addAlert({
                                            type: "error",
                                            message:
                                              error?.message ||
                                              t("call.raisePriorityError", {
                                                defaultValue:
                                                  "Unable to update hand priority.",
                                              }),
                                          })
                                        );
                                      } finally {
                                        setPendingHandPriorityOpsByUserId((prev) => {
                                          const next = { ...prev };
                                          delete next[targetUserId];
                                          return next;
                                        });
                                      }
                                    }}
                                    className={`p-2 rounded-lg ${
                                      isDarkColorScheme ? "bg-slate-700" : "bg-slate-200"
                                    }`}
                                    disabled={
                                      !canModerateTargetParticipant ||
                                      isHandPriorityUpdatePending
                                    }
                                    style={
                                      !canModerateTargetParticipant ||
                                      isHandPriorityUpdatePending
                                        ? { opacity: 0.6 }
                                        : undefined
                                    }
                                  >
                                    <FeIcon
                                      name="arrow-up-circle"
                                      size={18}
                                      color={isDarkColorScheme ? "#dee4e6" : "#2D2D37"}
                                    />
                                  </TouchableOpacity>
                                </Tooltip>
                              )}

                              {/* ✅ Enable/Disable Camera Button */}
                              {canUseMuteOthersAction && isVideoCall && (
                                <Tooltip text={entry.isVideoMuted ? t("call.requestEnableCamera") : t("call.disableCamera")}>
                                  <TouchableOpacity
                                    onPress={() => {
                                      if (currentSocket && roomId) {
                                        currentSocket.emit("requestToggleMedia", {
                                          callId,
                                          roomId,
                                          targetUserId: entry.userData?._id,
                                          mediaType: "video",
                                          action: entry.isVideoMuted ? "enable" : "disable",
                                          requestedBy: currentUser?._id,
                                        });
                                        dispatch(
                                          addAlert({
                                            type: "info",
                                            message: entry.isVideoMuted
                                              ? t("call.enableCameraRequestSent", { name: getFullName(entry.userData, false) })
                                              : t("call.disableCameraRequestSent", { name: getFullName(entry.userData, false) }),
                                          })
                                        );
                                      }
                                    }}
                                    className={`p-2 rounded-lg ${
                                      entry.isVideoMuted
                                        ? "bg-red-500/20"
                                        : isDarkColorScheme
                                          ? "bg-slate-700"
                                          : "bg-slate-200"
                                    }`}
                                  >
                                    <FeIcon
                                      name={entry.isVideoMuted ? "video-off" : "video"}
                                      size={18}
                                      color={
                                        entry.isVideoMuted
                                          ? "#ef4444"
                                          : isDarkColorScheme ? "#dee4e6" : "#2D2D37"
                                      }
                                    />
                                  </TouchableOpacity>
                                </Tooltip>
                              )}

                              {/* ✅ Request Screen Share Button */}
                              {isVideoCall && (
                              <Tooltip text={t("call.requestScreenShare")}>
                              <TouchableOpacity
                                onPress={async () => {
                                  try {
                                    await requestScreenShareFromParticipant(
                                      entry.userData?._id,
                                      false
                                    );
                                    dispatch(
                                      addAlert({
                                        type: "info",
                                        message: `Screen share request sent to ${getFullName(entry.userData, false)}`,
                                      })
                                    );
                                  } catch (error) {
                                    logger.error(
                                      "Error requesting screen share:",
                                      error
                                    );
                                    dispatch(
                                      addAlert({
                                        type: "error",
                                        message:
                                          error.message ||
                                          "Failed to request screen share",
                                      })
                                    );
                                  }
                                }}
                                className={`p-2 rounded-lg ${
                                  isDarkColorScheme
                                    ? "bg-slate-700"
                                    : "bg-slate-200"
                                }`}
                              >
                                <MdIcon
                                  name="monitor-share"
                                  size={18}
                                  color={
                                    isDarkColorScheme ? "#dee4e6" : "#2D2D37"
                                  }
                                />
                              </TouchableOpacity>
                              </Tooltip>
                              )}

                              {/* ✅ Remove participant (permission-gated) */}
                              {canUseKickFromCallAction && (
                                <Tooltip
                                  text={t("call.removeParticipant")}
                                >
                                  <TouchableOpacity
                                    onPress={async () => {
                                      try {
                                        if (!targetUserId || !callId) return;
                                        if (isParticipantRemovePending) return;
                                        setPendingRemoveParticipantOpsByUserId((prev) => ({
                                          ...prev,
                                          [targetUserId]: true,
                                        }));
                                        setOptimisticallyRemovedParticipantsByUserId((prev) => ({
                                          ...prev,
                                          [targetUserId]: true,
                                        }));
                                        await removeGroupCallParticipant({
                                          callId,
                                          participantId: targetUserId,
                                        });
                                        dispatch(
                                          addAlert({
                                            type: "success",
                                            message: t("call.participantRemoved"),
                                          })
                                        );
                                        pushModerationActivity(
                                          t("call.participantRemoved", {
                                            defaultValue: "Participant removed from call",
                                          })
                                        );
                                      } catch (error) {
                                        setOptimisticallyRemovedParticipantsByUserId((prev) => {
                                          const next = { ...prev };
                                          delete next[targetUserId];
                                          return next;
                                        });
                                        dispatch(
                                          addAlert({
                                            type: "error",
                                            message: error?.message || t("call.removeParticipantError"),
                                          })
                                        );
                                      } finally {
                                        setPendingRemoveParticipantOpsByUserId((prev) => {
                                          const next = { ...prev };
                                          delete next[targetUserId];
                                          return next;
                                        });
                                      }
                                    }}
                                    className="p-2 rounded-lg bg-red-500/20"
                                    disabled={isParticipantRemovePending}
                                    style={
                                      isParticipantRemovePending ? { opacity: 0.65 } : undefined
                                    }
                                  >
                                    <FeIcon name="user-x" size={18} color="#ef4444" />
                                  </TouchableOpacity>
                                </Tooltip>
                              )}
                            </View>
                          )}
                      </View>
                    </Box>
                  );
                });
              })()}
            </ScrollView>

            {/* ✅ Call Settings Section - تم نقله إلى modal منفصل */}
          </View>
        </Modal>

        {/* ✅ Unified Call Settings Modal (shared component) */}
        <CallSettingsPopup
          showModal={showCallSettingsModal}
          setShowModal={setShowCallSettingsModal}
        />

        {/* ✅ Call Transfer Modal */}
        {showTransferModal && room && (
          <Modal
            visible={showTransferModal}
            onClose={() => {
              setShowTransferModal(false);
              setTransferSearchQuery("");
            }}
            title={t("call.transferCall")}
          >
            <View className="w-full max-w-md">
              {/* Search Bar */}
              <View className="mb-4">
                <TextInput
                  className={`w-full px-4 py-3 rounded-xl ${
                    isDarkColorScheme
                      ? "bg-slate-800 text-white"
                      : "bg-slate-100 text-black"
                  }`}
                  placeholder={t("call.searchUser")}
                  placeholderTextColor={
                    isDarkColorScheme ? "#94a3b8" : "#64748b"
                  }
                  value={transferSearchQuery}
                  onChangeText={setTransferSearchQuery}
                />
      </View>

              {/* Users List */}
              <ScrollView
                className="max-h-[60vh]"
                showsVerticalScrollIndicator={false}
              >
                {room.members
                  .filter((member) => {
                    // Filter out current user
                    if (member._id === currentUser?._id) return false;

                    // Filter out users already in the call
                    const isInCall = peers.some(
                      (p) =>
                        p.userData?._id?.toString() === member._id?.toString()
                    );
                    if (isInCall) return false;

                    // Filter by search query
                    if (transferSearchQuery.trim()) {
                      const query = transferSearchQuery.toLowerCase();
                      const fullName =
                        `${member.firstName || ""} ${member.lastName || ""}`.toLowerCase();
                      const userName = (member.userName || "").toLowerCase();
                      const email = (member.email || "").toLowerCase();
                      const phoneNumber = (
                        member.phoneNumber || ""
                      ).toLowerCase();

                      return (
                        fullName.includes(query) ||
                        userName.includes(query) ||
                        email.includes(query) ||
                        phoneNumber.includes(query)
                      );
                    }

                    return true;
                  })
                  .map((member) => (
                    <TouchableOpacity
                      key={member._id}
                      className={`flex-row items-center p-3 mb-2 rounded-xl ${
                        isDarkColorScheme ? "bg-slate-800" : "bg-slate-100"
                      }`}
                      onPress={async () => {
                        if (isTransferring) return;

                        try {
                          setIsTransferring(true);
                          await transferCall({
                            targetUserId: member._id,
                          });

                          setShowTransferModal(false);
                          setTransferSearchQuery("");

                          dispatch(
                            addAlert({
                              type: "success",
                              message: t("call.transferSuccess", {
                                name:
                                  `${member.firstName || ""} ${member.lastName || ""}`.trim() ||
                                  member.userName ||
                                  "User",
                              }),
                            })
                          );
                        } catch (error) {
                          logger.error("Error transferring call:", error);
                          dispatch(
                            addAlert({
                              type: "error",
                              message:
                                error.message || t("call.transferFailed"),
                            })
                          );
                        } finally {
                          setIsTransferring(false);
                        }
                      }}
                      disabled={isTransferring}
                    >
                      <UserImage
                        user={member}
                        size="w-12 h-12"
                        border="border-0"
                        rounded="rounded-full"
                        showStatus={false}
                      />
                      <View className="flex-1 ml-3">
                        <UserName
                          user={member}
                          className={`text-base font-medium ${
                            isDarkColorScheme ? "text-white" : "text-black"
                          }`}
                          onlyFirst={true}
                        />
                        {member.phoneNumber && (
                          <Text
                            className={`text-sm ${
                              isDarkColorScheme
                                ? "text-slate-400"
                                : "text-slate-600"
                            }`}
                          >
                            {member.phoneNumber}
                          </Text>
                        )}
                      </View>
                      <FeIcon
                        name="arrow-right"
                        size={20}
                        color={isDarkColorScheme ? "#94a3b8" : "#64748b"}
                      />
    </TouchableOpacity>
                  ))}
              </ScrollView>

              {isTransferring && (
                <View className="mt-4 items-center">
                  <Text
                    className="text-sm text-slate-600 dark:text-slate-400"
                  >
                    {t("call.transferring")}...
                  </Text>
                </View>
              )}
            </View>
          </Modal>
        )}

        {/* Call Quality Metrics Modal */}
        {showQualityMetrics && (
          <Modal
            visible={showQualityMetrics}
            onClose={() => setShowQualityMetrics(false)}
            title="Call Quality Metrics"
          >
            <ScrollView className="max-h-[80vh]">
              {qualityMetrics ? (
                <View className="space-y-4">
                  {/* Overall Stats */}
                  <View className="bg-slate-100 dark:bg-slate-800 rounded-lg p-4">
                    <Text className="text-lg font-semibold mb-3 text-slate-900 dark:text-slate-100">
                      Overall Statistics
                    </Text>
                    <View className="space-y-2">
                      <View className="flex-row justify-between">
                        <Text className="text-slate-600 dark:text-slate-400">
                          Timestamp:
                        </Text>
                        <Text className="text-slate-900 dark:text-slate-100">
                          {new Date(
                            qualityMetrics.timestamp
                          ).toLocaleTimeString()}
                        </Text>
                      </View>
                    </View>
                  </View>

                  {/* Producers Stats */}
                  {qualityMetrics.producers &&
                    Object.keys(qualityMetrics.producers).length > 0 && (
                      <View className="bg-slate-100 dark:bg-slate-800 rounded-lg p-4">
                        <Text className="text-lg font-semibold mb-3 text-slate-900 dark:text-slate-100">
                          Outgoing (Producers)
                        </Text>
                        {Object.entries(qualityMetrics.producers).map(
                          ([kind, producer]) => (
                            <View key={kind} className="mb-4 last:mb-0">
                              <Text className="text-base font-medium mb-2 text-slate-800 dark:text-slate-200 capitalize">
                                {kind}
                              </Text>
                              {producer.stats && producer.stats.length > 0 && (
                                <View className="space-y-1 ml-4">
                                  {producer.stats.map((stat, idx) => {
                                    if (stat.type === "outbound-rtp") {
                                      const packetLossRate =
                                        stat.packetsSent > 0
                                          ? (
                                              ((stat.packetsLost || 0) /
                                                stat.packetsSent) *
                                              100
                                            ).toFixed(2)
                                          : "0.00";
                                      return (
                                        <View key={idx} className="space-y-1">
                                          <View className="flex-row justify-between">
                                            <Text className="text-slate-600 dark:text-slate-400">
                                              Bitrate:
                                            </Text>
                                            <Text className="text-slate-900 dark:text-slate-100">
                                              {stat.bitrate
                                                ? `${(stat.bitrate / 1000).toFixed(0)} kbps`
                                                : "N/A"}
                                            </Text>
                                          </View>
                                          <View className="flex-row justify-between">
                                            <Text className="text-slate-600 dark:text-slate-400">
                                              Packet Loss:
                                            </Text>
                                            <Text className="text-slate-900 dark:text-slate-100">
                                              {packetLossRate}%
                                            </Text>
                                          </View>
                                          <View className="flex-row justify-between">
                                            <Text className="text-slate-600 dark:text-slate-400">
                                              Packets Sent:
                                            </Text>
                                            <Text className="text-slate-900 dark:text-slate-100">
                                              {stat.packetsSent || 0}
                                            </Text>
                                          </View>
                                          <View className="flex-row justify-between">
                                            <Text className="text-slate-600 dark:text-slate-400">
                                              RTT:
                                            </Text>
                                            <Text className="text-slate-900 dark:text-slate-100">
                                              {stat.roundTripTime
                                                ? `${stat.roundTripTime.toFixed(0)} ms`
                                                : "N/A"}
                                            </Text>
                                          </View>
                                          {stat.frameWidth &&
                                            stat.frameHeight && (
                                              <View className="flex-row justify-between">
                                                <Text className="text-slate-600 dark:text-slate-400">
                                                  Resolution:
                                                </Text>
                                                <Text className="text-slate-900 dark:text-slate-100">
                                                  {stat.frameWidth}x
                                                  {stat.frameHeight}
                                                </Text>
                                              </View>
                                            )}
                                          {stat.framesPerSecond && (
                                            <View className="flex-row justify-between">
                                              <Text className="text-slate-600 dark:text-slate-400">
                                                Frame Rate:
                                              </Text>
                                              <Text className="text-slate-900 dark:text-slate-100">
                                                {stat.framesPerSecond} fps
                                              </Text>
                                            </View>
                                          )}
                                          {stat.codecId && (
                                            <View className="flex-row justify-between">
                                              <Text className="text-slate-600 dark:text-slate-400">
                                                Codec:
                                              </Text>
                                              <Text className="text-slate-900 dark:text-slate-100">
                                                {stat.codecId}
                                              </Text>
                                            </View>
                                          )}
                                        </View>
                                      );
                                    }
                                    return null;
                                  })}
                                </View>
                              )}
                            </View>
                          )
                        )}
                      </View>
                    )}

                  {/* Consumers Stats */}
                  {qualityMetrics.consumers &&
                    Object.keys(qualityMetrics.consumers).length > 0 && (
                      <View className="bg-slate-100 dark:bg-slate-800 rounded-lg p-4">
                        <Text className="text-lg font-semibold mb-3 text-slate-900 dark:text-slate-100">
                          Incoming (Consumers)
                        </Text>
                        {Object.entries(qualityMetrics.consumers).map(
                          ([consumerId, consumer]) => (
                            <View
                              key={consumerId}
                              className="mb-4 last:mb-0 border-b border-slate-300 dark:border-slate-700 pb-4 last:border-b-0"
                            >
                              <Text className="text-sm font-medium mb-2 text-slate-700 dark:text-slate-300">
                                {consumer.kind} (Peer:{" "}
                                {consumer.peerId?.substring(0, 8)}...)
                              </Text>
                              {consumer.stats && consumer.stats.length > 0 && (
                                <View className="space-y-1 ml-4">
                                  {consumer.stats.map((stat, idx) => {
                                    if (stat.type === "inbound-rtp") {
                                      const packetLossRate =
                                        stat.packetsReceived > 0
                                          ? (
                                              ((stat.packetsLost || 0) /
                                                stat.packetsReceived) *
                                              100
                                            ).toFixed(2)
                                          : "0.00";
                                      return (
                                        <View key={idx} className="space-y-1">
                                          <View className="flex-row justify-between">
                                            <Text className="text-slate-600 dark:text-slate-400">
                                              Bitrate:
                                            </Text>
                                            <Text className="text-slate-900 dark:text-slate-100">
                                              {stat.bitrate
                                                ? `${(stat.bitrate / 1000).toFixed(0)} kbps`
                                                : "N/A"}
                                            </Text>
                                          </View>
                                          <View className="flex-row justify-between">
                                            <Text className="text-slate-600 dark:text-slate-400">
                                              Packet Loss:
                                            </Text>
                                            <Text className="text-slate-900 dark:text-slate-100">
                                              {packetLossRate}%
                                            </Text>
                                          </View>
                                          <View className="flex-row justify-between">
                                            <Text className="text-slate-600 dark:text-slate-400">
                                              Packets Received:
                                            </Text>
                                            <Text className="text-slate-900 dark:text-slate-100">
                                              {stat.packetsReceived || 0}
                                            </Text>
                                          </View>
                                          {stat.frameWidth &&
                                            stat.frameHeight && (
                                              <View className="flex-row justify-between">
                                                <Text className="text-slate-600 dark:text-slate-400">
                                                  Resolution:
                                                </Text>
                                                <Text className="text-slate-900 dark:text-slate-100">
                                                  {stat.frameWidth}x
                                                  {stat.frameHeight}
                                                </Text>
                                              </View>
                                            )}
                                          {stat.framesPerSecond && (
                                            <View className="flex-row justify-between">
                                              <Text className="text-slate-600 dark:text-slate-400">
                                                Frame Rate:
                                              </Text>
                                              <Text className="text-slate-900 dark:text-slate-100">
                                                {stat.framesPerSecond} fps
                                              </Text>
                                            </View>
                                          )}
                                          {stat.codecId && (
                                            <View className="flex-row justify-between">
                                              <Text className="text-slate-600 dark:text-slate-400">
                                                Codec:
                                              </Text>
                                              <Text className="text-slate-900 dark:text-slate-100">
                                                {stat.codecId}
                                              </Text>
                                            </View>
                                          )}
                                        </View>
                                      );
                                    }
                                    return null;
                                  })}
                                </View>
                              )}
                            </View>
                          )
                        )}
                      </View>
                    )}

                  {(!qualityMetrics.producers ||
                    Object.keys(qualityMetrics.producers).length === 0) &&
                    (!qualityMetrics.consumers ||
                      Object.keys(qualityMetrics.consumers).length === 0) && (
                      <View className="bg-slate-100 dark:bg-slate-800 rounded-lg p-4">
                        <Text className="text-slate-600 dark:text-slate-400 text-center">
                          No statistics available yet
                        </Text>
                      </View>
                    )}
                </View>
              ) : (
                <View className="bg-slate-100 dark:bg-slate-800 rounded-lg p-4">
                  <Text className="text-slate-600 dark:text-slate-400 text-center">
                    Loading statistics...
                  </Text>
                </View>
              )}
            </ScrollView>
          </Modal>
        )}

        {/* ✅ Live Stream Request Modal */}
        {showLiveStreamRequestModal && liveStreamRequest && (
          <Popup
            showModal={showLiveStreamRequestModal}
            setShowModal={setShowLiveStreamRequestModal}
            onClick={() => {
              logger.callEvent("Accept live stream request clicked", {
                roomId: room?._id,
              });
              handleAcceptLiveStreamRequest();
            }}
            onCancel={() => {
              logger.callEvent("Decline live stream request clicked", {
                roomId: room?._id,
              });
              handleDeclineLiveStreamRequest();
            }}
            withActions={true}
            swithColor={true}
          >
            <View className="items-center">
              <FeIcon
                name="radio"
                size={48}
                color={isDarkColorScheme ? "#ef4444" : "#dc2626"}
              />
              <Text
                className={`text-xl font-bold mt-4 ${
                  isDarkColorScheme ? "text-white" : "text-black"
                }`}
              >
                Live Stream Request
              </Text>
              <Text
                  className={`text-base text-center mt-2 px-4 ${
                  isDarkColorScheme ? "text-slate-300" : "text-slate-600"
                }`}
              >
                {liveStreamRequest?.requesterData
                  ? getFullName(liveStreamRequest.requesterData, false)
                  : "Someone"}{" "}
                wants to convert this call to a live stream.
              </Text>
              <Text
                className={`text-sm text-center mt-4 px-4 ${
                  isDarkColorScheme ? "text-slate-400" : "text-slate-500"
                }`}
              >
                This will allow others to watch your call as a live stream.
              </Text>
            </View>
          </Popup>
        )}
      </View>
    </TouchableOpacity>
  );
};

export default MediasoupCall;
