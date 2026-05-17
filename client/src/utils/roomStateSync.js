/**
 * ✅ Room State Synchronization Service
 * خدمة لمزامنة حالة الغرفة بين Client و Server
 */

import logger from './logger';
import { updateRoom as updateRoomAction } from '../redux/chatSlice';

/**
 * ✅ Room State Synchronization Manager
 * يدير مزامنة حالة الغرفة مع version numbers
 */
class RoomStateSync {
  constructor(dispatch, updateRoom, socket) {
    this.dispatch = dispatch;
    this.updateRoom = updateRoom;
    this.socket = socket;
    this.roomVersions = new Map(); // Map<roomId, { clientVersion, serverVersion, lastSync }>
    this.syncQueue = new Map(); // Map<roomId, Array<syncOperations>>
    this.syncInProgress = new Set(); // Set<roomId>
  }

  /**
   * ✅ Initialize room state sync
   */
  initializeRoom(roomId, serverVersion = 1) {
    this.roomVersions.set(roomId, {
      clientVersion: serverVersion,
      serverVersion: serverVersion,
      lastSync: Date.now(),
    });
    logger.debug('Room state sync initialized', { roomId, serverVersion });
  }

  /**
   * ✅ Update room state with version check
   */
  async updateRoomState(roomId, updates, options = {}) {
    try {
      const { skipVersionCheck = false, force = false } = options;
      const roomVersion = this.roomVersions.get(roomId);

      if (!roomVersion && !force) {
        logger.warn('Room version not found, initializing', { roomId });
        this.initializeRoom(roomId);
      }

      // ✅ Check for version conflicts
      if (!skipVersionCheck && roomVersion) {
        const { clientVersion, serverVersion } = roomVersion;
        if (updates.stateVersion && updates.stateVersion < serverVersion) {
          logger.warn('Version conflict detected, fetching latest state', {
            roomId,
            clientVersion: updates.stateVersion,
            serverVersion,
          });
          // Fetch latest state from server
          await this.fetchLatestState(roomId);
          return;
        }
      }

      // ✅ Update local state
      // Note: this.updateRoom is already a function that takes updates and calls dispatch internally
      if (this.updateRoom && typeof this.updateRoom === 'function') {
        this.updateRoom({
          _id: roomId,
          ...updates,
          stateVersion: updates.stateVersion || roomVersion?.serverVersion || 1,
          lastUpdated: new Date().toISOString(),
          skipAddIfNotExists: true, // ✅ منع إضافة room جديد للمشاهدين
        });
      } else {
        // Fallback: use dispatch directly if updateRoom is not available
          this.dispatch(updateRoomAction({
          _id: roomId,
          ...updates,
          stateVersion: updates.stateVersion || roomVersion?.serverVersion || 1,
          lastUpdated: new Date().toISOString(),
          skipAddIfNotExists: true, // ✅ منع إضافة room جديد للمشاهدين
        }));
      }

      // ✅ Update version tracking
      if (roomVersion) {
        roomVersion.clientVersion = updates.stateVersion || roomVersion.serverVersion;
        roomVersion.lastSync = Date.now();
      }

      logger.debug('Room state updated', { roomId, version: updates.stateVersion });
    } catch (error) {
      logger.error('Error updating room state:', error);
    }
  }

  /**
   * ✅ Fetch latest state from server
   */
  async fetchLatestState(roomId) {
    try {
      if (this.syncInProgress.has(roomId)) {
        logger.debug('Sync already in progress for room', { roomId });
        return;
      }

      this.syncInProgress.add(roomId);

      logger.debug('Fetching latest room state from server', { roomId });

      // ✅ Emit getOneRoom event to fetch latest state
      if (this.socket && typeof this.socket.emit === 'function') {
        this.socket.emit('getOneRoom', { room: roomId, update: true });
      }

      // ✅ Remove from sync in progress after timeout
      setTimeout(() => {
        this.syncInProgress.delete(roomId);
      }, 5000);
    } catch (error) {
      logger.error('Error fetching latest state:', error);
      this.syncInProgress.delete(roomId);
    }
  }

  /**
   * ✅ Handle server state update
   */
  handleServerStateUpdate({ roomId, room, stateVersion }) {
    try {
      const roomVersion = this.roomVersions.get(roomId);
      const currentStateVersion = stateVersion || 1;

      if (!roomVersion) {
        this.initializeRoom(roomId, currentStateVersion);
      } else {
        // ✅ Update server version
        roomVersion.serverVersion = currentStateVersion;
        roomVersion.lastSync = Date.now();
      }

      // ✅ Always update Redux state with server data when receiving server update
      // This ensures that role changes and other server-side updates are reflected immediately
      logger.debug('Updating room from server state', {
        roomId,
        clientVersion: roomVersion?.clientVersion,
        serverVersion: currentStateVersion,
        roles: room?.roles,
        rolesLength: room?.roles?.length,
      });

      // ✅ Update Redux state with server data
      // Note: this.updateRoom is already a function that takes updates and calls dispatch internally
      try {
        const roomUpdates = {
          ...room,
          stateVersion: currentStateVersion,
          lastUpdated: new Date().toISOString(),
          skipAddIfNotExists: true, // ✅ منع إضافة room جديد للمشاهدين
        };

        // Validate room updates before proceeding
        if (!roomUpdates._id) {
          logger.error('Cannot update room: missing _id', { roomId, roomUpdates });
          return;
        }

        if (this.updateRoom && typeof this.updateRoom === 'function') {
          logger.debug('Using this.updateRoom function', { roomId, hasDispatch: !!this.dispatch });
          this.updateRoom(roomUpdates);
        } else if (this.dispatch) {
          // Fallback: use dispatch directly if updateRoom is not available
          logger.debug('Using dispatch fallback', { roomId, hasUpdateRoom: !!this.updateRoom });
          this.dispatch(updateRoomAction(roomUpdates));
        } else {
          logger.error('Cannot update room: both updateRoom and dispatch are unavailable', {
            roomId,
            hasUpdateRoom: !!this.updateRoom,
            hasDispatch: !!this.dispatch,
          });
        }
      } catch (updateError) {
        logger.error('Error updating room state in handleServerStateUpdate:', {
          error: updateError,
          message: updateError?.message,
          stack: updateError?.stack,
          roomId,
          hasUpdateRoom: !!this.updateRoom,
          hasDispatch: !!this.dispatch,
        });
        // Try fallback if available
        if (this.dispatch) {
          try {
            logger.debug('Attempting fallback updateRoom', { roomId });
            this.dispatch(updateRoomAction({
              ...room,
              stateVersion: currentStateVersion,
              lastUpdated: new Date().toISOString(),
              skipAddIfNotExists: true,
            }));
          } catch (fallbackError) {
            logger.error('Fallback updateRoom also failed:', {
              error: fallbackError,
              message: fallbackError?.message,
              stack: fallbackError?.stack,
            });
          }
        }
      }

      // ✅ Update client version to match server
      if (roomVersion) {
        roomVersion.clientVersion = currentStateVersion;
      }

      logger.debug('Server state update handled', { roomId, stateVersion: currentStateVersion });
    } catch (error) {
      logger.error('Error handling server state update:', error);
    }
  }

  /**
   * ✅ Queue sync operation
   */
  queueSyncOperation(roomId, operation) {
    if (!this.syncQueue.has(roomId)) {
      this.syncQueue.set(roomId, []);
    }
    this.syncQueue.get(roomId).push({
      ...operation,
      timestamp: Date.now(),
    });
    logger.debug('Sync operation queued', { roomId, operation: operation.type });
  }

  /**
   * ✅ Process sync queue for room
   */
  async processSyncQueue(roomId) {
    try {
      const queue = this.syncQueue.get(roomId);
      if (!queue || queue.length === 0) {
        return;
      }

      logger.debug('Processing sync queue', { roomId, queueLength: queue.length });

      // ✅ Process operations in order
      for (const operation of queue) {
        try {
          await this.executeSyncOperation(roomId, operation);
        } catch (error) {
          logger.error('Error executing sync operation:', error);
        }
      }

      // ✅ Clear queue
      this.syncQueue.delete(roomId);
    } catch (error) {
      logger.error('Error processing sync queue:', error);
    }
  }

  /**
   * ✅ Execute sync operation
   */
  async executeSyncOperation(roomId, operation) {
    switch (operation.type) {
      case 'update':
        await this.updateRoomState(roomId, operation.data, operation.options);
        break;
      case 'fetch':
        await this.fetchLatestState(roomId);
        break;
      default:
        logger.warn('Unknown sync operation type', { roomId, type: operation.type });
    }
  }

  /**
   * ✅ Get room version info
   */
  getRoomVersionInfo(roomId) {
    return this.roomVersions.get(roomId) || null;
  }

  /**
   * ✅ Check if sync is needed
   */
  isSyncNeeded(roomId, maxAge = 30000) {
    const roomVersion = this.roomVersions.get(roomId);
    if (!roomVersion) {
      return true;
    }

    const age = Date.now() - roomVersion.lastSync;
    return age > maxAge;
  }

  /**
   * ✅ Cleanup
   */
  cleanup() {
    this.roomVersions.clear();
    this.syncQueue.clear();
    this.syncInProgress.clear();
    logger.debug('Room State Sync cleaned up');
  }
}

export default RoomStateSync;

