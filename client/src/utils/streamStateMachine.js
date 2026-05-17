/**
 * ✅ Stream State Machine for Live Streams
 * Manages the lifecycle of live stream states and transitions
 */

import logger from './logger';

// Stream States
export const STREAM_STATES = {
  IDLE: 'idle',
  INITIALIZING: 'initializing',
  REQUESTING: 'requesting', // Requesting permission to start stream
  WAITING_APPROVAL: 'waitingApproval', // Waiting for other party to approve
  STARTING: 'starting',
  LIVE: 'live',
  PAUSED: 'paused',
  ENDING: 'ending',
  ENDED: 'ended',
  ERROR: 'error',
};

// Stream Events
export const STREAM_EVENTS = {
  REQUEST_STREAM: 'requestStream',
  APPROVE_STREAM: 'approveStream',
  REJECT_STREAM: 'rejectStream',
  START_STREAM: 'startStream',
  STREAM_STARTED: 'streamStarted',
  PAUSE_STREAM: 'pauseStream',
  RESUME_STREAM: 'resumeStream',
  END_STREAM: 'endStream',
  STREAM_ENDED: 'streamEnded',
  VIEWER_JOINED: 'viewerJoined',
  VIEWER_LEFT: 'viewerLeft',
  BROADCASTER_JOINED: 'broadcasterJoined',
  BROADCASTER_LEFT: 'broadcasterLeft',
  ERROR_OCCURRED: 'errorOccurred',
  RESET: 'reset',
};

// State Transitions
const STATE_TRANSITIONS = {
  [STREAM_STATES.IDLE]: {
    [STREAM_EVENTS.REQUEST_STREAM]: STREAM_STATES.REQUESTING,
    [STREAM_EVENTS.START_STREAM]: STREAM_STATES.STARTING,
    [STREAM_EVENTS.RESET]: STREAM_STATES.IDLE,
  },
  [STREAM_STATES.INITIALIZING]: {
    [STREAM_EVENTS.STREAM_STARTED]: STREAM_STATES.LIVE,
    [STREAM_EVENTS.ERROR_OCCURRED]: STREAM_STATES.ERROR,
    [STREAM_EVENTS.RESET]: STREAM_STATES.IDLE,
  },
  [STREAM_STATES.REQUESTING]: {
    [STREAM_EVENTS.APPROVE_STREAM]: STREAM_STATES.WAITING_APPROVAL,
    [STREAM_EVENTS.REJECT_STREAM]: STREAM_STATES.IDLE,
    [STREAM_EVENTS.ERROR_OCCURRED]: STREAM_STATES.ERROR,
    [STREAM_EVENTS.RESET]: STREAM_STATES.IDLE,
  },
  [STREAM_STATES.WAITING_APPROVAL]: {
    [STREAM_EVENTS.APPROVE_STREAM]: STREAM_STATES.STARTING,
    [STREAM_EVENTS.REJECT_STREAM]: STREAM_STATES.IDLE,
    [STREAM_EVENTS.ERROR_OCCURRED]: STREAM_STATES.ERROR,
    [STREAM_EVENTS.RESET]: STREAM_STATES.IDLE,
  },
  [STREAM_STATES.STARTING]: {
    [STREAM_EVENTS.STREAM_STARTED]: STREAM_STATES.LIVE,
    [STREAM_EVENTS.ERROR_OCCURRED]: STREAM_STATES.ERROR,
    [STREAM_EVENTS.END_STREAM]: STREAM_STATES.ENDING,
    [STREAM_EVENTS.RESET]: STREAM_STATES.IDLE,
  },
  [STREAM_STATES.LIVE]: {
    [STREAM_EVENTS.PAUSE_STREAM]: STREAM_STATES.PAUSED,
    [STREAM_EVENTS.END_STREAM]: STREAM_STATES.ENDING,
    [STREAM_EVENTS.STREAM_ENDED]: STREAM_STATES.ENDING,
    [STREAM_EVENTS.VIEWER_JOINED]: STREAM_STATES.LIVE,
    [STREAM_EVENTS.VIEWER_LEFT]: STREAM_STATES.LIVE,
    [STREAM_EVENTS.BROADCASTER_JOINED]: STREAM_STATES.LIVE,
    [STREAM_EVENTS.BROADCASTER_LEFT]: STREAM_STATES.LIVE,
    [STREAM_EVENTS.ERROR_OCCURRED]: STREAM_STATES.ERROR,
    [STREAM_EVENTS.RESET]: STREAM_STATES.IDLE,
  },
  [STREAM_STATES.PAUSED]: {
    [STREAM_EVENTS.RESUME_STREAM]: STREAM_STATES.LIVE,
    [STREAM_EVENTS.END_STREAM]: STREAM_STATES.ENDING,
    [STREAM_EVENTS.ERROR_OCCURRED]: STREAM_STATES.ERROR,
    [STREAM_EVENTS.RESET]: STREAM_STATES.IDLE,
  },
  [STREAM_STATES.ENDING]: {
    [STREAM_EVENTS.STREAM_ENDED]: STREAM_STATES.ENDED,
    [STREAM_EVENTS.ERROR_OCCURRED]: STREAM_STATES.ERROR,
    [STREAM_EVENTS.RESET]: STREAM_STATES.IDLE,
  },
  [STREAM_STATES.ENDED]: {
    [STREAM_EVENTS.RESET]: STREAM_STATES.IDLE,
    [STREAM_EVENTS.START_STREAM]: STREAM_STATES.STARTING, // Allow restarting
  },
  [STREAM_STATES.ERROR]: {
    [STREAM_EVENTS.RESET]: STREAM_STATES.IDLE,
    [STREAM_EVENTS.START_STREAM]: STREAM_STATES.STARTING, // Allow recovery
  },
};

// Stream State Machine Class
export class StreamStateMachine {
  constructor(initialState = STREAM_STATES.IDLE) {
    this.currentState = initialState;
    this.previousState = null;
    this.stateHistory = [initialState];
    this.listeners = new Map();
    this.metadata = {
      streamId: null,
      roomId: null,
      broadcasterId: null,
      viewersCount: 0,
      broadcastersCount: 0,
      startedAt: null,
      endedAt: null,
      error: null,
    };
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

  // Get metadata
  getMetadata() {
    return { ...this.metadata };
  }

  // Update metadata
  updateMetadata(updates) {
    this.metadata = { ...this.metadata, ...updates };
    logger.debug('Stream metadata updated', this.metadata);
  }

  // Check if transition is valid
  canTransition(event) {
    const transitions = STATE_TRANSITIONS[this.currentState];
    return transitions && transitions[event] !== undefined;
  }

  // ✅ Transition to new state with enhanced logging and validation
  transition(event, data = {}) {
    if (!this.canTransition(event)) {
      logger.warn(`Invalid stream transition from ${this.currentState} with event ${event}`, {
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
      logger.error('Stream state transition resulted in undefined state', {
        currentState: this.currentState,
        event,
      });
      return false;
    }

    this.previousState = previousState;
    this.currentState = newState;
    this.stateHistory.push(newState);

    // ✅ Update metadata based on state
    if (newState === STREAM_STATES.LIVE && !this.metadata.startedAt) {
      this.metadata.startedAt = Date.now();
    } else if (newState === STREAM_STATES.ENDED && !this.metadata.endedAt) {
      this.metadata.endedAt = Date.now();
    } else if (newState === STREAM_STATES.ERROR) {
      this.metadata.error = data.error || 'Unknown error';
    }

    // ✅ Enhanced logging
    logger.streamEvent('Stream state transition', {
      from: previousState,
      to: newState,
      event,
      timestamp: Date.now(),
      historyLength: this.stateHistory.length,
      metadata: this.metadata,
    });

    // Notify listeners
    this.notifyListeners(event, {
      from: previousState,
      to: newState,
      data,
      timestamp: Date.now(),
      metadata: this.metadata,
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
        logger.error('Error in stream state change listener:', error);
      }
    });
  }

  // Reset to initial state
  reset() {
    this.previousState = this.currentState;
    this.currentState = STREAM_STATES.IDLE;
    this.stateHistory = [STREAM_STATES.IDLE];
    this.metadata = {
      streamId: null,
      roomId: null,
      broadcasterId: null,
      viewersCount: 0,
      broadcastersCount: 0,
      startedAt: null,
      endedAt: null,
      error: null,
    };
    this.notifyListeners(STREAM_EVENTS.RESET, {
      from: this.previousState,
      to: this.currentState,
      data: {},
    });
  }

  // ✅ Recovery mechanism: محاولة استعادة من حالة الخطأ
  recover(recoveryStrategy = 'previous') {
    if (this.currentState !== STREAM_STATES.ERROR) {
      logger.warn('Stream recovery attempted from non-error state:', this.currentState);
      return false;
    }

    // ✅ Multiple recovery strategies
    let targetState = null;

    if (recoveryStrategy === 'previous' && this.previousState && this.previousState !== STREAM_STATES.ERROR) {
      targetState = this.previousState;
    } else if (recoveryStrategy === 'safe') {
      targetState = STREAM_STATES.IDLE;
    } else if (recoveryStrategy === 'history') {
      const validRecoveryStates = [
        STREAM_STATES.STARTING,
        STREAM_STATES.LIVE,
        STREAM_STATES.PAUSED,
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
        STREAM_STATES.STARTING,
        STREAM_STATES.LIVE,
        STREAM_STATES.PAUSED,
        STREAM_STATES.IDLE,
      ];
      
      if (validRecoveryStates.includes(targetState)) {
        logger.streamEvent('Attempting stream recovery', { 
          from: this.currentState, 
          to: targetState,
          strategy: recoveryStrategy,
        });
        
        this.previousState = this.currentState;
        this.currentState = targetState;
        this.stateHistory.push(this.currentState);
        this.metadata.error = null; // Clear error
        
        this.notifyListeners('recovered', {
          from: STREAM_STATES.ERROR,
          to: this.currentState,
          data: { 
            recovered: true,
            strategy: recoveryStrategy,
            timestamp: Date.now(),
          }
        });
        
        logger.streamEvent('Stream recovery successful', { 
          recoveredTo: this.currentState,
          strategy: recoveryStrategy,
        });
        return true;
      }
    }

    // ✅ إذا لم نتمكن من الاستعادة، نعيد تعيين الحالة
    logger.streamEvent('Stream recovery failed, resetting to IDLE', {
      strategy: recoveryStrategy,
      history: this.stateHistory,
    });
    this.reset();
    return false;
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
      [STREAM_STATES.IDLE]: 'Ready to start stream',
      [STREAM_STATES.INITIALIZING]: 'Initializing stream',
      [STREAM_STATES.REQUESTING]: 'Requesting permission to stream',
      [STREAM_STATES.WAITING_APPROVAL]: 'Waiting for approval',
      [STREAM_STATES.STARTING]: 'Starting stream',
      [STREAM_STATES.LIVE]: 'Stream is live',
      [STREAM_STATES.PAUSED]: 'Stream is paused',
      [STREAM_STATES.ENDING]: 'Ending stream',
      [STREAM_STATES.ENDED]: 'Stream has ended',
      [STREAM_STATES.ERROR]: 'Stream error occurred',
    };
    return descriptions[this.currentState] || 'Unknown state';
  }

  // Get valid transitions for current state
  getValidTransitions() {
    const transitions = STATE_TRANSITIONS[this.currentState];
    return transitions ? Object.keys(transitions) : [];
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
      isInError: this.currentState === STREAM_STATES.ERROR,
      isLive: this.currentState === STREAM_STATES.LIVE,
      isActive: this.isInAnyState([STREAM_STATES.LIVE, STREAM_STATES.PAUSED]),
      metadata: this.getMetadata(),
    };
  }

  // ✅ Force transition (for emergency recovery)
  forceTransition(newState, reason = '') {
    if (!Object.values(STREAM_STATES).includes(newState)) {
      logger.error('Invalid state for force transition', { newState });
      return false;
    }

    logger.warn('Force stream transition executed', {
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
}

// Helper functions
export const isStreamActive = (state) => {
  return [STREAM_STATES.LIVE, STREAM_STATES.PAUSED].includes(state);
};

export const isStreamInProgress = (state) => {
  return [
    STREAM_STATES.INITIALIZING,
    STREAM_STATES.REQUESTING,
    STREAM_STATES.WAITING_APPROVAL,
    STREAM_STATES.STARTING,
    STREAM_STATES.LIVE,
    STREAM_STATES.PAUSED,
  ].includes(state);
};

export const canStartStream = (state) => {
  return [STREAM_STATES.IDLE, STREAM_STATES.ENDED, STREAM_STATES.ERROR].includes(state);
};

export const canEndStream = (state) => {
  return [STREAM_STATES.LIVE, STREAM_STATES.PAUSED].includes(state);
};

export const canPauseStream = (state) => {
  return state === STREAM_STATES.LIVE;
};

export const canResumeStream = (state) => {
  return state === STREAM_STATES.PAUSED;
};

