/**
 * Logger utility for Mediasoup call system
 * Provides centralized logging with different levels and debug control
 */

const LOG_LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
};

class Logger {
  constructor() {
    // Enable debug logging in development or when explicitly set
    this.debugEnabled = process.env.NODE_ENV === 'development' || 
                       process.env.REACT_APP_MEDIASOUP_DEBUG === 'true';
    
    // Default log level
    this.logLevel = this.debugEnabled ? LOG_LEVELS.DEBUG : LOG_LEVELS.INFO;
    this.telemetryEnabled = process.env.REACT_APP_CALL_TELEMETRY === 'true';
  }

  setLogLevel(level) {
    this.logLevel = level;
  }

  setDebugEnabled(enabled) {
    this.debugEnabled = enabled;
    this.logLevel = enabled ? LOG_LEVELS.DEBUG : LOG_LEVELS.INFO;
  }

  _shouldLog(level) {
    return level >= this.logLevel;
  }

  _formatMessage(level, message, ...args) {
    const timestamp = new Date().toISOString().substr(11, 12);
    const levelStr = Object.keys(LOG_LEVELS)[level];
    const prefix = `[Mediasoup:${levelStr}] ${timestamp}`;
    
    if (args.length > 0) {
      return [prefix, message, ...args];
    }
    return [prefix, message];
  }

  debug(message, ...args) {
    if (this._shouldLog(LOG_LEVELS.DEBUG)) {
      console.log(...this._formatMessage(LOG_LEVELS.DEBUG, message, ...args));
    }
  }

  info(message, ...args) {
    if (this._shouldLog(LOG_LEVELS.INFO)) {
      console.info(...this._formatMessage(LOG_LEVELS.INFO, message, ...args));
    }
  }

  warn(message, ...args) {
    if (this._shouldLog(LOG_LEVELS.WARN)) {
      // console.warn(...this._formatMessage(LOG_LEVELS.WARN, message, ...args));
    }
  }

  error(message, ...args) {
    if (this._shouldLog(LOG_LEVELS.ERROR)) {
      console.error(...this._formatMessage(LOG_LEVELS.ERROR, message, ...args));
    }
  }

  _emitTelemetry(eventName, payload = {}) {
    if (!this.telemetryEnabled) return;
    try {
      if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
        window.dispatchEvent(
          new CustomEvent('call_telemetry', {
            detail: {
              event: eventName,
              payload,
              ts: Date.now(),
            },
          })
        );
      }
    } catch (error) {
      // Keep logger side-effect safe
    }
  }

  // Special method for call flow events
  callEvent(event, data = {}) {
    this.info(`📞 ${event}`, data);
    this._emitTelemetry('call_event', { event, ...data });
  }

  // Special method for device-related logs
  deviceEvent(event, data = {}) {
    this.debug(`🔍 ${event}`, data);
  }

  // Special method for room/peer events
  roomEvent(event, data = {}) {
    this.info(`🚪 ${event}`, data);
    this._emitTelemetry('room_event', { event, ...data });
  }

  // Special method for stream events
  streamEvent(event, data = {}) {
    this.debug(`📹 ${event}`, data);
    this._emitTelemetry('stream_event', { event, ...data });
  }

  // Special method for chat/message domain events
  chatEvent(event, data = {}) {
    this.info(`💬 ${event}`, data);
    this._emitTelemetry('chat_event', { event, ...data });
  }
}

// Create singleton instance
const logger = new Logger();

export default logger;
export { LOG_LEVELS };