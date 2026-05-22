/**
 * ✅ Socket Event Coordinator
 * خدمة لتنسيق Socket Events وتجنب Race Conditions
 */

import logger from './logger';

/**
 * ✅ Socket Event Coordinator
 * يدير تنسيق Socket Events مع debouncing و queuing
 */
class SocketEventCoordinator {
  constructor(socket) {
    this.socket = socket;
    this.eventQueue = new Map(); // Map<eventName, Array<events>>
    this.processing = new Set(); // Set<eventName>
    this.debounceTimers = new Map(); // Map<eventName, timer>
    this.eventHandlers = new Map(); // Map<eventName, Set<handlers>>
    this.maxQueueSize = 100;
    this.debounceDelay = 100; // 100ms default debounce
  }

  /**
   * ✅ Register event handler with coordination
   */
  on(eventName, handler, options = {}) {
    const {
      debounce = false,
      debounceDelay = this.debounceDelay,
      queue = false,
      priority = 0,
    } = options;

    if (!this.eventHandlers.has(eventName)) {
      this.eventHandlers.set(eventName, new Set());
    }

    const handlerWrapper = {
      handler,
      debounce,
      debounceDelay,
      queue,
      priority,
    };

    this.eventHandlers.get(eventName).add(handlerWrapper);

    // ✅ Register with socket
    if (this.socket && typeof this.socket.on === 'function') {
      this.socket.on(eventName, (data) => {
        this.handleEvent(eventName, data, handlerWrapper);
      });
    }

    // ✅ Return unsubscribe function
    return () => {
      this.off(eventName, handlerWrapper);
    };
  }

  /**
   * ✅ Remove event handler
   */
  off(eventName, handlerWrapper) {
    if (this.eventHandlers.has(eventName)) {
      this.eventHandlers.get(eventName).delete(handlerWrapper);
    }
  }

  /**
   * ✅ Handle event with coordination
   */
  handleEvent(eventName, data, handlerWrapper) {
    try {
      const { handler, debounce, debounceDelay, queue, priority } = handlerWrapper;

      if (debounce) {
        // ✅ Debounce handler
        const timerKey = `${eventName}_${handler.toString()}`;
        if (this.debounceTimers.has(timerKey)) {
          clearTimeout(this.debounceTimers.get(timerKey));
        }

        const timer = setTimeout(() => {
          try {
            handler(data);
          } catch (error) {
            logger.error(`Error in debounced handler for ${eventName}:`, error);
          }
          this.debounceTimers.delete(timerKey);
        }, debounceDelay);

        this.debounceTimers.set(timerKey, timer);
      } else if (queue) {
        // ✅ Queue handler
        this.queueEvent(eventName, { handler, data, priority });
      } else {
        // ✅ Execute immediately
        handler(data);
      }
    } catch (error) {
      logger.error(`Error handling event ${eventName}:`, error);
    }
  }

  /**
   * ✅ Queue event for processing
   */
  queueEvent(eventName, eventData) {
    if (!this.eventQueue.has(eventName)) {
      this.eventQueue.set(eventName, []);
    }

    const queue = this.eventQueue.get(eventName);

    // ✅ Check queue size
    if (queue.length >= this.maxQueueSize) {
      logger.warn(`Event queue full for ${eventName}, dropping oldest event`);
      queue.shift();
    }

    // ✅ Insert based on priority
    const insertIndex = queue.findIndex(e => e.priority < eventData.priority);
    if (insertIndex === -1) {
      queue.push(eventData);
    } else {
      queue.splice(insertIndex, 0, eventData);
    }

    // ✅ Process queue if not already processing
    if (!this.processing.has(eventName)) {
      this.processQueue(eventName);
    }
  }

  /**
   * ✅ Process event queue
   */
  async processQueue(eventName) {
    if (this.processing.has(eventName)) {
      return;
    }

    this.processing.add(eventName);

    try {
      const queue = this.eventQueue.get(eventName);
      if (!queue || queue.length === 0) {
        this.processing.delete(eventName);
        return;
      }

      // ✅ Process events in order
      while (queue.length > 0) {
        const eventData = queue.shift();
        try {
          await eventData.handler(eventData.data);
        } catch (error) {
          logger.error(`Error processing queued event ${eventName}:`, error);
        }
      }

      this.processing.delete(eventName);
    } catch (error) {
      logger.error(`Error processing queue for ${eventName}:`, error);
      this.processing.delete(eventName);
    }
  }

  /**
   * ✅ Emit event with coordination
   */
  emit(eventName, data, options = {}) {
    const {
      debounce = false,
      debounceDelay = this.debounceDelay,
      throttle = false,
      throttleDelay = this.debounceDelay,
    } = options;

    if (!this.socket || typeof this.socket.emit !== 'function') {
      logger.warn('Socket not available for emit', { eventName });
      return;
    }

    if (debounce) {
      const timerKey = `emit_${eventName}`;
      if (this.debounceTimers.has(timerKey)) {
        clearTimeout(this.debounceTimers.get(timerKey));
      }

      const timer = setTimeout(() => {
        this.socket.emit(eventName, data);
        this.debounceTimers.delete(timerKey);
      }, debounceDelay);

      this.debounceTimers.set(timerKey, timer);
    } else if (throttle) {
      // ✅ Throttle implementation (similar to debounce but different logic)
      const timerKey = `throttle_${eventName}`;
      if (!this.debounceTimers.has(timerKey)) {
        this.socket.emit(eventName, data);
        this.debounceTimers.set(timerKey, setTimeout(() => {
          this.debounceTimers.delete(timerKey);
        }, throttleDelay));
      }
    } else {
      this.socket.emit(eventName, data);
    }
  }

  /**
   * ✅ Emit with acknowledgment and coordination
   */
  emitWithAck(eventName, data, options = {}) {
    const { timeout = 5000 } = options;

    if (!this.socket || typeof this.socket.emitWithAck !== 'function') {
      logger.warn('Socket emitWithAck not available', { eventName });
      return Promise.reject(new Error('Socket emitWithAck not available'));
    }

    const ackPromise = Promise.resolve().then(() =>
      this.socket.emitWithAck(eventName, data)
    );
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`Event ${eventName} timeout`)), timeout);
    });

    return Promise.race([ackPromise, timeoutPromise]).then((response) => {
      if (response && response.success !== false) {
        return response;
      }
      throw new Error(response?.error || `Event ${eventName} failed`);
    });
  }

  /**
   * ✅ Clear debounce timers
   */
  clearDebounceTimers() {
    this.debounceTimers.forEach(timer => clearTimeout(timer));
    this.debounceTimers.clear();
  }

  /**
   * ✅ Get queue size for event
   */
  getQueueSize(eventName) {
    return this.eventQueue.get(eventName)?.length || 0;
  }

  /**
   * ✅ Clear queue for event
   */
  clearQueue(eventName) {
    this.eventQueue.delete(eventName);
    this.processing.delete(eventName);
  }

  /**
   * ✅ Cleanup
   */
  cleanup() {
    this.clearDebounceTimers();
    this.eventQueue.clear();
    this.processing.clear();
    this.eventHandlers.clear();
    logger.debug('Socket Event Coordinator cleaned up');
  }
}

export default SocketEventCoordinator;

