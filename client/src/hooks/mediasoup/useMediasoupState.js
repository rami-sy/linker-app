/**
 * ✅ useMediasoupState
 * إدارة جميع state variables في useMediasoup
 */

import { useState, useRef } from 'react';
import { CallStateMachine, CALL_STATES } from '../../utils/callStateMachine';

/**
 * ✅ Initialize all state variables for useMediasoup
 */
export const useMediasoupState = () => {
  // ===== DEVICE MANAGEMENT STATE =====
  const [devices, setDevices] = useState([]);
  const [audioDevices, setAudioDevices] = useState([]);
  const [videoDevices, setVideoDevices] = useState([]);
  const [selectedAudioDevice, setSelectedAudioDevice] = useState(null);
  const [selectedVideoDevice, setSelectedVideoDevice] = useState(null);
  const [isDetecting, setIsDetecting] = useState(false);
  const [detectionError, setDetectionError] = useState(null);
  const [hasAudio, setHasAudio] = useState(false);
  const [hasVideo, setHasVideo] = useState(false);
  const [audioPermission, setAudioPermission] = useState(null);
  const [videoPermission, setVideoPermission] = useState(null);

  // ===== CALL STATE MACHINE =====
  const callStateMachineRef = useRef(new CallStateMachine());
  const [callState, setCallState] = useState(CALL_STATES.IDLE);

  // ===== RECONNECTION STATE =====
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [reconnectAttempts, setReconnectAttempts] = useState(0);
  const reconnectTimeoutRef = useRef(null);
  const roomInfoBeforeDisconnectRef = useRef(null);
  const isVideoCallRef = useRef(false);
  const currentRoleRef = useRef('member');

  // ===== GUARD MANAGER =====
  const guardManagerRef = useRef({
    isJoining: false,
    isLeaving: false,
    hasLeftRoom: false,
    isLeavingDueToRejection: false,
    canJoin: () => !guardManagerRef.current.isJoining && !guardManagerRef.current.isLeaving,
    canLeave: () => !guardManagerRef.current.isJoining && !guardManagerRef.current.isLeaving,
    canStartCall: () => !guardManagerRef.current.isJoining && !guardManagerRef.current.isLeaving,
    setJoining: (value) => { guardManagerRef.current.isJoining = value; },
    setLeaving: (value) => { guardManagerRef.current.isLeaving = value; },
    setHasLeftRoom: (value) => { guardManagerRef.current.hasLeftRoom = value; },
    setLeavingDueToRejection: (value) => { guardManagerRef.current.isLeavingDueToRejection = value; },
    resetForNewRoom: () => {
      guardManagerRef.current.isJoining = false;
      guardManagerRef.current.isLeaving = false;
      guardManagerRef.current.hasLeftRoom = false;
      guardManagerRef.current.isLeavingDueToRejection = false;
    },
    resetAll: () => {
      guardManagerRef.current.isJoining = false;
      guardManagerRef.current.isLeaving = false;
      guardManagerRef.current.hasLeftRoom = false;
      guardManagerRef.current.isLeavingDueToRejection = false;
    },
  });

  // Legacy refs for backward compatibility
  const isLeavingDueToRejectionRef = useRef(false);
  const isLeavingRef = useRef(false);
  const hasLeftRoomRef = useRef(false);
  const isJoiningRef = useRef(false);

  // ===== DEVICE & TRANSPORTS =====
  const deviceRef = useRef(null);
  const producerTransportRef = useRef(null);
  const consumerTransportsRef = useRef(new Map());

  // ===== MEDIA STREAMS =====
  const [localStream, setLocalStream] = useState(null);
  const [remoteStreams, setRemoteStreams] = useState({});
  const [screenStream, setScreenStream] = useState(null);
  const screenProducerRef = useRef(null);
  const [isScreenSharing, setIsScreenSharing] = useState(false);

  // ===== PRODUCERS & CONSUMERS =====
  const producersRef = useRef(new Map());
  const consumersRef = useRef(new Map());
  const consumedProducerIdsRef = useRef(new Set());

  // ===== BANDWIDTH MANAGEMENT =====
  const [currentVideoQuality, setCurrentVideoQuality] = useState('high');
  const bandwidthMonitorIntervalRef = useRef(null);

  // ===== SIMULCAST SUPPORT =====
  const [enableSimulcast, setEnableSimulcast] = useState(true);
  const simulcastEnabledRef = useRef(false);
  const networkQualityHistoryRef = useRef([]);
  const currentLayerRef = useRef({ spatial: 2, temporal: 2 });
  const layerChangeTimestampRef = useRef(Date.now());
  const qualityScoreHistoryRef = useRef([]);

  // ===== TRANSCODING SUPPORT =====
  const [transcodingEnabled, setTranscodingEnabled] = useState(true);
  const codecPreferenceRef = useRef(['VP8', 'VP9', 'H264']);

  // ===== ROOM STATE =====
  const [roomId, setRoomId] = useState(null);
  const [peers, setPeers] = useState([]);
  const [isJoined, setIsJoined] = useState(false);
  const recipientsCountRef = useRef(0);
  const rejectedBySetRef = useRef(new Set());
  const peersJoinedCountRef = useRef(0);

  // ===== INCOMING CALL =====
  const [incomingCall, setIncomingCall] = useState(null);

  // ===== MEDIA CONTROLS =====
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [isCaller, setIsCaller] = useState(false);

  // ===== ERROR STATE =====
  const [mediaError, setMediaError] = useState(null);
  const [deviceError, setDeviceError] = useState(null);

  // ===== OTHER REFS =====
  const detectionTimeoutRef = useRef(null);
  const cancelledCallsRef = useRef(new Set());

  // Helper functions for Guard Manager
  const guardManager = {
    canJoin: () => guardManagerRef.current.canJoin(),
    canLeave: () => guardManagerRef.current.canLeave(),
    canStartCall: () => guardManagerRef.current.canStartCall(),
    setJoining: (value) => {
      guardManagerRef.current.setJoining(value);
      isJoiningRef.current = value;
    },
    setLeaving: (value) => {
      guardManagerRef.current.setLeaving(value);
      isLeavingRef.current = value;
    },
    setHasLeftRoom: (value) => {
      guardManagerRef.current.setHasLeftRoom(value);
      hasLeftRoomRef.current = value;
    },
    setLeavingDueToRejection: (value) => {
      guardManagerRef.current.setLeavingDueToRejection(value);
      isLeavingDueToRejectionRef.current = value;
    },
    resetForNewRoom: () => {
      guardManagerRef.current.resetForNewRoom();
      hasLeftRoomRef.current = false;
      isLeavingDueToRejectionRef.current = false;
    },
    resetAll: () => {
      guardManagerRef.current.resetAll();
      isLeavingRef.current = false;
      isJoiningRef.current = false;
      hasLeftRoomRef.current = false;
      isLeavingDueToRejectionRef.current = false;
    },
  };

  return {
    // Device State
    devices, setDevices,
    audioDevices, setAudioDevices,
    videoDevices, setVideoDevices,
    selectedAudioDevice, setSelectedAudioDevice,
    selectedVideoDevice, setSelectedVideoDevice,
    isDetecting, setIsDetecting,
    detectionError, setDetectionError,
    hasAudio, setHasAudio,
    hasVideo, setHasVideo,
    audioPermission, setAudioPermission,
    videoPermission, setVideoPermission,

    // Call State
    callStateMachineRef,
    callState, setCallState,

    // Reconnection State
    isReconnecting, setIsReconnecting,
    reconnectAttempts, setReconnectAttempts,
    reconnectTimeoutRef,
    roomInfoBeforeDisconnectRef,
    isVideoCallRef,
    currentRoleRef,

    // Guard Manager
    guardManagerRef,
    guardManager,
    isLeavingDueToRejectionRef,
    isLeavingRef,
    hasLeftRoomRef,
    isJoiningRef,

    // Device & Transports
    deviceRef,
    producerTransportRef,
    consumerTransportsRef,

    // Media Streams
    localStream, setLocalStream,
    remoteStreams, setRemoteStreams,
    screenStream, setScreenStream,
    screenProducerRef,
    isScreenSharing, setIsScreenSharing,

    // Producers & Consumers
    producersRef,
    consumersRef,
    consumedProducerIdsRef,

    // Bandwidth Management
    currentVideoQuality, setCurrentVideoQuality,
    bandwidthMonitorIntervalRef,

    // Simulcast Support
    enableSimulcast, setEnableSimulcast,
    simulcastEnabledRef,
    networkQualityHistoryRef,
    currentLayerRef,
    layerChangeTimestampRef,
    qualityScoreHistoryRef,

    // Transcoding Support
    transcodingEnabled, setTranscodingEnabled,
    codecPreferenceRef,

    // Room State
    roomId, setRoomId,
    peers, setPeers,
    isJoined, setIsJoined,
    recipientsCountRef,
    rejectedBySetRef,
    peersJoinedCountRef,

    // Incoming Call
    incomingCall, setIncomingCall,

    // Media Controls
    isAudioEnabled, setIsAudioEnabled,
    isVideoEnabled, setIsVideoEnabled,
    isCaller, setIsCaller,

    // Error State
    mediaError, setMediaError,
    deviceError, setDeviceError,

    // Other Refs
    detectionTimeoutRef,
    cancelledCallsRef,
  };
};

