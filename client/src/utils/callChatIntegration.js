/**
 * ✅ Call-Chat Integration Service
 * خدمة لإدارة التكامل بين المكالمات والدردشة
 */

import logger from './logger';

/**
 * ✅ Call-Chat Integration Manager
 * يدير التكامل بين Call events و Chat state
 */
class CallChatIntegration {
  constructor(dispatch, updateRoom) {
    this.dispatch = dispatch;
    this.updateRoom = updateRoom;
    this.activeCalls = new Map(); // Map<roomId, { callId, startedAt, participants, isVideoCall }>
    this.listeners = new Map(); // Map<eventName, Set<listeners>>
  }

  /**
   * ✅ Handle call started event
   */
  handleCallStarted({ roomId, callId, isVideoCall, participants, startedAt }) {
    try {
      logger.callEvent('Call started - updating chat state', { roomId, callId, isVideoCall });
      const normalizedStartedAt =
        startedAt && !Number.isNaN(new Date(startedAt).getTime())
          ? new Date(startedAt).toISOString()
          : null;

      // ✅ Update Redux room state
      this.updateRoom({
        _id: roomId,
        hasActiveCall: true,
        activeCallId: callId,
        activeCallType: isVideoCall ? 'video' : 'audio',
        activeCallStartedAt: normalizedStartedAt,
        activeCallParticipants: participants || [],
      });

      // ✅ Store call info
      this.activeCalls.set(roomId, {
        callId,
        startedAt: normalizedStartedAt,
        participants: participants || [],
        isVideoCall,
      });

      // ✅ Notify listeners
      this.notifyListeners('callStarted', { roomId, callId, isVideoCall });

      logger.callEvent('Chat state updated for call', { roomId, callId });
    } catch (error) {
      logger.error('Error handling call started:', error);
    }
  }

  /**
   * ✅ Handle call ended event
   */
  handleCallEnded({ roomId, callId, duration, endedBy }) {
    try {
      logger.callEvent('Call ended - updating chat state', { roomId, callId, duration });

      // ✅ Update Redux room state
      this.updateRoom({
        _id: roomId,
        hasActiveCall: false,
        activeCallId: null,
        activeCallType: null,
        activeCallStartedAt: null,
        activeCallParticipants: [],
        lastCallDuration: duration,
        lastCallEndedAt: new Date().toISOString(),
        lastCallEndedBy: endedBy,
      });

      // ✅ Remove call info
      this.activeCalls.delete(roomId);

      // ✅ Notify listeners
      this.notifyListeners('callEnded', { roomId, callId, duration });

      logger.callEvent('Chat state updated for call end', { roomId, callId });
    } catch (error) {
      logger.error('Error handling call ended:', error);
    }
  }

  /**
   * ✅ Handle participant joined call
   */
  handleParticipantJoined({ roomId, userId, userData }) {
    try {
      const callInfo = this.activeCalls.get(roomId);
      if (!callInfo) {
        logger.warn('Participant joined but no active call found', { roomId, userId });
        return;
      }

      // ✅ Update participants list
      if (!callInfo.participants.some(p => p.userId === userId)) {
        callInfo.participants.push({
          userId,
          userData,
          joinedAt: new Date().toISOString(),
        });

        // ✅ Update Redux room state
        this.updateRoom({
          _id: roomId,
          activeCallParticipants: callInfo.participants,
        });

        // ✅ Notify listeners
        this.notifyListeners('participantJoined', { roomId, userId, userData });

        logger.callEvent('Participant joined call', { roomId, userId });
      }
    } catch (error) {
      logger.error('Error handling participant joined:', error);
    }
  }

  /**
   * ✅ Handle participant left call
   */
  handleParticipantLeft({ roomId, userId }) {
    try {
      const callInfo = this.activeCalls.get(roomId);
      if (!callInfo) {
        logger.warn('Participant left but no active call found', { roomId, userId });
        return;
      }

      // ✅ Remove participant
      callInfo.participants = callInfo.participants.filter(p => p.userId !== userId);

      // ✅ Update Redux room state
      this.updateRoom({
        _id: roomId,
        activeCallParticipants: callInfo.participants,
      });

      // ✅ Notify listeners
      this.notifyListeners('participantLeft', { roomId, userId });

      logger.callEvent('Participant left call', { roomId, userId });
    } catch (error) {
      logger.error('Error handling participant left:', error);
    }
  }

  /**
   * ✅ Handle call state change
   */
  handleCallStateChange({ roomId, oldState, newState, event }) {
    try {
      logger.callEvent('Call state changed', { roomId, oldState, newState, event });

      // ✅ Update Redux room state with call state
      this.updateRoom({
        _id: roomId,
        activeCallState: newState,
        activeCallStateChangedAt: new Date().toISOString(),
      });

      // ✅ Notify listeners
      this.notifyListeners('callStateChanged', { roomId, oldState, newState, event });
    } catch (error) {
      logger.error('Error handling call state change:', error);
    }
  }

  /**
   * ✅ Get active call info for room
   */
  getActiveCallInfo(roomId) {
    return this.activeCalls.get(roomId) || null;
  }

  /**
   * ✅ Check if room has active call
   */
  hasActiveCall(roomId) {
    return this.activeCalls.has(roomId);
  }

  /**
   * ✅ Add event listener
   */
  on(eventName, callback) {
    if (!this.listeners.has(eventName)) {
      this.listeners.set(eventName, new Set());
    }
    this.listeners.get(eventName).add(callback);
    return () => this.off(eventName, callback);
  }

  /**
   * ✅ Remove event listener
   */
  off(eventName, callback) {
    if (this.listeners.has(eventName)) {
      this.listeners.get(eventName).delete(callback);
    }
  }

  /**
   * ✅ Notify all listeners for an event
   */
  notifyListeners(eventName, data) {
    if (this.listeners.has(eventName)) {
      this.listeners.get(eventName).forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          logger.error(`Error in listener for ${eventName}:`, error);
        }
      });
    }
  }

  /**
   * ✅ Cleanup
   */
  cleanup() {
    this.activeCalls.clear();
    this.listeners.clear();
    logger.debug('Call-Chat Integration cleaned up');
  }
}

export default CallChatIntegration;

