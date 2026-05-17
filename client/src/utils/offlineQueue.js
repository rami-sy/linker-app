/**
 * ✅ Offline Queue Service
 * خدمة لإدارة Queue للعمليات عند انقطاع الاتصال
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import logger from './logger';

const OFFLINE_QUEUE_KEY = '@linker:offline_queue';
const MAX_QUEUE_SIZE = 1000;

/**
 * ✅ Offline Queue Manager
 * يدير Queue للعمليات عند انقطاع الاتصال
 */
class OfflineQueue {
  constructor() {
    this.queue = [];
    this.isOnline = true;
    this.listeners = new Map(); // Map<eventName, Set<listeners>>
    this.syncInProgress = false;
    this.networkUnsubscribe = null;
    this.initialized = false;
  }

  /**
   * ✅ Initialize offline queue
   */
  async initialize() {
    try {
      if (this.initialized) {
        logger.debug('Offline Queue already initialized');
        return;
      }

      // Load queue from storage
      await this.loadQueue();

      const netState = await NetInfo.fetch();
      this.isOnline = !!(netState?.isConnected && netState?.isInternetReachable);
      
      // Monitor network status
      this.networkUnsubscribe = NetInfo.addEventListener(state => {
        const wasOffline = !this.isOnline;
        this.isOnline = !!(state?.isConnected && state?.isInternetReachable);
        
        if (wasOffline && this.isOnline) {
          logger.info('Network connection restored, processing offline queue');
          this.processQueue();
        } else if (!this.isOnline) {
          logger.warn('Network connection lost, queueing operations');
        }
      });

      // Process queue if online
      if (this.isOnline) {
        await this.processQueue();
      }

      this.initialized = true;
      logger.info('Offline Queue initialized', { queueSize: this.queue.length });
    } catch (error) {
      logger.error('Error initializing offline queue:', error);
    }
  }

  /**
   * ✅ Add operation to queue
   */
  async addOperation(operation) {
    try {
      const operationWithId = {
        id: `op_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        timestamp: Date.now(),
        retries: 0,
        maxRetries: 3,
        ...operation,
      };

      // Check queue size
      if (this.queue.length >= MAX_QUEUE_SIZE) {
        logger.warn('Offline queue full, removing oldest operation');
        this.queue.shift();
      }

      this.queue.push(operationWithId);
      await this.saveQueue();

      // If online, try to process immediately
      if (this.isOnline && !this.syncInProgress) {
        await this.processQueue();
      } else {
        logger.debug('Operation queued (offline or sync in progress)', {
          operationId: operationWithId.id,
          type: operation.type,
        });
      }

      // Notify listeners
      this.notifyListeners('operationQueued', operationWithId);

      return operationWithId.id;
    } catch (error) {
      logger.error('Error adding operation to queue:', error);
      throw error;
    }
  }

  /**
   * ✅ Process queue
   */
  async processQueue() {
    if (this.syncInProgress || !this.isOnline || this.queue.length === 0) {
      return;
    }

    this.syncInProgress = true;
    logger.info('Processing offline queue', { queueSize: this.queue.length });

    try {
      const operationsToProcess = [...this.queue];
      const successfulOps = [];
      const failedOps = [];

      for (const operation of operationsToProcess) {
        try {
          const success = await this.executeOperation(operation);
          
          if (success) {
            successfulOps.push(operation.id);
            this.queue = this.queue.filter(op => op.id !== operation.id);
          } else {
            operation.retries++;
            if (operation.retries >= operation.maxRetries) {
              logger.warn('Operation exceeded max retries, removing from queue', {
                operationId: operation.id,
                type: operation.type,
              });
              failedOps.push(operation.id);
              this.queue = this.queue.filter(op => op.id !== operation.id);
              this.notifyListeners('operationFailed', operation);
            }
          }
        } catch (error) {
          logger.error('Error executing operation:', error);
          operation.retries++;
          if (operation.retries >= operation.maxRetries) {
            failedOps.push(operation.id);
            this.queue = this.queue.filter(op => op.id !== operation.id);
            this.notifyListeners('operationFailed', operation);
          }
        }
      }

      if (successfulOps.length > 0 || failedOps.length > 0) {
        await this.saveQueue();
      }

      logger.info('Offline queue processed', {
        successful: successfulOps.length,
        failed: failedOps.length,
        remaining: this.queue.length,
      });

      // Notify listeners
      if (successfulOps.length > 0) {
        this.notifyListeners('queueProcessed', {
          successful: successfulOps.length,
          failed: failedOps.length,
          remaining: this.queue.length,
        });
      }
    } catch (error) {
      logger.error('Error processing offline queue:', error);
    } finally {
      this.syncInProgress = false;
    }
  }

  /**
   * ✅ Execute operation
   */
  async executeOperation(operation) {
    try {
      // Notify listeners to execute operation
      const listeners = this.listeners.get('executeOperation') || new Set();
      let executed = false;

      for (const listener of listeners) {
        try {
          const result = await listener(operation);
          if (result === true) {
            executed = true;
            break;
          }
        } catch (error) {
          logger.error('Error in operation listener:', error);
        }
      }

      return executed;
    } catch (error) {
      logger.error('Error executing operation:', error);
      return false;
    }
  }

  /**
   * ✅ Load queue from storage
   */
  async loadQueue() {
    try {
      const stored = await AsyncStorage.getItem(OFFLINE_QUEUE_KEY);
      if (stored) {
        this.queue = JSON.parse(stored);
        logger.debug('Offline queue loaded from storage', { queueSize: this.queue.length });
      }
    } catch (error) {
      logger.error('Error loading offline queue:', error);
      this.queue = [];
    }
  }

  /**
   * ✅ Save queue to storage
   */
  async saveQueue() {
    try {
      await AsyncStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(this.queue));
      logger.debug('Offline queue saved to storage', { queueSize: this.queue.length });
    } catch (error) {
      logger.error('Error saving offline queue:', error);
    }
  }

  /**
   * ✅ Get queue size
   */
  getQueueSize() {
    return this.queue.length;
  }

  /**
   * ✅ Get queue operations
   */
  getQueue() {
    return [...this.queue];
  }

  /**
   * ✅ Clear queue
   */
  async clearQueue() {
    this.queue = [];
    await AsyncStorage.removeItem(OFFLINE_QUEUE_KEY);
    logger.info('Offline queue cleared');
    this.notifyListeners('queueCleared', {});
  }

  /**
   * ✅ Remove operation from queue
   */
  async removeOperation(operationId) {
    this.queue = this.queue.filter(op => op.id !== operationId);
    await this.saveQueue();
    logger.debug('Operation removed from queue', { operationId });
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
   * ✅ Check if online
   */
  isConnected() {
    return this.isOnline;
  }

  /**
   * ✅ Cleanup
   */
  cleanup() {
    if (this.networkUnsubscribe) {
      this.networkUnsubscribe();
      this.networkUnsubscribe = null;
    }
    this.initialized = false;
    logger.debug('Offline Queue cleaned up');
  }
}

const offlineQueue = new OfflineQueue();
export default offlineQueue;

