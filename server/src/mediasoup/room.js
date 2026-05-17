/**
 * Room Class
 * تمثل غرفة مكالمة واحدة تحتوي على عدة مستخدمين (peers)
 */

const config = require('../config/media.config');
const logger = require('../utils/logger');

class Room {
  constructor({ id, worker }) {
    this.id = id; // Room ID
    this.worker = worker;
    this.router = null;
    this.peers = new Map(); // Map<socketId, Peer>
    this.createdAt = Date.now();
    this.lastActivity = Date.now(); // آخر نشاط في الغرفة
    
    // Active Speaker Observer (لاكتشاف المتحدث النشط)
    this.activeSpeakerObserver = null;
  }

  /**
   * تهيئة Router للغرفة
   */
  async initialize() {
    logger.roomEvent(`Creating router for room: ${this.id}`, { roomId: this.id });
    
    if (!this.worker) {
      throw new Error('Worker is not defined for room initialization');
    }
    
    this.router = await this.worker.createRouter({
      mediaCodecs: config.router.mediaCodecs,
    });

    // إنشاء Active Speaker Observer
    this.activeSpeakerObserver = await this.router.createActiveSpeakerObserver({
      interval: 300, // Check every 300ms
    });

    this.activeSpeakerObserver.on('dominantspeaker', (dominantSpeaker) => {
      logger.debug(`🎤 Dominant speaker in room ${this.id}:`, dominantSpeaker.producer.id);
      // يمكن إرسال هذه المعلومات للكلاينت لتمييز المتحدث
      this.broadcastToRoom('activeSpeaker', {
        producerId: dominantSpeaker.producer.id,
      });
    });

    logger.roomEvent(`Router created for room: ${this.id}`, { roomId: this.id });
  }

  /**
   * إضافة peer للغرفة
   */
  addPeer(peer) {
    this.peers.set(peer.id, peer);
    this.lastActivity = Date.now(); // تحديث آخر نشاط
    logger.roomEvent(`Peer ${peer.id} joined room ${this.id}. Total peers: ${this.peers.size}`, { 
      roomId: this.id, 
      peerId: peer.id, 
      peersCount: this.peers.size 
    });
  }

  /**
   * الحصول على peer
   */
  getPeer(peerId) {
    return this.peers.get(peerId);
  }

  /**
   * الحصول على peer بواسطة userId
   */
  getPeerByUserId(userId) {
    for (const peer of this.peers.values()) {
      if (peer.userId && peer.userId.toString() === userId.toString()) {
        return peer;
      }
    }
    return null;
  }

  /**
   * ✅ الحصول على producer من أي peer في الغرفة
   */
  getProducer(producerId) {
    for (const peer of this.peers.values()) {
      const producer = peer.producers.get(producerId);
      if (producer) {
        return producer;
      }
    }
    return null;
  }

  /**
   * إزالة peer من الغرفة
   */
  removePeer(peerId) {
    const peer = this.peers.get(peerId);
    if (peer) {
      peer.close();
      this.peers.delete(peerId);
      this.lastActivity = Date.now(); // تحديث آخر نشاط
      logger.roomEvent(`Peer ${peerId} left room ${this.id}. Remaining peers: ${this.peers.size}`, { 
        roomId: this.id, 
        peerId, 
        remainingPeers: this.peers.size 
      });
    }
    return this.peers.size === 0; // Return true if room is empty
  }

  /**
   * الحصول على جميع peers ما عدا peer محدد
   */
  getOtherPeers(excludePeerId) {
    return Array.from(this.peers.values()).filter(
      (peer) => peer.id !== excludePeerId
    );
  }

  /**
   * إرسال رسالة لجميع peers في الغرفة
   */
  broadcastToRoom(event, data, excludePeerId = null) {
    this.lastActivity = Date.now(); // تحديث آخر نشاط
    this.peers.forEach((peer) => {
      if (peer.id !== excludePeerId) {
        peer.socket.emit(event, data);
      }
    });
  }

  /**
   * إغلاق الغرفة وتنظيف جميع الموارد
   * مع معالجة أفضل للأخطاء
   */
  close() {
    logger.roomEvent(`Closing room: ${this.id}`, { 
      roomId: this.id,
      peersCount: this.peers.size,
      age: Date.now() - this.createdAt,
      inactiveFor: Date.now() - this.lastActivity
    });

    // Close all peers with error handling
    const peerIds = Array.from(this.peers.keys());
    peerIds.forEach((peerId) => {
      const peer = this.peers.get(peerId);
      if (peer) {
        try {
          peer.close();
          logger.debug(`Peer ${peerId} closed during room cleanup`, { peerId, roomId: this.id });
        } catch (error) {
          logger.error(`Error closing peer ${peerId} during room cleanup:`, error);
        }
      }
    });
    this.peers.clear();

    // Close active speaker observer with error handling
    if (this.activeSpeakerObserver) {
      try {
        this.activeSpeakerObserver.close();
        logger.debug(`Active speaker observer closed for room ${this.id}`, { roomId: this.id });
      } catch (error) {
        logger.error(`Error closing active speaker observer for room ${this.id}:`, error);
      }
      this.activeSpeakerObserver = null;
    }

    // Close router with error handling
    if (this.router) {
      try {
        this.router.close();
        logger.debug(`Router closed for room ${this.id}`, { roomId: this.id });
      } catch (error) {
        logger.error(`Error closing router for room ${this.id}:`, error);
      }
      this.router = null;
    }

    logger.roomEvent(`Room ${this.id} closed successfully`, { roomId: this.id });
  }

  /**
   * الحصول على معلومات الغرفة
   */
  getInfo() {
    return {
      id: this.id,
      peersCount: this.peers.size,
      peers: Array.from(this.peers.values()).map((peer) => peer.getInfo()),
      createdAt: this.createdAt,
      lastActivity: this.lastActivity,
      age: Date.now() - this.createdAt,
      inactiveFor: this.peers.size === 0 ? Date.now() - this.lastActivity : 0,
    };
  }

  /**
   * تحديث آخر نشاط في الغرفة
   */
  updateActivity() {
    this.lastActivity = Date.now();
  }

  /**
   * التحقق من أن الغرفة فارغة لفترة طويلة
   */
  isStale(maxInactiveTime = 60000) { // Default: 1 minute
    return this.peers.size === 0 && (Date.now() - this.lastActivity) > maxInactiveTime;
  }
}

module.exports = Room;

