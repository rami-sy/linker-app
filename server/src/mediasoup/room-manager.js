/**
 * Room Manager
 * إدارة جميع الغرف والمستخدمين
 */

const Room = require('./room');
const Peer = require('./peer');
const workerManager = require('./worker-manager');
const logger = require('../utils/logger');
const ScalingService = require('../utils/scalingService'); // ✅ Scaling Service integration

class RoomManager {
  constructor() {
    this.rooms = new Map(); // Map<roomId, Room>
    this.cleanupInterval = null;
    this.cleanupIntervalMs = 30000; // Check every 30 seconds
    this.maxInactiveTime = 60000; // Close rooms inactive for 1 minute
    this.scalingService = null; // ✅ سيتم تعيينه من app.js
    
    // بدء periodic cleanup
    this.startPeriodicCleanup();
  }

  /**
   * ✅ تعيين Scaling Service
   */
  setScalingService(scalingService) {
    this.scalingService = scalingService;
    logger.info('Scaling service set for RoomManager');
  }

  /**
   * الحصول على غرفة أو إنشاؤها إذا لم تكن موجودة
   */
  async getOrCreateRoom(roomId) {
    let room = this.rooms.get(roomId);

    if (!room) {
      logger.roomEvent(`Creating new room: ${roomId}`, { roomId });
      // ✅ استخدام load-based distribution
      const worker = await workerManager.getWorker();
      
      if (!worker) {
        throw new Error('No MediaSoup worker available');
      }
      
      room = new Room({ id: roomId, worker });
      await room.initialize();
      this.rooms.set(roomId, room);
      
      // ✅ Scaling Integration: تسجيل Room في Redis
      if (this.scalingService) {
        await this.scalingService.registerRoom(roomId);
      }
    }

    return room;
  }

  /**
   * الحصول على غرفة موجودة
   */
  getRoom(roomId) {
    return this.rooms.get(roomId);
  }

  /**
   * إنشاء peer جديد
   */
  createPeer({ socketId, userId, roomId, socket, userData = null, role = 'member' }) {
    return new Peer({
      id: socketId,
      userId,
      roomId,
      socket,
      userData,
      role, // ✅ إضافة role
    });
  }

  /**
   * إضافة peer لغرفة
   */
  async addPeerToRoom(roomId, peer) {
    const room = await this.getOrCreateRoom(roomId);
    const existingPeer = room.getPeer(peer.id);
    if (existingPeer) {
      try {
        existingPeer.close();
      } catch (error) {
        logger.warn(`Failed closing existing peer ${peer.id} before replacement`, error);
      }
    }
    room.addPeer(peer);
    return room;
  }

  /**
   * إزالة peer من غرفة
   * مع معالجة أفضل للأخطاء
   * ✅ تم تحويلها إلى async لدعم Scaling Service
   */
  async removePeerFromRoom(roomId, peerId) {
    const room = this.rooms.get(roomId);
    if (room) {
      try {
        const isEmpty = room.removePeer(peerId);
        
      // إذا أصبحت الغرفة فارغة، أغلقها
      if (isEmpty) {
        logger.roomEvent(`Room ${roomId} is empty, closing...`, { roomId });
        try {
          // ✅ Scaling Integration: إلغاء تسجيل Room من Redis
          if (this.scalingService) {
            await this.scalingService.unregisterRoom(roomId);
          }
          
          room.close();
          this.rooms.delete(roomId);
        } catch (closeError) {
          logger.error(`Error closing empty room ${roomId}:`, closeError);
          // محاولة حذف الغرفة من Map حتى في حالة الخطأ
          try {
            this.rooms.delete(roomId);
          } catch (deleteError) {
            logger.error(`Critical: Failed to delete room ${roomId}:`, deleteError);
          }
        }
      }
      } catch (error) {
        logger.error(`Error removing peer ${peerId} from room ${roomId}:`, error);
        // محاولة إزالة peer من Map حتى في حالة الخطأ
        try {
          room.peers.delete(peerId);
        } catch (deleteError) {
          logger.error(`Critical: Failed to delete peer ${peerId} from room ${roomId}:`, deleteError);
        }
      }
    } else {
      logger.warn(`Room ${roomId} not found when trying to remove peer ${peerId}`);
    }
  }

  /**
   * الحصول على peer من أي غرفة
   */
  getPeerBySocketId(socketId) {
    for (const room of this.rooms.values()) {
      const peer = room.getPeer(socketId);
      if (peer) {
        return { peer, room };
      }
    }
    return null;
  }

  /**
   * الحصول على معلومات جميع الغرف
   */
  getAllRoomsInfo() {
    return Array.from(this.rooms.values()).map((room) => room.getInfo());
  }

  /**
   * الحصول على عدد الغرف النشطة
   */
  getActiveRoomsCount() {
    return this.rooms.size;
  }

  /**
   * الحصول على الغرف الفارغة (stale rooms)
   */
  getStaleRooms() {
    const staleRooms = [];
    this.rooms.forEach((room, roomId) => {
      if (room.isStale(this.maxInactiveTime)) {
        staleRooms.push(room);
      }
    });
    return staleRooms;
  }

  /**
   * ✅ تنظيف الغرف الفارغة القديمة (محسّن)
   * مع ربط بمراقبة الذاكرة
   */
  cleanupStaleRooms() {
    const staleRooms = this.getStaleRooms();
    
    if (staleRooms.length > 0) {
      logger.roomEvent(`Cleaning up ${staleRooms.length} stale room(s)`, {
        staleRoomsCount: staleRooms.length,
        totalRooms: this.rooms.size,
      });

      for (const room of staleRooms) {
        try {
          logger.roomEvent(`Removing stale room: ${room.id}`, {
            roomId: room.id,
            inactiveFor: Date.now() - room.lastActivity,
          });
          room.close();
          this.rooms.delete(room.id);
          if (this.scalingService) {
            this.scalingService.unregisterRoom(room.id).catch((unregisterError) => {
              logger.warn(
                `Failed to unregister stale room ${room.id} from scaling service`,
                unregisterError
              );
            });
          }
        } catch (error) {
          logger.error(`Error cleaning up stale room ${room.id}:`, error);
          // محاولة حذف الغرفة من Map حتى في حالة الخطأ
          try {
            this.rooms.delete(room.id);
          } catch (deleteError) {
            logger.error(`Critical: Failed to delete stale room ${room.id}:`, deleteError);
          }
        }
      }
      
      // ✅ إجبار garbage collection إذا كان متاحاً (عند تنظيف عدد كبير من الغرف)
      if (staleRooms.length > 5 && global.gc) {
        logger.info('Forcing garbage collection after cleaning up multiple rooms');
        global.gc();
      }
    }
  }
  
  /**
   * ✅ الحصول على إحصائيات استخدام الذاكرة للغرف
   */
  getMemoryStats() {
    const roomsInfo = this.getAllRoomsInfo();
    const totalPeers = roomsInfo.reduce((sum, room) => sum + room.peersCount, 0);
    
    return {
      totalRooms: this.rooms.size,
      totalPeers,
      staleRooms: this.getStaleRooms().length,
      averagePeersPerRoom: this.rooms.size > 0 ? totalPeers / this.rooms.size : 0,
      roomsInfo: roomsInfo.map(room => ({
        id: room.id,
        peersCount: room.peersCount,
        age: room.age,
        inactiveFor: room.inactiveFor,
      })),
    };
  }

  /**
   * بدء periodic cleanup للغرف الفارغة
   */
  startPeriodicCleanup() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }

    this.cleanupInterval = setInterval(() => {
      this.cleanupStaleRooms();
    }, this.cleanupIntervalMs);

    logger.info('Periodic room cleanup started', {
      interval: this.cleanupIntervalMs,
      maxInactiveTime: this.maxInactiveTime,
    });
  }

  /**
   * إيقاف periodic cleanup
   */
  stopPeriodicCleanup() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
      logger.info('Periodic room cleanup stopped');
    }
  }

  /**
   * تنظيف كل شيء (عند إيقاف السيرفر)
   */
  closeAll() {
    // إيقاف periodic cleanup
    this.stopPeriodicCleanup();

    logger.info('🧹 Closing all rooms...', { roomsCount: this.rooms.size });
    this.rooms.forEach((room, roomId) => {
      try {
        room.close();
      } catch (error) {
        logger.error(`Error closing room ${roomId}:`, error);
      }
    });
    this.rooms.clear();
    logger.info('✅ All rooms closed');
  }
}

// Singleton instance
const roomManager = new RoomManager();

module.exports = roomManager;

