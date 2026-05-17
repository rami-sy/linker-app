/**
 * Peer Class
 * يمثل مستخدم واحد في الغرفة مع transports و producers و consumers الخاصة به
 */

const logger = require('../utils/logger');

class Peer {
  constructor({ id, userId, roomId, socket, userData = null, role = 'member' }) {
    this.id = id; // socket.id
    this.userId = userId; // User ID from database
    this.roomId = roomId;
    this.socket = socket;
    // معلومات المستخدم لعرض الاسم/الصورة لدى الآخرين
    this.userData = userData;
    // Role: 'broadcaster' | 'viewer' | 'member'
    this.role = role;
    
    // WebRTC Transports
    this.producerTransport = null;
    this.consumerTransports = new Map(); // Map<transportId, Transport>
    
    // Media Producers (ما يرسله هذا المستخدم)
    this.producers = new Map(); // Map<producerId, Producer>
    
    // Media Consumers (ما يستقبله من الآخرين)
    this.consumers = new Map(); // Map<consumerId, Consumer>
    
    // Metadata - تتبع حالة المايك والكاميرا ومشاركة الشاشة
    this.metadata = {
      isAudioEnabled: role === 'broadcaster' || role === 'member',
      isVideoEnabled: role === 'broadcaster' || role === 'member',
      isScreenSharing: false,
      joinedAt: Date.now(),
      role: role, // إضافة role في metadata
    };
  }

  /**
   * إضافة Producer Transport
   */
  addProducerTransport(transport) {
    this.producerTransport = transport;
  }

  /**
   * إضافة Consumer Transport
   */
  addConsumerTransport(transport) {
    this.consumerTransports.set(transport.id, transport);
  }

  /**
   * إضافة Producer
   */
  addProducer(producer) {
    this.producers.set(producer.id, producer);
  }

  /**
   * إضافة Consumer
   */
  addConsumer(consumer) {
    this.consumers.set(consumer.id, consumer);
  }

  /**
   * إزالة Producer
   */
  removeProducer(producerId) {
    this.producers.delete(producerId);
  }

  /**
   * إزالة Consumer
   */
  removeConsumer(consumerId) {
    this.consumers.delete(consumerId);
  }

  /**
   * إغلاق Producer Transport
   */
  closeProducerTransport() {
    if (this.producerTransport) {
      this.producerTransport.close();
      this.producerTransport = null;
    }
  }

  /**
   * إغلاق Consumer Transport محدد
   */
  closeConsumerTransport(transportId) {
    const transport = this.consumerTransports.get(transportId);
    if (transport) {
      transport.close();
      this.consumerTransports.delete(transportId);
    }
  }

  /**
   * إغلاق جميع Consumer Transports
   */
  closeAllConsumerTransports() {
    this.consumerTransports.forEach((transport) => {
      transport.close();
    });
    this.consumerTransports.clear();
  }

  /**
   * تنظيف كامل عند مغادرة المستخدم
   * مع معالجة أفضل للأخطاء وضمان إغلاق جميع الموارد
   */
  close() {
    logger.debug(`🧹 Cleaning up peer: ${this.id}`, { peerId: this.id, userId: this.userId });

    // Close all producers with error handling
    const producerIds = Array.from(this.producers.keys());
    producerIds.forEach((producerId) => {
      const producer = this.producers.get(producerId);
      if (producer) {
        try {
          if (!producer.closed) {
            producer.close();
            logger.debug(`Producer ${producerId} closed`, { producerId, peerId: this.id });
          } else {
            logger.debug(`Producer ${producerId} already closed`, { producerId, peerId: this.id });
          }
        } catch (error) {
          logger.error(`Error closing producer ${producerId}:`, error);
        }
      }
    });
    this.producers.clear();

    // Close all consumers with error handling
    const consumerIds = Array.from(this.consumers.keys());
    consumerIds.forEach((consumerId) => {
      const consumer = this.consumers.get(consumerId);
      if (consumer) {
        try {
          if (!consumer.closed) {
            consumer.close();
            logger.debug(`Consumer ${consumerId} closed`, { consumerId, peerId: this.id });
          } else {
            logger.debug(`Consumer ${consumerId} already closed`, { consumerId, peerId: this.id });
          }
        } catch (error) {
          logger.error(`Error closing consumer ${consumerId}:`, error);
        }
      }
    });
    this.consumers.clear();

    // Close producer transport with error handling
    try {
      this.closeProducerTransport();
      logger.debug(`Producer transport closed for peer ${this.id}`, { peerId: this.id });
    } catch (error) {
      logger.error(`Error closing producer transport for peer ${this.id}:`, error);
    }

    // Close all consumer transports with error handling
    try {
      this.closeAllConsumerTransports();
      logger.debug(`All consumer transports closed for peer ${this.id}`, { peerId: this.id });
    } catch (error) {
      logger.error(`Error closing consumer transports for peer ${this.id}:`, error);
    }
  }

  /**
   * الحصول على معلومات Peer
   */
  getInfo() {
    return {
      id: this.id,
      userId: this.userId,
      roomId: this.roomId,
      producersCount: this.producers.size,
      consumersCount: this.consumers.size,
      metadata: this.metadata,
    };
  }
}

module.exports = Peer;

