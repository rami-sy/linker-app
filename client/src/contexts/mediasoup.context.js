/**
 * MediaSoup Context Provider
 * توفير context للمكالمات في كل التطبيق
 */

import React, { createContext } from 'react';
import useMediasoup from '../hooks/useMediasoup';

const noop = () => {};

const defaultMediasoupContext = {
  // State defaults
  incomingCall: null,
  isIncomingCallMinimized: false,
  waitingCall: null,
  isWaitingCallMinimized: false,
  roomId: null,
  callId: null,
  currentRole: "member",
  isJoined: false,
  isVideoCall: true,
  rejectedParticipantsByRoom: {},
  remoteStreams: {},
  localStream: null,
  isAudioEnabled: true,
  isVideoEnabled: true,
  isCallOnHold: false,
  speakingLocksByUserId: {},
  handRaisePriorityByUserId: {},

  // Actions defaults
  startCall: noop,
  addGroupCallParticipant: noop,
  removeGroupCallParticipant: noop,
  muteAllGroupCallParticipants: noop,
  setGroupCallModerator: noop,
  setParticipantSpeakingLock: noop,
  setParticipantHandRaisePriority: noop,
  acceptCall: noop,
  rejectCall: noop,
  minimizeIncomingCall: noop,
  restoreIncomingCallModal: noop,
  joinRoom: noop,
  minimizeWaitingCall: noop,
  restoreWaitingCallModal: noop,
  leaveRoom: noop,
  startLiveStream: noop,
  stopLiveStream: noop,
  joinAsViewer: noop,
  toggleAudio: noop,
  toggleVideo: noop,
  reconnect: noop,
  getConnectionStatistics: async () => null,
  runPreCallReadiness: async () => ({
    ok: false,
    hasAudio: false,
    hasVideo: false,
    joinWithVideo: false,
    issues: ["notInitialized"],
  }),
};

export const MediasoupContext = createContext(defaultMediasoupContext);

export const MediasoupProvider = ({ children }) => {
  const mediasoupValues = useMediasoup();

  return (
    <MediasoupContext.Provider value={mediasoupValues}>
      {children}
    </MediasoupContext.Provider>
  );
};

export default MediasoupProvider;


