/**
 * useMediasoup Hook
 * Hook لإدارة المكالمات الصوتية والمرئية باستخدام MediaSoup
 * يدعم المكالمات الفردية والجماعية
 */

import { useState, useRef, useCallback, useEffect, useContext } from "react";
import { Device } from "mediasoup-client";
import { Platform } from "react-native";
import Constants from "expo-constants";
import { SocketContext } from "../contexts/socket.context";
import logger from "../utils/logger";
import {
  CallStateMachine,
  CALL_STATES,
  CALL_EVENTS,
} from "../utils/callStateMachine";
import streamManager from "../utils/streamManager";
import deviceManager from "../utils/deviceManager";
import { normalizeError, createError, ERROR_CODES } from "../utils/errorCodes";
import {
  getUserFriendlyError,
  getSimpleErrorMessage,
} from "../utils/userFriendlyErrors";
import { useSelector, useDispatch } from "react-redux"; // ✅ Added for Redux integration
import { updateRoom, updateRoomCallState } from "../redux/chatSlice"; // ✅ Added for Call-Chat integration
import { addAlert } from "../redux/alertSlice"; // ✅ Added for Recording notifications
import getFullName from "../utils/getFullName"; // ✅ For formatting user names
import { useTranslation } from "react-i18next"; // ✅ For translations
import CallChatIntegration from "../utils/callChatIntegration"; // ✅ Call-Chat Integration
import StreamChatIntegration from "../utils/streamChatIntegration"; // ✅ Stream-Chat Integration
import { createRecordingSocketHandlers } from "./mediasoup/recordingSocketHandlers";
import { createLiveStreamSocketHandlers } from "./mediasoup/liveStreamSocketHandlers";
import RoomStateSync from "../utils/roomStateSync"; // ✅ Room State Sync
import screenShareOptimizer from "../utils/screenShareOptimizer"; // ✅ Screen Share Optimizer
import {
  TIMEOUTS,
  RETRY_CONFIG,
  BANDWIDTH_MONITORING,
  VIDEO_QUALITY,
  ACTIVE_SPEAKER,
} from "../constants/mediasoup.constants";
import {
  mediaDevices,
  RTCPeerConnection,
  RTCSessionDescription,
  RTCIceCandidate,
  MediaStream,
  registerGlobals,
} from "../components/chat/web-rtc";
import { getDeviceHandler } from "./mediasoup/deviceHandler";
import {
  createGuardManagerFacade,
  createGuardManagerState,
} from "./mediasoup/guardManager";
import {
  normalizeSnapshotMeta,
  shouldApplySnapshot,
} from "../utils/call-snapshot-helpers";
const { shouldUseWaitingFlow } = require("../utils/call-waiting-helpers");
const {
  pruneCancelledRooms: pruneCancelledRoomMap,
  markCancelledRoom: addCancelledRoomToMap,
  wasRoomCancelledRecently: getCancelledRoomRaceState,
} = require("../utils/cancelled-room-race");
const CANCELLED_ROOM_RACE_WINDOW_MS = 1500;
const CANCELLED_ROOM_ENTRY_MAX_AGE_MS = 15000;

function getExpoPublicConfigValue(key) {
  try {
    const v =
      process?.env?.[key] ??
      Constants?.expoConfig?.extra?.[key] ??
      Constants?.manifest?.extra?.[key];
    return v == null ? undefined : String(v);
  } catch {
    return undefined;
  }
}

function splitUrls(value) {
  if (!value) return [];
  return String(value)
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

function parseIceServersFromExpoPublicEnv() {
  const json = getExpoPublicConfigValue("EXPO_PUBLIC_ICE_SERVERS_JSON");
  if (json) {
    try {
      const parsed = JSON.parse(json);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      // ignore invalid JSON
    }
  }

  const stunUrls = splitUrls(getExpoPublicConfigValue("EXPO_PUBLIC_STUN_URLS"));
  const turnUrls = splitUrls(getExpoPublicConfigValue("EXPO_PUBLIC_TURN_URLS"));
  const turnUsername = getExpoPublicConfigValue("EXPO_PUBLIC_TURN_USERNAME");
  const turnCredential = getExpoPublicConfigValue("EXPO_PUBLIC_TURN_CREDENTIAL");

  const servers = [];
  if (stunUrls.length > 0) {
    servers.push({ urls: stunUrls });
  }
  if (turnUrls.length > 0) {
    servers.push({
      urls: turnUrls,
      ...(turnUsername ? { username: turnUsername } : {}),
      ...(turnCredential ? { credential: turnCredential } : {}),
    });
  }

  return servers;
}

const ICE_SERVERS = parseIceServersFromExpoPublicEnv();

/**
 * Hook رئيسي لإدارة MediaSoup
 */
export const useMediasoup = () => {
  const { socket: socketFromContext } = useContext(SocketContext);
  const socket =
    socketFromContext || {
      emit: () => {},
      on: () => {},
      off: () => {},
      emitWithAck: async () => ({ type: "error", message: "Socket unavailable" }),
    };
  const { user: currentUser } = useSelector((state) => state.users);
  const rooms = useSelector((state) => state.chats.rooms);
  const dispatch = useDispatch(); // ✅ Added for Call-Chat integration
  const { t } = useTranslation(); // ✅ For translations
  const tSafe = useCallback(
    (key, fallback) => {
      const translated = t(key);
      return translated && translated !== key ? translated : fallback;
    },
    [t]
  );

  // ✅ Integration Services
  const callChatIntegrationRef = useRef(
    new CallChatIntegration(dispatch, (updates) =>
      dispatch(updateRoom(updates))
    )
  );
  const streamChatIntegrationRef = useRef(
    new StreamChatIntegration(dispatch, (updates) =>
      dispatch(updateRoom(updates))
    )
  );
  const roomStateSyncRef = useRef(
    new RoomStateSync(
      dispatch,
      (updates) => dispatch(updateRoom(updates)),
      socket
    )
  );

  // ===== DEVICE MANAGEMENT STATE =====
  // Device lists
  const [devices, setDevices] = useState([]);
  const [audioDevices, setAudioDevices] = useState([]);
  const [videoDevices, setVideoDevices] = useState([]);
  
  // Selected devices
  const [selectedAudioDevice, setSelectedAudioDevice] = useState(null);
  const [selectedVideoDevice, setSelectedVideoDevice] = useState(null);
  
  // Device states
  const [isDetecting, setIsDetecting] = useState(false);
  const [detectionError, setDetectionError] = useState(null);
  const [hasAudio, setHasAudio] = useState(false);
  const [hasVideo, setHasVideo] = useState(false);
  
  // Device permissions
  const [audioPermission, setAudioPermission] = useState(null);
  const [videoPermission, setVideoPermission] = useState(null);
  
  // ===== CALL STATE MACHINE =====
  const callStateMachineRef = useRef(new CallStateMachine());
  const [callState, setCallState] = useState(CALL_STATES.IDLE);

  // ===== RECONNECTION STATE =====
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [reconnectAttempts, setReconnectAttempts] = useState(0);
  const reconnectAttemptRef = useRef(0);
  const reconnectTimeoutRef = useRef(null);
  const joinRequestIdRef = useRef(null);
  const roomInfoBeforeDisconnectRef = useRef(null); // حفظ معلومات الغرفة قبل الانقطاع
  const isVideoCallRef = useRef(false); // حفظ نوع المكالمة (فيديو أم صوت فقط)
  const currentRoleRef = useRef("member"); // ✅ حفظ role الحالي (member/broadcaster/viewer)
  const [currentRole, setCurrentRole] = useState("member"); // ✅ State للـ role للاستخدام في UI
  const [activeCallId, setActiveCallId] = useState(null); // ✅ Track active call ID for message routing
  const activeCallIdRef = useRef(null);
  
  // Refs
  const detectionTimeoutRef = useRef(null);
  const cancelledCallsRef = useRef(new Map()); // Map<roomId, cancelledAt>
  // Single-Flight Guard Manager - موحد لإدارة جميع الحماية
  const guardManagerRef = useRef(null);
  if (!guardManagerRef.current) {
    guardManagerRef.current = createGuardManagerState(guardManagerRef);
  }
  // Legacy refs for backward compatibility (سيتم إزالتها لاحقاً)
  const isLeavingDueToRejectionRef = useRef(false);
  const isLeavingRef = useRef(false);
  const hasLeftRoomRef = useRef(false);
  const isJoiningRef = useRef(false);
  const isTogglingVideoRef = useRef(false);
  // Helper functions for Guard Manager
  const guardManager = createGuardManagerFacade({
    guardManagerRef,
    isJoiningRef,
    isLeavingRef,
    hasLeftRoomRef,
    isLeavingDueToRejectionRef,
  });

  const pruneCancelledRooms = useCallback((now = Date.now()) => {
    pruneCancelledRoomMap(cancelledCallsRef.current, {
      now,
      maxAgeMs: CANCELLED_ROOM_ENTRY_MAX_AGE_MS,
    });
  }, []);

  const markCancelledRoom = useCallback(
    (targetRoomId) => {
      if (!targetRoomId) return;
      const now = Date.now();
      addCancelledRoomToMap(cancelledCallsRef.current, targetRoomId, {
        now,
        maxAgeMs: CANCELLED_ROOM_ENTRY_MAX_AGE_MS,
      });
    },
    []
  );

  const wasRoomCancelledRecently = useCallback(
    (targetRoomId) => {
      const now = Date.now();
      const raceState = getCancelledRoomRaceState(
        cancelledCallsRef.current,
        targetRoomId,
        {
          now,
          raceWindowMs: CANCELLED_ROOM_RACE_WINDOW_MS,
          maxAgeMs: CANCELLED_ROOM_ENTRY_MAX_AGE_MS,
        }
      );
      return raceState.isRecent;
    },
    []
  );

  // Device & Transports
  const deviceRef = useRef(null);
  const producerTransportRef = useRef(null);
  const consumerTransportsRef = useRef(new Map()); // Map<peerId, transport>

  // Media Streams
  const [localStream, setLocalStream] = useState(null);
  const [remoteStreams, setRemoteStreams] = useState({}); // { peerId: stream }
  const [screenStream, setScreenStream] = useState(null);
  const screenProducerRef = useRef(null);
  const [isScreenSharing, setIsScreenSharing] = useState(false);

  // Producers & Consumers
  const producersRef = useRef(new Map()); // Map<kind, producer>
  const consumersRef = useRef(new Map()); // Map<consumerId, consumer>
  const consumedProducerIdsRef = useRef(new Set()); // Set<producerId>

  // Bandwidth Management
  const [currentVideoQuality, setCurrentVideoQuality] = useState("high"); // 'high', 'medium', 'low'
  const bandwidthMonitorIntervalRef = useRef(null);

  // Simulcast Support
  const [enableSimulcast, setEnableSimulcast] = useState(true); // تفعيل Simulcast افتراضياً
  const simulcastEnabledRef = useRef(false); // لتتبع حالة Simulcast

  // ✅ Dynamic Layer Selection - Network Quality History
  const networkQualityHistoryRef = useRef([]); // Array of { bitrate, packetLoss, rtt, timestamp }
  const currentLayerRef = useRef({
    spatial: VIDEO_QUALITY.LAYER_HIGH,
    temporal: 2,
  }); // Current layer state
  const layerChangeTimestampRef = useRef(Date.now()); // Last layer change time
  const qualityScoreHistoryRef = useRef([]); // History of quality scores for trend analysis

  // Transcoding Support
  const [transcodingEnabled, setTranscodingEnabled] = useState(true); // تفعيل Transcoding افتراضياً
  const codecPreferenceRef = useRef(["VP8", "VP9", "H264"]); // ترتيب تفضيل الكوديك

  // Room State
  const [roomId, setRoomId] = useState(null);
  const [peers, setPeers] = useState([]); // قائمة المستخدمين في الغرفة
  const [isJoined, setIsJoined] = useState(false);
  // ✅ Raise Hand State (Group Calls)
  const [raisedHands, setRaisedHands] = useState(new Set()); // Set of userIds who raised their hand
  const [speakingLocksByUserId, setSpeakingLocksByUserId] = useState({});
  const [handRaisePriorityByUserId, setHandRaisePriorityByUserId] = useState({});
  // Group-call helpers
  const recipientsCountRef = useRef(0);
  const rejectedBySetRef = useRef(new Set());
  const [rejectedParticipantsByRoom, setRejectedParticipantsByRoom] = useState(
    {}
  ); // { [roomId]: string[] }
  const peersJoinedCountRef = useRef(0); // عدد الpeers الذين انضموا فعلياً (من newPeer)

  const markRejectedParticipant = useCallback((targetRoomId, rejectedById) => {
    if (!targetRoomId || !rejectedById) return;
    const roomKey = String(targetRoomId);
    const participantKey = String(rejectedById);
    setRejectedParticipantsByRoom((prev) => {
      const existing = Array.isArray(prev?.[roomKey]) ? prev[roomKey] : [];
      if (existing.includes(participantKey)) return prev;
      return {
        ...prev,
        [roomKey]: [...existing, participantKey],
      };
    });
  }, []);

  const clearRejectedParticipantsForRoom = useCallback((targetRoomId) => {
    if (!targetRoomId) return;
    const roomKey = String(targetRoomId);
    setRejectedParticipantsByRoom((prev) => {
      if (!prev?.[roomKey]) return prev;
      const next = { ...prev };
      delete next[roomKey];
      return next;
    });
  }, []);

  const clearAllRejectedParticipants = useCallback(() => {
    setRejectedParticipantsByRoom({});
  }, []);

  // Incoming Call
  const [incomingCall, setIncomingCall] = useState(null); // { roomId, callerId, callerName, isVideoCall }
  const [isIncomingCallMinimized, setIsIncomingCallMinimized] = useState(false);

  // ✅ Missed Call Timeout
  const missedCallTimeoutRef = useRef(null); // Timeout reference للمكالمات الفائتة

  // Call Status (for outgoing calls: connecting -> queued -> ringing -> busy)
  const [callStatus, setCallStatus] = useState(null); // 'connecting' | 'queued' | 'ringing' | 'busy' | null

  // Current Call Type (video or audio)
  const [isVideoCall, setIsVideoCall] = useState(true); // ✅ نوع المكالمة الحالية (فيديو أم صوت)
  const roomSnapshotVersionRef = useRef(new Map()); // Map<roomId, { callId, updatedAt }>

  const clearCallParticipantsSnapshot = useCallback(
    (targetRoomId, options = {}) => {
      if (!targetRoomId) return;
      const clearUpdatedAt =
        Number(options?.updatedAt) > 0 ? Number(options.updatedAt) : Date.now();
      const nextCallId =
        options?.callId != null && options.callId !== ""
          ? String(options.callId)
          : null;
      try {
        roomSnapshotVersionRef.current.set(String(targetRoomId), {
          callId: nextCallId,
          updatedAt: clearUpdatedAt,
        });
        dispatch(
          updateRoom({
            _id: targetRoomId,
            hasActiveCall: false,
            activeCallId: null,
            activeCallType: null,
            activeCallStartedAt: null,
            activeCallParticipants: [],
            activeCallParticipantsSyncedAt: clearUpdatedAt,
            skipAddIfNotExists: true,
          })
        );
      } catch (error) {
        logger.warn("Failed to clear activeCallParticipants snapshot", {
          roomId: targetRoomId,
          error: error?.message || String(error),
        });
      }
    },
    [dispatch]
  );

  const clearAllActiveCallIndicators = useCallback(() => {
    const list = Array.isArray(rooms) ? rooms : [];
    list.forEach((entry) => {
      if (entry?.hasActiveCall !== true) return;
      dispatch(
        updateRoom({
          _id: entry?._id,
          hasActiveCall: false,
          activeCallId: null,
          activeCallType: null,
          activeCallStartedAt: null,
          activeCallParticipants: [],
          activeCallParticipantsSyncedAt: Date.now(),
          skipAddIfNotExists: true,
        })
      );
    });
  }, [rooms, dispatch]);

  const applyCallParticipantsSnapshot = useCallback(
    (snapshotPayload) => {
      const normalized = normalizeSnapshotMeta(snapshotPayload);
      if (!normalized.roomId) return false;

      const previousMeta = roomSnapshotVersionRef.current.get(normalized.roomId);
      if (!shouldApplySnapshot(previousMeta, normalized)) {
        logger.callEvent("Ignored stale call snapshot", {
          roomId: normalized.roomId,
          callId: normalized.callId,
          updatedAt: normalized.updatedAt,
          previousMeta,
        });
        return false;
      }

      roomSnapshotVersionRef.current.set(normalized.roomId, {
        callId: normalized.callId,
        updatedAt: normalized.updatedAt,
      });

      const roomUpdates = {
        _id: normalized.roomId,
        hasActiveCall: true,
        activeCallId: normalized.callId || null,
        activeCallType: normalized.isVideoCall ? "video" : "audio",
        activeCallParticipants: normalized.activeCallParticipants,
        activeCallParticipantsSyncedAt: normalized.updatedAt,
        skipAddIfNotExists: true,
      };
      if (normalized.hasStartedAt) {
        roomUpdates.activeCallStartedAt = normalized.startedAt || null;
      }

      dispatch(updateRoom(roomUpdates));

      return true;
    },
    [dispatch]
  );

  // ✅ Call Waiting State
  const [waitingCall, setWaitingCall] = useState(null); // { roomId, callerId, callerData, isVideoCall } - مكالمة واردة أثناء مكالمة نشطة
  const [isWaitingCallMinimized, setIsWaitingCallMinimized] = useState(false);
  const [isCallOnHold, setIsCallOnHold] = useState(false); // حالة المكالمة الحالية (On Hold أم لا)
  const [heldCallInfo, setHeldCallInfo] = useState(null); // معلومات المكالمة المحفوظة { roomId, isVideoCall }

  // ✅ Call Recording State
  const [isRecording, setIsRecording] = useState(false); // حالة التسجيل (جاري التسجيل أم لا)
  const [recordingId, setRecordingId] = useState(null); // ID التسجيل
  const [callId, setCallId] = useState(null); // ✅ Call ID للمكالمة الحالية
  const [isRemoteRinging, setIsRemoteRinging] = useState(false); // ✅ حالة رنين الطرف الآخر
  const [initialCallSettings, setInitialCallSettings] = useState(null); // ✅ Call settings received when joining
  const initialCallSettingsRef = useRef(null); // ✅ Ref for immediate access
  const [initialCallAdmins, setInitialCallAdmins] = useState([]); // ✅ Call admins received when joining
  const initialCallAdminsRef = useRef([]); // ✅ Ref for immediate access

  // Media Controls
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [isCaller, setIsCaller] = useState(false);

  // Error state
  const [mediaError, setMediaError] = useState(null);
  const [deviceError, setDeviceError] = useState(null);

  // ===== STATE MACHINE SETUP =====
  useEffect(() => {
    const stateMachine = callStateMachineRef.current;
    
    // Add state change listener
    const listenerId = stateMachine.onStateChange((event, transition) => {
      logger.callEvent(
        `State transition: ${transition.from} → ${transition.to}`,
        { event, data: transition.data }
      );
      setCallState(transition.to);
    });

    return () => {
      stateMachine.offStateChange(listenerId);
    };
  }, []);

  // ===== DEVICE MANAGEMENT FUNCTIONS =====
  
  /**
   * طلب إذن الوصول للأجهزة
   */
  const requestDevicePermissions = useCallback(async () => {
    if (Platform.OS !== "web") {
      return { audio: false, video: false };
    }

    try {
      const result = await deviceManager.requestDevicePermissions();
      setAudioPermission(result.audio);
      setVideoPermission(result.video);
      return result;
    } catch (error) {
      logger.error("Permission request failed:", error);
      setAudioPermission(false);
      setVideoPermission(false);
      return { audio: false, video: false };
    }
  }, []);
      
  /**
   * طلب الأذونات مع إعادة المحاولة
   */
  const requestDevicePermissionsWithRetry = useCallback(
    async (maxRetries = 3) => {
      if (Platform.OS !== "web") {
      return { audio: false, video: false };
    }

    try {
        const result = await deviceManager.requestDevicePermissionsWithRetry({
          maxRetries,
        });
      setAudioPermission(result.audio);
      setVideoPermission(result.video);
      return result;
    } catch (error) {
        logger.error("Permission request with retry failed:", error);
      setAudioPermission(false);
      setVideoPermission(false);
      return { audio: false, video: false };
        }
    },
    []
  );

  /**
   * كشف الأجهزة المتاحة (Lazy Loading)
   * يتم الكشف فقط عند الحاجة (عند استدعاء الدالة) وليس تلقائياً
   */
  const detectDevices = useCallback(
    async (forceRefresh = false) => {
      if (Platform.OS !== "web") {
        return {
          hasAudio: false,
          hasVideo: false,
          audioDevices: [],
          videoDevices: [],
        };
      }

      // Lazy Loading: إذا تم الكشف مسبقاً ولا نريد refresh، نعيد النتائج المحفوظة
      if (
        !forceRefresh &&
        devices.length > 0 &&
        audioDevices.length > 0 &&
        videoDevices.length > 0
      ) {
        logger.debug("Devices already detected, returning cached results", {
          devicesCount: devices.length,
          audioDevicesCount: audioDevices.length,
          videoDevicesCount: videoDevices.length,
        });
        return {
          hasAudio,
          hasVideo,
          audioDevices,
          videoDevices,
          allDevices: devices,
        };
    }

    try {
      setIsDetecting(true);
      setDetectionError(null);

        logger.debug("Detecting devices...", { forceRefresh });
      
      // استخدام Device Manager
      const deviceInfo = await deviceManager.detectDevices();
      
      // تحديث state
      setDevices(deviceInfo.allDevices || []);
      setAudioDevices(deviceInfo.audioDevices || []);
      setVideoDevices(deviceInfo.videoDevices || []);
      setHasAudio(deviceInfo.hasAudio);
      setHasVideo(deviceInfo.hasVideo);
      
      // اختيار الأجهزة الافتراضية
      const selectedDevices = deviceManager.getSelectedDevices(deviceInfo);
      if (selectedDevices.selectedAudioDevice && !selectedAudioDevice) {
        setSelectedAudioDevice(selectedDevices.selectedAudioDevice);
      }
      if (selectedDevices.selectedVideoDevice && !selectedVideoDevice) {
        setSelectedVideoDevice(selectedDevices.selectedVideoDevice);
      }

        logger.debug("Device detection complete", {
          audioDevices: deviceInfo.audioDevices?.length || 0,
          videoDevices: deviceInfo.videoDevices?.length || 0,
          hasAudio: deviceInfo.hasAudio,
          hasVideo: deviceInfo.hasVideo,
        });
      
      return deviceInfo;
    } catch (error) {
        logger.error("Device detection failed:", error);
      setDetectionError(error);
      throw error;
    } finally {
      setIsDetecting(false);
    }
    },
    [
      selectedAudioDevice,
      selectedVideoDevice,
      devices,
      audioDevices,
      videoDevices,
      hasAudio,
      hasVideo,
    ]
  );

  /**
   * Pre-call readiness check with quick auto-fix.
   * Returns diagnostics + recommended join mode.
   */
  const runPreCallReadiness = useCallback(
    async ({ expectVideo = false, forceRefresh = true } = {}) => {
      try {
        await requestDevicePermissionsWithRetry(2);
      } catch (_) {
        // We still continue with detection to produce detailed diagnostics.
      }
      let deviceStatus = null;
      try {
        deviceStatus = await detectDevices(forceRefresh);
      } catch (error) {
        return {
          ok: false,
          hasAudio: false,
          hasVideo: false,
          joinWithVideo: false,
          issues: ["deviceDetectionFailed"],
          message:
            error?.message ||
            "Could not check devices. Please verify your microphone and camera.",
        };
      }
      const hasMic = Boolean(deviceStatus?.hasAudio);
      const hasCam = Boolean(deviceStatus?.hasVideo);
      const issues = [];
      if (!hasMic) issues.push("noMicrophone");
      if (expectVideo && !hasCam) issues.push("noCamera");
      return {
        ok: hasMic,
        hasAudio: hasMic,
        hasVideo: hasCam,
        joinWithVideo: Boolean(expectVideo && hasCam),
        issues,
        message: !hasMic
          ? "No microphone detected. Call cannot start."
          : expectVideo && !hasCam
          ? "No camera detected. We will continue as audio."
          : "Devices are ready.",
      };
    },
    [detectDevices, requestDevicePermissionsWithRetry]
  );

  /**
   * إنشاء Media Stream
   */
  const createStream = useCallback(
    async (options = {}) => {
      if (Platform.OS !== "web") {
        throw createError(
          ERROR_CODES.DEVICE_NOT_SUPPORTED,
          "Stream creation not supported on mobile"
        );
      }

      const {
        audio = true,
        video = true,
        audioDeviceId = null,
        videoDeviceId = null,
      } = options;

    try {
      const constraints = {};

      if (audio) {
        // إعدادات الصوت المحسّنة لجودة أفضل
        const audioConstraints = {
            echoCancellation: true, // إلغاء الصدى
            noiseSuppression: true, // كتم الضوضاء
            autoGainControl: true, // التحكم التلقائي في الصوت
        };
        
        // إضافة deviceId إذا كان محدداً
        if (audioDeviceId) {
          audioConstraints.deviceId = { exact: audioDeviceId };
        } else if (selectedAudioDevice) {
          audioConstraints.deviceId = { exact: selectedAudioDevice.deviceId };
        }
        
        constraints.audio = audioConstraints;
      }

      if (video) {
        if (videoDeviceId) {
          constraints.video = { deviceId: { exact: videoDeviceId } };
        } else if (selectedVideoDevice) {
            constraints.video = {
              deviceId: { exact: selectedVideoDevice.deviceId },
            };
        } else {
          constraints.video = true;
        }
      }

        logger.streamEvent("Creating stream with constraints", constraints);
        logger.streamEvent("Available devices", {
        audioDevices: audioDevices.length, 
        videoDevices: videoDevices.length,
        selectedAudioDevice: selectedAudioDevice?.deviceId,
        selectedVideoDevice: selectedVideoDevice?.deviceId,
        audioDeviceId,
          videoDeviceId,
      });
      
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
        logger.streamEvent("Stream created successfully");
      return stream;
    } catch (error) {
        logger.error("Stream creation failed:", error);
      
      // تحسين رسائل الخطأ
        if (error.name === "NotFoundError") {
        if (audio && !video) {
            throw createError(
              ERROR_CODES.DEVICE_NOT_FOUND,
              "No audio input device found. Please connect a microphone."
            );
        } else if (video && !audio) {
            throw createError(
              ERROR_CODES.DEVICE_NOT_FOUND,
              "No video input device found. Please connect a camera."
            );
        } else {
            throw createError(
              ERROR_CODES.DEVICE_NOT_FOUND,
              "No audio or video devices found. Please connect a microphone or camera."
            );
          }
        } else if (error.name === "NotAllowedError") {
          throw createError(
            ERROR_CODES.DEVICE_PERMISSION_DENIED,
            "Permission denied. Please allow access to your microphone and camera."
          );
      } else if (error.name === "NotReadableError") {
          throw createError(
            ERROR_CODES.DEVICE_IN_USE,
            "Device is already in use by another application."
          );
      } else {
          throw createError(
            ERROR_CODES.STREAM_CREATION_FAILED,
            `Failed to access media devices: ${error.message}`
          );
        }
      }
    },
    [
      selectedAudioDevice,
      selectedVideoDevice,
      audioDevices.length,
      videoDevices.length,
    ]
  );

  /**
   * إنشاء Stream مرن (يحاول تكوينات مختلفة)
   */
  /**
   * 4.2 إنشاء stream مرن مع Stream Manager
   */
  const createFlexibleStream = useCallback(
    async (options = {}) => {
      if (Platform.OS !== "web") {
        throw createError(
          ERROR_CODES.DEVICE_NOT_SUPPORTED,
          "Stream creation not supported on mobile"
        );
    }

    const { 
      audio = true, 
      video = true, 
      audioDeviceId = selectedAudioDevice?.deviceId || null, 
      videoDeviceId = selectedVideoDevice?.deviceId || null,
      hasAudio: passedHasAudio = hasAudio,
      hasVideo: passedHasVideo = hasVideo,
      audioDevices: passedAudioDevices = audioDevices,
        videoDevices: passedVideoDevices = videoDevices,
    } = options;

    try {
      // استخدام Stream Manager لإنشاء الـ stream
        logger.streamEvent("Creating flexible stream with Stream Manager", {
          audio,
          video,
          hasAudio: passedHasAudio,
          hasVideo: passedHasVideo,
      });
      
      return await streamManager.createMediaStream({
        hasAudio: passedHasAudio && audio,
        hasVideo: passedHasVideo && video,
        audioDeviceId,
        videoDeviceId,
        audioDevices: passedAudioDevices,
          videoDevices: passedVideoDevices,
      });
    } catch (error) {
        logger.error("Flexible stream creation failed:", error);
      throw error;
    }
    },
    [
      hasAudio,
      hasVideo,
      selectedAudioDevice,
      selectedVideoDevice,
      audioDevices,
      videoDevices,
    ]
  );

  /**
   * 1. الحصول على Media Stream (كاميرا/ميكروفون)
   */
  const getLocalStream = useCallback(
    async (isVideoCall = true) => {
    try {
        logger.streamEvent("Getting local media stream...");

      // ✅ Cleanup stale local stream before requesting new media on join attempts
      if (localStream && !isJoined) {
        try {
          streamManager.stopMediaStream(localStream);
        } catch (cleanupError) {
          logger.warn("Failed to stop stale local stream before getUserMedia", {
            error: cleanupError?.message || String(cleanupError),
          });
        }
        setLocalStream(null);
      }
      
      // إذا لم تكن هناك أجهزة مكتشفة أو الأذونات غير ممنوحة، اكتشفها أولاً
      let currentHasAudio = hasAudio;
      let currentHasVideo = hasVideo;
      
      if (audioDevices.length === 0 && videoDevices.length === 0) {
          logger.streamEvent("No devices detected, detecting devices...");
        const deviceStatus = await detectDevices();
        
        if (deviceStatus) {
          currentHasAudio = deviceStatus.hasAudio;
          currentHasVideo = deviceStatus.hasVideo;
          
          // تحديث state
          setHasAudio(deviceStatus.hasAudio);
          setHasVideo(deviceStatus.hasVideo);
          
          // تحديث الأجهزة المختارة
            if (
              deviceStatus.audioDevices &&
              deviceStatus.audioDevices.length > 0 &&
              !selectedAudioDevice
            ) {
            setSelectedAudioDevice(deviceStatus.audioDevices[0]);
          }
            if (
              deviceStatus.videoDevices &&
              deviceStatus.videoDevices.length > 0 &&
              !selectedVideoDevice
            ) {
            setSelectedVideoDevice(deviceStatus.videoDevices[0]);
          }
        }
      }
      
      // إذا لم تكن هناك أذونات، اطلبها بقوة
      if (!currentHasAudio && !currentHasVideo) {
          logger.streamEvent(
            "No permissions detected, requesting permissions..."
          );
        await requestDevicePermissionsWithRetry();
        const deviceStatus = await detectDevices();
        
        if (deviceStatus) {
          currentHasAudio = deviceStatus.hasAudio;
          currentHasVideo = deviceStatus.hasVideo;
          
          // تحديث state
          setHasAudio(deviceStatus.hasAudio);
          setHasVideo(deviceStatus.hasVideo);
        }
      }
      
      // التحقق من توفر الأجهزة بعد طلب الأذونات
      if (!currentHasAudio && !currentHasVideo) {
        const error = createError(ERROR_CODES.DEVICE_NOT_FOUND);
        throw error;
      }
      
      // استخدام Stream Manager لإنشاء الـ stream
      const stream = await streamManager.createMediaStream({
        hasAudio: currentHasAudio,
        hasVideo: isVideoCall && currentHasVideo,
        audioDeviceId: selectedAudioDevice?.deviceId || null,
        videoDeviceId: selectedVideoDevice?.deviceId || null,
        audioDevices,
          videoDevices,
      });
      
      // تحديث local stream
      setLocalStream(stream);
      
      return stream;
    } catch (error) {
        logger.error("Error getting local stream:", error);
      const normalizedError = normalizeError(error);
        const friendlyError = getUserFriendlyError(normalizedError);
      setDeviceError(normalizedError);
        setMediaError(friendlyError.message || normalizedError.message);
      throw normalizedError;
        }
    },
    [
      hasAudio,
      hasVideo,
      localStream,
      isJoined,
      selectedAudioDevice,
      selectedVideoDevice,
      audioDevices,
      videoDevices,
      detectDevices,
      requestDevicePermissionsWithRetry,
    ]
  );

  /**
   * التحقق من دعم الكوديك وتفضيلات Transcoding
   * تم نقله هنا ليكون متاحاً قبل initializeDevice
   */
  const validateCodecSupport = useCallback(async (rtpCapabilities) => {
    try {
      if (!rtpCapabilities || !rtpCapabilities.codecs) {
        logger.warn("No codec information available");
        return;
      }

      const videoCodecs = rtpCapabilities.codecs.filter(
        (c) => c.kind === "video"
      );
      const supportedCodecs = videoCodecs.map((c) => c.mimeType.split("/")[1]);

      logger.deviceEvent("Supported video codecs:", supportedCodecs);
      
      // التحقق من توفر الكوديك المفضلة
      const availableCodecs = codecPreferenceRef.current.filter((codec) =>
        supportedCodecs.some((supported) =>
          supported.toLowerCase().includes(codec.toLowerCase())
        )
      );
      
      if (availableCodecs.length === 0) {
        logger.warn("No preferred codecs available, using fallback");
        // قد نحتاج لطلب transcoding من السيرفر
      } else {
        logger.deviceEvent("Preferred codecs available:", availableCodecs);
      }
      
      return availableCodecs;
    } catch (error) {
      logger.error("Error validating codec support:", error);
    }
  }, []);

  /**
   * 2. تهيئة Device
   */
  const initializeDevice = useCallback(
    async (rtpCapabilities) => {
    try {
      const handlerName = getDeviceHandler();
        logger.deviceEvent(
          "Creating device with handler",
          handlerName || "auto-detect"
        );
        logger.deviceEvent("Platform", Platform.OS);

      // على React Native يجب تسجيل الكائنات العالمية قبل إنشاء Device
        if (Platform.OS !== "web") {
        try {
          registerGlobals && registerGlobals();
            logger.deviceEvent("registerGlobals() called");
        } catch (e) {
            logger.warn("registerGlobals failed or not needed:", e?.message);
        }
      }

      // إنشاء Device
      const device = handlerName ? new Device({ handlerName }) : new Device();
      
      try {
        await device.load({ routerRtpCapabilities: rtpCapabilities });
        deviceRef.current = device;
          logger.deviceEvent("Device initialized successfully");
        
        // التحقق من توافق الكوديك لدعم Transcoding
          if (transcodingEnabled && Platform.OS === "web") {
          await validateCodecSupport(device.rtpCapabilities);
        }
        
        return device;
      } catch (loadError) {
        logger.warn(`Handler ${handlerName} failed:`, loadError.message);
        
        // على الويب، نحاول handlers بديلة
          if (Platform.OS === "web") {
            const alternativeHandlers = [
              "Chrome111",
              "Chrome74",
              "Firefox60",
              "Safari12",
            ];
          
          for (const altHandler of alternativeHandlers) {
            if (altHandler !== handlerName) {
              try {
                logger.deviceEvent(`Trying ${altHandler} handler...`);
                const altDevice = new Device({ handlerName: altHandler });
                  await altDevice.load({
                    routerRtpCapabilities: rtpCapabilities,
                  });
                deviceRef.current = altDevice;
                  logger.deviceEvent(
                    `Device initialized with ${altHandler} handler`
                  );
                
                // التحقق من توافق الكوديك لدعم Transcoding
                  if (transcodingEnabled && Platform.OS === "web") {
                  await validateCodecSupport(altDevice.rtpCapabilities);
                }
                
                return altDevice;
              } catch (altError) {
                  logger.warn(
                    `${altHandler} handler also failed:`,
                    altError.message
                  );
                continue;
              }
            }
          }
        }
        
        throw loadError;
      }
    } catch (error) {
        logger.error("Error initializing device:", error);
      throw error;
    }
    },
    [transcodingEnabled, validateCodecSupport]
  );

  /**
   * Helper: Timeout wrapper للعمليات الحرجة
   * تم نقله هنا ليكون متاحاً قبل createProducerTransport و createConsumerTransport
   */
  const withTimeout = useCallback(async (promise, timeoutMs, operationName) => {
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => {
        reject(
          createError(
            ERROR_CODES.NETWORK_TIMEOUT,
            `${operationName} timed out after ${timeoutMs}ms`
          )
        );
      }, timeoutMs);
    });
    return Promise.race([promise, timeoutPromise]);
  }, []);

  /**
   * Helper: Retry mechanism مع exponential backoff
   * تم نقله هنا ليكون متاحاً قبل createProducerTransport و createConsumerTransport
   */
  const withRetry = useCallback(
    async (
      operation,
      maxRetries = 3,
      initialDelay = 1000,
      operationName = "Operation"
    ) => {
    let lastError;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
          logger.callEvent(
            `${operationName} - Attempt ${attempt}/${maxRetries}`
          );
        return await operation();
      } catch (error) {
        lastError = error;
        // لا نعيد المحاولة إذا لم يكن خطأ في الشبكة
          if (
            error.code !== ERROR_CODES.NETWORK_TIMEOUT &&
            error.code !== ERROR_CODES.NETWORK_ERROR &&
            error.code !== ERROR_CODES.SOCKET_DISCONNECTED
          ) {
          throw error;
        }
        // إذا لم نصل للحد الأقصى، نعيد المحاولة
        if (attempt < maxRetries) {
          const delay = initialDelay * Math.pow(2, attempt - 1);
          logger.callEvent(`${operationName} - Retrying in ${delay}ms...`);
            await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }
    throw lastError;
    },
    []
  );

  /**
   * 3. إنشاء Producer Transport (للإرسال)
   */
  const createProducerTransport = useCallback(
    async (currentRoomId) => {
      try {
        logger.deviceEvent("Creating producer transport...");

        // ✅ فحص إضافي: منع viewers من إنشاء producer transport
        if (currentRoleRef.current === "viewer") {
          logger.warn(
            "❌ Attempted to create producer transport as viewer - this should not happen!",
            { role: currentRoleRef.current }
          );
          throw createError(
            ERROR_CODES.STREAM_CREATION_FAILED,
            "Viewers cannot create producer transport. Only broadcasters can stream."
          );
        }

      if (producerTransportRef.current) {
          logger.deviceEvent(
            "Producer transport already exists, skipping creation"
          );
        return producerTransportRef.current;
      }

      // طلب إنشاء transport من السيرفر مع retry
        const createTransportRequest = () =>
          socket.emitWithAck("createWebRtcTransport", {
        roomId: currentRoomId || roomId,
            direction: "send",
      });
      
      const { success, params, error } = await withRetry(
          () =>
            withTimeout(
              createTransportRequest(),
              10000,
              "createWebRtcTransport"
            ),
        2, // 2 retries
        2000, // start with 2s delay
          "createProducerTransport"
      );

      if (!success) {
        throw createError(ERROR_CODES.NETWORK_ERROR, error);
      }

      // إنشاء send transport
      const transport = deviceRef.current.createSendTransport({
        ...params,
        ...(ICE_SERVERS.length > 0 ? { iceServers: ICE_SERVERS } : {}),
      });

      // Event: عند الحاجة لربط transport
        transport.on(
          "connect",
          async ({ dtlsParameters }, callback, errback) => {
        try {
              logger.deviceEvent("Connecting producer transport...");
              const result = await withTimeout(
                socket.emitWithAck("connectWebRtcTransport", {
            roomId: currentRoomId || roomId,
            transportId: transport.id,
            dtlsParameters,
                }),
                10000,
                "connectWebRtcTransport"
              );

          if (result.success) {
                logger.deviceEvent("Producer transport connected");
            callback();
          } else {
                logger.error(
                  "Failed to connect producer transport:",
                  result.error
                );
            errback(new Error(result.error));
          }
        } catch (error) {
              logger.error("Error connecting producer transport:", error);
          errback(error);
        }
          }
        );
      
      // Monitor transport connection state
        transport.on("connectionstatechange", (state) => {
          logger.streamEvent("Producer transport connection state:", state);
          // ✅ معالجة أخطاء الاتصال
          if (state === "failed" || state === "disconnected") {
            logger.error("Producer transport connection failed:", state);
            // يمكن إضافة retry logic هنا إذا لزم الأمر
          }
        });

        transport.on("icestatechange", (state) => {
          logger.streamEvent("Producer transport ICE state:", state);
          // ✅ معالجة أخطاء ICE
          if (state === "failed") {
            logger.error("Producer transport ICE failed");
          }
        });

        // ✅ معالجة إغلاق transport
        transport.on("transportclose", () => {
          logger.warn("Producer transport closed");
          producerTransportRef.current = null;
      });

      // Event: عند الحاجة لإنتاج media
        transport.on(
          "produce",
          async ({ kind, rtpParameters, appData }, callback, errback) => {
        try {
          logger.streamEvent(`Producing ${kind}...`);
              const result = await withTimeout(
                socket.emitWithAck("produce", {
            roomId: currentRoomId || roomId,
            transportId: transport.id,
            kind,
            rtpParameters,
            appData,
                }),
                10000,
                "produce"
              );

          if (result.success) {
            callback({ id: result.id });
          } else {
            errback(new Error(result.error));
          }
        } catch (error) {
          errback(error);
        }
          }
        );

      producerTransportRef.current = transport;
        logger.streamEvent("Producer transport created");
      return transport;
    } catch (error) {
        logger.error("Error creating producer transport:", error);
      throw error;
    }
    },
    [socket, roomId, withTimeout, withRetry]
  );

  /**
   * 4. بدء الإنتاج (إرسال الصوت/الفيديو)
   */
  const produce = useCallback(
    async (stream) => {
      try {
        logger.streamEvent("produce() called with stream:", stream.id);

        // ✅ فحص إضافي: منع viewers من produce
        if (currentRoleRef.current === "viewer") {
          logger.warn(
            "❌ Attempted to produce as viewer - this should not happen!",
            { role: currentRoleRef.current }
          );
          throw createError(
            ERROR_CODES.STREAM_CREATION_FAILED,
            "Viewers cannot produce media. Only broadcasters can stream."
          );
        }
      
      const transport = producerTransportRef.current;
      if (!transport) {
          throw createError(
            ERROR_CODES.STREAM_CREATION_FAILED,
            "Producer transport not created"
          );
      }

        // إنتاج Audio (idempotent) مع retry mechanism
      const audioTrack = stream.getAudioTracks()[0];
      if (audioTrack) {
          const existingAudio = producersRef.current.get("audio");
        if (existingAudio) {
            logger.streamEvent(
              `Audio producer already exists: ${existingAudio.id}, skipping`
            );
        } else {
            logger.streamEvent("Producing audio...");
            // ✅ إضافة retry mechanism لإنتاج audio
            const audioProducer = await withRetry(
              async () => {
                try {
                  return await transport.produce({ track: audioTrack });
                } catch (error) {
                  logger.error("Error producing audio:", error);
                  // إعادة المحاولة فقط للأخطاء القابلة للاسترداد
                  if (
                    error.name === "InvalidStateError" ||
                    error.message?.includes("transport")
                  ) {
                    const friendlyError = getUserFriendlyError(error);
                    throw createError(
                      ERROR_CODES.NETWORK_ERROR,
                      friendlyError.message ||
                        `Audio production failed: ${error.message}`
                    );
                  }
                  throw error;
                }
              },
              RETRY_CONFIG.MAX_RETRIES,
              TIMEOUTS.INITIAL_RETRY_DELAY,
              "produceAudio"
            );
            producersRef.current.set("audio", audioProducer);
            logger.streamEvent("Audio producer created:", audioProducer.id);
        }
      }

      // إنتاج Video (idempotent)
      const videoTrack = stream.getVideoTracks()[0];
      logger.roomEvent("🔍 [DEBUG] Video track check", {
        hasVideoTrack: !!videoTrack,
        videoTrackEnabled: videoTrack?.enabled,
        videoTrackReadyState: videoTrack?.readyState,
        streamVideoTracksCount: stream.getVideoTracks().length,
      });
      
      if (videoTrack) {
          const existingVideo = producersRef.current.get("video");
        if (existingVideo) {
            logger.streamEvent(
              `Video producer already exists: ${existingVideo.id}, skipping`
            );
        } else {
            logger.streamEvent("Producing video...");
          
          // تحديد جودة الفيديو الأولية بناءً على حالة الشبكة الحالية
            const initialQuality = currentVideoQuality || "high";
          logger.streamEvent(`Initial video quality: ${initialQuality}`);
          
          // إعداد Simulcast encoding parameters إذا كان مفعلاً
          let encodingParameters = null;
            if (enableSimulcast && Platform.OS === "web") {
            encodingParameters = [
              // Layer 0 (Low quality - QVGA): للمستخدمين بإنترنت ضعيف
              {
                  rid: "r0",
                  maxBitrate: VIDEO_QUALITY.SIMULCAST_LOW_BITRATE,
                  scaleResolutionDownBy: VIDEO_QUALITY.SIMULCAST_LOW_SCALE,
                  maxFramerate: VIDEO_QUALITY.LOW_FRAMERATE,
              },
              // Layer 1 (Medium quality - VGA): للمستخدمين بإنترنت متوسط
              {
                  rid: "r1",
                  maxBitrate: VIDEO_QUALITY.SIMULCAST_MEDIUM_BITRATE,
                  scaleResolutionDownBy: VIDEO_QUALITY.SIMULCAST_MEDIUM_SCALE,
                  maxFramerate: VIDEO_QUALITY.MEDIUM_FRAMERATE,
              },
              // Layer 2 (High quality - HD): للمستخدمين بإنترنت قوي
              {
                  rid: "r2",
                  maxBitrate: VIDEO_QUALITY.HIGH_BITRATE,
                  scaleResolutionDownBy: VIDEO_QUALITY.HIGH_SCALE,
                  maxFramerate: VIDEO_QUALITY.HIGH_FRAMERATE,
                },
              ];

              logger.streamEvent(
                "Simulcast enabled with 3 spatial layers",
                encodingParameters
              );
            simulcastEnabledRef.current = true;
          }
          
            // ✅ إضافة retry mechanism لإنتاج video
            const videoProducer = await withRetry(
              async () => {
                try {
                  return await transport.produce({
            track: videoTrack,
                    ...(encodingParameters && {
                      encodings: encodingParameters,
                    }),
                  });
                } catch (error) {
                  logger.error("Error producing video:", error);
                  // إعادة المحاولة فقط للأخطاء القابلة للاسترداد
                  if (
                    error.name === "InvalidStateError" ||
                    error.message?.includes("transport")
                  ) {
                    const friendlyError = getUserFriendlyError(error);
                    throw createError(
                      ERROR_CODES.NETWORK_ERROR,
                      friendlyError.message ||
                        `Video production failed: ${error.message}`
                    );
                  }
                  throw error;
                }
              },
              RETRY_CONFIG.MAX_RETRIES,
              TIMEOUTS.INITIAL_RETRY_DELAY,
              "produceVideo"
            );

            producersRef.current.set("video", videoProducer);
            logger.streamEvent("Video producer created:", videoProducer.id);
          
          // تطبيق الجودة الأولية (للتأكد من تطبيق constraints)
          await adjustVideoQuality(initialQuality);
        }
      }
      
        logger.streamEvent("produce() completed");
    } catch (error) {
        logger.error("Error producing:", error);
      throw error;
    }
    },
    [currentVideoQuality]
  );

  /**
   * تعديل جودة الفيديو بناءً على حالة الشبكة
   */
  const adjustVideoQuality = useCallback(
    async (quality) => {
    try {
        if (Platform.OS !== "web" || !isJoined) {
        return;
      }

        const videoProducer = producersRef.current.get("video");
      const videoTrack = localStream?.getVideoTracks()?.[0];
      
      if (!videoProducer || !videoTrack) {
          logger.warn(
            "Cannot adjust video quality - no video producer or track"
          );
        return;
      }

      // تعريفات الجودة (resolution, frameRate, bitrate)
      const qualitySettings = {
        high: {
          width: { ideal: 1280, max: 1920 },
          height: { ideal: 720, max: 1080 },
          frameRate: { ideal: 30, max: 60 },
            bitrate: VIDEO_QUALITY.HIGH_BITRATE,
        },
        medium: {
          width: { ideal: 640, max: 1280 },
          height: { ideal: 480, max: 720 },
          frameRate: { ideal: 24, max: 30 },
          bitrate: 1000000, // 1 Mbps
        },
        low: {
          width: { ideal: 320, max: 640 },
          height: { ideal: 240, max: 480 },
          frameRate: { ideal: 15, max: 24 },
            bitrate: VIDEO_QUALITY.LOW_BITRATE,
        },
      };

      const settings = qualitySettings[quality] || qualitySettings.medium;
      
      logger.streamEvent(`Adjusting video quality to: ${quality}`, settings);

      // تطبيق constraints على video track
        if (videoTrack && typeof videoTrack.applyConstraints === "function") {
        await videoTrack.applyConstraints({
          width: settings.width,
          height: settings.height,
          frameRate: settings.frameRate,
        });
        logger.streamEvent(`Video constraints applied: ${quality}`);
      }

      // تحديث state
      setCurrentVideoQuality(quality);

      // ملاحظة: MediaSoup Producer لا يدعم تغيير bitrate مباشرة عبر setMaxBitrate
      // ولكن يمكن استخدام encoding parameters عند create producer
      // هنا نعتمد على constraints فقط لتقليل resolution و frameRate
    } catch (error) {
        logger.error("Error adjusting video quality:", error);
      throw error;
    }
    },
    [isJoined, localStream]
  );

  /**
   * Helper function للحصول على stats مع retry mechanism
   */
  const getStatsWithRetry = useCallback(
    async (
      getStatsFn,
      context,
      maxRetries = RETRY_CONFIG.STATS_MAX_RETRIES,
      baseDelay = TIMEOUTS.STATS_RETRY_BASE_DELAY
    ) => {
      let lastError;
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          return await getStatsFn();
        } catch (error) {
          lastError = error;
          if (attempt < maxRetries) {
            const delay = baseDelay * Math.pow(2, attempt); // Exponential backoff
            logger.debug(
              `Stats collection failed for ${context}, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries + 1})`,
              {
                context,
                attempt: attempt + 1,
                error: error.message,
              }
            );
            await new Promise((resolve) => setTimeout(resolve, delay));
          }
        }
      }
      logger.warn(
        `Stats collection failed for ${context} after ${maxRetries + 1} attempts:`,
        {
          context,
          error: lastError?.message || "Unknown error",
        }
      );
      throw lastError;
    },
    []
  );

  /**
   * جمع إحصائيات الاتصال للـ debugging و Bandwidth Management
   * تم نقله هنا ليكون متاحاً قبل monitorBandwidth
   * مع إضافة retry mechanism ومعالجة أفضل للأخطاء
   */
  const getConnectionStatistics = useCallback(
    async (retries = 2, options = {}) => {
    try {
        if (!isJoined || Platform.OS !== "web") {
        return null;
      }
      const mode = options?.mode || "full";
      const includeProducerSide = mode !== "viewer";
      const includeConsumerSide = mode !== "broadcaster";

      const stats = {
        timestamp: new Date().toISOString(),
        transports: {},
        producers: {},
        consumers: {},
      };

      // إحصائيات Producer Transport
      if (includeProducerSide && producerTransportRef.current) {
        try {
            const transportStats = await getStatsWithRetry(
              () => producerTransportRef.current.getStats(),
              `producer-transport-${producerTransportRef.current.id}`,
              2,
              100
            );
          stats.transports.producer = {
            id: producerTransportRef.current.id,
            connectionState: producerTransportRef.current.connectionState,
              stats: Array.from(transportStats.values()).map((stat) => ({
              type: stat.type,
              timestamp: stat.timestamp,
                ...(stat.type === "transport"
                  ? {
                bytesReceived: stat.bytesReceived,
                bytesSent: stat.bytesSent,
                packetsReceived: stat.packetsReceived,
                packetsSent: stat.packetsSent,
                packetsLost: stat.packetsLost,
                    }
                  : {}),
            })),
          };
        } catch (error) {
            logger.warn(
              "Failed to get producer transport stats after retries:",
              {
                transportId: producerTransportRef.current?.id,
                error: error.message,
                connectionState: producerTransportRef.current?.connectionState,
              }
            );
        }
      }

      // إحصائيات Producers
      if (includeProducerSide) {
        for (const [key, producer] of producersRef.current) {
        try {
            const producerStats = await getStatsWithRetry(
              () => producer.getStats(),
              `producer-${key}-${producer.id}`,
              2,
              100
            );
          stats.producers[key] = {
            id: producer.id,
            kind: producer.kind,
            paused: producer.paused,
              stats: Array.from(producerStats.values()).map((stat) => ({
              type: stat.type,
              timestamp: stat.timestamp,
                ...(stat.type === "outbound-rtp"
                  ? {
                bytesSent: stat.bytesSent,
                packetsSent: stat.packetsSent,
                packetsLost: stat.packetsLost,
                bitrate: stat.bitrate,
                roundTripTime: stat.roundTripTime,
                    }
                  : {}),
            })),
          };
        } catch (error) {
            logger.warn(`Failed to get producer ${key} stats after retries:`, {
              producerId: producer.id,
              kind: producer.kind,
              paused: producer.paused,
              error: error.message,
            });
        }
      }
      }

      // إحصائيات Consumer Transports
      if (includeConsumerSide) {
        for (const [peerId, transport] of consumerTransportsRef.current) {
        try {
            const transportStats = await getStatsWithRetry(
              () => transport.getStats(),
              `consumer-transport-${peerId}-${transport.id}`,
              2,
              100
            );
          stats.transports[`consumer-${peerId}`] = {
            id: transport.id,
            peerId,
            connectionState: transport.connectionState,
              stats: Array.from(transportStats.values()).map((stat) => ({
              type: stat.type,
              timestamp: stat.timestamp,
            })),
          };
        } catch (error) {
            logger.warn(
              `Failed to get consumer transport ${peerId} stats after retries:`,
              {
                transportId: transport.id,
                peerId,
                connectionState: transport.connectionState,
                error: error.message,
              }
            );
        }
      }
      }

      // إحصائيات Consumers
      if (includeConsumerSide) {
        for (const [consumerId, { consumer, peerId }] of consumersRef.current) {
        try {
            const consumerStats = await getStatsWithRetry(
              () => consumer.getStats(),
              `consumer-${consumerId}-${peerId}`,
              2,
              100
            );
          stats.consumers[consumerId] = {
            id: consumer.id,
            peerId,
            kind: consumer.kind,
            paused: consumer.paused,
              stats: Array.from(consumerStats.values()).map((stat) => ({
              type: stat.type,
              timestamp: stat.timestamp,
                ...(stat.type === "inbound-rtp"
                  ? {
                bytesReceived: stat.bytesReceived,
                packetsReceived: stat.packetsReceived,
                packetsLost: stat.packetsLost,
                bitrate: stat.bitrate,
                jitter: stat.jitter,
                    }
                  : {}),
            })),
          };
        } catch (error) {
            logger.warn(
              `Failed to get consumer ${consumerId} stats after retries:`,
              {
                consumerId,
                peerId,
                kind: consumer.kind,
                paused: consumer.paused,
                error: error.message,
              }
            );
          }
        }
      }

        // التحقق من أن لدينا على الأقل بعض البيانات المفيدة
        const hasUsefulData =
          Object.keys(stats.transports).length > 0 ||
          Object.keys(stats.producers).length > 0 ||
          Object.keys(stats.consumers).length > 0;

        if (!hasUsefulData) {
          logger.warn(
            "getConnectionStatistics returned empty stats - no useful data collected",
            {
              isJoined,
              hasProducerTransport: !!producerTransportRef.current,
              producersCount: producersRef.current.size,
              consumerTransportsCount: consumerTransportsRef.current.size,
              consumersCount: consumersRef.current.size,
            }
          );
      }

      return stats;
    } catch (error) {
        if (retries > 0) {
          logger.warn(
            `Stats collection failed, retrying... (${retries} retries left)`,
            {
              error: error.message,
              retriesLeft: retries,
            }
          );
          await new Promise((resolve) =>
            setTimeout(
              resolve,
              TIMEOUTS.STATS_RETRY_MAX_DELAY * Math.pow(2, 2 - retries)
            )
          ); // Exponential backoff
          return getConnectionStatistics(retries - 1, options);
        }
        logger.error("Failed to get connection statistics after all retries:", {
          error: error.message,
          stack: error.stack,
        });
      return null;
    }
    },
    [isJoined, getStatsWithRetry]
  );

  /**
   * ✅ حساب Quality Score بناءً على network metrics
   * يستخدم weighted scoring system لتحديد جودة الشبكة
   */
  const calculateQualityScore = useCallback(
    (networkMetrics, isViewer = false) => {
      const { packetLossRate, bitrate, rtt } = networkMetrics;
      const weights = BANDWIDTH_MONITORING.QUALITY_SCORE_WEIGHTS;

      // Normalize metrics (0-1 scale, higher is better)
      let bitrateScore = 0;
      let packetLossScore = 0;
      let rttScore = 0;

      if (isViewer) {
        // للمشاهدين: استخدام thresholds محافظة
        const maxBitrate =
          BANDWIDTH_MONITORING.VIEWER_BITRATE_THRESHOLD_HIGH * 1.5; // 3 Mbps
        bitrateScore = Math.min(bitrate / maxBitrate, 1);

        const maxPacketLoss =
          BANDWIDTH_MONITORING.VIEWER_PACKET_LOSS_THRESHOLD_POOR;
        packetLossScore = Math.max(0, 1 - packetLossRate / maxPacketLoss);

        const maxRtt = BANDWIDTH_MONITORING.VIEWER_RTT_THRESHOLD_POOR * 2; // 400ms
        rttScore = Math.max(0, 1 - rtt / maxRtt);
      } else {
        // للبث: استخدام thresholds عادية
        const maxBitrate = BANDWIDTH_MONITORING.BITRATE_THRESHOLD_HIGH * 2; // 3 Mbps
        bitrateScore = Math.min(bitrate / maxBitrate, 1);

        const maxPacketLoss = BANDWIDTH_MONITORING.PACKET_LOSS_THRESHOLD_POOR;
        packetLossScore = Math.max(0, 1 - packetLossRate / maxPacketLoss);

        const maxRtt = BANDWIDTH_MONITORING.RTT_THRESHOLD_POOR * 2; // 600ms
        rttScore = Math.max(0, 1 - rtt / maxRtt);
      }

      // Weighted average
      const qualityScore =
        bitrateScore * weights.bitrate +
        packetLossScore * weights.packetLoss +
        rttScore * weights.rtt;

      return {
        score: qualityScore,
        components: { bitrateScore, packetLossScore, rttScore },
      };
    },
    []
  );

  /**
   * ✅ تحديد الاتجاه (Trend) في جودة الشبكة
   * يحلل آخر N قياسات لتحديد ما إذا كانت الجودة تتحسن أو تتراجع
   */
  const analyzeNetworkTrend = useCallback(() => {
    const history = qualityScoreHistoryRef.current;
    if (history.length < BANDWIDTH_MONITORING.TREND_WINDOW_SIZE) {
      return { trend: "stable", confidence: 0 }; // لا توجد بيانات كافية
    }

    // استخدام آخر N قياسات
    const recentScores = history.slice(-BANDWIDTH_MONITORING.TREND_WINDOW_SIZE);
    const firstHalf = recentScores.slice(
      0,
      Math.floor(recentScores.length / 2)
    );
    const secondHalf = recentScores.slice(Math.floor(recentScores.length / 2));

    const avgFirst =
      firstHalf.reduce((sum, s) => sum + s, 0) / firstHalf.length;
    const avgSecond =
      secondHalf.reduce((sum, s) => sum + s, 0) / secondHalf.length;

    const difference = avgSecond - avgFirst;
    const threshold = 0.05; // 5% change threshold

    if (difference > threshold) {
      return {
        trend: "improving",
        confidence: Math.min(Math.abs(difference) * 10, 1),
      };
    } else if (difference < -threshold) {
      return {
        trend: "degrading",
        confidence: Math.min(Math.abs(difference) * 10, 1),
      };
    } else {
      return { trend: "stable", confidence: 1 - Math.abs(difference) * 10 };
    }
  }, []);

  /**
   * ✅ تعديل Consumer layers في Simulcast بناءً على جودة الاتصال
   * تم تحسينه لاستخدام Dynamic Layer Selection مع Hysteresis و Trend Analysis
   */
  const adjustConsumerLayers = useCallback(
    async (quality, networkMetrics = null) => {
      try {
        if (Platform.OS !== "web" || !isJoined) {
        return;
      }

        // ✅ تحسين: للمشاهدين، نستخدم منطق مختلف (أكثر تحفظاً لتوفير bandwidth)
        const isViewer = currentRoleRef.current === "viewer";

        // إذا كانت networkMetrics متوفرة، نستخدم Dynamic Layer Selection
        if (networkMetrics) {
          const { packetLossRate, bitrate, rtt } = networkMetrics;
          const now = Date.now();

          // ✅ إضافة القياس الحالي للتاريخ
          networkQualityHistoryRef.current.push({
            bitrate,
            packetLoss: packetLossRate,
            rtt,
            timestamp: now,
          });

          // ✅ الحفاظ على آخر N قياسات فقط
          const maxHistorySize = BANDWIDTH_MONITORING.TREND_WINDOW_SIZE * 2;
          if (networkQualityHistoryRef.current.length > maxHistorySize) {
            networkQualityHistoryRef.current.shift();
          }

          // ✅ حساب Quality Score
          const qualityScoreResult = calculateQualityScore(
            networkMetrics,
            isViewer
          );
          const qualityScore = qualityScoreResult.score;

          // ✅ إضافة للتاريخ
          qualityScoreHistoryRef.current.push(qualityScore);
          if (qualityScoreHistoryRef.current.length > maxHistorySize) {
            qualityScoreHistoryRef.current.shift();
          }

          // ✅ تحليل الاتجاه
          const trend = analyzeNetworkTrend();

          // ✅ تحديد الطبقة المستهدفة بناءً على Quality Score
          let targetSpatialLayer = VIDEO_QUALITY.LAYER_MEDIUM;
          let targetTemporalLayer = 1;

          if (isViewer) {
            // ✅ للمشاهدين: تحسين الجودة - استخدام thresholds أفضل
            if (qualityScore < 0.2) {
              // فقط في حالة الشبكة الضعيفة جداً
              targetSpatialLayer = VIDEO_QUALITY.LAYER_LOW;
              targetTemporalLayer = 0;
            } else if (qualityScore < 0.5) {
              // شبكة متوسطة - استخدام medium layer
              targetSpatialLayer = VIDEO_QUALITY.LAYER_MEDIUM;
              targetTemporalLayer = 1;
            } else {
              // شبكة جيدة - استخدام high layer للحصول على جودة أفضل
              targetSpatialLayer = VIDEO_QUALITY.LAYER_HIGH;
              targetTemporalLayer = 2;
            }
          } else {
            // للبث: thresholds عادية
            if (qualityScore < 0.4) {
              targetSpatialLayer = VIDEO_QUALITY.LAYER_LOW;
              targetTemporalLayer = 0;
            } else if (qualityScore < 0.7) {
              targetSpatialLayer = VIDEO_QUALITY.LAYER_MEDIUM;
              targetTemporalLayer = 1;
            } else {
              targetSpatialLayer = VIDEO_QUALITY.LAYER_HIGH;
              targetTemporalLayer = 2;
            }
          }

          // ✅ Hysteresis: منع التغييرات المفاجئة
          const currentLayer = currentLayerRef.current;
          const timeSinceLastChange = now - layerChangeTimestampRef.current;
          const minStableDuration = BANDWIDTH_MONITORING.MIN_STABLE_DURATION;

          // التحقق من الحاجة للتغيير
          const needsChange =
            targetSpatialLayer !== currentLayer.spatial ||
            targetTemporalLayer !== currentLayer.temporal;

          if (needsChange) {
            // ✅ Hysteresis: تأخير في التغيير للأسفل (أكثر تحفظاً)
            if (targetSpatialLayer < currentLayer.spatial) {
              // نحتاج إلى فترة استقرار أطول قبل التخفيض
              if (timeSinceLastChange < minStableDuration * 1.5) {
                // ✅ تم إزالة logger.streamEvent لتقليل اللوغات المتكررة
                // logger.streamEvent('Hysteresis: Delaying layer downgrade', {...});
                // نستخدم الطبقة الحالية
                targetSpatialLayer = currentLayer.spatial;
                targetTemporalLayer = currentLayer.temporal;
              } else if (qualityScoreHistoryRef.current.length >= 2) {
                // ✅ تطبيق hysteresis threshold للتحقق من استقرار التدهور
                const scoreDiff =
                  qualityScoreHistoryRef.current[
                    qualityScoreHistoryRef.current.length - 1
                  ] -
                  qualityScoreHistoryRef.current[
                    qualityScoreHistoryRef.current.length - 2
                  ];
                if (
                  scoreDiff > -BANDWIDTH_MONITORING.HYSTERESIS_DOWN_THRESHOLD
                ) {
                  // ✅ تم إزالة logger.streamEvent لتقليل اللوغات المتكررة
                  // logger.streamEvent('Hysteresis: Score change too small for downgrade', {...});
                  targetSpatialLayer = currentLayer.spatial;
                  targetTemporalLayer = currentLayer.temporal;
                }
              }
            }
            // ✅ Hysteresis: تأخير أقل في التغيير للأعلى (أكثر حساسية للتحسين)
            else if (targetSpatialLayer > currentLayer.spatial) {
              if (timeSinceLastChange < minStableDuration) {
                // ✅ تم إزالة logger.streamEvent لتقليل اللوغات المتكررة
                // logger.streamEvent('Hysteresis: Delaying layer upgrade', {...});
                targetSpatialLayer = currentLayer.spatial;
                targetTemporalLayer = currentLayer.temporal;
              } else if (qualityScoreHistoryRef.current.length >= 2) {
                // ✅ تطبيق hysteresis threshold للتحقق من استقرار التحسين
                const scoreDiff =
                  qualityScoreHistoryRef.current[
                    qualityScoreHistoryRef.current.length - 1
                  ] -
                  qualityScoreHistoryRef.current[
                    qualityScoreHistoryRef.current.length - 2
                  ];
                if (scoreDiff < BANDWIDTH_MONITORING.HYSTERESIS_UP_THRESHOLD) {
                  // ✅ تم إزالة logger.streamEvent لتقليل اللوغات المتكررة
                  // logger.streamEvent('Hysteresis: Score change too small for upgrade', {...});
                  targetSpatialLayer = currentLayer.spatial;
                  targetTemporalLayer = currentLayer.temporal;
                }
              }
            }
          }

          // ✅ تحديث الطبقة الحالية إذا تغيرت
          if (
            targetSpatialLayer !== currentLayer.spatial ||
            targetTemporalLayer !== currentLayer.temporal
          ) {
            currentLayerRef.current = {
              spatial: targetSpatialLayer,
              temporal: targetTemporalLayer,
            };
            layerChangeTimestampRef.current = now;
            // ✅ تم إزالة logger.streamEvent لتقليل اللوغات المتكررة
            // logger.streamEvent('Dynamic layer selection: Layer changed', {
            //   from: { spatial: currentLayer.spatial, temporal: currentLayer.temporal },
            //   to: { spatial: targetSpatialLayer, temporal: targetTemporalLayer },
            //   qualityScore,
            //   trend: trend.trend,
            //   trendConfidence: trend.confidence
            // });
          }
        } else {
          // Fallback إلى quality string إذا لم تكن networkMetrics متوفرة
          let targetSpatialLayer = VIDEO_QUALITY.LAYER_MEDIUM;
          let targetTemporalLayer = 1;

          if (quality === "low") {
            targetSpatialLayer = VIDEO_QUALITY.LAYER_LOW;
            targetTemporalLayer = 0;
          } else if (quality === "medium") {
            targetSpatialLayer = VIDEO_QUALITY.LAYER_MEDIUM;
            targetTemporalLayer = 1;
          } else if (quality === "high") {
            targetSpatialLayer = VIDEO_QUALITY.LAYER_HIGH;
            targetTemporalLayer = 2;
          }

          // تحديث الطبقة الحالية
          currentLayerRef.current = {
            spatial: targetSpatialLayer,
            temporal: targetTemporalLayer,
          };
        }

        // ✅ استخدام الطبقة المحددة من Dynamic Layer Selection
        const finalSpatialLayer = currentLayerRef.current.spatial;
        const finalTemporalLayer = currentLayerRef.current.temporal;

        // ✅ تم إزالة logger.streamEvent لتقليل اللوغات المتكررة
        // logger.streamEvent(`Adjusting consumer layers: spatial=${finalSpatialLayer}, temporal=${finalTemporalLayer}`, {...});

      // تطبيق على جميع video consumers
        let successCount = 0;
        let failCount = 0;

      for (const [consumerId, { consumer, peerId }] of consumersRef.current) {
          if (consumer.kind === "video" && !consumer.closed) {
          try {
            // التحقق من دعم setPreferredLayers
              if (typeof consumer.setPreferredLayers === "function") {
                // محاولة تعيين الطبقات المفضلة
              await consumer.setPreferredLayers({
                  spatialLayer: finalSpatialLayer,
                  temporalLayer:
                    finalTemporalLayer === 2 ? 255 : finalTemporalLayer, // 255 = جميع temporal layers
              });
                // ✅ تم إزالة logger.streamEvent لتقليل اللوغات المتكررة
                // logger.streamEvent(`Consumer ${consumerId} (peer ${peerId}) layer set: ...`);
                successCount++;
            } else {
                logger.warn(
                  `Consumer ${consumerId} does not support setPreferredLayers`
                );
                failCount++;
            }
          } catch (error) {
              logger.error(
                `Error adjusting layer for consumer ${consumerId}:`,
                error
              );
              failCount++;
            }
          }
        }

        // ✅ تم إزالة logger.streamEvent لتقليل اللوغات المتكررة
        // if (successCount > 0) {
        //   logger.streamEvent(`Successfully adjusted ${successCount} consumer(s), ${failCount} failed`);
        // }
    } catch (error) {
        logger.error("Error adjusting consumer layers:", error);
      }
    },
    [isJoined, calculateQualityScore, analyzeNetworkTrend]
  );

  /**
   * تحديد تردد المراقبة ديناميكياً بناءً على حالة المكالمة
   * ✅ تم تحسينه لدعم المشاهدين
   */
  const getMonitorInterval = useCallback(() => {
    // ✅ للمشاهدين: تردد أقل لتوفير الموارد
    if (currentRoleRef.current === "viewer") {
      return BANDWIDTH_MONITORING.VIEWER_INTERVAL;
    }

    // إذا لم يكن هناك peers، تردد أقل لتوفير الموارد
    if (peers.length === 0) {
      return BANDWIDTH_MONITORING.NO_PEERS_INTERVAL;
    }

    // إذا كان screen sharing نشط، تردد متوسط
    if (isScreenSharing) {
      return BANDWIDTH_MONITORING.SCREEN_SHARING_INTERVAL;
    }

    // إذا كانت جودة الشبكة ضعيفة، تردد أعلى للاستجابة السريعة
    if (currentVideoQuality === "low") {
      return BANDWIDTH_MONITORING.LOW_QUALITY_INTERVAL;
    }

    // تردد عادي للجودة المتوسطة/عالية
    return BANDWIDTH_MONITORING.NORMAL_INTERVAL;
  }, [peers.length, isScreenSharing, currentVideoQuality]);

  /**
   * مراقبة جودة الشبكة وتعديل جودة الفيديو تلقائياً
   * ✅ تم تحسينه لدعم المشاهدين مع thresholds محافظة
   */
  const monitorBandwidth = useCallback(async () => {
    try {
      if (!isJoined || Platform.OS !== "web") {
        return;
      }

      const isViewer = currentRoleRef.current === "viewer";

      // ✅ للمشاهدين: نركز على consumer stats بدلاً من producer stats
      const stats = await getConnectionStatistics(2, {
        mode: isViewer ? "viewer" : "broadcaster",
      });

      if (isViewer) {
        // للمشاهدين: نستخدم consumer stats لتحديد جودة الاستقبال
        const consumerList = Object.values(stats?.consumers || {});
        if (!stats || consumerList.length === 0) {
          return;
        }

        // الحصول على network metrics من consumers
        let totalBitrate = 0;
        let totalPacketLoss = 0;
        let totalRtt = 0;
        let consumerCount = 0;

        for (const consumerStat of consumerList) {
          if (consumerStat.kind === "video") {
            const consumerStats = consumerStat.stats?.find(
              (s) => s.type === "inbound-rtp"
            );
            if (consumerStats) {
              totalBitrate += consumerStats.bitrate || 0;
              const packetsReceived = consumerStats.packetsReceived || 0;
              const packetsLost = consumerStats.packetsLost || 0;
              if (packetsReceived > 0) {
                totalPacketLoss += (packetsLost / packetsReceived) * 100;
              }
              totalRtt += consumerStats.roundTripTime || 0;
              consumerCount++;
            }
          }
        }

        if (consumerCount === 0) {
          return;
        }

        const avgBitrate = totalBitrate / consumerCount;
        const avgPacketLoss = totalPacketLoss / consumerCount;
        const avgRtt = totalRtt / consumerCount;

        // ✅ تم إزالة logger.streamEvent لتقليل اللوغات المتكررة
        // logger.streamEvent('Viewer bandwidth monitoring', {...});

        // ✅ استخدام thresholds محافظة للمشاهدين
        const networkMetrics = {
          packetLossRate: avgPacketLoss,
          bitrate: avgBitrate,
          rtt: avgRtt,
        };

        // تعديل consumer layers مباشرة بناءً على network metrics
        if (simulcastEnabledRef.current) {
          await adjustConsumerLayers(currentVideoQuality, networkMetrics);
        }

        return; // المشاهدون لا ينتجون media، لذا لا نحتاج لتعديل producer quality
      }

      // للبث: نستخدم producer stats (الكود الأصلي)
      if (!stats || !stats.producers?.video) {
        return;
      }

      const videoProducer = stats.producers.video;
      const videoStats = videoProducer.stats?.find(
        (s) => s.type === "outbound-rtp"
      );
      
      if (!videoStats) {
        return;
      }

      // استخراج المقاييس
      const packetsSent = videoStats.packetsSent || 0;
      const packetsLost = videoStats.packetsLost || 0;
      const bitrate = videoStats.bitrate || 0;
      const roundTripTime = videoStats.roundTripTime || 0;

      // حساب معدل فقدان الحزم
      const packetLossRate =
        packetsSent > 0 ? (packetsLost / packetsSent) * 100 : 0;

      // ✅ تم إزالة logger.streamEvent لتقليل اللوغات المتكررة
      // logger.streamEvent('Broadcaster bandwidth monitoring', {...});

      // قرار تغيير الجودة بناءً على المقاييس
      let targetQuality = currentVideoQuality;

      // شروط لتقليل الجودة (Poor network conditions)
      if (
        packetLossRate > BANDWIDTH_MONITORING.PACKET_LOSS_THRESHOLD_POOR ||
        (bitrate > 0 && bitrate < BANDWIDTH_MONITORING.BITRATE_THRESHOLD_LOW) ||
        roundTripTime > BANDWIDTH_MONITORING.RTT_THRESHOLD_POOR
      ) {
        // تقليل الجودة
        if (currentVideoQuality === "high") {
          targetQuality = "medium";
        } else if (currentVideoQuality === "medium") {
          targetQuality = "low";
        }
      }
      // شروط لزيادة الجودة (Good network conditions)
      else if (
        packetLossRate < BANDWIDTH_MONITORING.PACKET_LOSS_THRESHOLD_GOOD &&
        bitrate > BANDWIDTH_MONITORING.BITRATE_THRESHOLD_HIGH &&
        roundTripTime < BANDWIDTH_MONITORING.RTT_THRESHOLD_GOOD
      ) {
        // زيادة الجودة
        if (currentVideoQuality === "low") {
          targetQuality = "medium";
        } else if (currentVideoQuality === "medium") {
          targetQuality = "high";
        }
      }

      // تطبيق التغيير إذا لزم الأمر
      if (targetQuality !== currentVideoQuality) {
        // ✅ تم إزالة logger.streamEvent لتقليل اللوغات المتكررة
        // logger.streamEvent(`Bandwidth adjustment: ${currentVideoQuality} → ${targetQuality}`);
        await adjustVideoQuality(targetQuality);
        
        // إذا كان Simulcast مفعلاً، نقوم بضبط Consumer layers تلقائياً
        // نمرر network metrics لتحسين اختيار الطبقة
        if (simulcastEnabledRef.current) {
          const networkMetrics = {
            packetLossRate,
            bitrate,
            rtt: roundTripTime,
          };
          await adjustConsumerLayers(targetQuality, networkMetrics);
        }
      } else if (simulcastEnabledRef.current) {
        // حتى لو لم تتغير الجودة، قد نحتاج لتعديل الطبقات بناءً على network metrics
        // هذا يضمن استجابة أفضل للتغيرات الطفيفة في الشبكة
        const networkMetrics = {
          packetLossRate,
          bitrate,
          rtt: roundTripTime,
        };
        await adjustConsumerLayers(currentVideoQuality, networkMetrics);
      }
    } catch (error) {
      logger.error("Error monitoring bandwidth:", error);
    }
  }, [
    isJoined,
    currentVideoQuality,
    getConnectionStatistics,
    adjustVideoQuality,
    adjustConsumerLayers,
  ]);

  /**
   * إيقاف مراقبة Bandwidth
   * يجب تعريفه قبل startBandwidthMonitoring لأنه يُستخدم داخله
   */
  const stopBandwidthMonitoring = useCallback(() => {
    if (bandwidthMonitorIntervalRef.current) {
      // تنظيف timeout إذا كان موجوداً
      if (bandwidthMonitorIntervalRef.current._timeout) {
        clearTimeout(bandwidthMonitorIntervalRef.current._timeout);
      }
      // تنظيف interval إذا كان موجوداً (legacy support)
      if (typeof bandwidthMonitorIntervalRef.current === "number") {
        clearInterval(bandwidthMonitorIntervalRef.current);
      }
      bandwidthMonitorIntervalRef.current = null;
      logger.streamEvent("Stopped bandwidth monitoring");
    }
  }, []);

  /**
   * بدء/إيقاف مراقبة Bandwidth مع تردد ديناميكي
   */
  const startBandwidthMonitoring = useCallback(() => {
    if (bandwidthMonitorIntervalRef.current) {
      // إذا كان المراقبة نشطة، نعيد ضبط التردد إذا تغير
      const currentInterval = getMonitorInterval();
      // نتحقق من التردد الحالي (نحتاج لتخزينه في ref)
      if (bandwidthMonitorIntervalRef.current._interval !== currentInterval) {
        stopBandwidthMonitoring();
        // سيتم إعادة التشغيل بالتردد الجديد أدناه
      } else {
        return; // Already monitoring with correct interval
      }
    }

    if (!isJoined || Platform.OS !== "web") {
      return;
    }

    const interval = getMonitorInterval();
    // ✅ تم إزالة logger.streamEvent لتقليل اللوغات المتكررة
    // logger.streamEvent(`Starting bandwidth monitoring with ${interval}ms interval...`, {...});

    // مراقبة بتردد ديناميكي
    const scheduleNext = () => {
      const currentInterval = getMonitorInterval();
      bandwidthMonitorIntervalRef.current._interval = currentInterval;

      bandwidthMonitorIntervalRef.current._timeout = setTimeout(() => {
        monitorBandwidth().finally(() => {
          if (bandwidthMonitorIntervalRef.current) {
            scheduleNext(); // جدولة التالية
          }
        });
      }, currentInterval);
    };

    // بدء المراقبة
    scheduleNext();

    // تحديث أولي بعد delay محدد
    setTimeout(() => {
      monitorBandwidth();
    }, TIMEOUTS.BANDWIDTH_MONITOR_INITIAL_DELAY);
  }, [
    isJoined,
    monitorBandwidth,
    getMonitorInterval,
    peers.length,
    isScreenSharing,
    currentVideoQuality,
    stopBandwidthMonitoring,
  ]);

  /**
   * تحديث تردد المراقبة تلقائياً عند تغيير الحالة
   */
  useEffect(() => {
    if (
      bandwidthMonitorIntervalRef.current &&
      isJoined &&
      Platform.OS === "web"
    ) {
      const currentInterval = getMonitorInterval();
      // إذا تغير التردد، نعيد تشغيل المراقبة بالتردد الجديد
      if (bandwidthMonitorIntervalRef.current._interval !== currentInterval) {
        // ✅ تم إزالة logger.streamEvent لتقليل اللوغات المتكررة
        // logger.streamEvent(`Bandwidth monitoring interval changed to ${currentInterval}ms`, {...});
        stopBandwidthMonitoring();
        // إعادة التشغيل بالتردد الجديد
        setTimeout(() => {
          startBandwidthMonitoring();
        }, TIMEOUTS.BANDWIDTH_MONITOR_INTERVAL_UPDATE_DELAY);
      }
    }
  }, [
    peers.length,
    isScreenSharing,
    currentVideoQuality,
    isJoined,
    getMonitorInterval,
    startBandwidthMonitoring,
    stopBandwidthMonitoring,
  ]);

  /**
   * 5. إنشاء Consumer Transport (للاستقبال من peer معين)
   */
  const createConsumerTransport = useCallback(
    async (peerId, currentRoomId) => {
    try {
      logger.streamEvent(`Creating consumer transport for peer: ${peerId}`);

      // طلب إنشاء transport من السيرفر مع retry
        const createTransportRequest = () =>
          socket.emitWithAck("createWebRtcTransport", {
        roomId: currentRoomId || roomId,
            direction: "recv",
      });
      
      const { success, params, error } = await withRetry(
          () =>
            withTimeout(
              createTransportRequest(),
              10000,
              "createWebRtcTransport"
            ),
        2, // 2 retries
        2000, // start with 2s delay
          "createConsumerTransport"
      );

      if (!success) {
        throw createError(ERROR_CODES.NETWORK_ERROR, error);
      }

      // إنشاء receive transport
      const transport = deviceRef.current.createRecvTransport({
        ...params,
        ...(ICE_SERVERS.length > 0 ? { iceServers: ICE_SERVERS } : {}),
      });

      // Event: عند الحاجة لربط transport
        transport.on(
          "connect",
          async ({ dtlsParameters }, callback, errback) => {
            try {
              logger.streamEvent(
                `Connecting consumer transport for peer ${peerId}...`
              );
              const result = await withTimeout(
                socket.emitWithAck("connectWebRtcTransport", {
            roomId: currentRoomId || roomId,
            transportId: transport.id,
            dtlsParameters,
                }),
                10000,
                "connectWebRtcTransport"
              );

          if (result.success) {
                logger.streamEvent(
                  `Consumer transport connected for peer ${peerId}`
                );
            callback();
          } else {
                logger.error(
                  `Failed to connect consumer transport for peer ${peerId}:`,
                  result.error
                );
            errback(new Error(result.error));
          }
        } catch (error) {
              logger.error(
                `Error connecting consumer transport for peer ${peerId}:`,
                error
              );
          errback(error);
        }
          }
        );
      
      // Monitor transport connection state
        transport.on("connectionstatechange", (state) => {
          logger.streamEvent(
            `Consumer transport connection state for peer ${peerId}:`,
            state
          );
          // ✅ معالجة أخطاء الاتصال
          if (state === "failed" || state === "disconnected") {
            logger.error(
              `Consumer transport connection failed for peer ${peerId}:`,
              state
            );
            // يمكن إضافة retry logic هنا إذا لزم الأمر
          }
        });

        transport.on("icestatechange", (state) => {
          logger.streamEvent(
            `Consumer transport ICE state for peer ${peerId}:`,
            state
          );
          // ✅ معالجة أخطاء ICE
          if (state === "failed") {
            logger.error(`Consumer transport ICE failed for peer ${peerId}`);
          }
        });

        // ✅ معالجة إغلاق transport
        transport.on("transportclose", () => {
          logger.warn(`Consumer transport closed for peer ${peerId}`);
          consumerTransportsRef.current.delete(peerId);
      });

      consumerTransportsRef.current.set(peerId, transport);
      logger.streamEvent(`Consumer transport created for peer: ${peerId}`);
      return transport;
    } catch (error) {
        logger.error(
          `Error creating consumer transport for peer ${peerId}:`,
          error
        );
      throw error;
    }
    },
    [socket, roomId, withTimeout, withRetry]
  );

  /**
   * 6. استهلاك Media من peer (استقبال الصوت/الفيديو)
   */
  const consume = useCallback(
    async (peerId, producerId, currentRoomId, isScreenShare = false) => {
    try {
        logger.streamEvent(
          `Consuming producer ${producerId} from peer ${peerId}`,
          { isScreenShare }
        );

      // منع الاستهلاك المكرر لنفس الـ producer
      if (consumedProducerIdsRef.current.has(producerId)) {
          logger.streamEvent(
            `Producer ${producerId} already consumed, skipping`
          );
        return null;
      }

      // الحصول أو إنشاء consumer transport
      let transport = consumerTransportsRef.current.get(peerId);
      if (!transport) {
        transport = await createConsumerTransport(peerId, currentRoomId);
      }

      // طلب استهلاك من السيرفر
        const { success, params, error } = await withTimeout(
          socket.emitWithAck("consume", {
        roomId: currentRoomId || roomId,
        transportId: transport.id,
        producerId,
        rtpCapabilities: deviceRef.current.rtpCapabilities,
          }),
          10000,
          "consume"
        );

      if (!success) {
        throw createError(ERROR_CODES.NETWORK_ERROR, error);
      }

        // ✅ إنشاء consumer مع retry mechanism
        const consumer = await withRetry(
          async () => {
            try {
              return await transport.consume(params);
            } catch (error) {
              logger.error(`Error consuming producer ${producerId}:`, error);
              // إعادة المحاولة فقط للأخطاء القابلة للاسترداد
              if (
                error.name === "InvalidStateError" ||
                error.message?.includes("transport") ||
                error.message?.includes("codec")
              ) {
                throw createError(
                  ERROR_CODES.NETWORK_ERROR,
                  `Consumer creation failed: ${error.message}`
                );
              }
              throw error;
            }
          },
          RETRY_CONFIG.MAX_RETRIES,
          TIMEOUTS.INITIAL_RETRY_DELAY,
          `consumeProducer_${producerId}`
        );

        // ✅ تحسين الأداء: إذا كان viewer، نختار الطبقة المناسبة تلقائياً
        // للمشاهدين: نستخدم thresholds أكثر تحفظاً لتوفير bandwidth
        if (
          currentRoleRef.current === "viewer" &&
          consumer.kind === "video" &&
          !isScreenShare
        ) {
          try {
            // الحصول على network stats لتحديد الطبقة المناسبة
            const stats = await getConnectionStatistics();
            if (stats && stats.network) {
              const {
                bitrate = 0,
                packetLossRate = 0,
                rtt = 0,
              } = stats.network;

              // تحديد الطبقة المناسبة بناءً على network conditions
              // ✅ للمشاهدين: نستخدم thresholds أكثر تحفظاً (توفير bandwidth)
              let preferredSpatialLayer = VIDEO_QUALITY.LAYER_MEDIUM; // افتراضي: medium (ليس high)
              let preferredTemporalLayer = 1;

              // ✅ استخدام thresholds محافظة من constants
              // Poor network: Layer 0 (Low) - thresholds أكثر تحفظاً
              if (
                (bitrate > 0 &&
                  bitrate <
                    BANDWIDTH_MONITORING.VIEWER_BITRATE_THRESHOLD_LOW) ||
                packetLossRate >
                  BANDWIDTH_MONITORING.VIEWER_PACKET_LOSS_THRESHOLD_POOR ||
                rtt > BANDWIDTH_MONITORING.VIEWER_RTT_THRESHOLD_POOR
              ) {
                preferredSpatialLayer = VIDEO_QUALITY.LAYER_LOW;
                preferredTemporalLayer = 0;
                // ✅ تم إزالة logger.streamEvent لتقليل اللوغات المتكررة
              }
              // Fair network: Layer 1 (Medium)
              else if (
                (bitrate > 0 &&
                  bitrate <
                    BANDWIDTH_MONITORING.VIEWER_BITRATE_THRESHOLD_MEDIUM) ||
                packetLossRate >
                  BANDWIDTH_MONITORING.VIEWER_PACKET_LOSS_THRESHOLD_GOOD ||
                rtt > BANDWIDTH_MONITORING.VIEWER_RTT_THRESHOLD_GOOD
              ) {
                preferredSpatialLayer = VIDEO_QUALITY.LAYER_MEDIUM;
                preferredTemporalLayer = 1;
                // ✅ تم إزالة logger.streamEvent لتقليل اللوغات المتكررة
              }
              // Good network: Layer 2 (High) - فقط إذا كانت الشبكة ممتازة
              else if (
                bitrate >= BANDWIDTH_MONITORING.VIEWER_BITRATE_THRESHOLD_HIGH
              ) {
                preferredSpatialLayer = VIDEO_QUALITY.LAYER_HIGH;
                preferredTemporalLayer = 2;
                // ✅ تم إزالة logger.streamEvent لتقليل اللوغات المتكررة
              } else {
                // Default to medium if bitrate is between medium and high thresholds
                preferredSpatialLayer = VIDEO_QUALITY.LAYER_MEDIUM;
                preferredTemporalLayer = 1;
                // ✅ تم إزالة logger.streamEvent لتقليل اللوغات المتكررة
              }

              // تطبيق الطبقة المفضلة
              if (typeof consumer.setPreferredLayers === "function") {
                await consumer.setPreferredLayers({
                  spatialLayer: preferredSpatialLayer,
                  temporalLayer:
                    preferredTemporalLayer === 2 ? 255 : preferredTemporalLayer,
                });
                logger.streamEvent(
                  `Viewer: Applied preferred layers (conservative)`,
                  {
                    spatialLayer: preferredSpatialLayer,
                    temporalLayer: preferredTemporalLayer,
                  }
                );
              }
            } else {
              // إذا لم تكن network stats متوفرة، نستخدم medium كافتراضي (توفير bandwidth)
              if (typeof consumer.setPreferredLayers === "function") {
                await consumer.setPreferredLayers({
                  spatialLayer: VIDEO_QUALITY.LAYER_MEDIUM,
                  temporalLayer: 1,
                });
                logger.streamEvent(
                  "Viewer: Applied default MEDIUM quality layer (no stats available)"
                );
              }
            }
          } catch (error) {
            logger.warn(
              "Failed to set preferred layers for viewer consumer:",
              error
            );
            // لا نوقف العملية إذا فشل setPreferredLayers
          }
        }

        // ✅ تم إزالة logger.streamEvent لتقليل اللوغات المتكررة
        // logger.streamEvent(`Consumer ${consumer.id} created:`, {...});
      
      consumersRef.current.set(consumer.id, {
        consumer,
        peerId,
        producerId,
          isScreenShare, // حفظ معلومات screen share
      });
      consumedProducerIdsRef.current.add(producerId);

      // استئناف consumer
      logger.streamEvent(`Requesting to resume consumer: ${consumer.id}`);
        const resumeResult = await withTimeout(
          socket.emitWithAck("resumeConsumer", {
        roomId: currentRoomId || roomId,
        consumerId: consumer.id,
          }),
          10000,
          "resumeConsumer"
        );
      
      if (resumeResult.success) {
        logger.streamEvent(`Consumer resumed on server: ${consumer.id}`);
      } else {
        logger.error(`Failed to resume consumer: ${resumeResult.error}`);
      }

      // إضافة track للـ stream
      const track = consumer.track;
      setRemoteStreams((prev) => {
          // إذا كان screen share، نستخدم key منفصل
          const streamKey = isScreenShare ? `${peerId}-screen` : peerId;
          const oldStream = prev[streamKey];
          const targetStream =
            oldStream ||
            (Platform.OS === "web"
              ? new window.MediaStream()
              : new MediaStream());

        // إزالة أي track من نفس النوع قبل الإضافة (تجنب التكرار)
          targetStream
            .getTracks()
          .filter((t) => t.kind === track.kind)
          .forEach((t) => targetStream.removeTrack(t));

        // إضافة الـ track الجديد
        targetStream.addTrack(track);

        const info = {
          videoTracks: targetStream.getVideoTracks().length,
          audioTracks: targetStream.getAudioTracks().length,
          trackId: track.id,
            trackKind: track.kind,
            isScreenShare,
        };
          logger.streamEvent(
            `Updated stream for ${streamKey}: video=${info.videoTracks}, audio=${info.audioTracks}, kind=${info.trackKind}, isScreenShare=${isScreenShare}`
          );

        // نعيد نفس كائن MediaStream لضمان ثبات srcObject وعدم إعادة التحميل
          return { ...prev, [streamKey]: targetStream };
      });

      logger.streamEvent(`Consumer created: ${consumer.id}`);
      
      return consumer;
    } catch (error) {
      logger.error(`Error consuming producer ${producerId}:`, error);
      throw error;
    }
    },
    [socket, roomId, createConsumerTransport]
  );

  /**
   * محاولة استهلاك مع fallback للكوديك عند عدم التوافق
   * تم تحسينه بإضافة exponential backoff و error code checking
   */
  const consumeWithTranscodingFallback = useCallback(
    async (peerId, producerId, currentRoomId, retryCount = 0) => {
      const maxRetries = RETRY_CONFIG.TRANSCODING_FALLBACK_RETRIES || 3;
      const baseDelay = TIMEOUTS.TRANSCODING_FALLBACK_BASE_DELAY || 1000;

      try {
      const result = await consume(peerId, producerId, currentRoomId);
      return result;
    } catch (error) {
        // التحقق من نوع الخطأ - نعيد المحاولة فقط للأخطاء المتعلقة بالكوديك
        const isCodecError =
          error.code === ERROR_CODES.CANNOT_CONSUME ||
          error.message?.includes("cannot consume") ||
          error.message?.includes("codec") ||
          error.message?.includes("not compatible");

        // إذا فشل الاستهلاك وكان transcoding مفعلاً وكان الخطأ متعلق بالكوديك
        if (transcodingEnabled && isCodecError && retryCount < maxRetries) {
          // Exponential backoff: تأخير متزايد مع كل محاولة
          const delay = baseDelay * Math.pow(2, retryCount); // 1s, 2s, 4s
          logger.warn(
            `Consume failed (codec error), attempting transcoding fallback (attempt ${retryCount + 1}/${maxRetries + 1})`,
            {
              peerId,
              producerId,
              error: error.message,
              delay: `${delay}ms`,
            }
          );

        // MediaSoup يقوم بالـ transcoding تلقائياً على السيرفر إذا لزم الأمر
          // نحن ننتظر قليلاً لإتاحة الوقت للسيرفر لتحويل الكوديك
          await new Promise((resolve) => setTimeout(resolve, delay));

          return consumeWithTranscodingFallback(
            peerId,
            producerId,
            currentRoomId,
            retryCount + 1
          );
        }

        // إذا لم يكن الخطأ متعلق بالكوديك أو تجاوزنا عدد المحاولات، نرمي الخطأ
        if (isCodecError && retryCount >= maxRetries) {
          logger.error(
            `Transcoding fallback failed after ${maxRetries + 1} attempts`,
            {
              peerId,
              producerId,
              error: error.message,
            }
          );
          throw createError(
            ERROR_CODES.CANNOT_CONSUME,
            `Failed to consume after transcoding fallback: ${error.message}`
          );
        }

        // للأخطاء الأخرى (غير codec)، نرمي الخطأ مباشرة
      throw error;
    }
    },
    [consume, transcodingEnabled]
  );
      
  /**
   * Helper: تنظيف userData قبل الإرسال للتأكد من صحة images[0].path
   */
  const sanitizeUserData = useCallback((userData) => {
    if (!userData) return userData;
    
    const sanitized = { ...userData };
    
    // ✅ تنظيف images array
    if (sanitized.images && Array.isArray(sanitized.images)) {
      sanitized.images = sanitized.images.map((img) => {
        if (!img) return null;
        
        // ✅ Handle both object format {path: "...", thumbnail: "..."} and string format
        let imagePath = null;
        if (typeof img === 'string') {
          imagePath = img.trim();
        } else if (typeof img === 'object' && img.path) {
          imagePath = typeof img.path === 'string' ? img.path.trim() : null;
        }
        
        // ✅ Accept both relative paths (starting with /) and absolute URIs (http:// or https://)
        // Relative paths will be combined with apiUrl in UserImage component
        if (imagePath && (imagePath.startsWith("/") || imagePath.startsWith("http://") || imagePath.startsWith("https://"))) {
          // ✅ Return properly formatted image object
          if (typeof img === 'string') {
            return { path: imagePath };
          } else {
            return {
              path: imagePath,
              ...(img.thumbnail ? { thumbnail: img.thumbnail } : {}),
            };
          }
        }
        
        // ✅ Invalid path - remove it
        logger.warn("Invalid image path, removing from userData", { path: imagePath, img });
        return null;
      }).filter((img) => img && img.path); // ✅ إزالة الصور التي لا تحتوي على path صالح
    }
    
    return sanitized;
  }, []);
      
  /**
   * Helper: Partial Cleanup عند فشل joinRoom جزئياً
   * ينظف فقط ما تم إنشاؤه حتى الآن
   * تم نقله هنا ليكون متاحاً قبل joinRoom
   */
  const partialCleanup = useCallback(
    async (stage, error, streamToCleanup = null) => {
    logger.error(`Partial cleanup at stage: ${stage}`, error);
    
    // Helper function للـ full cleanup (دون dependency على resetAll)
    const performFullCleanup = async () => {
      try {
        // إيقاف جميع producers
        producersRef.current.forEach((producer) => {
          try {
            if (!producer.closed) {
              producer.close();
            }
          } catch (e) {
              logger.error("Error closing producer:", e);
          }
        });
        producersRef.current.clear();

        // إيقاف جميع consumers
        consumersRef.current.forEach(({ consumer }) => {
          try {
            if (!consumer.closed) {
              consumer.close();
            }
          } catch (e) {
              logger.error("Error closing consumer:", e);
          }
        });
        consumersRef.current.clear();

        // إغلاق transports
        if (producerTransportRef.current) {
          try {
            producerTransportRef.current.close();
            producerTransportRef.current = null;
          } catch (e) {
              logger.error("Error closing producer transport:", e);
          }
        }

        consumerTransportsRef.current.forEach((transport) => {
          try {
            if (!transport.closed) {
              transport.close();
            }
          } catch (e) {
              logger.error("Error closing consumer transport:", e);
          }
        });
        consumerTransportsRef.current.clear();

        // إيقاف streams
        const streamToStop = streamToCleanup || localStream;
        if (streamToStop) {
          try {
            streamManager.stopMediaStream(streamToStop);
            setLocalStream(null);
          } catch (e) {
              logger.error("Error stopping stream:", e);
          }
      }

        // إغلاق device
          if (
            deviceRef.current &&
            typeof deviceRef.current.close === "function"
          ) {
          try {
            deviceRef.current.close();
            deviceRef.current = null;
          } catch (e) {
              logger.error("Error closing device:", e);
          }
        } else if (deviceRef.current) {
          // إذا كان device موجود لكن لا يحتوي على close، نقوم بإعادة تعيينه فقط
          deviceRef.current = null;
        }

        // إعادة تعيين state
        setRemoteStreams({});
        setPeers([]);
        setIsJoined(false);
        guardManager.resetAll();
      } catch (cleanupError) {
          logger.error("Error during full cleanup:", cleanupError);
      }
    };
    
    try {
      switch (stage) {
          case "after-join": {
          // تم joinRoom لكن فشل شيء بعدها
          // تنظيف stream إذا تم إنشاؤه
          if (streamToCleanup) {
            try {
              streamManager.stopMediaStream(streamToCleanup);
                logger.streamEvent(
                  "Local stream stopped during partial cleanup"
                );
            } catch (e) {
                logger.error("Error stopping local stream:", e);
            }
          }
          // إرسال leaveRoom notification للـ server
          if (roomId) {
            try {
                await withTimeout(
                  socket.emitWithAck("leaveRoom", {
                roomId,
                    userId: currentUser?._id || socket.id,
                  }),
                  10000,
                  "leaveRoom"
                );
            } catch (e) {
                logger.error("Error sending leaveRoom in partial cleanup:", e);
            }
          }
          break;
        }
        
          case "after-producer-transport": {
          // تم إنشاء producer transport لكن فشل produce
          // إغلاق producer transport
          if (producerTransportRef.current) {
            try {
              producerTransportRef.current.close();
              producerTransportRef.current = null;
                logger.deviceEvent(
                  "Producer transport closed during partial cleanup"
                );
            } catch (e) {
                logger.error("Error closing producer transport:", e);
            }
          }
          // إيقاف local stream
          const streamToStop = streamToCleanup || localStream;
          if (streamToStop) {
            try {
              streamManager.stopMediaStream(streamToStop);
              setLocalStream(null);
                logger.streamEvent(
                  "Local stream stopped during partial cleanup"
                );
            } catch (e) {
                logger.error("Error stopping local stream:", e);
            }
          }
          // إرسال leaveRoom
          if (roomId) {
            try {
                await withTimeout(
                  socket.emitWithAck("leaveRoom", {
                roomId,
                    userId: currentUser?._id || socket.id,
                  }),
                  10000,
                  "leaveRoom"
                );
            } catch (e) {
                logger.error("Error sending leaveRoom:", e);
            }
          }
          break;
        }
        
          case "after-produce": {
          // تم produce لكن فشل consume
          // إغلاق جميع producers
          producersRef.current.forEach((producer) => {
            try {
              if (!producer.closed) {
                producer.close();
              }
            } catch (e) {
                logger.error("Error closing producer during cleanup:", e);
            }
          });
          producersRef.current.clear();
          // إغلاق producer transport
          if (producerTransportRef.current) {
            try {
              producerTransportRef.current.close();
              producerTransportRef.current = null;
            } catch (e) {
                logger.error("Error closing producer transport:", e);
            }
          }
          // إيقاف local stream
          const streamToStop = streamToCleanup || localStream;
          if (streamToStop) {
            try {
              streamManager.stopMediaStream(streamToStop);
              setLocalStream(null);
            } catch (e) {
                logger.error("Error stopping local stream:", e);
            }
          }
          // إرسال leaveRoom
          if (roomId) {
            try {
                await withTimeout(
                  socket.emitWithAck("leaveRoom", {
                roomId,
                    userId: currentUser?._id || socket.id,
                  }),
                  10000,
                  "leaveRoom"
                );
            } catch (e) {
                logger.error("Error sending leaveRoom:", e);
            }
          }
          break;
        }
        
        default:
          // تنظيف كامل كـ fallback
            logger.warn("Unknown cleanup stage, performing full cleanup");
          await performFullCleanup();
      }
    } catch (cleanupError) {
        logger.error("Error during partial cleanup:", cleanupError);
      // في حالة فشل cleanup، ننفذ full cleanup كـ fallback
      await performFullCleanup();
    }
    },
    [socket, roomId, currentUser, localStream]
  );

  /**
   * 7. الانضمام للغرفة (Main Function)
   * تم نقله هنا ليكون متاحاً قبل startCall و resetAll
   */
  const joinRoom = useCallback(
    async ({
      roomId: newRoomId,
      userId,
      userData,
      isVideoCall = true,
      callIsVideo = isVideoCall,
      joinWithVideo = callIsVideo,
      isCaller: isCallerParam,
      role = "member",
    }) => {
    const stateMachine = callStateMachineRef.current;
      let currentStage = "initial"; // لتتبع المرحلة الحالية
    let localStreamCreated = null;
    
    try {
        // ✅ التحقق من صحة roomId قبل المتابعة
        if (!newRoomId) {
          logger.error("joinRoom: roomId is required but not provided");
          throw createError(ERROR_CODES.INVALID_INPUT, "Room ID is required");
        }

        // ✅ التحقق من أن roomId هو string صحيح
        const roomIdStr =
          typeof newRoomId === "string" ? newRoomId : String(newRoomId);
        if (!roomIdStr || roomIdStr.trim() === "") {
          logger.error("joinRoom: roomId is empty or invalid", {
            newRoomId,
            type: typeof newRoomId,
          });
          throw createError(ERROR_CODES.INVALID_INPUT, "Invalid room ID");
        }

        logger.roomEvent("joinRoom: Validating roomId", {
          roomId: roomIdStr,
          userId,
          isCaller: isCallerParam,
          isVideoCall,
          callIsVideo,
          joinWithVideo,
        });
        const resolvedCallIsVideo =
          typeof callIsVideo === "boolean" ? callIsVideo : Boolean(isVideoCall);
        const resolvedJoinWithVideo =
          typeof joinWithVideo === "boolean"
            ? joinWithVideo
            : resolvedCallIsVideo;
        let effectiveJoinWithVideo = resolvedJoinWithVideo;

      // منع استدعاء joinRoom عدة مرات في نفس الوقت (Guard Manager)
      if (!guardManager.canJoin()) {
          logger.warn("Already joining a room, ignoring duplicate call");
        throw createError(
          ERROR_CODES.INVALID_STATE,
          "Join already in progress, please wait"
        );
      }
      
      // التحقق من إمكانية الانضمام (FSM)
        const currentState = stateMachine.getState();

        // إذا كانت الحالة IDLE، نحتاج إلى الانتقال إلى INVITING أولاً
        if (currentState === CALL_STATES.IDLE) {
          logger.roomEvent("State is IDLE, transitioning to INVITING first", {
            currentState,
            role,
          });
          if (stateMachine.canTransition(CALL_EVENTS.START_CALL)) {
            stateMachine.transition(CALL_EVENTS.START_CALL, {
              roomId: newRoomId,
              userId,
              userData,
              isVideoCall: resolvedCallIsVideo,
            });
            logger.roomEvent("Transitioned to INVITING", {
              newState: stateMachine.getState(),
            });
          } else {
            logger.error("Cannot transition from IDLE to INVITING");
            throw createError(
              ERROR_CODES.INVALID_STATE,
              `Cannot transition from IDLE state`
            );
          }
        }

        // التحقق من إمكانية الانضمام بعد الانتقال
      if (!stateMachine.canTransition(CALL_EVENTS.JOIN_ROOM)) {
          const blockedState = stateMachine.getState();
          logger.warn("Cannot join room in current state, trying recovery", {
            blockedState,
            roomId: roomIdStr,
          });

          // Recovery: after reject/leave race, FSM can remain in a stale state
          // while the user still wants to join an ongoing call from rejoin modal.
          stateMachine.reset();
          if (stateMachine.canTransition(CALL_EVENTS.START_CALL)) {
            stateMachine.transition(CALL_EVENTS.START_CALL, {
              roomId: roomIdStr,
              userId,
              userData,
              isVideoCall: resolvedCallIsVideo,
            });
          }

          if (!stateMachine.canTransition(CALL_EVENTS.JOIN_ROOM)) {
            logger.warn("Cannot join room - invalid state after recovery", {
              blockedState,
              recoveredState: stateMachine.getState(),
              roomId: roomIdStr,
            });
            throw createError(
              ERROR_CODES.INVALID_STATE,
              `Cannot join room in ${blockedState} state`
            );
          }
      }
      
      guardManager.setJoining(true);
        logger.roomEvent("Joining room", newRoomId);
      
      // الانتقال إلى حالة JOINING
        stateMachine.transition(CALL_EVENTS.JOIN_ROOM, {
          roomId: newRoomId,
          userId,
          userData,
          isVideoCall: resolvedCallIsVideo,
        });

        // حفظ نوع المكالمة
        isVideoCallRef.current = resolvedCallIsVideo;
        setIsVideoCall(resolvedCallIsVideo); // ✅ تحديث state أيضاً
      
      // نعيد تهيئة حالة الخروج عند الانضمام لغرفة جديدة
      guardManager.resetForNewRoom();
      setRoomId(newRoomId);

      // 1. الحصول على RTP Capabilities مع timeout و retry
        currentStage = "rtp-capabilities";
        const getRtpCapabilities = () =>
          socket.emitWithAck("getRouterRtpCapabilities", { roomId: newRoomId });
        const {
          success: capsSuccess,
          rtpCapabilities,
          error: capsError,
        } = await withRetry(
          () =>
            withTimeout(
              getRtpCapabilities(),
              TIMEOUTS.GET_RTP_CAPABILITIES_TIMEOUT,
              "getRouterRtpCapabilities"
            ),
          RETRY_CONFIG.GET_RTP_CAPABILITIES_RETRIES,
          TIMEOUTS.INITIAL_RETRY_DELAY * 2, // start with 2s delay
          "getRouterRtpCapabilities"
        );

      if (!capsSuccess) {
        throw createError(ERROR_CODES.NETWORK_ERROR, capsError);
      }

      // 2. تهيئة Device
        currentStage = "device-init";
      await initializeDevice(rtpCapabilities);

      // 3. الانضمام للغرفة مع timeout و retry
        currentStage = "join-room";
        // استخدام isCallerParam إذا كان متوفراً، وإلا استخدم isCaller من state
        const callerFlag =
          isCallerParam !== undefined ? isCallerParam : isCaller;
        // ✅ تنظيف userData قبل الإرسال
        const sanitizedUserData = sanitizeUserData(userData);
        
        const joinRoomRequest = () => {
          const emittedJoinIsVideoCall =
            typeof resolvedCallIsVideo === "boolean"
              ? resolvedCallIsVideo
              : true;
          const requestId =
            joinRequestIdRef.current ||
            `${socket?.id || "socket"}-${Date.now()}-${Math.random()
              .toString(36)
              .slice(2, 8)}`;
          joinRequestIdRef.current = requestId;
          return socket.emitWithAck("joinRoom", {
            roomId: newRoomId,
            userId,
            userData: sanitizedUserData,
            isCaller: callerFlag, // معرفة إذا كان المتصل أو المستجيب
            isVideoCall: emittedJoinIsVideoCall, // نوع المكالمة
            role: role, // ✅ إضافة role (member/broadcaster/viewer)
            joinRequestId: requestId,
          });
        };
        const {
          success: joinSuccess,
          peers: existingPeers,
          callId: returnedCallId,
          startedAt: returnedStartedAt,
          callSettings: returnedCallSettings, // ✅ استقبال callSettings من السيرفر
          callAdmins: returnedCallAdmins, // ✅ استقبال callAdmins من السيرفر
          error: joinError,
        } = await withTimeout(
          joinRoomRequest(),
          TIMEOUTS.JOIN_ROOM_TIMEOUT,
          "joinRoom"
        );

        // ✅ Update active call ID from response
        if (returnedCallId) {
          setActiveCallId(returnedCallId);
          activeCallIdRef.current = returnedCallId;
          logger.debug("Active call ID set:", returnedCallId);
        } else {
          setActiveCallId(null);
          activeCallIdRef.current = null;
        }
        
        // ✅ Store callSettings for mediasoup-call.js
        if (returnedCallSettings) {
          initialCallSettingsRef.current = returnedCallSettings;
          setInitialCallSettings(returnedCallSettings);
          logger.callEvent("Initial call settings stored", { callSettings: returnedCallSettings });
        }
        
        // ✅ Store callAdmins for mediasoup-call.js
        if (returnedCallAdmins) {
          initialCallAdminsRef.current = returnedCallAdmins;
          setInitialCallAdmins(returnedCallAdmins);
          logger.callEvent("Initial call admins stored", { callAdmins: returnedCallAdmins });
        }

      if (!joinSuccess) {
        throw createError(ERROR_CODES.NETWORK_ERROR, joinError);
      }
      joinRequestIdRef.current = null;

        // ✅ حفظ callId من callback
        if (returnedCallId) {
          setCallId(returnedCallId);
          logger.callEvent("Call ID received from joinRoom", {
            callId: returnedCallId,
          });
        }

        // ✅ إعادة تعيين حالة التسجيل عند بدء مكالمة جديدة
        setIsRecording(false);
        setRecordingId(null);

      // إزالة التكرارات وتجاهل نفسي إن وجد
      // إضافة metadata افتراضي إذا لم يكن موجوداً
        const uniquePeers = Array.from(
          new Map(
            (existingPeers || []).map((p) => [
              p.peerId,
              {
        ...p,
                metadata: p.metadata || {
                  isAudioEnabled: true,
                  isVideoEnabled: true,
                  isScreenSharing: false,
                },
              },
            ])
          ).values()
        ).filter((p) => p.peerId !== socket.id);
      setPeers(uniquePeers);

        // ✅ حفظ role الحالي في ref
        currentRoleRef.current = role;
        setCurrentRole(role); // ✅ تحديث state أيضاً

        // ✅ Call-Chat Integration: تحديث Redux room state عند الانضمام للمكالمة
        try {
          const callChatIntegration = callChatIntegrationRef.current;
          callChatIntegration.handleCallStarted({
            roomId: newRoomId,
            callId: returnedCallId || null,
            isVideoCall: resolvedCallIsVideo,
            participants: uniquePeers.map((p) => ({
              userId: p.metadata?.userId || p.peerId,
              userData: p.metadata?.userData,
            })),
            startedAt: returnedStartedAt || null,
          });
          logger.callEvent("Call-Chat integration: call started", {
            roomId: newRoomId,
            startedAt: returnedStartedAt || null,
          });
        } catch (error) {
          logger.error("Error updating Call-Chat integration:", error);
        }

        // ✅ إذا كان viewer، نتخطى produce (viewers لا يمكنهم إرسال media)
        logger.roomEvent("Checking role before produce", {
          role,
          roomId: newRoomId,
          roleType: typeof role,
        });
        if (role === "viewer") {
          logger.roomEvent(
            "✅ Joining as viewer - skipping produce and producer transport",
            { roomId: newRoomId, role }
          );
          // Viewers فقط يستهلكون media من الآخرين
          // لا نحتاج local stream أو producer transport للـ viewers
          // ✅ تنظيف localStream إذا كان موجوداً من قبل (من مكالمة سابقة)
          if (localStream) {
            try {
              localStream.getTracks().forEach((track) => {
                track.stop();
              });
              setLocalStream(null);
              logger.roomEvent("Cleaned up existing localStream for viewer", {
                roomId: newRoomId,
              });
            } catch (e) {
              logger.error("Error cleaning up localStream for viewer:", e);
            }
          }
        } else {
          logger.roomEvent("Joining as broadcaster/member - will produce", {
            roomId: newRoomId,
            role,
          });
          // 4. الحصول على Media Stream المحلي (للمشاركين فقط)
          currentStage = "get-stream";
      const stream = await getLocalStream(effectiveJoinWithVideo);
      localStreamCreated = stream;
      setIsAudioEnabled(stream.getAudioTracks().length > 0);
      setIsVideoEnabled(stream.getVideoTracks().length > 0);
      const joinedWithVideoTrack = stream.getVideoTracks().length > 0;
      if (effectiveJoinWithVideo && !joinedWithVideoTrack) {
        effectiveJoinWithVideo = false;
        dispatch(
          addAlert({
            type: "warning",
            title: tSafe("call.callAction", "Call"),
            message: tSafe(
              "call.videoUnavailableAcceptedAudio",
              "No camera detected, joined as audio call."
            ),
          })
        );
      }

      // 5. إنشاء Producer Transport مع timeout
          currentStage = "create-producer-transport";
      try {
        await withTimeout(
          createProducerTransport(newRoomId),
              TIMEOUTS.CREATE_TRANSPORT_TIMEOUT,
              "createProducerTransport"
        );
      } catch (error) {
        // تنظيف جزئي: stream created لكن transport failed
            await partialCleanup("after-join", error, stream);
        throw error;
      }

      // 6. بدء الإنتاج مع timeout
          currentStage = "produce";
      try {
        await withTimeout(
          produce(stream),
              TIMEOUTS.PRODUCE_TIMEOUT,
              "produce"
        );
      } catch (error) {
        // تنظيف جزئي: transport created لكن produce failed
            await partialCleanup("after-producer-transport", error, stream);
        throw error;
          }
      }

        // 7. ✅ استهلاك Media من الأعضاء الموجودين (Lazy Consumer Creation)
        // ننشئ consumers فقط للـ producers النشطة (audio/video) وليس screen share إلا عند الحاجة
        currentStage = "consume";
      const consumeErrors = [];

        // ✅ Lazy Consumer Creation: ننشئ consumers فقط للـ producers النشطة
        logger.roomEvent("🔍 [DEBUG] Starting to consume from existing peers", {
          totalPeers: existingPeers.length,
          peers: existingPeers.map(p => ({
            peerId: p.peerId,
            producerIds: p.producerIds || [],
            producerCount: (p.producerIds || []).length,
          })),
        });
        
      for (const peer of existingPeers) {
        logger.roomEvent(`🔍 [DEBUG] Processing peer ${peer.peerId}`, {
          producerIds: peer.producerIds || [],
          metadata: peer.metadata,
        });
        
        for (const producerId of peer.producerIds || []) {
          try {
              // ✅ التحقق من نوع الـ producer قبل إنشاء consumer
              // ننشئ consumers فقط للـ audio/video الأساسي
              // screen share سيتم إنشاؤه عند newProducer event
              const isScreenShare = peer.metadata?.isScreenSharing === true;

              // ✅ للمشاهدين: ننشئ consumers فقط للـ producers النشطة
              // نتحقق من أن producer نشط (يوجد في producerIds)
              if (isScreenShare) {
                // Screen share: نؤجل إنشاء consumer حتى يظهر newProducer event
                logger.streamEvent(
                  `Deferring screen share consumer creation for ${producerId}`,
                  { peerId: peer.peerId }
                );
                continue;
              }

              logger.roomEvent(`🔍 [DEBUG] Consuming producer ${producerId} from peer ${peer.peerId}`);
              // ✅ إنشاء consumer للـ audio/video الأساسي
              await consume(peer.peerId, producerId, newRoomId, false);
          } catch (error) {
              logger.error(
                `Error consuming producer ${producerId} from peer ${peer.peerId}:`,
                error
              );
            consumeErrors.push({ peerId: peer.peerId, producerId, error });
            // نكمل مع باقي الـ consumers حتى لو فشل بعضها
          }
        }
      }
      
      // إذا فشل جميع الـ consumes، نعتبر هذا خطأ خطير
      if (consumeErrors.length > 0 && existingPeers.length > 0) {
          const allFailed =
            consumeErrors.length ===
            existingPeers.reduce(
              (sum, p) => sum + (p.producerIds?.length || 0),
              0
            );
        if (allFailed) {
            await partialCleanup(
              "after-produce",
              new Error("All consumers failed")
            );
            throw createError(
              ERROR_CODES.NETWORK_ERROR,
              "Failed to consume media from peers"
            );
        } else {
            logger.warn(
              `Some consumers failed: ${consumeErrors.length} errors`,
              consumeErrors
            );
        }
      }

      setIsJoined(true);
        logger.roomEvent("Successfully joined room", { role });
      
        // ✅ تحديث بيانات الغرفة للحصول على أحدث liveStreamSettings
        // هذا يضمن أن جميع المستخدمين لديهم نفس البيانات
        if (socket && newRoomId) {
          socket.emit("getOneRoom", { room: newRoomId, update: true });
        }
      
        // بدء مراقبة Bandwidth تلقائياً (للمشاركين فقط)
        if (role !== "viewer") {
      startBandwidthMonitoring();
        }

        // الانتقال إلى حالة PRODUCING بعد إنشاء الـ producers (للمشاركين فقط)
        if (role !== "viewer") {
          if (stateMachine.canTransition(CALL_EVENTS.PRODUCER_CREATED)) {
            stateMachine.transition(CALL_EVENTS.PRODUCER_CREATED, {
              roomId: newRoomId,
            });
          }
        } else {
          // Viewers ينتقلون مباشرة إلى حالة CONSUMING
          // فقط إذا كان هناك consumers تم إنشاؤها
          if (
            existingPeers.length > 0 &&
            stateMachine.canTransition(CALL_EVENTS.CONSUMER_CREATED)
          ) {
            stateMachine.transition(CALL_EVENTS.CONSUMER_CREATED, {
              roomId: newRoomId,
            });
          } else if (stateMachine.canTransition(CALL_EVENTS.PEER_JOINED)) {
            // إذا لم يكن هناك peers، نستخدم PEER_JOINED للانتقال
            stateMachine.transition(CALL_EVENTS.PEER_JOINED, {
              roomId: newRoomId,
            });
          }
        }
    } catch (error) {
      joinRequestIdRef.current = null;
      logger.error(`Error joining room at stage: ${currentStage}`, error);
      const normalizedError = normalizeError(error);
      
      // إيقاف مراقبة Bandwidth في حالة الخطأ
      stopBandwidthMonitoring();
      
      // تنظيف جزئي حسب المرحلة
        if (
          currentStage === "after-join" ||
          currentStage === "create-producer-transport" ||
          currentStage === "produce" ||
          currentStage === "consume"
        ) {
        // تم تنظيف جزئي بالفعل في catch blocks
      } else {
        // تنظيف كامل كـ fallback - نستخدم partialCleanup مع stage default
          await partialCleanup("unknown", error, localStreamCreated);
      }
      
      // الانتقال إلى حالة الخطأ
        stateMachine.transition(CALL_EVENTS.ERROR_OCCURRED, {
          error: normalizedError.message,
        });
      throw normalizedError;
    } finally {
      guardManager.setJoining(false);
    }
    },
    [
      socket,
      initializeDevice,
      getLocalStream,
      createProducerTransport,
      produce,
      consume,
      withTimeout,
      withRetry,
      isCaller,
      partialCleanup,
      startBandwidthMonitoring,
      stopBandwidthMonitoring,
      localStream,
      dispatch,
      tSafe,
    ]
  );

  /**
   * إعادة تعيين شامل لجميع الحالات والموارد
   * تستخدم عند انتهاء المكالمة أو عند حدوث خطأ
   * تم نقله هنا ليكون متاحاً قبل startCall
   */
  const resetAll = useCallback(
    async (skipIfJoined = false) => {
      try {
        // ✅ إذا كان skipIfJoined = true و isJoined = true، لا نعيد تعيين state
        if (skipIfJoined && isJoined) {
          logger.callEvent("Skipping resetAll - user is joined", {
            isJoined,
            role: currentRoleRef.current,
          });
          return;
        }

        logger.callEvent("Starting comprehensive reset...");

      // 1. إيقاف جميع MediaStreams
      if (localStream) {
          logger.streamEvent("Stopping local stream...");
        streamManager.stopMediaStream(localStream);
        setLocalStream(null);
      }

      // 2. إيقاف جميع Remote Streams
      if (Object.keys(remoteStreams).length > 0) {
          logger.streamEvent("Stopping remote streams...");
          Object.values(remoteStreams).forEach((stream) => {
          if (stream) {
            streamManager.stopMediaStream(stream);
          }
        });
        setRemoteStreams({});
      }

        // 2.1. إيقاف Screen Share Stream
        if (screenStream) {
          logger.streamEvent("Stopping screen share stream...");
          streamManager.stopMediaStream(screenStream);
          setScreenStream(null);
      }

      // 3. إيقاف جميع Producers
      if (producersRef.current.size > 0) {
          logger.streamEvent("Stopping producers...");
          producersRef.current.forEach((producer) => {
          if (producer && !producer.closed) {
            producer.close();
    }
        });
        producersRef.current.clear();
      }

        // 3.1. إيقاف Screen Share Producer
        if (screenProducerRef.current) {
          logger.streamEvent("Stopping screen share producer...");
          try {
            if (!screenProducerRef.current.closed) {
              screenProducerRef.current.close();
            }
          } catch (error) {
            logger.error("Error closing screen producer:", error);
          }
          screenProducerRef.current = null;
      }

      // 4. إيقاف جميع Consumers
      if (consumersRef.current.size > 0) {
          logger.streamEvent("Stopping consumers...");
        consumersRef.current.forEach(({ consumer }) => {
          if (consumer && !consumer.closed) {
            consumer.close();
          }
        });
        consumersRef.current.clear();
      }

      // 5. إيقاف جميع Transports
      if (producerTransportRef.current) {
          logger.streamEvent("Stopping producer transport...");
        producerTransportRef.current.close();
        producerTransportRef.current = null;
      }

      if (consumerTransportsRef.current.size > 0) {
          logger.streamEvent("Stopping consumer transports...");
          consumerTransportsRef.current.forEach((transport) => {
          if (transport && !transport.closed) {
            transport.close();
          }
        });
        consumerTransportsRef.current.clear();
      }

      // 6. إيقاف Mediasoup Device
      if (deviceRef.current) {
          logger.deviceEvent("Stopping mediasoup device...");
          if (typeof deviceRef.current.close === "function") {
          try {
            deviceRef.current.close();
          } catch (error) {
              logger.error("Error closing device:", error);
          }
        }
        deviceRef.current = null;
      }

      // 7. إعادة تعيين جميع الحالات
      // إيقاف مراقبة Bandwidth
      stopBandwidthMonitoring();
      
        // ✅ تنظيف Dynamic Layer Selection history
        networkQualityHistoryRef.current = [];
        qualityScoreHistoryRef.current = [];
        currentLayerRef.current = {
          spatial: VIDEO_QUALITY.LAYER_HIGH,
          temporal: 2,
        };
        layerChangeTimestampRef.current = Date.now();

        // ✅ تنظيف جميع refs لتجنب memory leaks
        consumedProducerIdsRef.current.clear();

        logger.callEvent("Resetting all states...");
      setRoomId(null);
      setIsJoined(false);
      setIsCaller(false);
      setIncomingCall(null);
        setCallStatus(null); // ✅ تنظيف حالة المكالمة (يتم تنظيفه دائماً هنا)
        setIsVideoCall(true); // ✅ إعادة تعيين نوع المكالمة إلى الافتراضي
      setPeers([]);
      setMediaError(null);
      setDeviceError(null);
        setCurrentVideoQuality("high"); // إعادة تعيين جودة الفيديو
        setIsAudioEnabled(true); // إعادة تعيين حالة المايك إلى مفعّل
        setIsVideoEnabled(true); // إعادة تعيين حالة الكاميرا إلى مفعّل
        setIsScreenSharing(false); // إعادة تعيين حالة مشاركة الشاشة
        setScreenStream(null); // إعادة تعيين stream مشاركة الشاشة
        // ✅ تنظيف Call Waiting state
        setWaitingCall(null);
        setIsCallOnHold(false);
        setHeldCallInfo(null);
        // ✅ تنظيف Raise Hand state
        setRaisedHands(new Set());
        
        // ✅ تنظيف Missed Call timeout
        if (missedCallTimeoutRef.current) {
          clearTimeout(missedCallTimeoutRef.current);
          missedCallTimeoutRef.current = null;
        }

      // 8. إعادة تعيين Guard Manager
        logger.callEvent("Resetting guard manager...");
      guardManager.resetAll();

      // 9. إعادة تعيين Race Condition Refs
        logger.callEvent("Resetting race condition refs...");
      cancelledCallsRef.current.clear();
      rejectedBySetRef.current.clear();
      clearAllRejectedParticipants();
      recipientsCountRef.current = 0;
      peersJoinedCountRef.current = 0;
      isLeavingDueToRejectionRef.current = false;

      // 10. إعادة تعيين FSM إلى الحالة الأولية
        logger.callEvent("Resetting FSM to idle state...");
      const stateMachine = callStateMachineRef.current;
      stateMachine.reset();

      // 11. إعادة تعيين Device States (اختياري - يمكن الاحتفاظ بها)
      // setHasAudio(false);
      // setHasVideo(false);
      // setAudioPermission(null);
      // setVideoPermission(null);

        logger.callEvent("Comprehensive reset completed successfully");
    } catch (error) {
        logger.error("Error during comprehensive reset:", error);
      // حتى لو فشل الـ reset، نحاول إعادة تعيين الحالات الأساسية
      setRoomId(null);
      setIsJoined(false);
      setIsCaller(false);
      setIncomingCall(null);
      setPeers([]);
      setMediaError(null);
      setDeviceError(null);
        setIsAudioEnabled(true); // إعادة تعيين حالة المايك إلى مفعّل
        setIsVideoEnabled(true); // إعادة تعيين حالة الكاميرا إلى مفعّل
        setIsScreenSharing(false); // إعادة تعيين حالة مشاركة الشاشة
        setScreenStream(null); // إعادة تعيين stream مشاركة الشاشة
      guardManager.resetAll();
    }
    },
    [
      localStream,
      remoteStreams,
      screenStream,
      guardManager,
      isJoined,
      currentRoleRef,
      stopBandwidthMonitoring,
      clearAllRejectedParticipants,
    ]
  );

  /**
   * 6.5. بدء مكالمة (إرسال إشعار للطرف الآخر)
   */
  const startCall = useCallback(
    async ({ roomId: targetRoomId, userId, userData, isVideoCall = true }) => {
      try {
        // ✅ التحقق من صحة roomId قبل المتابعة
        if (!targetRoomId) {
          logger.error("startCall: roomId is required but not provided");
          throw createError(ERROR_CODES.INVALID_INPUT, "Room ID is required");
        }

        // ✅ التحقق من أن roomId هو string صحيح
        const roomIdStr =
          typeof targetRoomId === "string"
            ? targetRoomId
            : String(targetRoomId);
        if (!roomIdStr || roomIdStr.trim() === "") {
          logger.error("startCall: roomId is empty or invalid", {
            targetRoomId,
            type: typeof targetRoomId,
          });
          throw createError(ERROR_CODES.INVALID_INPUT, "Invalid room ID");
        }

      const stateMachine = callStateMachineRef.current;
      
      // التحقق من إمكانية بدء المكالمة (FSM + Guard)
      if (!stateMachine.canTransition(CALL_EVENTS.START_CALL)) {
          logger.warn(
            "Cannot start call - invalid state:",
            stateMachine.getState()
          );
          throw createError(
            ERROR_CODES.INVALID_STATE,
            `Cannot start call in ${stateMachine.getState()} state`
          );
      }

      if (!guardManager.canStartCall()) {
          logger.warn("Cannot start call - operation in progress");
          throw createError(
            ERROR_CODES.OPERATION_FAILED,
            "Cannot start call - another operation is in progress"
          );
        }

        logger.callEvent("Starting call to room", {
          roomId: roomIdStr,
          userId,
          isVideoCall,
        });
      
      // طلب الأذونات قبل بدء المكالمة (Pre-call permissions)
        if (Platform.OS === "web") {
          logger.callEvent("Requesting device permissions before call...");
        const permissions = await requestDevicePermissionsWithRetry(2);
        
        if (!permissions.audio && !permissions.video) {
            throw createError(
              ERROR_CODES.DEVICE_PERMISSION_DENIED,
              "Device permissions denied. Please allow access to microphone and/or camera."
            );
        }
        
        // كشف الأجهزة بعد الحصول على الأذونات
        await detectDevices();
        
          logger.callEvent("Permissions granted:", {
            audio: permissions.audio,
            video: permissions.video,
          });
      }
      
      // ✅ تنظيف userData قبل الاستخدام
      const sanitizedUserData = sanitizeUserData(userData);
      
      // الانتقال إلى حالة INVITING
        stateMachine.transition(CALL_EVENTS.START_CALL, {
          roomId: roomIdStr,
          userId,
          userData: sanitizedUserData,
          isVideoCall,
        });

        // ✅ تعيين حالة "جار الاتصال" عند بدء المكالمة
        setCallStatus("connecting");

        // ✅ تحديث نوع المكالمة
        setIsVideoCall(isVideoCall);
        isVideoCallRef.current = isVideoCall;
      
      // إرسال إشعار للطرف الآخر

        socket.emit("callRequest", {
          roomId: roomIdStr,
        callerId: userId,
          callerData: sanitizedUserData,
        isVideoCall,
      });
        logger.callEvent("callRequest event sent successfully");
      // إعادة ضبط عدّادات المجموعة عند بدء الاتصال
      recipientsCountRef.current = 0;
      rejectedBySetRef.current.clear();
      clearRejectedParticipantsForRoom(roomIdStr);
      setIsCaller(true);
      
      // تعيين المتصل كـ caller
      setIsCaller(true);
        // ✅ استخدام roomIdStr بدلاً من targetRoomId للاتساق
      // الانضمام مباشرة
        await joinRoom({
          roomId: roomIdStr,
          userId,
          userData,
          isVideoCall,
          callIsVideo: isVideoCall,
          joinWithVideo: isVideoCall,
          isCaller: true,
        });
    } catch (error) {
        logger.error("Error starting call:", error);
      const normalizedError = normalizeError(error);
      // الانتقال إلى حالة الخطأ
        callStateMachineRef.current.transition(CALL_EVENTS.ERROR_OCCURRED, {
          error: normalizedError.message,
        });
      await resetAll(); // تنظيف شامل عند الخطأ
      throw normalizedError;
    }
    },
    [
      socket,
      resetAll,
      joinRoom,
      requestDevicePermissionsWithRetry,
      detectDevices,
      clearRejectedParticipantsForRoom,
    ]
  );

  /**
   * 8. مغادرة الغرفة
   */
  const leaveRoom = useCallback(async () => {
    const stateMachine = callStateMachineRef.current;
    const stateBeforeLeave = stateMachine.getState();
    
    // منع استدعاءات متعددة (Guard Manager)
    if (!guardManager.canLeave()) {
      logger.warn("Cannot leave room - operation in progress or already left");
      return;
    }
    
    // التحقق من إمكانية المغادرة (FSM)
    const canLeaveTransition = stateMachine.canTransition(CALL_EVENTS.LEAVE_ROOM);
    const shouldForceLeaveFromErrorState =
      !canLeaveTransition && stateBeforeLeave === CALL_STATES.ERROR;
    if (!canLeaveTransition && !shouldForceLeaveFromErrorState) {
      logger.warn(
        "Cannot leave room - invalid state:",
        stateMachine.getState()
      );
      const error = createError(
        ERROR_CODES.INVALID_STATE,
        `Cannot leave room in ${stateMachine.getState()} state`
      );
      throw error;
    }
    
    guardManager.setLeaving(true);
    
    try {
      logger.roomEvent("Leaving room...");
      
      // إيقاف مراقبة Bandwidth
      stopBandwidthMonitoring();
      
      // الانتقال إلى حالة LEAVING (أو تخطيه عند forced cleanup من ERROR)
      if (canLeaveTransition) {
        stateMachine.transition(CALL_EVENTS.LEAVE_ROOM, { roomId });
      }

      // إيقاف جميع producers
      producersRef.current.forEach((producer) => {
        producer.close();
      });
      producersRef.current.clear();

      // إيقاف جميع consumers
      consumersRef.current.forEach(({ consumer }) => {
        consumer.close();
      });
      consumersRef.current.clear();

      // إغلاق transports
      if (producerTransportRef.current) {
        producerTransportRef.current.close();
        producerTransportRef.current = null;
      }

      consumerTransportsRef.current.forEach((transport) => {
        transport.close();
      });
      consumerTransportsRef.current.clear();

      // ✅ إيقاف Screen Share أولاً (إذا كان نشطاً)
      if (screenProducerRef.current) {
        logger.streamEvent("Stopping screen share producer before leaving...");
        try {
          // إرسال event للباك اند لإغلاق producer
          if (roomId && socket?.connected) {
            try {
              await withTimeout(
                socket.emitWithAck("closeProducer", {
                  roomId,
                  producerId: screenProducerRef.current.id,
                }),
                5000,
                "closeProducer"
              );
              logger.streamEvent("Screen share producer closed on server");
            } catch (error) {
              logger.error("Error closing screen producer on server:", error);
            }
          }

          // Close producer locally
          if (!screenProducerRef.current.closed) {
            screenProducerRef.current.close();
          }
          screenProducerRef.current = null;
        } catch (error) {
          logger.error("Error stopping screen share producer:", error);
        }
      }

      // ✅ إيقاف screen stream
      if (screenStream) {
        try {
          screenStream.getTracks().forEach((track) => {
            track.stop();
            track.enabled = false;
          });
          streamManager.stopMediaStream(screenStream);
          setScreenStream(null);
          setIsScreenSharing(false);
          logger.streamEvent("Screen stream stopped and cleared");
        } catch (error) {
          logger.error("Error stopping screen stream:", error);
        }
      }

      // إيقاف local stream
      if (localStream) {
        // استخدام Stream Manager لإيقاف الـ stream
        streamManager.stopMediaStream(localStream);
        setLocalStream(null);
        logger.streamEvent("Local stream stopped and cleared");
      }

      // إخبار السيرفر وإلغاء المكالمة الواردة
      if (roomId) {
        logger.roomEvent("Sending leave notification...", {
          roomId,
          socketConnected: socket?.connected,
          socketId: socket?.id,
          peersCount: peers.length,
          isLeavingDueToRejection:
            guardManagerRef.current.isLeavingDueToRejection,
        });
        
        try {
          // ✅ Viewers لا يرسلون callCancelled أبداً - فقط broadcasters/members
          const isViewer = currentRoleRef.current === "viewer";
          const roomSnapshot = (Array.isArray(rooms) ? rooms : []).find(
            (entry) => entry?._id === roomId
          );
          const hasAnsweredSnapshot = !!roomSnapshot?.activeCallStartedAt;
          const isPreAnswerCallerState =
            isCaller &&
            (callStatus === "connecting" ||
              callStatus === "queued" ||
              callStatus === "ringing" ||
              stateBeforeLeave === CALL_STATES.INVITING ||
              stateBeforeLeave === CALL_STATES.JOINING ||
              stateBeforeLeave === CALL_STATES.PRODUCING);

          if (isViewer) {
            logger.callEvent("Viewer leaving - not sending callCancelled", {
              roomId,
              role: currentRoleRef.current,
            });
          } else {
          // إرسال callCancelled فقط إذا لم ينضم أحد بعد (المتصل يلغي قبل الرد)
          // أي: لا يوجد peers آخرين في المكالمة
          // ولكن ليس إذا كنا نغادر بسبب الرفض (callRejected)
            const anyPeerJoined =
              peersJoinedCountRef.current > 0 || peers.length > 0;
            logger.roomEvent("Leave decision:", {
            peersLength: peers.length,
            peersJoinedCount: peersJoinedCountRef.current,
            anyPeerJoined,
              hasAnsweredSnapshot,
              isCaller,
              callStatus,
              stateBeforeLeave,
              isPreAnswerCallerState,
              isLeavingDueToRejection:
                guardManagerRef.current.isLeavingDueToRejection,
              roomId,
              role: currentRoleRef.current,
            });

            if (
              isPreAnswerCallerState &&
              !anyPeerJoined &&
              !hasAnsweredSnapshot &&
              !guardManagerRef.current.isLeavingDueToRejection
            ) {
              logger.callEvent(
                "No peers joined yet - sending call cancellation"
              );
              socket.emit("callCancelled", { roomId });
              logger.callEvent(
                "Call cancelled notification sent to room",
                roomId
              );
          } else if (guardManagerRef.current.isLeavingDueToRejection) {
              logger.callEvent(
                "Leaving due to rejection - not sending cancellation"
              );
          } else {
              logger.callEvent(
                "Peers exist - just leaving, not cancelling for everyone"
              );
            }
          }
          
          await withTimeout(
            socket.emitWithAck("leaveRoom", {
          roomId,
              userId: currentUser?._id || socket.id,
            }),
            10000,
            "leaveRoom"
          );
          logger.callEvent("leaveRoom acknowledged");
        } catch (error) {
          logger.error("Error sending leave notification:", error);
        }
      } else {
        logger.warn("No roomId to send leave notification");
      }

      // ✅ تنظيف callStatus مباشرة قبل resetAll (لضمان التنظيف الفوري)
      if (isCaller) {
        setCallStatus(null);
      }

      // ✅ تنظيف remote streams بشكل صريح (خاصة screen share streams)
      setRemoteStreams((prev) => {
        const updated = { ...prev };
        // إيقاف جميع streams بما فيها screen share
        Object.entries(updated).forEach(([key, stream]) => {
          if (stream) {
            try {
              stream.getTracks().forEach((track) => {
                track.stop();
                track.enabled = false;
              });
        } catch (error) {
              logger.error(`Error stopping tracks in stream ${key}:`, error);
            }
          }
        });
        return {};
      });

      // ✅ إيقاف التسجيل إذا كان نشطاً
      if (isRecording && callId && socket?.connected) {
        logger.callEvent("Stopping recording before leaving room...", {
          callId,
          recordingId,
        });
        try {
          const result = await withTimeout(
            socket.emitWithAck("stopCallRecording", { callId }),
            5000,
            "stopCallRecording"
          );
          if (result && result.success) {
            setIsRecording(false);
            setRecordingId(null);
            logger.callEvent("Recording stopped successfully before leaving");
      } else {
            logger.warn(
              "Failed to stop recording before leaving:",
              result?.error
            );
          }
        } catch (error) {
          logger.error("Error stopping recording before leaving:", error);
          // نستمر حتى لو فشل إيقاف التسجيل
        }
      }

      // تنظيف state
      // تنظيف شامل عند المغادرة
      await resetAll();
      
      // تنظيف incoming call
      setIncomingCall(null);

      logger.roomEvent("Room left and all streams stopped");

      logger.roomEvent("Left room successfully");
      
      // الانتقال إلى حالة IDLE بعد المغادرة الناجحة
      stateMachine.transition(CALL_EVENTS.RESET);
    } catch (error) {
      logger.error("Error leaving room:", error);
      const normalizedError = normalizeError(error);
      // الانتقال إلى حالة الخطأ
      stateMachine.transition(CALL_EVENTS.ERROR_OCCURRED, {
        error: normalizedError.message,
      });
      throw normalizedError;
    } finally {
      // تنظيف roomId في النهاية
      setRoomId(null);
      
      // إعادة تعيين الـ flags (Guard Manager)
      guardManager.setLeaving(false);
      guardManager.setHasLeftRoom(true);
      
      if (guardManagerRef.current.isLeavingDueToRejection) {
        guardManager.setLeavingDueToRejection(false);
        logger.callEvent("Rejection flag reset in finally");
      }
    }
  }, [
    socket,
    roomId,
    rooms,
    peers,
    isCaller,
    callStatus,
    currentUser,
    localStream,
    screenStream,
    isRecording,
    callId,
    recordingId,
    resetAll,
    stopBandwidthMonitoring,
    withTimeout,
  ]);

  /**
   * 8.1 إنهاء المكالمة للجميع (للمتصل فقط)
   */
  const endCallForAll = useCallback(async () => {
    if (!roomId) return;
    
    const stateMachine = callStateMachineRef.current;

    // التحقق من إمكانية إنهاء المكالمة للجميع (FSM + Guard)
    if (!stateMachine.canTransition(CALL_EVENTS.END_CALL)) {
      logger.warn(
        "Cannot end call for all - invalid state:",
        stateMachine.getState()
      );
      const error = createError(
        ERROR_CODES.INVALID_STATE,
        `Cannot end call for all in ${stateMachine.getState()} state`
      );
      throw error;
    }
    
    if (!guardManager.canLeave()) {
      logger.warn("Cannot end call for all - operation in progress");
      const error = createError(
        ERROR_CODES.OPERATION_FAILED,
        "Cannot end call for all - operation in progress"
      );
      throw error;
    }
    
    try {
      logger.callEvent("Ending call for all...");
      
      // الانتقال إلى حالة LEAVING
      stateMachine.transition(CALL_EVENTS.END_CALL, { roomId });
      
      await withTimeout(
        socket.emitWithAck("endCall", {
        roomId,
          userId: currentUser?._id || socket.id,
        }),
        10000,
        "endCall"
      );

      // ✅ Call-Chat Integration: تحديث Redux room state عند إنهاء المكالمة
      try {
        const callChatIntegration = callChatIntegrationRef.current;
        callChatIntegration.handleCallEnded({
          roomId,
          callId: null,
          duration: null, // Will be calculated from startedAt
          endedBy: currentUser?._id || socket.id,
        });
        logger.callEvent("Call-Chat integration: call ended", { roomId });
      } catch (error) {
        logger.error("Error updating Call-Chat integration on end:", error);
      }

      // ✅ تنظيف callStatus عند إنهاء المكالمة
      setCallStatus(null);

      await leaveRoom();
    } catch (error) {
      logger.error("Error ending call for all:", error);
      const normalizedError = normalizeError(error);
      // الانتقال إلى حالة الخطأ
      stateMachine.transition(CALL_EVENTS.ERROR_OCCURRED, {
        error: normalizedError.message,
      });
      await resetAll(); // تنظيف شامل عند الخطأ
      throw normalizedError;
    }
  }, [socket, roomId, leaveRoom]);

  /**
   * 9. التحكم بالصوت (Mute/Unmute)
   */
  const toggleAudio = useCallback(async () => {
    try {
      const audioProducer = producersRef.current.get("audio");
      if (!audioProducer) return;

      // تحديث محلي فوري (optimistic update) لتحسين الاستجابة
      const newAudioState = !isAudioEnabled;
      setIsAudioEnabled(newAudioState);
      
      // تحديث metadata محلياً في peers state فوراً
      setPeers((prev) =>
        prev.map((p) =>
          p.peerId === socket.id ||
          (p.userId === currentUser?._id && p.isLocal !== false)
            ? { 
                ...p, 
                metadata: { 
                  ...p.metadata, 
                  isAudioEnabled: newAudioState,
                },
              }
            : p
        )
      );

      if (isAudioEnabled) {
        logger.streamEvent("Pausing audio producer");
        await withTimeout(
          socket.emitWithAck("pauseProducer", {
          roomId,
          producerId: audioProducer.id,
          }),
          10000,
          "pauseProducer"
        );
      } else {
        logger.streamEvent("Resuming audio producer");
        await withTimeout(
          socket.emitWithAck("resumeProducer", {
          roomId,
          producerId: audioProducer.id,
          }),
          10000,
          "resumeProducer"
        );
      }
      // ملاحظة: metadata سيتم تحديثه من الباك اند عبر peerMetadataUpdated event
      // لكن التحديث المحلي الفوري يضمن استجابة فورية في UI
    } catch (error) {
      logger.error("Error toggling audio:", error);
      // إعادة الحالة في حالة الخطأ
      setIsAudioEnabled(isAudioEnabled);
      setPeers((prev) =>
        prev.map((p) =>
          p.peerId === socket.id
            ? { 
                ...p, 
                metadata: { 
                  ...(p.metadata || {
                    isAudioEnabled: true,
                    isVideoEnabled: true,
                    isScreenSharing: false,
                  }),
                  isAudioEnabled: isAudioEnabled,
                },
              }
            : p
        )
      );
    }
  }, [socket, roomId, isAudioEnabled, currentUser]);

  /**
   * 10. التحكم بالفيديو (Enable/Disable)
   */
  const toggleVideo = useCallback(async () => {
    if (isTogglingVideoRef.current) {
      logger.warn("toggleVideo ignored because another toggle is in progress");
      return;
    }

    isTogglingVideoRef.current = true;
    try {
      let videoProducer = producersRef.current.get("video");

      // ✅ إذا لم يكن هناك videoProducer (في المكالمات الصوتية)، نحتاج لإنشاء video track أولاً
      if (!videoProducer && localStream) {
        try {
          logger.streamEvent(
            "No video producer found, creating video track for audio call"
          );

          const videoStream = await createStream({
            audio: false,
            video: true,
          });

          const videoTrack = videoStream.getVideoTracks()[0];
          if (videoTrack) {
            // إضافة video track إلى localStream
            localStream.addTrack(videoTrack);
            // Force new MediaStream reference to keep local preview in sync.
            setLocalStream(new MediaStream(localStream.getTracks()));
            setIsVideoEnabled(true);

            // إنتاج video track
            logger.streamEvent("Producing video track for audio call");
            await produce(localStream);

            // تحديث videoProducer
            videoProducer = producersRef.current.get("video");
            if (!videoProducer) {
              logger.error(
                "Failed to create video producer after adding track"
              );
              return;
            }

            logger.streamEvent("Video track added successfully to audio call");
          }
        } catch (error) {
          logger.error("Error creating video track for audio call:", error);
          throw error;
        }
      }

      if (!videoProducer) {
        logger.warn("No video producer available, cannot toggle video");
        return;
      }

      if (!isVideoEnabled) {
        const currentVideoTrack = localStream?.getVideoTracks?.()[0];
        const needsTrackRecovery =
          !currentVideoTrack || currentVideoTrack.readyState !== "live";

        if (needsTrackRecovery) {
          logger.streamEvent(
            "Local video track missing/stale while enabling video; recovering track"
          );
          const recoveryStream = await createStream({ audio: false, video: true });
          const recoveredTrack = recoveryStream.getVideoTracks()[0];

          if (recoveredTrack && videoProducer && !videoProducer.closed) {
            await videoProducer.replaceTrack({ track: recoveredTrack });
          }

          if (localStream && recoveredTrack) {
            if (currentVideoTrack && currentVideoTrack !== recoveredTrack) {
              localStream.removeTrack(currentVideoTrack);
              currentVideoTrack.stop();
            }
            localStream.addTrack(recoveredTrack);
            setLocalStream(new MediaStream(localStream.getTracks()));
          } else if (recoveryStream) {
            setLocalStream(recoveryStream);
          }
        }
      }

      // تحديث محلي فوري (optimistic update) لتحسين الاستجابة
      const newVideoState = !isVideoEnabled;
      setIsVideoEnabled(newVideoState);
      
      // تحديث metadata محلياً في peers state فوراً (للأطراف الأخرى الذين يروننا)
      // ملاحظة: local user metadata يتم تحديثه مباشرة من isVideoEnabled في mediasoup-call.js
      setPeers((prev) =>
        prev.map((p) =>
          p.peerId === socket.id
            ? { 
                ...p, 
                metadata: { 
                  ...(p.metadata || {
                    isAudioEnabled: true,
                    isVideoEnabled: true,
                    isScreenSharing: false,
                  }),
                  isVideoEnabled: newVideoState,
                },
              }
            : p
        )
      );

      if (isVideoEnabled) {
        logger.streamEvent("Pausing video producer");
        await withTimeout(
          socket.emitWithAck("pauseProducer", {
          roomId,
          producerId: videoProducer.id,
          }),
          10000,
          "pauseProducer"
        );
      } else {
        logger.streamEvent("Resuming video producer");
        await withTimeout(
          socket.emitWithAck("resumeProducer", {
          roomId,
          producerId: videoProducer.id,
          }),
          10000,
          "resumeProducer"
        );
      }
      // ملاحظة: metadata سيتم تحديثه من الباك اند عبر peerMetadataUpdated event
      // لكن التحديث المحلي الفوري يضمن استجابة فورية في UI
    } catch (error) {
      const normalizedError = normalizeError(error);
      if (normalizedError.code === ERROR_CODES.DEVICE_IN_USE) {
        logger.warn("Camera busy while toggling video", normalizedError);
        dispatch(
          addAlert({
            type: "warning",
            title: tSafe("call.callAction", "Call"),
            message: tSafe(
              "call.videoBusyTryAgain",
              "Camera is busy. Close other apps using the camera and try again."
            ),
          })
        );
      } else {
        logger.error("Error toggling video:", error);
      }
      // إعادة الحالة في حالة الخطأ
      setIsVideoEnabled(isVideoEnabled);
      setPeers((prev) =>
        prev.map((p) =>
          p.peerId === socket.id
            ? { 
                ...p, 
                metadata: { 
                  ...(p.metadata || {
                    isAudioEnabled: true,
                    isVideoEnabled: true,
                    isScreenSharing: false,
                  }),
                  isVideoEnabled: isVideoEnabled,
                },
              }
            : p
        )
      );
    } finally {
      isTogglingVideoRef.current = false;
    }
  }, [
    socket,
    roomId,
    isVideoEnabled,
    localStream,
    produce,
    createStream,
    dispatch,
    tSafe,
  ]);

  /**
   * 12. تبديل جهاز الصوت أثناء المكالمة
   */
  const switchAudioDevice = useCallback(
    async (deviceId) => {
      let newStream = null;
      let oldAudioTrack = null;
      const previousDeviceId = selectedAudioDevice?.deviceId;

      try {
        if (Platform.OS !== "web") {
          throw createError(
            ERROR_CODES.DEVICE_NOT_SUPPORTED,
            "Device switching only available on web"
          );
      }

      if (!isJoined) {
          throw createError(
            ERROR_CODES.INVALID_STATE,
            "Cannot switch device - not in a call"
          );
      }

        const audioProducer = producersRef.current.get("audio");
      if (!audioProducer) {
          throw createError(
            ERROR_CODES.OPERATION_FAILED,
            "No audio producer found"
          );
        }

        // التحقق من أن الجهاز مختلف
        if (deviceId === previousDeviceId) {
          logger.deviceEvent("Device is already selected, skipping switch");
          return;
        }

        logger.deviceEvent("Switching audio device to:", deviceId);

        // حفظ الـ track القديم للـ rollback في حالة الفشل
        if (localStream) {
          oldAudioTrack = localStream.getAudioTracks()[0];
        }

      // إنشاء stream جديد من الجهاز الجديد
        newStream = await createStream({
        audio: true, 
        video: false, 
          audioDeviceId: deviceId,
      });

      const newAudioTrack = newStream.getAudioTracks()[0];
      if (!newAudioTrack) {
          newStream.getTracks().forEach((track) => track.stop());
          throw createError(
            ERROR_CODES.DEVICE_NOT_FOUND,
            "No audio track in new stream"
          );
        }

        // استبدال الـ track في الـ producer (seamless switching)
        try {
      await audioProducer.replaceTrack({ track: newAudioTrack });
          logger.deviceEvent("Audio track replaced in producer successfully");
        } catch (replaceError) {
          // Rollback: إيقاف الـ stream الجديد
          newStream.getTracks().forEach((track) => track.stop());
          throw createError(
            ERROR_CODES.OPERATION_FAILED,
            `Failed to replace audio track: ${replaceError.message}`
          );
        }

        // تحديث الـ local stream
      if (localStream) {
          // إزالة الـ track القديم
        if (oldAudioTrack && oldAudioTrack !== newAudioTrack) {
          oldAudioTrack.stop();
          localStream.removeTrack(oldAudioTrack);
        }
        // إضافة الـ track الجديد للـ stream المحلي
        localStream.addTrack(newAudioTrack);
      } else {
        setLocalStream(newStream);
      }

        // تنظيف الـ stream المؤقت (تم نقل الـ track إلى localStream)
        if (newStream && newStream !== localStream) {
          // إزالة جميع tracks من newStream (تم نقلها بالفعل)
          newStream.getTracks().forEach((track) => {
            if (track !== newAudioTrack) {
              track.stop();
            }
          });
      }

      // تحديث الجهاز المحدد
        const device = audioDevices.find((d) => d.deviceId === deviceId);
      if (device) {
        setSelectedAudioDevice(device);
          logger.deviceEvent("Audio device switched successfully", {
            from: previousDeviceId,
            to: deviceId,
          });
        } else {
          logger.warn(
            "Device not found in audioDevices list, but switch completed"
          );
        }
    } catch (error) {
        logger.error("Error switching audio device:", error);

        // Rollback: محاولة استعادة الـ track القديم إذا كان متاحاً
        if (oldAudioTrack && !oldAudioTrack.ended && localStream) {
          try {
            const audioProducer = producersRef.current.get("audio");
            if (audioProducer && !audioProducer.closed) {
              await audioProducer.replaceTrack({ track: oldAudioTrack });
              logger.deviceEvent("Rolled back to previous audio device");
            }
          } catch (rollbackError) {
            logger.error("Failed to rollback audio device:", rollbackError);
          }
        }

        // تنظيف الـ stream الجديد في حالة الفشل
        if (newStream) {
          newStream.getTracks().forEach((track) => track.stop());
        }

      throw normalizeError(error);
    }
    },
    [isJoined, createStream, localStream, audioDevices, selectedAudioDevice]
  );

  /**
   * 13. تبديل جهاز الفيديو أثناء المكالمة
   */
  const switchVideoDevice = useCallback(
    async (deviceId) => {
      let newStream = null;
      let oldVideoTrack = null;
      const previousDeviceId = selectedVideoDevice?.deviceId;

      try {
        if (Platform.OS !== "web") {
          throw createError(
            ERROR_CODES.DEVICE_NOT_SUPPORTED,
            "Device switching only available on web"
          );
      }

      if (!isJoined) {
          throw createError(
            ERROR_CODES.INVALID_STATE,
            "Cannot switch device - not in a call"
          );
      }

        const videoProducer = producersRef.current.get("video");
      if (!videoProducer) {
          throw createError(
            ERROR_CODES.OPERATION_FAILED,
            "No video producer found"
          );
        }

        // التحقق من أن الجهاز مختلف
        if (deviceId === previousDeviceId) {
          logger.deviceEvent("Device is already selected, skipping switch");
          return;
        }

        logger.deviceEvent("Switching video device to:", deviceId);

        // حفظ الـ track القديم للـ rollback في حالة الفشل
        if (localStream) {
          oldVideoTrack = localStream.getVideoTracks()[0];
        }

      // إنشاء stream جديد من الجهاز الجديد
        newStream = await createStream({
        audio: false, 
        video: true, 
          videoDeviceId: deviceId,
      });

      const newVideoTrack = newStream.getVideoTracks()[0];
      if (!newVideoTrack) {
          newStream.getTracks().forEach((track) => track.stop());
          throw createError(
            ERROR_CODES.DEVICE_NOT_FOUND,
            "No video track in new stream"
          );
        }

        // استبدال الـ track في الـ producer (seamless switching)
        try {
      await videoProducer.replaceTrack({ track: newVideoTrack });
          logger.deviceEvent("Video track replaced in producer successfully");
        } catch (replaceError) {
          // Rollback: إيقاف الـ stream الجديد
          newStream.getTracks().forEach((track) => track.stop());
          throw createError(
            ERROR_CODES.OPERATION_FAILED,
            `Failed to replace video track: ${replaceError.message}`
          );
        }

        // تحديث الـ local stream
      if (localStream) {
          // إزالة الـ track القديم
        if (oldVideoTrack && oldVideoTrack !== newVideoTrack) {
          oldVideoTrack.stop();
          localStream.removeTrack(oldVideoTrack);
        }
        // إضافة الـ track الجديد للـ stream المحلي
        localStream.addTrack(newVideoTrack);
      } else {
        setLocalStream(newStream);
      }

        // تنظيف الـ stream المؤقت (تم نقل الـ track إلى localStream)
        if (newStream && newStream !== localStream) {
          // إزالة جميع tracks من newStream (تم نقلها بالفعل)
          newStream.getTracks().forEach((track) => {
            if (track !== newVideoTrack) {
              track.stop();
            }
          });
      }

      // تحديث الجهاز المحدد
        const device = videoDevices.find((d) => d.deviceId === deviceId);
      if (device) {
        setSelectedVideoDevice(device);
          logger.deviceEvent("Video device switched successfully", {
            from: previousDeviceId,
            to: deviceId,
          });
        } else {
          logger.warn(
            "Device not found in videoDevices list, but switch completed"
          );
        }
    } catch (error) {
        logger.error("Error switching video device:", error);

        // Rollback: محاولة استعادة الـ track القديم إذا كان متاحاً
        if (oldVideoTrack && !oldVideoTrack.ended && localStream) {
          try {
            const videoProducer = producersRef.current.get("video");
            if (videoProducer && !videoProducer.closed) {
              await videoProducer.replaceTrack({ track: oldVideoTrack });
              logger.deviceEvent("Rolled back to previous video device");
            }
          } catch (rollbackError) {
            logger.error("Failed to rollback video device:", rollbackError);
          }
        }

        // تنظيف الـ stream الجديد في حالة الفشل
        if (newStream) {
          newStream.getTracks().forEach((track) => track.stop());
        }

      throw normalizeError(error);
    }
    },
    [isJoined, createStream, localStream, videoDevices, selectedVideoDevice]
  );

  /**
   * 11. مشاركة الشاشة (محسّنة)
   */
  const startScreenShare = useCallback(
    async (options = {}) => {
      try {
        if (Platform.OS !== "web") {
          throw createError(
            ERROR_CODES.OPERATION_FAILED,
            "Screen share only available on web"
          );
        }

        logger.streamEvent("Starting screen share...");

        // ✅ Use screen share optimizer for better quality
        const quality = options.quality || "high";
        const constraints = screenShareOptimizer.getDisplayMediaConstraints(
          quality,
          {
            audio: options.audio || false,
            cursor: options.cursor || "always",
          }
        );

        const screenStream =
          await navigator.mediaDevices.getDisplayMedia(constraints);

      const screenTrack = screenStream.getVideoTracks()[0];
      
      // Handle user stopping share from browser UI
        screenTrack.addEventListener("ended", () => {
          logger.streamEvent("Screen share stopped by user");
        stopScreenShare();
      });

      // Create producer for screen track
      const transport = producerTransportRef.current;
      if (!transport) {
          throw createError(
            ERROR_CODES.STREAM_CREATION_FAILED,
            "No producer transport"
          );
        }

        logger.streamEvent("Producing screen track...");

        // ✅ Use optimized encoding parameters
        const encodingParams =
          screenShareOptimizer.getEncodingParameters(quality);

      const screenProducer = await transport.produce({
        track: screenTrack,
          encodings: encodingParams,
          codecOptions: {
            videoGoogleStartBitrate: 1000,
          },
        appData: { screenShare: true, peerId: socket.id },
      });

      screenProducerRef.current = screenProducer;
      setScreenStream(screenStream);
      setIsScreenSharing(true);

        logger.streamEvent("Screen share started:", screenProducer.id);
    } catch (error) {
        logger.error("Error starting screen share:", error);
        if (error.name === "NotAllowedError") {
          throw createError(
            ERROR_CODES.PERMISSION_DENIED,
            "Screen share permission denied"
          );
      }
      throw normalizeError(error);
    }
    },
    [socket]
  );

  /**
   * ✅ Request Screen Share from another participant
   */
  const requestScreenShareFromParticipant = useCallback(
    async (targetUserId, allowAll = false) => {
      try {
        if (!callId) {
          throw createError(ERROR_CODES.INVALID_STATE, "No active call");
        }

        logger.callEvent("Requesting screen share from participant", {
          callId,
          targetUserId,
          allowAll,
        });

        return new Promise((resolve, reject) => {
          socket.emit(
            "requestScreenShare",
            { callId, targetUserId, allowAll },
            (response) => {
              if (response.success) {
                logger.callEvent("Screen share request sent", {
                  callId,
                  targetUserId,
                });
                resolve(response);
              } else {
                logger.error("Error requesting screen share:", response.error);
                reject(new Error(response.error));
              }
            }
          );
        });
      } catch (error) {
        logger.error("Error requesting screen share:", error);
        throw error;
      }
    },
    [callId, socket]
  );

  /**
   * ✅ Respond to Screen Share Request
   */
  const respondToScreenShareRequest = useCallback(
    async (requesterId, accepted) => {
      try {
        if (!callId) {
          throw createError(ERROR_CODES.INVALID_STATE, "No active call");
        }

        logger.callEvent("Responding to screen share request", {
          callId,
          requesterId,
          accepted,
        });

        return new Promise((resolve, reject) => {
          socket.emit(
            "respondToScreenShareRequest",
            { callId, requesterId, accepted },
            (response) => {
              if (response.success) {
                logger.callEvent("Screen share request responded", {
                  callId,
                  requesterId,
                  accepted,
                });
                resolve(response);
              } else {
                logger.error(
                  "Error responding to screen share request:",
                  response.error
                );
                reject(new Error(response.error));
              }
            }
          );
        });
      } catch (error) {
        logger.error("Error responding to screen share request:", error);
        throw error;
      }
    },
    [callId, socket]
  );

  const stopScreenShare = useCallback(async () => {
    try {
      logger.streamEvent("Stopping screen share...");

      if (screenProducerRef.current) {
        const producerId = screenProducerRef.current.id;
        
        // إرسال event للباك اند لإغلاق producer
        try {
          await withTimeout(
            socket.emitWithAck("closeProducer", {
            roomId,
            producerId,
            }),
            10000,
            "closeProducer"
          );
          logger.streamEvent("Screen share producer closed on server");
        } catch (error) {
          logger.error("Error closing producer on server:", error);
        }
        
        // Close producer locally
        screenProducerRef.current.close();
        screenProducerRef.current = null;
      }

      if (screenStream) {
        screenStream.getTracks().forEach((track) => track.stop());
        setScreenStream(null);
      }

      // تحديث محلي فوري (optimistic update)
      setIsScreenSharing(false);
      
      // تحديث metadata محلياً في peers state فوراً
      setPeers((prev) =>
        prev.map((p) =>
          p.peerId === socket.id
            ? { 
                ...p, 
                metadata: { 
                  ...(p.metadata || {
                    isAudioEnabled: true,
                    isVideoEnabled: true,
                    isScreenSharing: false,
                  }),
                  isScreenSharing: false,
                },
              }
            : p
        )
      );
      
      logger.streamEvent("Screen share stopped");
      
      // ملاحظة: metadata سيتم تحديثه من الباك اند عبر peerMetadataUpdated event
    } catch (error) {
      logger.error("Error stopping screen share:", error);
      // إعادة الحالة في حالة الخطأ
      setIsScreenSharing(true);
    }
  }, [screenStream, socket, roomId]);

  /**
   * Socket Event Listeners
   * مع معالجة Race Conditions: حفظ handler functions في refs لضمان cleanup صحيح
   */
  useEffect(() => {
    if (!socket) return;

    // حفظ معلومات الغرفة قبل الانقطاع (لإعادة الاتصال)
    const saveRoomInfo = () => {
      if (isJoined && roomId && currentUser) {
        roomInfoBeforeDisconnectRef.current = {
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
          isVideoCall: isVideoCallRef.current,
          isCaller: isCaller, // حفظ حالة caller لإعادة الاتصال
          role: currentRoleRef.current, // ✅ حفظ role (member/broadcaster/viewer) لإعادة الاتصال
        };
        logger.callEvent("Room info saved for reconnection", {
          roomId,
          role: currentRoleRef.current,
        });
      }
    };

    // دالة إعادة الاتصال بالغرفة
    const reconnectToRoom = async () => {
      const savedRoomInfo = roomInfoBeforeDisconnectRef.current;
      if (!savedRoomInfo) {
        logger.warn("No room info saved, cannot reconnect");
        setIsReconnecting(false);
        return;
      }

      if (isReconnecting) {
        logger.warn("Reconnection already in progress");
        return;
      }

      setIsReconnecting(true);
      const attemptNumber = reconnectAttemptRef.current + 1;
      reconnectAttemptRef.current = attemptNumber;
      setReconnectAttempts(attemptNumber);

      try {
        logger.callEvent(
          `Attempting to reconnect to room (attempt ${attemptNumber})...`,
          {
            roomId: savedRoomInfo.roomId,
            role: savedRoomInfo.role,
          }
        );

        // ✅ إعادة الانضمام للغرفة مع role المحفوظ (viewer/member/broadcaster)
        await joinRoom({
          roomId: savedRoomInfo.roomId,
          userId: savedRoomInfo.userId,
          userData: savedRoomInfo.userData,
          isVideoCall: savedRoomInfo.isVideoCall,
          isCaller: savedRoomInfo.isCaller, // استخدام حالة caller المحفوظة
          role: savedRoomInfo.role || "member", // ✅ استخدام role المحفوظ (viewer/member/broadcaster)
        });

        logger.callEvent("Successfully reconnected to room", {
          roomId: savedRoomInfo.roomId,
          attempts: attemptNumber,
          role: savedRoomInfo.role,
        });

        // إعادة تعيين حالة إعادة الاتصال
        setIsReconnecting(false);
        setReconnectAttempts(0);
        reconnectAttemptRef.current = 0;
        roomInfoBeforeDisconnectRef.current = null;
      } catch (error) {
        logger.error("Failed to reconnect to room:", error);

        // إعادة المحاولة بعد تأخير (exponential backoff)
        const maxAttempts = 5;
        if (attemptNumber < maxAttempts) {
          const delay = Math.min(2000 * Math.pow(2, attemptNumber - 1), 30000); // Max 30 seconds
          logger.callEvent(
            `Will retry reconnection in ${delay}ms (attempt ${attemptNumber}/${maxAttempts})`
          );

          reconnectTimeoutRef.current = setTimeout(() => {
            reconnectToRoom();
          }, delay);
        } else {
          logger.error("Max reconnection attempts reached, giving up");
          setIsReconnecting(false);
          setReconnectAttempts(0);
          reconnectAttemptRef.current = 0;
          roomInfoBeforeDisconnectRef.current = null;
          setMediaError(
            createError(
              ERROR_CODES.NETWORK_ERROR,
              "Failed to reconnect after multiple attempts. Please try joining again."
            )
          );
        }
      }
    };

    // حفظ handler functions في refs لضمان cleanup صحيح
    const handlers = {
      ...createRecordingSocketHandlers({
        callId,
        dispatch,
        addAlert,
        t,
        logger,
        setIsRecording,
        setRecordingId,
      }),
      callError: (payload) => {
        logger.error("callError from server:", payload);
        // معالجة خطأ المكالمة: يتم عرض الخطأ عبر setMediaError
        // يمكن تحسينه مستقبلاً بإضافة toast notification system للرسائل غير الحرجة
        setMediaError(
          createError(
            ERROR_CODES.OPERATION_FAILED,
            payload?.message || "Call failed"
          )
        );
      },
      participantMuted: async ({ mutedBy }) => {
        logger.callEvent("participantMuted event received", { mutedBy });
        dispatch(
          addAlert({
            type: "warning",
            message: tSafe(
              "call.participantMutedByModerator",
              "You were muted by a call moderator"
            ),
          })
        );
        if (isAudioEnabled) {
          try {
            await toggleAudio();
          } catch (error) {
            logger.error("Error applying participantMuted locally:", error);
          }
        }
      },
      groupCallParticipantRemoved: async ({ callId: removedFromCallId, removedBy }) => {
        logger.callEvent("groupCallParticipantRemoved event received", {
          removedFromCallId,
          removedBy,
        });
        dispatch(
          addAlert({
            type: "warning",
            message: tSafe("call.removedFromCall", "You were removed from this call"),
          })
        );
        try {
          await leaveRoom();
        } catch (error) {
          logger.error("Error leaving room after removal:", error);
        }
      },
      groupCallModeratorStatusChanged: ({ callId: updatedCallId, isModerator }) => {
        logger.callEvent("groupCallModeratorStatusChanged event received", {
          updatedCallId,
          isModerator,
        });
        setCurrentRole(isModerator ? "moderator" : "member");
        currentRoleRef.current = isModerator ? "moderator" : "member";
        dispatch(
          addAlert({
            type: "info",
            message: isModerator
              ? tSafe("call.promotedToModerator", "You were promoted to moderator")
              : tSafe("call.moderatorRoleRemoved", "Moderator role removed"),
          })
        );
      },
      newPeer: ({ peerId, userId, userData, metadata }) => {
        logger.roomEvent("New peer joined", peerId);
      peersJoinedCountRef.current += 1;
      
      // FSM transition
      const stateMachine = callStateMachineRef.current;
      if (stateMachine.canTransition(CALL_EVENTS.PEER_JOINED)) {
          stateMachine.transition(CALL_EVENTS.PEER_JOINED, {
            peerId,
            userId,
            userData,
          });
      }
      
      setPeers((prev) => {
        if (prev.some((p) => p.peerId === peerId)) {
            logger.roomEvent(
              `Peer ${peerId} already in list, ignoring duplicate newPeer event`
            );
          return prev;
        }
          return [
            ...prev,
            {
          peerId, 
          userId, 
          userData, 
          producerIds: [],
              metadata: metadata || {
                isAudioEnabled: true,
                isVideoEnabled: true,
                isScreenSharing: false,
              },
            },
          ];
        });
      },
      peerMetadataUpdated: ({ peerId, metadata }) => {
        logger.roomEvent("Peer metadata updated", { peerId, metadata });
      
      // تحديث فوري لـ peers state
      setPeers((prev) =>
        prev.map((p) =>
          p.peerId === peerId
            ? { 
                ...p, 
                metadata: {
                  ...p.metadata,
                  ...(metadata || {}),
                  // التأكد من وجود جميع الحقول المطلوبة
                    isAudioEnabled:
                      metadata?.isAudioEnabled !== undefined
                        ? metadata.isAudioEnabled
                        : (p.metadata?.isAudioEnabled ?? true),
                    isVideoEnabled:
                      metadata?.isVideoEnabled !== undefined
                        ? metadata.isVideoEnabled
                        : (p.metadata?.isVideoEnabled ?? false),
                    isScreenSharing:
                      metadata?.isScreenSharing !== undefined
                        ? metadata.isScreenSharing
                        : (p.metadata?.isScreenSharing ?? false),
                  },
              }
            : p
        )
      );
      },
      producerClosed: ({ peerId, producerId, kind }) => {
      logger.roomEvent(`Producer closed from peer ${peerId}`, producerId);
      
      // إزالة consumer المرتبط بهذا producer
      const consumerInfo = Array.from(consumersRef.current.values()).find(
        (c) => c.producerId === producerId
      );
      
      if (consumerInfo) {
          const { consumer, isScreenShare } = consumerInfo;
        try {
          if (!consumer.closed) {
            consumer.close();
          }
        } catch (error) {
            logger.error("Error closing consumer:", error);
        }
        
        consumersRef.current.delete(consumer.id);
        consumedProducerIdsRef.current.delete(producerId);
        
        // إزالة track من remoteStreams
        setRemoteStreams((prev) => {
            // إذا كان screen share، نزيل stream منفصل
            if (isScreenShare) {
              const screenStreamKey = `${peerId}-screen`;
              const updated = { ...prev };
              if (updated[screenStreamKey]) {
                // إيقاف جميع tracks في screen share stream
                updated[screenStreamKey]
                  .getTracks()
                  .forEach((track) => track.stop());
                delete updated[screenStreamKey];
                logger.streamEvent(`Removed screen share stream for ${peerId}`);
              }
              return updated;
            }

            // للـ video/audio عادي، نزيل track من stream العادي
          const stream = prev[peerId];
          if (stream) {
              const newStream =
                Platform.OS === "web"
                  ? new window.MediaStream()
                  : new MediaStream();
            // نسخ جميع tracks ما عدا track المرتبط بهذا consumer
            stream.getTracks().forEach((track) => {
              if (track.id !== consumer.track?.id) {
                newStream.addTrack(track);
              }
            });
            
            // إذا لم يعد هناك tracks، نزيل stream
            if (newStream.getTracks().length === 0) {
              const updated = { ...prev };
              delete updated[peerId];
              return updated;
            }
            
            return { ...prev, [peerId]: newStream };
          }
          return prev;
        });
      }
      },
      newProducer: async ({
        peerId,
        producerId,
        kind,
        isScreenShare: isScreenShareFromEvent,
      }) => {
        logger.roomEvent(`New producer from peer ${peerId}`, {
          producerId,
          kind,
          isScreenShare: isScreenShareFromEvent,
        });

        // ✅ Lazy Consumer Creation: منع استهلاك نفس الـ producer أكثر من مرة
      if (consumedProducerIdsRef.current.has(producerId)) {
          logger.roomEvent(
            `Producer ${producerId} already being consumed, ignoring duplicate newProducer event`
          );
          return;
        }

        // ✅ Lazy Consumer Creation: التحقق من أننا في حالة صالحة لإنشاء consumer
        if (!isJoined || !roomId) {
          logger.warn(
            `Cannot consume producer ${producerId} - not joined to room yet`,
            { isJoined, roomId }
          );
        return;
      }
      
      // FSM transition
      const stateMachine = callStateMachineRef.current;
        // ✅ فقط إذا لم نكن في حالة CONSUMING أو IN_CALL بالفعل
        const currentState = stateMachine.getState();
        if (
          currentState !== CALL_STATES.CONSUMING &&
          currentState !== CALL_STATES.IN_CALL
        ) {
      if (stateMachine.canTransition(CALL_EVENTS.CONSUMER_CREATED)) {
            stateMachine.transition(CALL_EVENTS.CONSUMER_CREATED, {
              peerId,
              producerId,
              kind,
            });
          }
        }

        // ✅ Lazy Consumer Creation: تحديث قائمة producers للـ peer واستهلاك producer في نفس الوقت
        setPeers((prev) => {
          const updatedPeers = prev.map((p) =>
          p.peerId === peerId
            ? { ...p, producerIds: [...(p.producerIds || []), producerId] }
            : p
          );

          // استخدام isScreenShare من event مباشرة (السيرفر يرسله الآن)
          // fallback إلى metadata فقط في حالة عدم وجوده في event (للتوافق مع الإصدارات القديمة)
          const peer = updatedPeers.find((p) => p.peerId === peerId);
          const isScreenShare =
            isScreenShareFromEvent === true ||
            (kind === "video" && peer?.metadata?.isScreenSharing === true);

          logger.streamEvent(
            `Consuming producer ${producerId} as ${isScreenShare ? "screen share" : kind}`,
            {
              peerId,
              producerId,
              kind,
              isScreenShareFromEvent,
              isScreenShare,
            }
          );

          // ✅ Lazy Consumer Creation: استهلاك producer الجديد فقط إذا كان نشطاً
          // نتحقق من أن producer موجود في producerIds قبل إنشاء consumer
          const producerExists = updatedPeers.some(
            (p) =>
              p.peerId === peerId && (p.producerIds || []).includes(producerId)
          );

          if (producerExists) {
            // استهلاك producer الجديد مع تحديد إذا كان screen share
            consume(peerId, producerId, roomId, isScreenShare).catch(
              (error) => {
                logger.error("Error consuming new producer:", error);
              }
            );
          } else {
            logger.warn(
              `Producer ${producerId} not found in peer ${peerId} producerIds, deferring consumer creation`
            );
          }

          return updatedPeers;
        });
      },
      peerJoined: ({ peerId, metadata }) => {
        logger.roomEvent("Peer joined", { peerId, metadata });

        // ✅ Call-Chat Integration: تحديث Redux room state عند انضمام peer
        try {
          const callChatIntegration = callChatIntegrationRef.current;
          if (roomId && callChatIntegration.hasActiveCall(roomId)) {
            callChatIntegration.handleParticipantJoined({
              roomId,
              userId: metadata?.userId || peerId,
              userData: metadata?.userData,
            });
            logger.callEvent("Call-Chat integration: participant joined", {
              roomId,
              peerId,
            });
          }
      } catch (error) {
          logger.error(
            "Error updating Call-Chat integration on peerJoined:",
            error
          );
        }
      },
      peerLeft: ({ peerId, metadata }) => {
        logger.roomEvent("Peer left", { peerId, metadata });

        // ✅ Call-Chat Integration: تحديث Redux room state عند مغادرة peer
        try {
          const callChatIntegration = callChatIntegrationRef.current;
          if (roomId && callChatIntegration.hasActiveCall(roomId)) {
            callChatIntegration.handleParticipantLeft({
              roomId,
              userId: metadata?.userId || peerId,
            });
            logger.callEvent("Call-Chat integration: participant left", {
              roomId,
              peerId,
            });
          }
        } catch (error) {
          logger.error(
            "Error updating Call-Chat integration on peerLeft:",
            error
          );
        }
        peersJoinedCountRef.current = Math.max(
          0,
          peersJoinedCountRef.current - 1
        );
      
      // FSM transition
      const stateMachine = callStateMachineRef.current;
      if (stateMachine.canTransition(CALL_EVENTS.PEER_LEFT)) {
        stateMachine.transition(CALL_EVENTS.PEER_LEFT, { peerId });
      }
      
      setPeers((prev) => {
        const updatedPeers = prev.filter((p) => p.peerId !== peerId);
        
          logger.roomEvent(
            "updatedPeers.length",
            updatedPeers.length,
            "isJoined",
            isJoined
          );
          // ✅ تحقق إذا لم يعد هناك أشخاص آخرين في المكالمة
          // ✅ لكن فقط إذا لم يكن المستخدم الحالي viewer (viewers لا ينهون الستريم)
          if (
            updatedPeers.length === 0 &&
            isJoined &&
            currentRoleRef.current !== "viewer"
          ) {
            logger.roomEvent("Room is now empty, leaving...");
          // مغادرة الغرفة تلقائياً إذا لم يعد هناك أحد
          // التحقق من guardManager قبل الاستدعاء لمنع race conditions
          if (guardManager.canLeave()) {
            leaveRoom().catch((error) => {
                logger.error("Error in auto-leave from peerLeft:", error);
            });
        } else {
              logger.warn("Cannot auto-leave - cleanup already in progress");
            }
          } else if (
            updatedPeers.length === 0 &&
            isJoined &&
            currentRoleRef.current === "viewer"
          ) {
            // ✅ إذا كان viewer والغرفة فارغة، لا ننهي الستريم (viewers لا ينهون الستريم)
            logger.roomEvent(
              "Viewer detected empty room but not leaving (viewers don't end streams)",
              {
                updatedPeersLength: updatedPeers.length,
                currentRole: currentRoleRef.current,
              }
            );
        }
        
        return updatedPeers;
      });
      
        // إزالة stream (العادي + screen share)
      setRemoteStreams((prev) => {
        const newStreams = { ...prev };
          // إزالة stream العادي
          if (newStreams[peerId]) {
            newStreams[peerId].getTracks().forEach((track) => track.stop());
        delete newStreams[peerId];
          }
          // إزالة screen share stream إذا كان موجوداً
          const screenStreamKey = `${peerId}-screen`;
          if (newStreams[screenStreamKey]) {
            newStreams[screenStreamKey]
              .getTracks()
              .forEach((track) => track.stop());
            delete newStreams[screenStreamKey];
          }
        return newStreams;
      });

      // إغلاق consumer transport
      const transport = consumerTransportsRef.current.get(peerId);
      if (transport) {
        transport.close();
        consumerTransportsRef.current.delete(peerId);
      }
      },
      consumerClosed: ({ consumerId }) => {
        logger.streamEvent("Consumer closed", consumerId);
      const consumerData = consumersRef.current.get(consumerId);
      if (consumerData) {
        consumerData.consumer.close();
        consumersRef.current.delete(consumerId);
      }
      },
      incomingCall: ({
        roomId: callRoomId,
        callerId,
        callerData,
        isVideoCall,
      }) => {
        logger.callEvent("Incoming call from", callerId);
        logger.callEvent("Room ID", callRoomId);
        logger.callEvent(
          "Cancelled calls list",
          Array.from(cancelledCallsRef.current.keys())
        );
        // ✅ Ignore incoming calls if user is a viewer (watching live stream)
        if (currentRoleRef.current === "viewer") {
          logger.callEvent(
            "Ignoring incoming call - user is viewer in live stream",
            {
              currentRole: currentRoleRef.current,
              callRoomId,
              callerId,
            }
          );
          return;
        }

      // هذه الجهة مستقبل، لا حاجة لإدارة عدّاد المجموعة هنا
      
      // التحقق من أن المكالمة لم يتم إلغاؤها بالفعل (race condition)
      const cancelledRecently = wasRoomCancelledRecently(callRoomId);
      if (cancelledRecently) {
          logger.warn("Ignoring incoming call - recently cancelled (race window)");
        return;
      }

      // ✅ إذا كان المستخدم داخل مكالمة أخرى بالفعل، نحولها إلى Call Waiting
      if (
        shouldUseWaitingFlow({
          isJoined,
          currentRoomId: roomId,
          incomingRoomId: callRoomId,
          currentRole: currentRoleRef.current,
        })
      ) {
        logger.callEvent("Routing incoming call to waitingCall", {
          currentRoomId: roomId,
          incomingRoomId: callRoomId,
          callerId,
        });
        setWaitingCall({
          roomId: callRoomId,
          callerId,
          callerData,
          images: callerData?.images,
          firstName: callerData?.firstName,
          lastName: callerData?.lastName,
          colors: callerData?.colors,
          phoneNumber: callerData?.phoneNumber,
          email: callerData?.email,
          _id: callerData?._id,
          isVideoCall,
          currentCallRoomId: roomId,
        });
        setIsWaitingCallMinimized(false);
        return;
      }
      
      // FSM transition
      const stateMachine = callStateMachineRef.current;
      if (stateMachine.canTransition(CALL_EVENTS.INCOMING_CALL)) {
        stateMachine.transition(CALL_EVENTS.INCOMING_CALL, { 
          roomId: callRoomId, 
          callerId, 
          callerData, 
            isVideoCall,
        });
      }

        // ✅ تحديث نوع المكالمة عند استقبال مكالمة واردة
        setIsVideoCall(isVideoCall);
        isVideoCallRef.current = isVideoCall;
      
      setIncomingCall({
        roomId: callRoomId,
        callerId,
        images: callerData?.images,
        firstName: callerData?.firstName,
        lastName: callerData?.lastName,
        colors: callerData?.colors,
        phoneNumber: callerData?.phoneNumber,
        email: callerData?.email,
        _id: callerData?._id,
        isVideoCall,
      });
      setIsIncomingCallMinimized(false);
      clearRejectedParticipantsForRoom(callRoomId);
      clearCallParticipantsSnapshot(callRoomId);
      },
      callWaitingIncoming: ({
        roomId: waitingRoomId,
        callerId,
        callerData,
        isVideoCall,
        currentCallRoomId,
        currentCallId,
      }) => {
        logger.callEvent("callWaitingIncoming received", {
          waitingRoomId,
          currentCallRoomId,
          currentCallId,
          callerId,
        });
        setWaitingCall({
          roomId: waitingRoomId,
          callerId,
          callerData,
          images: callerData?.images,
          firstName: callerData?.firstName,
          lastName: callerData?.lastName,
          colors: callerData?.colors,
          phoneNumber: callerData?.phoneNumber,
          email: callerData?.email,
          _id: callerData?._id,
          isVideoCall,
          currentCallRoomId: currentCallRoomId || roomId || null,
          currentCallId: currentCallId || callId || null,
        });
        setIsWaitingCallMinimized(false);
      },
      calleeOnAnotherCall: ({ recipientId, currentCallRoomId }) => {
        logger.callEvent("calleeOnAnotherCall received", {
          recipientId,
          currentCallRoomId,
        });
        dispatch(
          addAlert({
            type: "warning",
            title: tSafe("call.busyTitle", "User is unavailable"),
            message: tSafe(
              "call.busyMessage",
              "This user is in another call right now."
            ),
          })
        );
      },
      callRejected: ({ roomId: callRoomId, rejectedBy }) => {
        logger.callEvent("Call rejected by someone in room", callRoomId);
        logger.callEvent("Rejected by socket", rejectedBy);
        markRejectedParticipant(callRoomId, rejectedBy);
        
        // FSM transition
        const stateMachine = callStateMachineRef.current;
        if (stateMachine.canTransition(CALL_EVENTS.REJECT_CALL)) {
          stateMachine.transition(CALL_EVENTS.REJECT_CALL, {
            roomId: callRoomId,
            rejectedBy,
          });
        }

        // ✅ تنظيف callStatus عند رفض المكالمة (إذا كان المتصل هو caller)
        if (roomId === callRoomId && isCaller) {
          setCallStatus(null);
          logger.callEvent("Call status cleared - call rejected", {
            rejectedBy,
          });
        }
        
        // زيادة العداد لدى المتصل فقط
        if (roomId === callRoomId && isJoined && isCaller) {
          // نحن المتصل (داخل الغرفة)، نسجل الرافض
          rejectedBySetRef.current.add(rejectedBy);
          logger.callEvent(
            "Rejections so far",
            rejectedBySetRef.current.size,
            "of",
            recipientsCountRef.current
          );
        }
        
        // منع معالجة متعددة لنفس الرفض (Guard Manager)
        if (guardManagerRef.current.isLeaving) {
          logger.warn("Already leaving, ignoring callRejected");
          return;
        }
        
        // التحقق من الحالة الحالية مباشرة
        setRoomId((currentRoomId) => {
          setPeers((currentPeers) => {
            logger.callEvent("Current state", {
              currentRoomId,
              callRoomId,
              peersCount: currentPeers.length,
            });
            
            // إذا كان المستخدم في هذه الغرفة ولا يوجد peers (لم يرد أحد بعد)
            // ولا يزال هناك مستقبلون آخرون محتملون لم يرفضوا بعد
            if (currentRoomId === callRoomId && currentPeers.length === 0) {
              const totalRecipients = Number(recipientsCountRef.current || 0);
              const rejectedCount = rejectedBySetRef.current.size;
              const isGroupInvite = totalRecipients > 1;
              // إذا كنا في مكالمة جماعية: لا نغادر إلا إذا رفض الجميع
              if (isGroupInvite && rejectedCount < totalRecipients) {
                logger.callEvent(
                  "Not everyone rejected yet; keeping call open for others"
                );
                return currentPeers; // لا نغادر الآن
              }
              logger.callEvent("Leaving after rejection threshold reached", {
                totalRecipients,
                rejectedCount,
                isGroupInvite,
              });
              logger.callEvent("Before setting flag", {
                isLeavingDueToRejection:
                  guardManagerRef.current.isLeavingDueToRejection,
                currentRoomId,
                callRoomId,
                peersCount: currentPeers.length,
              });
              
              // تعيين الـ flag قبل المغادرة مباشرة (Guard Manager)
              guardManager.setLeavingDueToRejection(true);
              logger.callEvent("Rejection flag set to true");
              logger.callEvent("After setting flag", {
                isLeavingDueToRejection:
                  guardManagerRef.current.isLeavingDueToRejection,
              });
              
              // استدعاء leaveRoom بعد تأخير صغير للتأكد من تعيين الـ flag
              setTimeout(() => {
                logger.callEvent("About to call leaveRoom from setTimeout");
                leaveRoom();
              }, 0);
            } else if (currentRoomId === callRoomId) {
              logger.callEvent(
                "Some rejected but others joined. Peers",
                currentPeers.length
              );
              // المكالمة مستمرة مع الآخرين
            }
            
            return currentPeers;
          });
          
          return currentRoomId;
      });
      },
      callCancelled: ({ roomId: callRoomId }) => {
        logger.callEvent("Call cancelled for room", callRoomId);
        clearRejectedParticipantsForRoom(callRoomId);
        clearCallParticipantsSnapshot(callRoomId);
        const normalizedCancelledRoomId =
          callRoomId?.toString?.() || String(callRoomId || "");
        
        // FSM transition
        const stateMachine = callStateMachineRef.current;
        if (stateMachine.canTransition(CALL_EVENTS.CANCEL_CALL)) {
          stateMachine.transition(CALL_EVENTS.CANCEL_CALL, {
            roomId: callRoomId,
          });
      }
        
        // إضافة الغرفة للقائمة الملغاة (للتعامل مع race condition)
        markCancelledRoom(callRoomId);
        logger.callEvent(
          "Added to cancelled list",
          Array.from(cancelledCallsRef.current.keys())
        );
        
        // استخدام setIncomingCall مع callback للحصول على القيمة الحالية
        setIncomingCall((currentIncomingCall) => {
          const incomingRoomId =
            currentIncomingCall?.roomId?.toString?.() ||
            String(currentIncomingCall?.roomId || "");
          const shouldClearIncoming =
            incomingRoomId &&
            normalizedCancelledRoomId &&
            incomingRoomId === normalizedCancelledRoomId;
          logger.callEvent("Current state", {
            incomingCall: currentIncomingCall,
        currentRoomId: roomId, 
            isJoined,
          });
          
          // إذا كان هناك incoming call بنفس الـ roomId، امسحه
          if (shouldClearIncoming) {
            logger.callEvent("Clearing incoming call");
            return null;
          }
          
          return currentIncomingCall;
        });
        setWaitingCall((currentWaitingCall) => {
          const waitingRoomId =
            currentWaitingCall?.roomId?.toString?.() ||
            String(currentWaitingCall?.roomId || "");
          if (
            waitingRoomId &&
            normalizedCancelledRoomId &&
            waitingRoomId === normalizedCancelledRoomId
          ) {
            return null;
          }
          return currentWaitingCall;
        });
        
        // إذا كان المستخدم في غرفة تم إلغاؤها (المتصل أو المستقبل يرفض)، اخرج من الغرفة
        // التحقق من roomId فقط بدون isJoined لأن isJoined قد يكون stale في closure
        const normalizedCurrentRoomId = roomId?.toString?.() || String(roomId || "");
        if (
          normalizedCurrentRoomId &&
          normalizedCancelledRoomId &&
          normalizedCurrentRoomId === normalizedCancelledRoomId
        ) {
          logger.callEvent("Leaving cancelled room (current room matches)");
        leaveRoom();
        }
        
      },
      disconnect: async () => {
        logger.callEvent("Socket disconnected, cleaning up...");
        clearAllActiveCallIndicators();

        // حفظ معلومات الغرفة قبل التنظيف (إذا كنا في مكالمة)
        if (isJoined && roomId) {
          saveRoomInfo();
        }
      
      // منع double cleanup: إذا كان leaveRoom قيد التنفيذ، لا نفعل شيء
        if (
          guardManagerRef.current.isLeaving ||
          guardManagerRef.current.hasLeftRoom
        ) {
          logger.warn(
            "Disconnect handler: cleanup already in progress or completed, skipping..."
          );
        // فقط ننظف state بدون الموارد (تم تنظيفها بالفعل)
        setRemoteStreams({});
        setPeers([]);
        setIsJoined(false);
        setRoomId(null);
        setIncomingCall(null);
        setMediaError(null);
      setScreenStream(null);
      setIsScreenSharing(false);
      stopBandwidthMonitoring();
      return;
      }
      
      // تعيين guard لمنع race conditions
      guardManager.setLeaving(true);
      
      const currentRoomId = roomId; // حفظ roomId قبل تنظيف state
      const wasJoined = isJoined; // حفظ حالة الانضمام
      
      // إذا كان المستخدم في مكالمة، نحتاج لتنظيف الموارد
      if (wasJoined && currentRoomId) {
          logger.callEvent("User was in a call, performing cleanup...");
        
        try {
          // 1. إيقاف جميع producers
          producersRef.current.forEach((producer) => {
            try {
              if (!producer.closed) {
                producer.close();
              }
            } catch (e) {
                logger.error("Error closing producer during disconnect:", e);
            }
          });
          producersRef.current.clear();

          // 2. إيقاف جميع consumers
          consumersRef.current.forEach(({ consumer }) => {
            try {
              if (!consumer.closed) {
                consumer.close();
              }
            } catch (e) {
                logger.error("Error closing consumer during disconnect:", e);
            }
          });
          consumersRef.current.clear();

          // 3. إغلاق transports
            if (
              producerTransportRef.current &&
              typeof producerTransportRef.current.close === "function"
            ) {
            try {
              producerTransportRef.current.close();
            } catch (e) {
                logger.error(
                  "Error closing producer transport during disconnect:",
                  e
                );
            }
            producerTransportRef.current = null;
          }

          consumerTransportsRef.current.forEach((transport) => {
            try {
                if (
                  !transport.closed &&
                  typeof transport.close === "function"
                ) {
                transport.close();
              }
            } catch (e) {
                logger.error(
                  "Error closing consumer transport during disconnect:",
                  e
                );
            }
          });
          consumerTransportsRef.current.clear();

          // 4. إيقاف streams
          if (localStream) {
            try {
              streamManager.stopMediaStream(localStream);
            } catch (e) {
                logger.error(
                  "Error stopping local stream during disconnect:",
                  e
                );
            }
          }

          if (screenStream) {
            try {
              streamManager.stopMediaStream(screenStream);
            } catch (e) {
                logger.error(
                  "Error stopping screen stream during disconnect:",
                  e
                );
            }
          }

          Object.values(remoteStreams).forEach((stream) => {
            try {
              if (stream) {
                streamManager.stopMediaStream(stream);
              }
            } catch (e) {
                logger.error(
                  "Error stopping remote stream during disconnect:",
                  e
                );
            }
          });

          // 5. إغلاق device
            if (
              deviceRef.current &&
              typeof deviceRef.current.close === "function"
            ) {
            try {
              deviceRef.current.close();
            } catch (e) {
                logger.error("Error closing device during disconnect:", e);
            }
            deviceRef.current = null;
          }

            logger.callEvent("Resources cleaned up after disconnect");
        } catch (error) {
            logger.error("Error during disconnect cleanup:", error);
        }
      }

      // 6. تنظيف state (يتم بعد تنظيف الموارد)
        setRemoteStreams({});
      setPeers([]);
        setIsJoined(false);
        setRoomId(null);
      setIncomingCall(null);
      setMediaError(null);
      setScreenStream(null);
      setIsScreenSharing(false);
      
      // 7. إعادة تعيين FSM
      const stateMachine = callStateMachineRef.current;
      if (stateMachine.canTransition(CALL_EVENTS.LEAVE_ROOM)) {
          stateMachine.transition(CALL_EVENTS.LEAVE_ROOM, {
            roomId: currentRoomId,
          });
      }
      stateMachine.reset();
      
      // 8. إعادة تعيين guard (يتم في النهاية)
      guardManager.setHasLeftRoom(true);
      guardManager.setLeaving(false);
      
        logger.callEvent("Disconnect cleanup completed");
      },
      callEnded: ({ roomId: endedRoomId }) => {
        logger.callEvent("Call ended by caller for room", endedRoomId);
        clearRejectedParticipantsForRoom(endedRoomId);
        clearCallParticipantsSnapshot(endedRoomId);
        const normalizedEndedRoomId =
          endedRoomId?.toString?.() || String(endedRoomId || "");
      
      // FSM transition
      const stateMachine = callStateMachineRef.current;
      if (stateMachine.canTransition(CALL_EVENTS.CALL_ENDED)) {
          stateMachine.transition(CALL_EVENTS.CALL_ENDED, {
            roomId: endedRoomId,
          });
        }

        // ✅ Call-Chat Integration: تحديث Redux room state عند انتهاء المكالمة
        try {
          const callChatIntegration = callChatIntegrationRef.current;
          callChatIntegration.handleCallEnded({
            roomId: endedRoomId,
            callId: null,
            duration: null,
            endedBy: null,
          });
          logger.callEvent("Call-Chat integration: call ended", {
            roomId: endedRoomId,
          });
        } catch (error) {
          logger.error(
            "Error updating Call-Chat integration on callEnded:",
            error
          );
        }

        // ✅ تنظيف callStatus عند انتهاء المكالمة
        const normalizedCurrentRoomId = roomId?.toString?.() || String(roomId || "");
        if (
          normalizedCurrentRoomId &&
          normalizedEndedRoomId &&
          normalizedCurrentRoomId === normalizedEndedRoomId
        ) {
          setCallStatus(null);
        leaveRoom();
      }

      // ✅ للمستخدمين الذين لديهم incoming modal فقط (غير منضمين للغرفة)
      setIncomingCall((currentIncomingCall) => {
        const incomingRoomId =
          currentIncomingCall?.roomId?.toString?.() ||
          String(currentIncomingCall?.roomId || "");
        if (
          incomingRoomId &&
          normalizedEndedRoomId &&
          incomingRoomId === normalizedEndedRoomId
        ) {
          return null;
        }
        return currentIncomingCall;
      });
      setWaitingCall((currentWaitingCall) => {
        const waitingRoomId =
          currentWaitingCall?.roomId?.toString?.() ||
          String(currentWaitingCall?.roomId || "");
        if (
          waitingRoomId &&
          normalizedEndedRoomId &&
          waitingRoomId === normalizedEndedRoomId
        ) {
          return null;
        }
        return currentWaitingCall;
      });
      },
      // ✅ Call-Chat Integration: Event listener لتحديث Redux عند استقبال room update من server
      roomUpdated: ({ roomId: updatedRoomId, updates }) => {
        logger.callEvent("Room updated from server", {
          roomId: updatedRoomId,
          updates,
        });
        try {
          const normalizedUpdatedRoomId =
            updatedRoomId?.toString?.() || String(updatedRoomId || "");
          const updatesHasSnapshot =
            updates &&
            (Object.prototype.hasOwnProperty.call(
              updates,
              "activeCallParticipantsSyncedAt"
            ) ||
              Object.prototype.hasOwnProperty.call(updates, "activeCallId"));

          if (updatesHasSnapshot && updates?.hasActiveCall === false) {
            clearCallParticipantsSnapshot(updatedRoomId, {
              updatedAt: updates?.activeCallParticipantsSyncedAt,
              callId: updates?.activeCallId || null,
            });
            // Fallback cleanup: if callCancelled/callEnded event was delayed or dropped,
            // close incoming/waiting UI using authoritative room state.
            setIncomingCall((currentIncomingCall) => {
              const incomingRoomId =
                currentIncomingCall?.roomId?.toString?.() ||
                String(currentIncomingCall?.roomId || "");
              const shouldClearIncoming =
                incomingRoomId &&
                normalizedUpdatedRoomId &&
                incomingRoomId === normalizedUpdatedRoomId;
              if (
                shouldClearIncoming
              ) {
                return null;
              }
              return currentIncomingCall;
            });
            setWaitingCall((currentWaitingCall) => {
              const waitingRoomId =
                currentWaitingCall?.roomId?.toString?.() ||
                String(currentWaitingCall?.roomId || "");
              if (
                waitingRoomId &&
                normalizedUpdatedRoomId &&
                waitingRoomId === normalizedUpdatedRoomId
              ) {
                return null;
              }
              return currentWaitingCall;
            });
            setRoomId((currentRoomId) => {
              const normalizedCurrentRoomId =
                currentRoomId?.toString?.() || String(currentRoomId || "");
              if (
                normalizedCurrentRoomId &&
                normalizedUpdatedRoomId &&
                normalizedCurrentRoomId === normalizedUpdatedRoomId
              ) {
                setCallStatus(null);
              }
              return currentRoomId;
            });
            return;
          }

          if (updatesHasSnapshot && Array.isArray(updates?.activeCallParticipants)) {
            const applied = applyCallParticipantsSnapshot({
              roomId: updatedRoomId,
              callId: updates?.activeCallId || null,
              isVideoCall: updates?.activeCallType === "video",
              startedAt: updates?.activeCallStartedAt || null,
              updatedAt: updates?.activeCallParticipantsSyncedAt,
              activeCallParticipants: updates?.activeCallParticipants,
            });
            if (!applied) return;
          }

          dispatch(
            updateRoom({
              _id: updatedRoomId,
              ...updates,
              skipAddIfNotExists: true, // ✅ منع إضافة room جديد للمشاهدين
            })
          );
          logger.callEvent("Redux room state updated from server", {
            roomId: updatedRoomId,
          });
        } catch (error) {
          logger.error("Error updating Redux room state from server:", error);
        }
      },
      callParticipantsSnapshot: ({
        roomId: snapshotRoomId,
        callId,
        isVideoCall,
        startedAt,
        updatedAt,
        activeCallParticipants,
      }) => {
        logger.callEvent("callParticipantsSnapshot received", {
          roomId: snapshotRoomId,
          callId,
          startedAt,
          updatedAt,
          participantsCount: Array.isArray(activeCallParticipants)
            ? activeCallParticipants.length
            : 0,
        });
        try {
          applyCallParticipantsSnapshot({
            roomId: snapshotRoomId,
            callId,
            isVideoCall,
            startedAt,
            updatedAt,
            activeCallParticipants,
          });
        } catch (error) {
          logger.error("Error applying callParticipantsSnapshot:", error);
        }
      },
      callQueueEnqueued: ({
        roomId: queuedRoomId,
        recipientId,
        queuePosition,
        timeoutMs,
      }) => {
        logger.callEvent("callQueueEnqueued received", {
          roomId: queuedRoomId,
          recipientId,
          queuePosition,
          timeoutMs,
        });
        if (queuedRoomId === roomId && isCaller) {
          setCallStatus("queued");
        }
      },
      callQueuePromoted: ({ roomId: promotedRoomId, recipientId, requestId }) => {
        logger.callEvent("callQueuePromoted received", {
          roomId: promotedRoomId,
          recipientId,
          requestId,
        });
        if (promotedRoomId === roomId && isCaller) {
          setCallStatus("ringing");
        }
      },
      callQueueBusyTimeout: ({
        roomId: busyRoomId,
        recipientId,
        reason,
        timeoutMs,
      }) => {
        logger.callEvent("callQueueBusyTimeout received", {
          roomId: busyRoomId,
          recipientId,
          reason,
          timeoutMs,
        });
        if (busyRoomId === roomId && isCaller) {
          setCallStatus("busy");
          dispatch(
            addAlert({
              type: "warning",
              title: tSafe("call.busyTitle", "User is unavailable"),
              message: tSafe(
                "call.busyMessage",
                "This user is unavailable for a call right now."
              ),
            })
          );
        }
      },
      // ✅ Event listener: عندما يتم إرسال الإشعار للطرف الآخر، نغير الحالة من "connecting" إلى "ringing"
      callInviteSummary: ({
        roomId: summaryRoomId,
        recipientsCount,
        connectedRecipientsCount,
      }) => {
        logger.callEvent("Call invite summary received", {
          roomId: summaryRoomId,
          recipientsCount,
          connectedRecipientsCount,
        });
        // ✅ إذا كانت المكالمة نشطة وكان المتصل هو caller
        // ✅ نغير الحالة إلى "ringing" فقط إذا كان هناك مستلمين متصلين فعلياً
        // استخدام refs لتجنب stale closure
        const currentIsCaller = isCaller;
        const currentRoomId = roomId;
        const actualConnectedCount =
          connectedRecipientsCount !== undefined
            ? connectedRecipientsCount
            : recipientsCount; // Fallback للتوافق مع الإصدارات القديمة
        const normalizedRecipientsCount = Number(recipientsCount || 0);

        if (currentRoomId === summaryRoomId) {
          recipientsCountRef.current = normalizedRecipientsCount;
          logger.callEvent("recipientsCount updated from invite summary", {
            roomId: summaryRoomId,
            recipientsCount: recipientsCountRef.current,
          });
        }

        if (
          currentIsCaller &&
          currentRoomId === summaryRoomId &&
          actualConnectedCount > 0
        ) {
          setCallStatus("ringing");
          logger.callEvent("Call status changed: connecting -> ringing", {
            roomId: summaryRoomId,
            connectedRecipients: actualConnectedCount,
          });
        } else if (
          currentIsCaller &&
          currentRoomId === summaryRoomId &&
          actualConnectedCount === 0
        ) {
          // ✅ إذا لم يكن هناك مستلمين متصلين، نبقى في حالة "connecting"
          logger.callEvent(
            "Call status remains connecting - no connected recipients",
            {
              roomId: summaryRoomId,
              totalRecipients: recipientsCount,
              connectedRecipients: actualConnectedCount,
            }
          );
        }
      },
      // ✅ Event listener: عندما يرن جهاز الطرف الآخر
      remoteRinging: ({ roomId: ringingRoomId, recipientId }) => {
        logger.callEvent("Remote ringing notification received", {
          roomId: ringingRoomId,
          recipientId,
        });
        if (ringingRoomId === roomId) {
          setIsRemoteRinging(true);
          // Update call status to ringing if not already
          setCallStatus("ringing");
        }
      },
      callRequestError: ({ error, roomId: errorRoomId }) => {
        logger.error("Call request error received", {
          error,
          roomId: errorRoomId,
        });
        // ✅ إذا كان الخطأ متعلق بعدم وجود الغرفة، نوقف المكالمة
        if (error === "Room not found" || error?.includes("Room not found")) {
          logger.error("Room not found, resetting call state", {
            roomId: errorRoomId,
          });
          setMediaError(
            createError(
              ERROR_CODES.ROOM_NOT_FOUND,
              "Room not found. Please try again."
            )
          );
          setCallStatus(null);
          // إعادة تعيين الحالة
          resetAll();
        }
      },
      // ✅ Call Waiting: إشعارات Hold/Resume
      callOnHold: ({ roomId: holdRoomId, heldBy, peerId }) => {
        logger.callEvent("Call on hold notification received", {
          roomId: holdRoomId,
          heldBy,
          peerId,
        });
        // إذا كانت المكالمة المحفوظة هي المكالمة الحالية
        if (holdRoomId === roomId && peerId !== socket.id) {
          // إشعار المستخدم أن أحد المشاركين وضع المكالمة على Hold
          logger.callEvent("Another participant put the call on hold", {
            heldBy,
            peerId,
          });
        }
      },
      callResumed: ({ roomId: resumeRoomId, resumedBy, peerId }) => {
        logger.callEvent("Call resumed notification received", {
          roomId: resumeRoomId,
          resumedBy,
          peerId,
        });
        // إذا كانت المكالمة المستأنفة هي المكالمة الحالية
        if (resumeRoomId === roomId && peerId !== socket.id) {
          // إشعار المستخدم أن أحد المشاركين استأنف المكالمة
          logger.callEvent("Another participant resumed the call", {
            resumedBy,
            peerId,
          });
        }
      },
      // ✅ Call Recording: إشعارات التسجيل
      callRecordingStarted: ({
        callId: recordingCallId,
        recordingId: newRecordingId,
        startedBy,
      }) => {
        logger.callEvent("Call recording started notification received", {
          callId: recordingCallId,
          recordingId: newRecordingId,
          startedBy,
        });
        // إذا كانت المكالمة المسجلة هي المكالمة الحالية
        if (recordingCallId === callId) {
          setIsRecording(true);
          setRecordingId(newRecordingId);
          logger.callEvent("Recording started for current call", {
            callId: recordingCallId,
            recordingId: newRecordingId,
            startedBy,
          });

          // ✅ إشعار المستخدم أن المكالمة مسجلة (إذا لم يكن هو من بدأ التسجيل)
          if (
            startedBy &&
            startedBy.toString() !== currentUser?._id?.toString()
          ) {
            dispatch(
              addAlert({
                type: "info",
                message: "This call is being recorded",
              })
            );
          }
        }
      },
      // ✅ إشعار طلب Screen Share
      screenShareRequested: ({
        callId: requestCallId,
        requesterId,
        requesterData,
        allowAll,
        action,
      }) => {
        logger.callEvent("Screen share requested notification received", {
          callId: requestCallId,
          requesterId,
          allowAll,
          action,
        });

        if (requestCallId === callId) {
          if (allowAll && action === "start") {
            // إذا كان allowAll، إشعار جميع المشاركين
            dispatch(
              addAlert({
                type: "info",
                message: `${getFullName(requesterData, false)} started screen sharing`,
              })
            );
          } else {
            // طلب موافقة
            const requesterName = getFullName(requesterData, false) || "Someone";
            dispatch(
              addAlert({
                type: "warning",
                message: t("call.screenShare.requestMessage", {
                  name: requesterName,
                }) || `${requesterName} requests you to share screen`,
                action: {
                  label: t("call.screenShare.accept") || "Accept",
                  onPress: async () => {
                    try {
                      await respondToScreenShareRequest(requesterId, true);
                    } catch (error) {
                      logger.error(
                        "Error accepting screen share request:",
                        error
                      );
                    }
                  },
                },
                action2: {
                  label: t("call.screenShare.reject") || "Reject",
                  onPress: async () => {
                    try {
                      await respondToScreenShareRequest(requesterId, false);
                    } catch (error) {
                      logger.error(
                        "Error rejecting screen share request:",
                        error
                      );
                    }
                  },
                },
              })
            );
          }
        }
      },
      // ✅ إشعار قبول طلب Screen Share
      screenShareRequestAccepted: ({ callId: requestCallId, acceptedBy }) => {
        logger.callEvent(
          "Screen share request accepted notification received",
          {
            callId: requestCallId,
            acceptedBy,
          }
        );

        if (requestCallId === callId) {
          dispatch(
            addAlert({
              type: "success",
              message:
                "Screen share request accepted. You can now start sharing.",
            })
          );

          // بدء Screen Share تلقائياً
          if (Platform.OS === "web") {
            startScreenShare().catch((error) => {
              logger.error(
                "Error starting screen share after acceptance:",
                error
              );
            });
          }
        }
      },
      // ✅ إشعار رفض طلب Screen Share
      screenShareRequestRejected: ({ callId: requestCallId, rejectedBy }) => {
        logger.callEvent(
          "Screen share request rejected notification received",
          {
            callId: requestCallId,
            rejectedBy,
          }
        );

        if (requestCallId === callId) {
          dispatch(
            addAlert({
              type: "error",
              message: "Screen share request was rejected",
            })
          );
        }
      },
      callTransferred: ({
        callId: transferredCallId,
        roomId: transferredRoomId,
        callerId,
        callerData,
        isVideoCall,
        transferredBy,
      }) => {
        logger.callEvent("Call transferred notification received", {
          callId: transferredCallId,
          roomId: transferredRoomId,
          callerId,
          transferredBy,
        });

        // ✅ إذا كانت المكالمة المنقولة هي المكالمة الحالية، ننضم إليها
        if (transferredCallId && transferredRoomId) {
          logger.callEvent("Joining transferred call", {
            callId: transferredCallId,
            roomId: transferredRoomId,
          });

          // استخدام بيانات المستخدم الحالي
          const userData = {
            images: currentUser?.images,
            _id: currentUser?._id,
            email: currentUser?.email,
            phoneNumber: currentUser?.phoneNumber,
            firstName: currentUser?.firstName,
            lastName: currentUser?.lastName,
            colors: currentUser?.colors,
          };

          // الانضمام للمكالمة المنقولة
          joinRoom({
            roomId: transferredRoomId,
            userId: currentUser._id,
            userData: userData,
            isVideoCall: isVideoCall || false,
            isCaller: false, // المستخدم المنقول إليه ليس caller
          }).catch((error) => {
            logger.error("Error joining transferred call:", error);
            dispatch(
              addAlert({
                type: "error",
                message: "Failed to join transferred call.",
              })
            );
          });
        }
      },
      // ✅ Raise Hand events
      handRaised: ({
        callId: raisedCallId,
        roomId: raisedRoomId,
        userId,
        userData: raisedUserData,
      }) => {
        logger.callEvent("Hand raised notification received", {
          callId: raisedCallId,
          roomId: raisedRoomId,
          userId,
          currentCallId: callId,
          currentRoomId: roomId,
        });

        if (raisedCallId === callId && raisedRoomId === roomId) {
          setRaisedHands((prev) => new Set([...prev, userId]));
          logger.callEvent("Hand raised added to state", { userId });
          // ✅ لا نعرض alert - الأيقونة ستظهر بجانب الاسم
        }
      },
      handLowered: ({
        callId: loweredCallId,
        roomId: loweredRoomId,
        userId,
      }) => {
        logger.callEvent("Hand lowered notification received", {
          callId: loweredCallId,
          roomId: loweredRoomId,
          userId,
        });

        if (loweredCallId === callId && loweredRoomId === roomId) {
          setRaisedHands((prev) => {
            const newSet = new Set(prev);
            newSet.delete(userId);
            return newSet;
          });
          logger.callEvent("Hand lowered removed from state", { userId });
        }
      },
      participantSpeakingLockUpdated: ({
        callId: updatedCallId,
        participantId,
        locked,
      }) => {
        if (String(updatedCallId || "") !== String(callId || "")) return;
        const targetId = String(participantId || "");
        if (!targetId) return;
        setSpeakingLocksByUserId((prev) => ({
          ...prev,
          [targetId]: Boolean(locked),
        }));
        if (String(currentUser?._id || "") === targetId && Boolean(locked)) {
          dispatch(
            addAlert({
              type: "warning",
              message:
                tSafe("call.speakingLocked") ||
                "A moderator temporarily locked your speaking permission.",
            })
          );
          if (isAudioEnabled) {
            toggleAudio().catch(() => {});
          }
        }
      },
      participantHandRaisePriorityUpdated: ({
        callId: updatedCallId,
        participantId,
        priority,
      }) => {
        if (String(updatedCallId || "") !== String(callId || "")) return;
        const targetId = String(participantId || "");
        if (!targetId) return;
        setHandRaisePriorityByUserId((prev) => ({
          ...prev,
          [targetId]: Number(priority) || 0,
        }));
      },
      // ✅ Viewer Joined event (لجميع الأطراف في الستريم)
      viewerJoined: ({ peerId, userId, userData, metadata, viewersCount }) => {
        logger.streamEvent("Viewer joined notification received", {
          peerId,
          userId,
          viewersCount,
          roomId,
        });

        // ✅ تحديث viewersCount في Redux room state لجميع الأطراف (بما في ذلك المشاهدين)
        if (roomId) {
          // ✅ إشعار الـ broadcasters فقط (للعرض في toast)
          if (currentRoleRef.current !== "viewer") {
            const viewerName =
              userData?.firstName || userData?.userName || "A viewer";
            logger.streamEvent(`New viewer joined: ${viewerName}`, {
              userId,
              viewersCount,
              roomId,
            });
          }

          // ✅ تحديث viewersCount في Redux room state لجميع الأطراف
          try {
            const streamChatIntegration = streamChatIntegrationRef.current;
            // ✅ استخدام viewersCount المرسل من السيرفر
            streamChatIntegration.handleViewerJoined({
              roomId,
              userId,
              userData,
              viewersCount, // ✅ تمرير viewersCount من السيرفر
            });
          } catch (error) {
            logger.error("Error updating viewersCount in Redux:", error);
          }
        }
      },
      // ✅ Viewer Left event (لجميع الأطراف في الستريم)
      viewerLeft: ({ peerId, userId, viewersCount }) => {
        logger.streamEvent("Viewer left notification received", {
          peerId,
          userId,
          viewersCount,
          roomId,
        });

        // ✅ تحديث viewersCount في Redux room state لجميع الأطراف (بما في ذلك المشاهدين)
        if (roomId) {
          try {
            const streamChatIntegration = streamChatIntegrationRef.current;
            // ✅ استخدام viewersCount المرسل من السيرفر
            streamChatIntegration.handleViewerLeft({
              roomId,
              userId,
              viewersCount, // ✅ تمرير viewersCount من السيرفر
            });
          } catch (error) {
            logger.error("Error updating viewersCount in Redux:", error);
          }
        }
      },
      ...createLiveStreamSocketHandlers({
        streamChatIntegrationRef,
        logger,
      }),
    };

    // إضافة socket connection state listeners
    const connectionHandlers = {
      disconnect: () => {
        logger.callEvent("Socket disconnected event received");
        clearAllActiveCallIndicators();
        // saveRoomInfo سيتم استدعاؤه من disconnect handler في stateMachine
      },
      reconnect: (attemptNumber) => {
        logger.callEvent(`Socket reconnected (attempt ${attemptNumber})`);
        // إعادة الاتصال بالغرفة بعد إعادة الاتصال بالـ socket
        if (roomInfoBeforeDisconnectRef.current && !isReconnecting) {
          // تأخير قصير للتأكد من أن socket جاهز
          setTimeout(() => {
            reconnectToRoom();
          }, 1000);
        }
      },
      reconnect_attempt: (attemptNumber) => {
        logger.callEvent(`Socket reconnection attempt ${attemptNumber}`);
        setIsReconnecting(true);
      },
      reconnect_failed: () => {
        logger.error("Socket reconnection failed");
        setIsReconnecting(false);
        setReconnectAttempts(0);
        if (roomInfoBeforeDisconnectRef.current) {
          setMediaError(
            createError(
              ERROR_CODES.NETWORK_ERROR,
              "Connection lost and reconnection failed. Please try joining again."
            )
          );
        }
      },
      reconnect_error: (error) => {
        logger.error("Socket reconnection error:", error);
      },
    };

    // إضافة connection state listeners
    Object.entries(connectionHandlers).forEach(([eventName, handler]) => {
      socket.on(eventName, handler);
    });

    // تسجيل جميع listeners الجديدة
    Object.entries(handlers).forEach(([eventName, handler]) => {
      socket.on(eventName, handler);
    });

    // Cleanup function: إزالة جميع listeners باستخدام handler functions المحفوظة
    return () => {
      // إلغاء أي محاولات إعادة اتصال معلقة
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }

      // ✅ إزالة connection state listeners
      if (socket && typeof socket.off === "function") {
        Object.entries(connectionHandlers).forEach(([eventName, handler]) => {
          try {
            socket.off(eventName, handler);
          } catch (error) {
            logger.error(
              `Error removing connection listener ${eventName}:`,
              error
            );
          }
        });

        // ✅ إزالة handlers
        Object.entries(handlers).forEach(([eventName, handler]) => {
          try {
            socket.off(eventName, handler);
          } catch (error) {
            logger.error(`Error removing handler ${eventName}:`, error);
          }
        });
      }
    };
  }, [
    socket,
    consume,
    incomingCall,
    isJoined,
    roomId,
    currentUser,
    isReconnecting,
    reconnectAttempts,
    joinRoom,
    setMediaError,
    toggleAudio,
    leaveRoom,
    isCaller,
    isAudioEnabled,
    dispatch,
    wasRoomCancelledRecently,
    markCancelledRoom,
    markRejectedParticipant,
    clearRejectedParticipantsForRoom,
  ]);

  // ✅ تنظيف callStatus عندما تبدأ المكالمة فعلياً (عندما ينضم peers)
  useEffect(() => {
    if (isCaller && callStatus && peers.length > 0) {
      // عندما ينضم peer، المكالمة بدأت فعلياً، لا حاجة لعرض "connecting" أو "ringing"
      setCallStatus(null);
      logger.callEvent("Call status cleared - call started", {
        peersCount: peers.length,
      });
    }
  }, [isCaller, callStatus, peers.length]);

  // ✅ تنظيف callStatus عند إغلاق المكالمة (عندما يصبح roomId = null)
  useEffect(() => {
    if (!roomId && callStatus) {
      setCallStatus(null);
      logger.callEvent("Call status cleared - room closed", { roomId });
    }
  }, [roomId, callStatus]);

  // ✅ تنظيف callStatus عند تغيير isCaller إلى false
  useEffect(() => {
    if (!isCaller && callStatus) {
      setCallStatus(null);
      logger.callEvent("Call status cleared - not caller anymore", {
        isCaller,
      });
    }
  }, [isCaller, callStatus]);

  // ✅ Missed Call Timeout: مراقبة incomingCall وإضافة timeout تلقائي
  useEffect(() => {
    // تنظيف timeout السابق إذا كان موجوداً
    if (missedCallTimeoutRef.current) {
      clearTimeout(missedCallTimeoutRef.current);
      missedCallTimeoutRef.current = null;
    }

    // إذا لم تكن هناك مكالمة واردة، لا نضيف timeout
    if (!incomingCall) {
      return;
    }

    // ✅ إضافة timeout (30 ثانية) للمكالمة الواردة
    const MISSED_CALL_TIMEOUT = TIMEOUTS.MISSED_CALL_TIMEOUT || 60000; // 60 ثانية افتراضياً

    logger.callEvent("Starting missed call timeout", {
      roomId: incomingCall.roomId,
      timeout: MISSED_CALL_TIMEOUT,
    });

    missedCallTimeoutRef.current = setTimeout(() => {
      // إذا كانت المكالمة لا تزال واردة ولم يتم قبولها أو رفضها
      if (incomingCall) {
        logger.callEvent("Missed call timeout reached", {
          roomId: incomingCall.roomId,
          callerId: incomingCall.callerId,
        });

        // ✅ إرسال event للسيرفر لإنشاء/تحديث Call record بـ status: "missed"
        socket.emit("markCallAsMissed", {
          roomId: incomingCall.roomId,
          callerId: incomingCall.callerId,
          isVideoCall: incomingCall.isVideoCall, // ✅ إرسال نوع المكالمة
        });

        // ✅ تنظيف incomingCall state
        setIncomingCall(null);
        clearCallParticipantsSnapshot(incomingCall.roomId);

        // ✅ FSM transition
        const stateMachine = callStateMachineRef.current;
        if (stateMachine.canTransition(CALL_EVENTS.REJECT_CALL)) {
          stateMachine.transition(CALL_EVENTS.REJECT_CALL, {
            roomId: incomingCall.roomId,
            reason: "timeout",
          });
        }

        logger.callEvent("Call marked as missed due to timeout");
      }
    }, MISSED_CALL_TIMEOUT);

    // تنظيف timeout عند unmount أو تغيير incomingCall
    return () => {
      if (missedCallTimeoutRef.current) {
        clearTimeout(missedCallTimeoutRef.current);
        missedCallTimeoutRef.current = null;
      }
    };
  }, [incomingCall, socket, clearCallParticipantsSnapshot]);

  useEffect(() => {
    if (!waitingCall) return;
  }, [waitingCall, incomingCall]);

  useEffect(() => {
    if (!waitingCall?.roomId) return;
    const WAITING_CALL_TIMEOUT = TIMEOUTS.MISSED_CALL_TIMEOUT || 60000;
    const timeoutId = setTimeout(() => {
      setWaitingCall((currentWaitingCall) => {
        if (!currentWaitingCall) return currentWaitingCall;
        return null;
      });
    }, WAITING_CALL_TIMEOUT);
    return () => clearTimeout(timeoutId);
  }, [waitingCall?.roomId]);

  /**
   * قبول المكالمة الواردة
   */
  const acceptCall = useCallback(async (options = {}) => {
    if (!incomingCall) return;
    
    const stateMachine = callStateMachineRef.current;
    let currentState = stateMachine.getState();
    
    const ensureRingingStateForAccept = () => {
      currentState = stateMachine.getState();
      if (stateMachine.canTransition(CALL_EVENTS.ACCEPT_CALL)) return true;

      // Recover from error -> idle first
      if (currentState === CALL_STATES.ERROR) {
        logger.warn("Recovering state machine from ERROR before acceptCall");
        stateMachine.reset();
        currentState = stateMachine.getState();
      }

      // If we are idle but still have an incoming call, bootstrap to ringing
      if (currentState === CALL_STATES.IDLE && incomingCall?.roomId) {
        logger.callEvent(
          "acceptCall recovery: bootstrapping state from IDLE via INCOMING_CALL",
          {
            roomId: incomingCall.roomId,
          }
        );
        stateMachine.transition(CALL_EVENTS.INCOMING_CALL, {
          roomId: incomingCall.roomId,
          callerId: incomingCall.callerId,
          isVideoCall: incomingCall.isVideoCall,
        });
      }

      currentState = stateMachine.getState();
      return stateMachine.canTransition(CALL_EVENTS.ACCEPT_CALL);
    };

    // التحقق من إمكانية قبول المكالمة
    if (!ensureRingingStateForAccept()) {
      logger.warn(
        "Cannot accept call - invalid state:",
        currentState
      );
      const error = createError(
        ERROR_CODES.INVALID_STATE,
        `Cannot accept call in ${currentState} state`
      );
      throw error;
    }
    
    logger.callEvent("Accepting incoming call");
    const callIsVideo = Boolean(incomingCall?.isVideoCall);
    const joinWithVideo =
      typeof options?.joinWithVideo === "boolean"
        ? options.joinWithVideo
        : callIsVideo;
    
    // طلب الأذونات قبل قبول المكالمة (Pre-call permissions)
    if (Platform.OS === "web") {
      logger.callEvent(
        "Requesting device permissions before accepting call..."
      );
      const permissions = await requestDevicePermissionsWithRetry(2);
      
      if (!permissions.audio && !permissions.video) {
        throw createError(
          ERROR_CODES.DEVICE_PERMISSION_DENIED,
          "Device permissions denied. Please allow access to microphone and/or camera."
        );
      }
      
      // كشف الأجهزة بعد الحصول على الأذونات
      await detectDevices();
      
      logger.callEvent("Permissions granted for incoming call:", {
        audio: permissions.audio,
        video: permissions.video,
      });
    }
    
    // الانتقال إلى حالة JOINING
    stateMachine.transition(CALL_EVENTS.ACCEPT_CALL, { incomingCall });
    
    setIsCaller(false);
    
    // استخدام بيانات المستخدم الحالي من Redux selector
    const userData = {
      images: currentUser?.images,
      _id: currentUser?._id,
      email: currentUser?.email,
      phoneNumber: currentUser?.phoneNumber,
      firstName: currentUser?.firstName,
      lastName: currentUser?.lastName,
      colors: currentUser?.colors,
    };
    
      setIsCaller(false); // المستجيب ليس caller

    // استخدام currentUser._id بدلاً من socket.id لأن السيرفر يتحقق من userId
    if (!currentUser?._id) {
      throw createError(
        ERROR_CODES.INVALID_STATE,
        "User ID not available. Please log in again."
      );
    }

    try {
      await joinRoom({
        roomId: incomingCall.roomId,
        userId: currentUser._id, // استخدام user ID وليس socket ID
          userData: userData,
        isVideoCall: callIsVideo,
        callIsVideo,
        joinWithVideo,
        isCaller: false, // المستجيب ليس caller
      });
    } catch (error) {
      const normalizedError = normalizeError(error);
      // ✅ Keep accept flow recoverable for retry when device is busy
      if (normalizedError?.code === ERROR_CODES.DEVICE_IN_USE) {
        stateMachine.reset();
        setIsCaller(false);

        // If the incoming call is video and camera is busy, retry as audio once.
        if (incomingCall?.isVideoCall) {
          try {
            logger.callEvent(
              "acceptCall fallback: retrying as audio due to busy device",
              { roomId: incomingCall.roomId }
            );
            await joinRoom({
              roomId: incomingCall.roomId,
              userId: currentUser._id,
              userData,
              isVideoCall: callIsVideo,
              callIsVideo,
              joinWithVideo: false,
              isCaller: false,
            });
            setIncomingCall(null);
            dispatch(
              addAlert({
                type: "warning",
                title: tSafe("call.callAction", "Call"),
                message:
                  tSafe(
                    "call.videoBusyAcceptedAudio",
                    "Camera is busy, joined as audio call."
                  ),
              })
            );
            return;
          } catch (audioFallbackError) {
            logger.error("acceptCall audio fallback failed:", audioFallbackError);
          }
        }
      }
      throw normalizedError;
    }
    
    setIncomingCall(null);
  }, [
    incomingCall,
    joinRoom,
    socket,
    currentUser,
    requestDevicePermissionsWithRetry,
    detectDevices,
    dispatch,
    tSafe,
  ]);

  /**
   * رفض المكالمة الواردة
   */
  const rejectCall = useCallback(() => {
    if (!incomingCall) return;

    // ✅ تنظيف missed call timeout عند رفض المكالمة
    if (missedCallTimeoutRef.current) {
      clearTimeout(missedCallTimeoutRef.current);
      missedCallTimeoutRef.current = null;
    }
    
    const stateMachine = callStateMachineRef.current;
    
    // التحقق من إمكانية رفض المكالمة (مع recovery لتجنب رمي أخطاء UI)
    if (!stateMachine.canTransition(CALL_EVENTS.REJECT_CALL)) {
      const currentState = stateMachine.getState();
      logger.warn("rejectCall recovery path", { currentState });

      if (currentState === CALL_STATES.ERROR || currentState === CALL_STATES.IDLE) {
        stateMachine.reset();
        if (incomingCall?.roomId && stateMachine.canTransition(CALL_EVENTS.INCOMING_CALL)) {
          stateMachine.transition(CALL_EVENTS.INCOMING_CALL, {
            roomId: incomingCall.roomId,
            callerId: incomingCall.callerId,
            isVideoCall: incomingCall.isVideoCall,
          });
        }
      }
    }
    
    logger.callEvent("Rejecting incoming call");
    
    // الانتقال إلى حالة IDLE (best effort)
    if (stateMachine.canTransition(CALL_EVENTS.REJECT_CALL)) {
      stateMachine.transition(CALL_EVENTS.REJECT_CALL, { incomingCall });
    } else {
      stateMachine.reset();
    }
    
    setIsCaller(false);
    setCallStatus(null); // ✅ تنظيف callStatus عند رفض المكالمة الواردة
    clearCallParticipantsSnapshot(incomingCall.roomId);
    try {
      socket.emit("callRejected", {
        roomId: incomingCall.roomId,
        callerId: incomingCall.callerId,
      });
    } catch (error) {
      logger.error("rejectCall emit failed:", error);
    }
    
    setIsIncomingCallMinimized(false);
    setIncomingCall(null);
  }, [incomingCall, socket, clearCallParticipantsSnapshot]);

  const minimizeIncomingCall = useCallback(() => {
    if (!incomingCall) return;
    setIsIncomingCallMinimized(true);
    logger.callEvent("Incoming call modal minimized", {
      roomId: incomingCall?.roomId,
    });
  }, [incomingCall]);

  const restoreIncomingCallModal = useCallback(() => {
    if (!incomingCall) return;
    setIsIncomingCallMinimized(false);
    logger.callEvent("Incoming call modal restored", {
      roomId: incomingCall?.roomId,
    });
  }, [incomingCall]);

  /**
   * ✅ Call Waiting: Hold المكالمة الحالية
   */
  const holdCall = useCallback(async () => {
    if (!isJoined || !roomId) {
      logger.warn("Cannot hold call - no active call");
      return;
    }

    try {
      logger.callEvent("Holding current call", { roomId });

      // ✅ استخدام holdCall handler في السيرفر (سيقوم بإيقاف جميع producers تلقائياً)
      const holdResult = await socket.emitWithAck("holdCall", {
        roomId,
      });

      if (!holdResult || !holdResult.success) {
        logger.error("Failed to hold call on server:", holdResult?.error);
        throw new Error(holdResult?.error || "Failed to hold call");
      }

      // حفظ معلومات المكالمة بعد نجاح Hold
      setHeldCallInfo({
        roomId,
        isVideoCall,
      });
      setIsCallOnHold(true);

      logger.callEvent("Call held successfully", {
        roomId,
        pausedProducers: holdResult.pausedProducers,
      });
    } catch (error) {
      logger.error("Error holding call:", error);
      throw error;
    }
  }, [isJoined, roomId, isVideoCall, socket, currentUser]);

  /**
   * ✅ Call Waiting: Resume المكالمة المحفوظة
   */
  const resumeCall = useCallback(async () => {
    if (!isCallOnHold || !heldCallInfo) {
      logger.warn("Cannot resume call - no call on hold");
      return;
    }

    try {
      logger.callEvent("Resuming held call", { roomId: heldCallInfo.roomId });

      // ✅ استخدام resumeCall handler في السيرفر (سيقوم باستئناف جميع producers تلقائياً)
      const resumeResult = await socket.emitWithAck("resumeCall", {
        roomId: heldCallInfo.roomId,
      });

      if (!resumeResult || !resumeResult.success) {
        logger.error("Failed to resume call on server:", resumeResult?.error);
        throw new Error(resumeResult?.error || "Failed to resume call");
      }

      setIsCallOnHold(false);
      setHeldCallInfo(null);

      logger.callEvent("Call resumed successfully", {
        roomId: heldCallInfo.roomId,
        resumedProducers: resumeResult.resumedProducers,
      });
    } catch (error) {
      logger.error("Error resuming call:", error);
      throw error;
    }
  }, [isCallOnHold, heldCallInfo, socket, currentUser]);

  /**
   * ✅ Call Waiting: قبول المكالمة الواردة (End current + Accept)
   */
  const acceptWaitingCall = useCallback(
    async (options = {}) => {
      if (!waitingCall) {
        logger.warn("Cannot accept waiting call - no waiting call");
        return;
      }

      try {
        const callIsVideo = Boolean(waitingCall?.isVideoCall);
        const joinWithVideo =
          typeof options?.joinWithVideo === "boolean"
            ? options.joinWithVideo
            : callIsVideo;
        logger.callEvent("Accepting waiting call", {
          waitingCallRoomId: waitingCall.roomId,
          strategy: "end-and-accept",
          callIsVideo,
          joinWithVideo,
        });

        const userData = {
          images: currentUser?.images,
          _id: currentUser?._id,
          email: currentUser?.email,
          phoneNumber: currentUser?.phoneNumber,
          firstName: currentUser?.firstName,
          lastName: currentUser?.lastName,
          colors: currentUser?.colors,
        };

        // إنهاء المكالمة الحالية
        await leaveRoom();
        // انتظار قصير للتأكد من إنهاء المكالمة
        await new Promise((resolve) => setTimeout(resolve, 500));

        // قبول المكالمة الواردة
        setIsCaller(false);
        setCallStatus(null);

        await joinRoom({
          roomId: waitingCall.roomId,
          userId: currentUser._id,
          userData: userData,
          isVideoCall: callIsVideo,
          callIsVideo,
          joinWithVideo,
          isCaller: false,
        });

        // تنظيف waiting call
        setIsWaitingCallMinimized(false);
        setWaitingCall(null);

        logger.callEvent("Waiting call accepted successfully", {
          roomId: waitingCall.roomId,
          strategy: "end-and-accept",
        });
      } catch (error) {
        logger.error("Error accepting waiting call:", error);
        throw error;
      }
    },
    [waitingCall, leaveRoom, joinRoom, currentUser, socket]
  );

  /**
   * ✅ Call Waiting: رفض المكالمة الواردة
   */
  const rejectWaitingCall = useCallback(() => {
    if (!waitingCall) {
      logger.warn("Cannot reject waiting call - no waiting call");
      return;
    }

    try {
      logger.callEvent("Rejecting waiting call", {
        roomId: waitingCall.roomId,
      });

      socket.emit("callRejected", {
        roomId: waitingCall.roomId,
        callerId: waitingCall.callerId,
      });

      setIsWaitingCallMinimized(false);
      setWaitingCall(null);

      logger.callEvent("Waiting call rejected successfully");
    } catch (error) {
      logger.error("Error rejecting waiting call:", error);
      throw error;
    }
  }, [waitingCall, socket]);

  const minimizeWaitingCall = useCallback(() => {
    if (!waitingCall) return;
    setIsWaitingCallMinimized(true);
    logger.callEvent("Waiting call modal minimized", {
      roomId: waitingCall?.roomId,
    });
  }, [waitingCall]);

  const restoreWaitingCallModal = useCallback(() => {
    if (!waitingCall) return;
    setIsWaitingCallMinimized(false);
    logger.callEvent("Waiting call modal restored", {
      roomId: waitingCall?.roomId,
    });
  }, [waitingCall]);

  /**
   * ✅ Call Recording: بدء التسجيل
   */
  const startRecording = useCallback(
    async (options = {}) => {
      if (!callId) {
        logger.warn("Cannot start recording - no call ID");
        throw createError(
          ERROR_CODES.INVALID_STATE,
          "No active call to record"
        );
      }

      // ✅ إزالة التحقق من isRecording - نعتمد على السيرفر للتحقق
      // السيرفر سيتحقق من حالة التسجيل الفعلية
      try {
        logger.callEvent("Starting call recording", { callId });

        const result = await socket.emitWithAck("startCallRecording", {
          callId,
          options,
        });

        if (!result || !result.success) {
          logger.error("Failed to start recording:", result?.error);
          throw createError(
            ERROR_CODES.RECORDING_FAILED,
            result?.error || "Failed to start recording"
          );
        }

        setIsRecording(true);
        setRecordingId(result.recording?._id || null);

        logger.callEvent("Call recording started successfully", {
          callId,
          recordingId: result.recording?._id,
        });

        return result.recording;
      } catch (error) {
        logger.error("Error starting recording:", error);
        throw error;
      }
    },
    [callId, isRecording, socket]
  );

  /**
   * ✅ Call Recording: إيقاف التسجيل
   */
  const stopRecording = useCallback(async () => {
    if (!callId) {
      logger.warn("Cannot stop recording - no call ID");
      throw createError(ERROR_CODES.INVALID_STATE, "No active call");
    }

    if (!isRecording) {
      logger.warn("No recording in progress");
      throw createError(ERROR_CODES.INVALID_STATE, "No recording in progress");
    }

    try {
      logger.callEvent("Stopping call recording", { callId, recordingId });

      const result = await socket.emitWithAck("stopCallRecording", {
        callId,
      });

      if (!result || !result.success) {
        logger.error("Failed to stop recording:", result?.error);
        throw createError(
          ERROR_CODES.RECORDING_FAILED,
          result?.error || "Failed to stop recording"
        );
      }

      setIsRecording(false);
      const stoppedRecordingId = recordingId;
      setRecordingId(null);

      logger.callEvent("Call recording stopped successfully", {
        callId,
        recordingId: stoppedRecordingId,
      });

      return result.recording;
    } catch (error) {
      logger.error("Error stopping recording:", error);
      throw error;
    }
  }, [callId, isRecording, recordingId, socket]);

  /**
   * ✅ Call Recording: الحصول على تسجيلات المستخدم
   */
  const getUserRecordings = useCallback(
    async ({ type = "all", limit = 20, offset = 0 } = {}) => {
      try {
        logger.callEvent("Getting user recordings", { type, limit, offset });

        return new Promise((resolve, reject) => {
          socket.emit(
            "getUserRecordings",
            { type, limit, offset },
            (response) => {
              if (response.success) {
                logger.callEvent("User recordings retrieved successfully", {
                  total: response.total,
                  callRecordings: response.callRecordings?.length || 0,
                  streamRecordings: response.streamRecordings?.length || 0,
                });
                resolve(response);
              } else {
                logger.error("Error getting user recordings:", response.error);
                reject(new Error(response.error));
              }
            }
          );
        });
      } catch (error) {
        logger.error("Error getting user recordings:", error);
        throw error;
      }
    },
    [socket]
  );

  /**
   * ✅ Call Recording: الحصول على تسجيل مكالمة محددة
   */
  const getCallRecording = useCallback(
    async (callId) => {
      try {
        logger.callEvent("Getting call recording", { callId });

        // الحصول على جميع التسجيلات والبحث عن التسجيل المرتبط بهذه المكالمة
        const recordings = await getUserRecordings({
          type: "call",
          limit: 100,
          offset: 0,
        });
        const recording = recordings.callRecordings?.find(
          (r) =>
            r.call?._id?.toString() === callId?.toString() ||
            r.call?.toString() === callId?.toString()
        );

        if (recording) {
          logger.callEvent("Call recording found", {
            recordingId: recording._id,
            callId,
          });
          return recording;
        }

        logger.warn("Call recording not found", { callId });
        return null;
      } catch (error) {
        logger.error("Error getting call recording:", error);
        throw error;
      }
    },
    [getUserRecordings]
  );

  /**
   * ✅ Call Recording: التحقق من حالة التسجيل
   */
  const checkRecordingStatus = useCallback(
    async (recordingId, callId) => {
      try {
        logger.callEvent("Checking recording status", { recordingId, callId });

        return new Promise((resolve, reject) => {
          socket.emit(
            "checkRecordingStatus",
            { recordingId, callId },
            (response) => {
              if (response.success) {
                logger.callEvent("Recording status checked", {
                  recordingId,
                  status: response.recording?.status,
                });
                resolve(response.recording);
              } else {
                logger.error(
                  "Error checking recording status:",
                  response.error
                );
                reject(new Error(response.error));
              }
            }
          );
        });
      } catch (error) {
        logger.error("Error checking recording status:", error);
        throw error;
      }
    },
    [socket]
  );

  // ✅ تم إزالة اللوغات المتكررة لتقليل الضغط على console
  // logger.debug("isJoined", isJoined);
  // logger.debug("roomId", roomId);

  /**
   * إعادة كشف الأجهزة
   */
  const refreshDevices = useCallback(async () => {
    logger.deviceEvent("Refreshing devices...");
    await detectDevices();
  }, [detectDevices]);

  /**
   * الانضمام كـ viewer (مشاهد فقط - لا يمكنه produce)
   */
  const joinAsViewer = useCallback(
    async ({ roomId: newRoomId, userId, userData }) => {
      try {
        // ✅ فحص إضافي: إذا كان المستخدم منضم بالفعل لنفس الـ room، لا نعيد المحاولة
        if (isJoined && roomId === newRoomId) {
          logger.callEvent(
            "Already joined as viewer, skipping duplicate joinAsViewer",
            { newRoomId, currentRoomId: roomId, isJoined }
          );
          return;
        }

        const stateMachine = callStateMachineRef.current;
        const currentState = stateMachine.getState();

        // إذا كانت الحالة error أو في حالة غير صالحة، نعيد تعيينها إلى IDLE
        if (
          currentState === CALL_STATES.ERROR ||
          currentState === CALL_STATES.LEAVING ||
          currentState === CALL_STATES.ENDED
        ) {
          logger.warn(
            "State machine in invalid state, resetting to IDLE:",
            currentState
          );
          stateMachine.reset();
        }

        if (!guardManager.canJoin()) {
          logger.warn("Already joining a room, ignoring duplicate call");
          return;
        }

        logger.callEvent("Joining as viewer", {
          roomId: newRoomId,
          userId,
          currentState: stateMachine.getState(),
        });

        // التأكد من أن الحالة IDLE قبل الانتقال
        if (stateMachine.getState() !== CALL_STATES.IDLE) {
          logger.warn("State is not IDLE, resetting:", stateMachine.getState());
          stateMachine.reset();
        }

        // الانتقال إلى حالة INVITING
        if (stateMachine.canTransition(CALL_EVENTS.START_CALL)) {
          stateMachine.transition(CALL_EVENTS.START_CALL, {
            roomId: newRoomId,
            userId,
            userData,
            isVideoCall: true,
          });
          logger.callEvent("Transitioned to INVITING state", {
            newState: stateMachine.getState(),
          });
        } else {
          logger.error(
            "Cannot transition to INVITING from state:",
            stateMachine.getState()
          );
          // محاولة reset ثم الانتقال مرة أخرى
          stateMachine.reset();
          if (stateMachine.canTransition(CALL_EVENTS.START_CALL)) {
            stateMachine.transition(CALL_EVENTS.START_CALL, {
              roomId: newRoomId,
              userId,
              userData,
              isVideoCall: true,
            });
            logger.callEvent("Transitioned to INVITING state after reset", {
              newState: stateMachine.getState(),
            });
          } else {
            throw createError(
              ERROR_CODES.INVALID_STATE,
              `Cannot transition to INVITING from ${stateMachine.getState()} state`
            );
          }
        }

        // التأكد من أن الحالة أصبحت INVITING قبل استدعاء joinRoom
        if (stateMachine.getState() !== CALL_STATES.INVITING) {
          logger.error(
            "State is not INVITING after transition:",
            stateMachine.getState()
          );
          throw createError(
            ERROR_CODES.INVALID_STATE,
            `Expected INVITING state but got ${stateMachine.getState()}`
          );
        }

        // ✅ تنظيف localStream قبل الانضمام كـ viewer (لضمان عدم ظهور المشاهد كأنه مشارك)
        if (localStream) {
          try {
            logger.callEvent(
              "Cleaning up localStream before joining as viewer",
              { roomId: newRoomId }
            );
            localStream.getTracks().forEach((track) => {
              track.stop();
            });
            setLocalStream(null);
            logger.callEvent("LocalStream cleaned up successfully for viewer", {
              roomId: newRoomId,
            });
          } catch (e) {
            logger.error("Error cleaning up localStream in joinAsViewer:", e);
          }
        }

        // الانضمام كـ viewer (بدون produce)
        await joinRoom({
          roomId: newRoomId,
          userId,
          userData,
          isVideoCall: true,
          isCaller: false,
          role: "viewer", // ✅ إضافة role
        });

        logger.callEvent("Successfully joined as viewer");
      } catch (error) {
        logger.error("Error joining as viewer:", error);
        const normalizedError = normalizeError(error);
        // ✅ فقط إذا لم نكن في حالة ERROR بالفعل
        const currentState = callStateMachineRef.current.getState();
        if (currentState !== CALL_STATES.ERROR) {
          if (
            callStateMachineRef.current.canTransition(
              CALL_EVENTS.ERROR_OCCURRED
            )
          ) {
            callStateMachineRef.current.transition(CALL_EVENTS.ERROR_OCCURRED, {
              error: normalizedError.message,
            });
          }
        }
        throw normalizedError;
      }
    },
    [joinRoom, isJoined, roomId, localStream]
  );

  /**
   * بدء البث المباشر
   */
  const startLiveStream = useCallback(
    async ({ roomId, settings = {} }) => {
      try {
        return await withTimeout(
          new Promise((resolve, reject) => {
            socket.emit("startLiveStream", { roomId, settings }, (response) => {
              if (response.success) {
                logger.callEvent("Live stream started successfully", {
                  roomId,
                });
                resolve(response.room);
              } else {
                logger.error("Error starting live stream:", response.error);
                reject(new Error(response.error));
              }
            });
          }),
          TIMEOUTS.SOCKET_ACK_TIMEOUT,
          "startLiveStream"
        );
      } catch (error) {
        logger.error("Error starting live stream:", error);
        throw error;
      }
    },
    [socket, withTimeout]
  );

  /**
   * طلب تحويل المكالمة إلى ستريم (يتطلب موافقة الطرف الآخر)
   */
  const requestLiveStream = useCallback(
    async ({ roomId, userData, settings = {} }) => {
      try {
        return await withTimeout(
          new Promise((resolve, reject) => {
            socket.emit(
              "requestLiveStream",
              { roomId, userData, settings },
              (response) => {
                if (response.success) {
                  logger.callEvent("Live stream request sent successfully", {
                    roomId,
                  });
                  resolve(response);
                } else {
                  logger.error("Error requesting live stream:", response.error);
                  reject(new Error(response.error));
                }
              }
            );
          }),
          TIMEOUTS.SOCKET_ACK_TIMEOUT,
          "requestLiveStream"
        );
      } catch (error) {
        logger.error("Error requesting live stream:", error);
        throw error;
      }
    },
    [socket, withTimeout]
  );

  /**
   * الرد على طلب تحويل المكالمة إلى ستريم
   */
  const respondToLiveStreamRequest = useCallback(
    async ({ roomId, accepted, settings = {} }) => {
      try {
        return await withTimeout(
          new Promise((resolve, reject) => {
            socket.emit(
              "respondToLiveStreamRequest",
              { roomId, accepted, settings },
              (response) => {
                if (response.success) {
                  logger.callEvent(
                    "Live stream request response sent successfully",
                    { roomId, accepted }
                  );
                  resolve(response);
                } else {
                  logger.error(
                    "Error responding to live stream request:",
                    response.error
                  );
                  reject(new Error(response.error));
                }
              }
            );
          }),
          TIMEOUTS.SOCKET_ACK_TIMEOUT,
          "respondToLiveStreamRequest"
        );
      } catch (error) {
        logger.error("Error responding to live stream request:", error);
        throw error;
      }
    },
    [socket, withTimeout]
  );

  /**
   * إيقاف البث المباشر
   */
  const stopLiveStream = useCallback(
    async ({ roomId }) => {
      try {
        const result = await withTimeout(
          new Promise((resolve, reject) => {
            socket.emit("stopLiveStream", { roomId }, (response) => {
              if (response.success) {
                logger.callEvent("Live stream stopped successfully", {
                  roomId,
                });
                resolve(response);
              } else {
                logger.error("Error stopping live stream:", response.error);
                reject(new Error(response.error));
              }
            });
          }),
          TIMEOUTS.SOCKET_ACK_TIMEOUT,
          "stopLiveStream"
        );

        // ✅ Stream-Chat Integration: تحديث Redux room state عند إيقاف الستريم
        try {
          const streamChatIntegration = streamChatIntegrationRef.current;
          const streamInfo = streamChatIntegration.getActiveStreamInfo(roomId);
          const duration = streamInfo
            ? Date.now() - new Date(streamInfo.startedAt).getTime()
            : null;

          streamChatIntegration.handleStreamEnded({
            roomId,
            streamId: streamInfo?.streamId || null,
            duration: duration ? Math.floor(duration / 1000) : null, // Convert to seconds
            endedBy: currentUser?._id,
          });
          logger.streamEvent("Stream-Chat integration: stream ended", {
            roomId,
          });
        } catch (error) {
          logger.error(
            "Error updating Stream-Chat integration on stop:",
            error
          );
        }

        return result.room || result;
      } catch (error) {
        logger.error("Error stopping live stream:", error);
        throw error;
      }
    },
    [socket, withTimeout, currentUser]
  );

  /**
   * الحصول على Live Streams النشطة
   */
  const getLiveStreams = useCallback(
    async ({ limit = 20, offset = 0 } = {}) => {
      try {
        return await withTimeout(
          new Promise((resolve, reject) => {
            socket.emit("getLiveStreams", { limit, offset }, (response) => {
              if (response.success) {
                logger.callEvent("Live streams retrieved successfully", {
                  count: response.streams?.length,
                });
                resolve(response.streams);
              } else {
                logger.error("Error getting live streams:", response.error);
                reject(new Error(response.error));
              }
            });
          }),
          TIMEOUTS.SOCKET_ACK_TIMEOUT,
          "getLiveStreams"
        );
      } catch (error) {
        logger.error("Error getting live streams:", error);
        throw error;
      }
    },
    [socket, withTimeout]
  );

  /**
   * الحصول على معلومات stream محدد
   */
  const getStreamInfo = useCallback(
    async ({ roomId }) => {
      try {
        return await withTimeout(
          new Promise((resolve, reject) => {
            socket.emit("getStreamInfo", { roomId }, (response) => {
              if (response.success) {
                logger.callEvent("Stream info retrieved successfully", {
                  roomId,
                });
                resolve(response.stream);
              } else {
                logger.error("Error getting stream info:", response.error);
                reject(new Error(response.error));
              }
            });
          }),
          TIMEOUTS.SOCKET_ACK_TIMEOUT,
          "getStreamInfo"
        );
      } catch (error) {
        logger.error("Error getting stream info:", error);
        throw error;
      }
    },
    [socket, withTimeout]
  );

  /**
   * إرسال تعليق في البث المباشر
   */
  const sendStreamComment = useCallback(
    async ({ streamId, comment }) => {
      try {
        return new Promise((resolve, reject) => {
          socket.emit(
            "sendStreamComment",
            { streamId, comment },
            (response) => {
              if (response.success) {
                logger.callEvent("Stream comment sent successfully", {
                  streamId,
                });
                resolve(response.comment);
              } else {
                logger.error("Error sending stream comment:", response.error);
                reject(new Error(response.error));
              }
            }
          );
        });
      } catch (error) {
        logger.error("Error sending stream comment:", error);
        throw error;
      }
    },
    [socket]
  );

  /**
   * إرسال reaction في البث المباشر
   */
  const sendStreamReaction = useCallback(
    async ({ streamId, reaction }) => {
      try {
        return new Promise((resolve, reject) => {
          socket.emit(
            "sendStreamReaction",
            { streamId, reaction },
            (response) => {
              if (response.success) {
                logger.callEvent("Stream reaction sent successfully", {
                  streamId,
                  reaction,
                });
                resolve(response.reaction);
              } else {
                logger.error("Error sending stream reaction:", response.error);
                reject(new Error(response.error));
              }
            }
          );
        });
      } catch (error) {
        logger.error("Error sending stream reaction:", error);
        throw error;
      }
    },
    [socket]
  );

  /**
   * ✅ Group Call: Add participant
   */
  const addGroupCallParticipant = useCallback(
    async ({ callId, participantId }) => {
      try {
        return new Promise((resolve, reject) => {
          socket.emit(
            "addGroupCallParticipant",
            { callId, participantId },
            (response) => {
              if (response.success) {
                logger.callEvent(
                  "Participant added to group call successfully",
                  { callId, participantId }
                );
                resolve(response.call);
              } else {
                logger.error(
                  "Error adding group call participant:",
                  response.error
                );
                reject(new Error(response.error));
              }
            }
          );
        });
      } catch (error) {
        logger.error("Error adding group call participant:", error);
        throw error;
      }
    },
    [socket]
  );

  /**
   * ✅ Group Call: Remove participant
   */
  const removeGroupCallParticipant = useCallback(
    async ({ callId, participantId }) => {
      try {
        return new Promise((resolve, reject) => {
          socket.emit(
            "removeGroupCallParticipant",
            { callId, participantId },
            (response) => {
              if (response.success) {
                logger.callEvent(
                  "Participant removed from group call successfully",
                  { callId, participantId }
                );
                resolve(response.call);
              } else {
                logger.error(
                  "Error removing group call participant:",
                  response.error
                );
                reject(
                  createError(
                    response?.code || ERROR_CODES.OPERATION_FAILED,
                    response.error || "Failed to remove participant."
                  )
                );
              }
            }
          );
        });
      } catch (error) {
        logger.error("Error removing group call participant:", error);
        throw error;
      }
    },
    [socket]
  );

  /**
   * ✅ Group Call: Mute all participants
   */
  const muteAllGroupCallParticipants = useCallback(
    async ({ callId }) => {
      try {
        return new Promise((resolve, reject) => {
          socket.emit(
            "muteAllGroupCallParticipants",
            { callId },
            (response) => {
              if (response.success) {
                logger.callEvent(
                  "All participants muted in group call successfully",
                  { callId }
                );
                resolve(response);
              } else {
                logger.error(
                  "Error muting all group call participants:",
                  response.error
                );
                reject(
                  createError(
                    response?.code || ERROR_CODES.OPERATION_FAILED,
                    response.error || "Failed to mute all participants."
                  )
                );
              }
            }
          );
        });
      } catch (error) {
        logger.error("Error muting all group call participants:", error);
        throw error;
      }
    },
    [socket]
  );

  /**
   * ✅ Group Call: Set moderator
   */
  const setGroupCallModerator = useCallback(
    async ({ callId, participantId, isModerator }) => {
      try {
        return new Promise((resolve, reject) => {
          socket.emit(
            "setGroupCallModerator",
            { callId, participantId, isModerator },
            (response) => {
              if (response.success) {
                logger.callEvent(
                  "Group call moderator status updated successfully",
                  { callId, participantId, isModerator }
                );
                resolve(response.call);
              } else {
                logger.error(
                  "Error setting group call moderator:",
                  response.error
                );
                reject(
                  createError(
                    response?.code || ERROR_CODES.OPERATION_FAILED,
                    response.error || "Failed to update moderator role."
                  )
                );
              }
            }
          );
        });
      } catch (error) {
        logger.error("Error setting group call moderator:", error);
        throw error;
      }
    },
    [socket]
  );

  /**
   * ✅ Raise Hand (Group Calls): رفع اليد في المكالمات الجماعية
   */
  const raiseHand = useCallback(async () => {
    try {
      if (!isJoined || !roomId || !callId) {
        throw createError(ERROR_CODES.INVALID_STATE, "Not in a group call.");
      }

      logger.callEvent("Raising hand", { callId, roomId });

      return await new Promise((resolve, reject) => {
        socket.emit("raiseHand", { callId, roomId }, (response) => {
          if (response.success) {
            logger.callEvent("Hand raised successfully", { callId });
            setRaisedHands((prev) => new Set([...prev, currentUser?._id]));
            resolve(response);
          } else {
            logger.error("Error raising hand:", response.error);
            reject(
              createError(
                ERROR_CODES.UNKNOWN_ERROR,
                response.error || "Failed to raise hand."
              )
            );
          }
        });
      });
    } catch (error) {
      logger.error("Error raising hand:", error);
      throw normalizeError(error);
    }
  }, [isJoined, roomId, callId, socket, currentUser?._id]);

  /**
   * ✅ Lower Hand (Group Calls): خفض اليد
   */
  const lowerHand = useCallback(async () => {
    try {
      if (!isJoined || !roomId || !callId) {
        throw createError(ERROR_CODES.INVALID_STATE, "Not in a group call.");
      }

      logger.callEvent("Lowering hand", { callId, roomId });

      return await new Promise((resolve, reject) => {
        socket.emit("lowerHand", { callId, roomId }, (response) => {
          if (response.success) {
            logger.callEvent("Hand lowered successfully", { callId });
            setRaisedHands((prev) => {
              const newSet = new Set(prev);
              newSet.delete(currentUser?._id);
              return newSet;
            });
            resolve(response);
          } else {
            logger.error("Error lowering hand:", response.error);
            reject(
              createError(
                ERROR_CODES.UNKNOWN_ERROR,
                response.error || "Failed to lower hand."
              )
            );
          }
        });
      });
    } catch (error) {
      logger.error("Error lowering hand:", error);
      throw normalizeError(error);
    }
  }, [isJoined, roomId, callId, socket, currentUser?._id]);

  const setParticipantSpeakingLock = useCallback(
    async ({ participantId, locked }) => {
      if (!socket || !callId || !participantId) {
        throw createError(
          ERROR_CODES.INVALID_INPUT,
          "Call ID and participant ID are required."
        );
      }
      return withTimeout(
        new Promise((resolve, reject) => {
          socket.emit(
            "setParticipantSpeakingLock",
            {
              callId,
              participantId,
              locked: Boolean(locked),
            },
            (response) => {
              if (response?.success) {
                resolve(response);
              } else {
                reject(
                  createError(
                    response?.code || ERROR_CODES.OPERATION_FAILED,
                    response?.error || "Failed to update speaking lock."
                  )
                );
              }
            }
          );
        }),
        TIMEOUTS.SOCKET_ACK_TIMEOUT,
        "setParticipantSpeakingLock"
      );
    },
    [socket, callId]
  );

  const setParticipantHandRaisePriority = useCallback(
    async ({ participantId, priority }) => {
      if (!socket || !callId || !participantId) {
        throw createError(
          ERROR_CODES.INVALID_INPUT,
          "Call ID and participant ID are required."
        );
      }
      return withTimeout(
        new Promise((resolve, reject) => {
          socket.emit(
            "setParticipantHandRaisePriority",
            {
              callId,
              participantId,
              priority: Number(priority) || 0,
            },
            (response) => {
              if (response?.success) {
                resolve(response);
              } else {
                reject(
                  createError(
                    response?.code || ERROR_CODES.OPERATION_FAILED,
                    response?.error || "Failed to update hand raise priority."
                  )
                );
              }
            }
          );
        }),
        TIMEOUTS.SOCKET_ACK_TIMEOUT,
        "setParticipantHandRaisePriority"
      );
    },
    [socket, callId]
  );

  /**
   * ✅ Call Transfer: نقل المكالمة لمستخدم آخر
   */
  const transferCall = useCallback(
    async ({ targetUserId }) => {
      try {
        if (!isJoined || !roomId) {
          throw createError(
            ERROR_CODES.INVALID_STATE,
            "No active call to transfer."
          );
        }

        if (!callId) {
          throw createError(ERROR_CODES.INVALID_INPUT, "Call ID is required.");
        }

        if (!targetUserId) {
          throw createError(
            ERROR_CODES.INVALID_INPUT,
            "Target user ID is required."
          );
        }

        logger.callEvent("Transferring call", { callId, targetUserId, roomId });

        return await withTimeout(
          new Promise((resolve, reject) => {
            socket.emit(
              "transferCall",
              { callId, targetUserId },
              (response) => {
                if (response.success) {
                  logger.callEvent("Call transferred successfully", {
                    callId,
                    targetUserId,
                    newCallId: response.newCallId,
                  });

                  // ✅ الخروج من المكالمة الحالية بعد النقل
                  leaveRoom();

                  resolve(response);
                } else {
                  logger.error("Error transferring call:", response.error);
                  reject(
                    createError(
                      response?.code || ERROR_CODES.CALL_TRANSFER_FAILED,
                      response.error || "Failed to transfer call."
                    )
                  );
                }
              }
            );
          }),
          TIMEOUTS.SOCKET_ACK_TIMEOUT,
          "transferCall"
        );
      } catch (error) {
        logger.error("Error transferring call:", error);
        throw normalizeError(error);
      }
    },
    [isJoined, roomId, callId, socket, leaveRoom]
  );

  return {
    // State
    localStream,
    remoteStreams,
    peers,
    isJoined,
    isAudioEnabled,
    isVideoEnabled,
    isCaller,
    roomId,
    incomingCall,
    rejectedParticipantsByRoom,
    isIncomingCallMinimized,
    mediaError,
    callState,
    callStatus, // ✅ حالة المكالمة: 'connecting' | 'queued' | 'ringing' | 'busy' | null
    isVideoCall, // ✅ نوع المكالمة الحالية (فيديو أم صوت)
    screenStream,
    isScreenSharing,
    isReconnecting,
    reconnectAttempts,
    // ✅ Call Waiting State
    waitingCall, // مكالمة واردة أثناء مكالمة نشطة
    isWaitingCallMinimized,
    isCallOnHold, // حالة المكالمة الحالية (On Hold)
    heldCallInfo, // معلومات المكالمة المحفوظة
    // ✅ Call Recording State
    isRecording, // حالة التسجيل (جاري التسجيل)
    recordingId, // ID التسجيل
    callId, // Call ID للمكالمة الحالية

    // Device Management State
    devices,
    audioDevices,
    videoDevices,
    selectedAudioDevice,
    selectedVideoDevice,
    hasAudio,
    hasVideo,
    isDetecting,
    detectionError,
    audioPermission,
    videoPermission,

    // Actions
    startCall,
    joinRoom,
    leaveRoom,
    endCallForAll,
    endCallForAll,
    acceptCall,
    rejectCall,
    minimizeIncomingCall,
    restoreIncomingCallModal,
    // ✅ Call Waiting Actions
    holdCall,
    resumeCall,
    acceptWaitingCall,
    rejectWaitingCall,
    minimizeWaitingCall,
    restoreWaitingCallModal,
    // ✅ Call Recording Actions
    startRecording,
    stopRecording,
    getUserRecordings,
    getCallRecording,
    toggleAudio,
    toggleVideo,
    switchAudioDevice,
    switchVideoDevice,
    startScreenShare,
    stopScreenShare,
    requestScreenShareFromParticipant,
    respondToScreenShareRequest,
    clearMediaError: () => setMediaError(null),
    clearDeviceError: () => setDeviceError(null),
    deviceError,

    // Device Management Actions
    detectDevices,
    refreshDevices,
    requestDevicePermissions,
    requestDevicePermissionsWithRetry,
    runPreCallReadiness,
    createStream,
    createFlexibleStream,
    setSelectedAudioDevice,
    setSelectedVideoDevice,

    // Reset & Cleanup Actions
    resetAll,

    // Bandwidth Management
    currentVideoQuality,
    adjustVideoQuality,
    startBandwidthMonitoring,
    stopBandwidthMonitoring,

    // Simulcast Support
    enableSimulcast,
    setEnableSimulcast,
    adjustConsumerLayers,

    // Transcoding Support
    transcodingEnabled,
    setTranscodingEnabled,
    validateCodecSupport,
    consumeWithTranscodingFallback,

    // Statistics
    getConnectionStatistics,

    // Live Streaming Actions
    joinAsViewer,
    startLiveStream,
    requestLiveStream,
    respondToLiveStreamRequest,
    stopLiveStream,
    getLiveStreams,
    getStreamInfo,
    sendStreamComment,
    sendStreamReaction,
    // ✅ Group Call functions
    addGroupCallParticipant,
    removeGroupCallParticipant,
    muteAllGroupCallParticipants,
    setGroupCallModerator,
    // ✅ Call Transfer
    transferCall,
    // ✅ Raise Hand (Group Calls)
    raiseHand,
    lowerHand,
    raisedHands, // Set of userIds who raised their hand
    speakingLocksByUserId,
    handRaisePriorityByUserId,
    setParticipantSpeakingLock,
    setParticipantHandRaisePriority,
    // ✅ Call Recording
    startRecording,
    stopRecording,
    getUserRecordings,
    getCallRecording,
    checkRecordingStatus,
    isRecording,
    recordingId,
    callId,
    isRemoteRinging, // ✅ تصدير الحالة الجديدة
    // ✅ Current Role (member/broadcaster/viewer)
    currentRole: currentRoleRef.current,
    activeCallId, // ✅ Expose active call ID
    initialCallSettings, // ✅ Call settings received when joining
    initialCallAdmins, // ✅ Call admins received when joining
    
    // ✅ Device availability
    hasAudio,
    hasVideo,
  };
};

export default useMediasoup;
