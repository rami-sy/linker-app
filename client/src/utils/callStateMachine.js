/**
 * Call State Machine for Mediasoup calls
 * Manages the lifecycle of call states and transitions
 */

import logger from './logger';

// Call States
export const CALL_STATES = {
  IDLE: 'idle',
  INVITING: 'inviting',
  RINGING: 'ringing',
  JOINING: 'joining',
  PRODUCING: 'producing',
  CONSUMING: 'consuming',
  IN_CALL: 'inCall',
  LEAVING: 'leaving',
  ENDED: 'ended',
  ERROR: 'error'
};

// Call Events
export const CALL_EVENTS = {
  START_CALL: 'startCall',
  INCOMING_CALL: 'incomingCall',
  ACCEPT_CALL: 'acceptCall',
  REJECT_CALL: 'rejectCall',
  CANCEL_CALL: 'cancelCall',
  JOIN_ROOM: 'joinRoom',
  PEER_JOINED: 'peerJoined',
  PEER_LEFT: 'peerLeft',
  PRODUCER_CREATED: 'producerCreated',
  CONSUMER_CREATED: 'consumerCreated',
  LEAVE_ROOM: 'leaveRoom',
  END_CALL: 'endCall',
  CALL_ENDED: 'callEnded',
  ERROR_OCCURRED: 'errorOccurred',
  RESET: 'reset'
};

// State Transitions
const STATE_TRANSITIONS = {
  [CALL_STATES.IDLE]: {
    [CALL_EVENTS.START_CALL]: CALL_STATES.INVITING,
    [CALL_EVENTS.INCOMING_CALL]: CALL_STATES.RINGING,
    [CALL_EVENTS.RESET]: CALL_STATES.IDLE
  },
  [CALL_STATES.INVITING]: {
    [CALL_EVENTS.JOIN_ROOM]: CALL_STATES.JOINING,
    [CALL_EVENTS.CANCEL_CALL]: CALL_STATES.IDLE,
    [CALL_EVENTS.ERROR_OCCURRED]: CALL_STATES.ERROR,
    [CALL_EVENTS.RESET]: CALL_STATES.IDLE
  },
  [CALL_STATES.RINGING]: {
    [CALL_EVENTS.ACCEPT_CALL]: CALL_STATES.JOINING,
    [CALL_EVENTS.REJECT_CALL]: CALL_STATES.IDLE,
    [CALL_EVENTS.CANCEL_CALL]: CALL_STATES.IDLE,
    [CALL_EVENTS.ERROR_OCCURRED]: CALL_STATES.ERROR,
    [CALL_EVENTS.RESET]: CALL_STATES.IDLE
  },
  [CALL_STATES.JOINING]: {
    [CALL_EVENTS.JOIN_ROOM]: CALL_STATES.JOINING, // Allow re-joining if already joining
    [CALL_EVENTS.PRODUCER_CREATED]: CALL_STATES.PRODUCING,
    [CALL_EVENTS.CONSUMER_CREATED]: CALL_STATES.CONSUMING, // ✅ للـ viewers الذين لا ينتجون media
    [CALL_EVENTS.PEER_JOINED]: CALL_STATES.CONSUMING,
    [CALL_EVENTS.LEAVE_ROOM]: CALL_STATES.LEAVING,
    [CALL_EVENTS.END_CALL]: CALL_STATES.LEAVING, // Allow ending call for all from joining state
    [CALL_EVENTS.CALL_ENDED]: CALL_STATES.LEAVING, // Allow call ended from joining state
    [CALL_EVENTS.ERROR_OCCURRED]: CALL_STATES.ERROR,
    [CALL_EVENTS.RESET]: CALL_STATES.IDLE
  },
  [CALL_STATES.PRODUCING]: {
    [CALL_EVENTS.JOIN_ROOM]: CALL_STATES.PRODUCING, // Allow re-joining if already producing
    [CALL_EVENTS.CONSUMER_CREATED]: CALL_STATES.CONSUMING,
    [CALL_EVENTS.PEER_JOINED]: CALL_STATES.CONSUMING,
    [CALL_EVENTS.LEAVE_ROOM]: CALL_STATES.LEAVING,
    [CALL_EVENTS.END_CALL]: CALL_STATES.LEAVING, // Allow ending call for all from producing state
    [CALL_EVENTS.CALL_ENDED]: CALL_STATES.LEAVING, // Allow call ended from producing state
    [CALL_EVENTS.ERROR_OCCURRED]: CALL_STATES.ERROR,
    [CALL_EVENTS.RESET]: CALL_STATES.IDLE
  },
  [CALL_STATES.CONSUMING]: {
    [CALL_EVENTS.JOIN_ROOM]: CALL_STATES.CONSUMING, // Allow re-joining if already consuming
    [CALL_EVENTS.PEER_JOINED]: CALL_STATES.IN_CALL,
    [CALL_EVENTS.PEER_LEFT]: CALL_STATES.CONSUMING,
    [CALL_EVENTS.LEAVE_ROOM]: CALL_STATES.LEAVING,
    [CALL_EVENTS.END_CALL]: CALL_STATES.LEAVING,
    [CALL_EVENTS.CALL_ENDED]: CALL_STATES.LEAVING,
    [CALL_EVENTS.ERROR_OCCURRED]: CALL_STATES.ERROR,
    [CALL_EVENTS.RESET]: CALL_STATES.IDLE
  },
  [CALL_STATES.IN_CALL]: {
    [CALL_EVENTS.JOIN_ROOM]: CALL_STATES.IN_CALL, // Allow re-joining if already in call
    [CALL_EVENTS.PEER_LEFT]: CALL_STATES.IN_CALL,
    [CALL_EVENTS.LEAVE_ROOM]: CALL_STATES.LEAVING,
    [CALL_EVENTS.END_CALL]: CALL_STATES.LEAVING,
    [CALL_EVENTS.CALL_ENDED]: CALL_STATES.LEAVING,
    [CALL_EVENTS.ERROR_OCCURRED]: CALL_STATES.ERROR,
    [CALL_EVENTS.RESET]: CALL_STATES.IDLE
  },
  [CALL_STATES.LEAVING]: {
    [CALL_EVENTS.LEAVE_ROOM]: CALL_STATES.LEAVING, // Allow re-leaving if already leaving
    [CALL_EVENTS.END_CALL]: CALL_STATES.LEAVING, // Allow ending call if already leaving
    [CALL_EVENTS.CALL_ENDED]: CALL_STATES.LEAVING, // Allow call ended if already leaving
    [CALL_EVENTS.RESET]: CALL_STATES.IDLE,
    [CALL_EVENTS.ERROR_OCCURRED]: CALL_STATES.ERROR
  },
  [CALL_STATES.ENDED]: {
    [CALL_EVENTS.RESET]: CALL_STATES.IDLE
  },
  [CALL_STATES.ERROR]: {
    [CALL_EVENTS.RESET]: CALL_STATES.IDLE,
    [CALL_EVENTS.JOIN_ROOM]: CALL_STATES.JOINING // ✅ السماح بالانضمام مرة أخرى بعد الخطأ
  }
};

// State Machine Class
export class CallStateMachine {
  constructor(initialState = CALL_STATES.IDLE) {
    this.currentState = initialState;
    this.previousState = null;
    this.stateHistory = [initialState];
    this.listeners = new Map();
  }

  // Get current state
  getState() {
    return this.currentState;
  }

  // Get previous state
  getPreviousState() {
    return this.previousState;
  }

  // Get state history
  getStateHistory() {
    return [...this.stateHistory];
  }

  // Check if transition is valid
  canTransition(event) {
    const transitions = STATE_TRANSITIONS[this.currentState];
    return transitions && transitions[event] !== undefined;
  }

  // ✅ Transition to new state with enhanced logging and validation
  transition(event, data = {}) {
    if (!this.canTransition(event)) {
      logger.warn(`Invalid transition from ${this.currentState} with event ${event}`, {
        currentState: this.currentState,
        event,
        validTransitions: this.getValidTransitions(),
      });
      return false;
    }

    const previousState = this.currentState;
    const newState = STATE_TRANSITIONS[this.currentState][event];
    
    // ✅ Validate state transition
    if (!newState) {
      logger.error('State transition resulted in undefined state', {
        currentState: this.currentState,
        event,
      });
      return false;
    }

    this.previousState = previousState;
    this.currentState = newState;
    this.stateHistory.push(newState);

    // ✅ Enhanced logging
    logger.callEvent('State transition', {
      from: previousState,
      to: newState,
      event,
      timestamp: Date.now(),
      historyLength: this.stateHistory.length,
    });

    // Notify listeners
    this.notifyListeners(event, {
      from: previousState,
      to: newState,
      data,
      timestamp: Date.now(),
    });

    return true;
  }

  // Add state change listener
  onStateChange(callback) {
    const id = Date.now() + Math.random();
    this.listeners.set(id, callback);
    return id;
  }

  // Remove state change listener
  offStateChange(id) {
    this.listeners.delete(id);
  }

  // Notify all listeners
  notifyListeners(event, transition) {
    this.listeners.forEach(callback => {
      try {
        callback(event, transition);
      } catch (error) {
        logger.error('Error in state change listener:', error);
      }
    });
  }

  // Reset to initial state
  reset() {
    this.previousState = this.currentState;
    this.currentState = CALL_STATES.IDLE;
    this.stateHistory = [CALL_STATES.IDLE];
    this.notifyListeners(CALL_EVENTS.RESET, {
      from: this.previousState,
      to: this.currentState,
      data: {}
    });
  }

  // ✅ Enhanced Recovery mechanism: محاولة استعادة من حالة الخطأ
  recover(recoveryStrategy = 'previous') {
    if (this.currentState !== CALL_STATES.ERROR) {
      logger.warn('Recovery attempted from non-error state:', this.currentState);
      return false;
    }

    // ✅ Multiple recovery strategies
    let targetState = null;

    if (recoveryStrategy === 'previous' && this.previousState && this.previousState !== CALL_STATES.ERROR) {
      targetState = this.previousState;
    } else if (recoveryStrategy === 'safe') {
      // ✅ Safe recovery: go to a safe intermediate state
      targetState = CALL_STATES.JOINING;
    } else if (recoveryStrategy === 'history') {
      // ✅ Recovery from history: find last valid state
      const validRecoveryStates = [
        CALL_STATES.JOINING,
        CALL_STATES.PRODUCING,
        CALL_STATES.CONSUMING,
        CALL_STATES.IN_CALL
      ];
      
      for (let i = this.stateHistory.length - 1; i >= 0; i--) {
        if (validRecoveryStates.includes(this.stateHistory[i])) {
          targetState = this.stateHistory[i];
          break;
        }
      }
    }

    if (targetState) {
      const validRecoveryStates = [
        CALL_STATES.JOINING,
        CALL_STATES.PRODUCING,
        CALL_STATES.CONSUMING,
        CALL_STATES.IN_CALL
      ];
      
      if (validRecoveryStates.includes(targetState)) {
        logger.callEvent('Attempting recovery', { 
          from: this.currentState, 
          to: targetState,
          strategy: recoveryStrategy,
        });
        
        this.previousState = this.currentState;
        this.currentState = targetState;
        this.stateHistory.push(this.currentState);
        
        this.notifyListeners('recovered', {
          from: CALL_STATES.ERROR,
          to: this.currentState,
          data: { 
            recovered: true,
            strategy: recoveryStrategy,
            timestamp: Date.now(),
          }
        });
        
        logger.callEvent('Recovery successful', { 
          recoveredTo: this.currentState,
          strategy: recoveryStrategy,
        });
        return true;
      }
    }

    // ✅ إذا لم نتمكن من الاستعادة، نعيد تعيين الحالة
    logger.callEvent('Recovery failed, resetting to IDLE', {
      strategy: recoveryStrategy,
      history: this.stateHistory,
    });
    this.reset();
    return false;
  }

  // ✅ Get state statistics
  getStateStats() {
    return {
      currentState: this.currentState,
      previousState: this.previousState,
      historyLength: this.stateHistory.length,
      history: [...this.stateHistory],
      listenersCount: this.listeners.size,
      validTransitions: this.getValidTransitions(),
      isInError: this.currentState === CALL_STATES.ERROR,
      isActive: isCallActive(this.currentState),
      isInProgress: isCallInProgress(this.currentState),
    };
  }

  // ✅ Force transition (for emergency recovery)
  forceTransition(newState, reason = '') {
    if (!Object.values(CALL_STATES).includes(newState)) {
      logger.error('Invalid state for force transition', { newState });
      return false;
    }

    logger.warn('Force transition executed', {
      from: this.currentState,
      to: newState,
      reason,
      timestamp: Date.now(),
    });

    this.previousState = this.currentState;
    this.currentState = newState;
    this.stateHistory.push(newState);

    this.notifyListeners('forceTransition', {
      from: this.previousState,
      to: newState,
      data: { reason, forced: true, timestamp: Date.now() },
    });

    return true;
  }

  // Check if in specific state
  isInState(state) {
    return this.currentState === state;
  }

  // Check if in any of the given states
  isInAnyState(states) {
    return states.includes(this.currentState);
  }

  // Get state description
  getStateDescription() {
    const descriptions = {
      [CALL_STATES.IDLE]: 'Ready to start or receive calls',
      [CALL_STATES.INVITING]: 'Sending call invitations',
      [CALL_STATES.RINGING]: 'Waiting for call to be answered',
      [CALL_STATES.JOINING]: 'Joining the call room',
      [CALL_STATES.PRODUCING]: 'Creating media producers',
      [CALL_STATES.CONSUMING]: 'Setting up media consumers',
      [CALL_STATES.IN_CALL]: 'Active call in progress',
      [CALL_STATES.LEAVING]: 'Leaving the call',
      [CALL_STATES.ENDED]: 'Call has ended',
      [CALL_STATES.ERROR]: 'Call error occurred'
    };
    return descriptions[this.currentState] || 'Unknown state';
  }

  // Get valid transitions for current state
  getValidTransitions() {
    const transitions = STATE_TRANSITIONS[this.currentState];
    return transitions ? Object.keys(transitions) : [];
  }
}

// Helper functions
export const isCallActive = (state) => {
  return [CALL_STATES.IN_CALL, CALL_STATES.CONSUMING, CALL_STATES.PRODUCING].includes(state);
};

export const isCallInProgress = (state) => {
  return [CALL_STATES.INVITING, CALL_STATES.RINGING, CALL_STATES.JOINING, CALL_STATES.PRODUCING, CALL_STATES.CONSUMING, CALL_STATES.IN_CALL].includes(state);
};

export const canStartCall = (state) => {
  return state === CALL_STATES.IDLE;
};

export const canAcceptCall = (state) => {
  return state === CALL_STATES.RINGING;
};

export const canRejectCall = (state) => {
  return state === CALL_STATES.RINGING;
};

export const canLeaveCall = (state) => {
  return [CALL_STATES.JOINING, CALL_STATES.PRODUCING, CALL_STATES.CONSUMING, CALL_STATES.IN_CALL].includes(state);
};

export const canEndCall = (state) => {
  return [CALL_STATES.IN_CALL, CALL_STATES.CONSUMING].includes(state);
};
