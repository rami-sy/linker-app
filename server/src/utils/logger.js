/**
 * Logger utility for MediaSoup server-side
 * Provides centralized logging with different levels and debug control
 */

const LOG_LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
};

function parseLogLevel(value, fallback) {
  if (!value) return fallback;
  const key = String(value).trim().toUpperCase();
  return LOG_LEVELS[key] ?? fallback;
}

class Logger {
  constructor() {
    // Enable debug logging in development or when explicitly set
    this.debugEnabled = process.env.NODE_ENV === 'development' || 
                       process.env.MEDIASOUP_DEBUG === 'true';
    
    // Default log level
    this.logLevel = parseLogLevel(
      process.env.LOG_LEVEL,
      this.debugEnabled ? LOG_LEVELS.DEBUG : LOG_LEVELS.INFO
    );
    this.jsonMode = process.env.LOG_FORMAT === "json";
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
    const timestamp = new Date().toISOString().substring(11, 23);
    const levelStr = Object.keys(LOG_LEVELS)[level];
    const prefix = `[Mediasoup:${levelStr}] ${timestamp}`;
    
    if (args.length > 0) {
      return [prefix, message, ...args];
    }
    return [prefix, message];
  }

  _emit(level, message, ...args) {
    const levelStr = Object.keys(LOG_LEVELS)[level].toLowerCase();
    const method =
      level === LOG_LEVELS.ERROR
        ? "error"
        : level === LOG_LEVELS.WARN
          ? "warn"
          : "log";

    if (this.jsonMode) {
      const payload = {
        ts: new Date().toISOString(),
        level: levelStr,
        message,
      };
      if (args.length === 1) payload.meta = args[0];
      if (args.length > 1) payload.meta = args;
      console[method](JSON.stringify(payload));
      return;
    }

    if (method === "log") {
      console.log(...this._formatMessage(level, message, ...args));
      return;
    }
    console[method](...this._formatMessage(level, message, ...args));
  }

  debug(message, ...args) {
    if (this._shouldLog(LOG_LEVELS.DEBUG)) {
      this._emit(LOG_LEVELS.DEBUG, message, ...args);
    }
  }

  info(message, ...args) {
    if (this._shouldLog(LOG_LEVELS.INFO)) {
      this._emit(LOG_LEVELS.INFO, message, ...args);
    }
  }

  warn(message, ...args) {
    if (this._shouldLog(LOG_LEVELS.WARN)) {
      this._emit(LOG_LEVELS.WARN, message, ...args);
    }
  }

  error(message, ...args) {
    if (this._shouldLog(LOG_LEVELS.ERROR)) {
      this._emit(LOG_LEVELS.ERROR, message, ...args);
    }
  }

  // Special method for call flow events
  callEvent(event, data = {}) {
    this.info(`📞 ${event}`, data);
  }

  // Special method for device-related logs
  deviceEvent(event, data = {}) {
    this.debug(`🔍 ${event}`, data);
  }

  // Special method for room/peer events
  roomEvent(event, data = {}) {
    this.info(`🚪 ${event}`, data);
  }

  // Special method for stream events
  streamEvent(event, data = {}) {
    this.debug(`📹 ${event}`, data);
  }

  // Special method for transport events
  transportEvent(event, data = {}) {
    this.debug(`🔗 ${event}`, data);
  }

  // Special method for producer events
  producerEvent(event, data = {}) {
    this.info(`🎥 ${event}`, data);
  }

  // Special method for consumer events
  consumerEvent(event, data = {}) {
    this.info(`📥 ${event}`, data);
  }

  // Special method for message/chat events
  messageEvent(event, data = {}) {
    this.info(`💬 ${event}`, data);
  }
}

// Create singleton instance
const logger = new Logger();

module.exports = logger;
module.exports.LOG_LEVELS = LOG_LEVELS;

