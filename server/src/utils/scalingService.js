/**
 * ✅ Scaling Service
 * خدمة لدعم Horizontal Scaling
 * يدعم multiple servers و shared state management
 */

const logger = require('./logger');
const redis = require('redis');

class ScalingService {
  constructor(redisClient) {
    this.redisClient = redisClient;
    this.enabled = process.env.HORIZONTAL_SCALING_ENABLED === 'true';
    this.serverId = process.env.SERVER_ID || `server-${Date.now()}`;
    this.heartbeatInterval = null;
    this.heartbeatIntervalMs = parseInt(process.env.HEARTBEAT_INTERVAL) || 30000; // 30 seconds
    this.serverTimeout = parseInt(process.env.SERVER_TIMEOUT) || 60000; // 60 seconds
    this.rooms = new Map(); // Local rooms cache
  }

  /**
   * ✅ تهيئة Scaling Service
   */
  async initialize() {
    if (!this.enabled) {
      logger.info('Horizontal scaling is disabled');
      return;
    }

    if (!this.redisClient || !this.redisClient.isReady) {
      logger.warn('Redis client not available, horizontal scaling may not work correctly');
      return;
    }

    try {
      // تسجيل هذا الـ server
      await this.registerServer();

      // بدء heartbeat
      this.startHeartbeat();

      // بدء periodic cleanup للـ servers الميتة
      this.startServerCleanup();

      logger.info(`✅ Scaling service initialized for server: ${this.serverId}`);
    } catch (error) {
      logger.error('Error initializing scaling service:', error);
    }
  }

  /**
   * ✅ تسجيل Server في Redis
   */
  async registerServer() {
    if (!this.redisClient || !this.redisClient.isReady) return;

    try {
      const serverInfo = {
        serverId: this.serverId,
        timestamp: Date.now(),
        status: 'active',
        rooms: this.rooms.size,
        connections: 0, // سيتم تحديثه لاحقاً
      };

      await this.redisClient.setEx(
        `server:${this.serverId}`,
        this.serverTimeout / 1000,
        JSON.stringify(serverInfo)
      );

      // إضافة للقائمة العامة للـ servers
      await this.redisClient.sAdd('servers:active', this.serverId);

      logger.debug(`Server registered: ${this.serverId}`);
    } catch (error) {
      logger.error('Error registering server:', error);
    }
  }

  /**
   * ✅ بدء Heartbeat
   */
  startHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    this.heartbeatInterval = setInterval(async () => {
      await this.updateHeartbeat();
    }, this.heartbeatIntervalMs);
  }

  /**
   * ✅ تحديث Heartbeat
   */
  async updateHeartbeat() {
    if (!this.redisClient || !this.redisClient.isReady) return;

    try {
      await this.registerServer(); // Renew registration
      logger.debug(`Heartbeat updated for server: ${this.serverId}`);
    } catch (error) {
      logger.error('Error updating heartbeat:', error);
    }
  }

  /**
   * ✅ بدء Server Cleanup
   */
  startServerCleanup() {
    setInterval(async () => {
      await this.cleanupDeadServers();
    }, this.heartbeatIntervalMs * 2); // Check every 2 heartbeats
  }

  /**
   * ✅ تنظيف Servers الميتة
   */
  async cleanupDeadServers() {
    if (!this.redisClient || !this.redisClient.isReady) return;

    try {
      const activeServers = await this.redisClient.sMembers('servers:active');
      const now = Date.now();
      const deadServers = [];

      for (const serverId of activeServers) {
        const serverKey = `server:${serverId}`;
        const serverData = await this.redisClient.get(serverKey);

        if (!serverData) {
          deadServers.push(serverId);
          continue;
        }

        try {
          const serverInfo = JSON.parse(serverData);
          const age = now - serverInfo.timestamp;

          if (age > this.serverTimeout) {
            deadServers.push(serverId);
          }
        } catch (error) {
          logger.error(`Error parsing server data for ${serverId}:`, error);
          deadServers.push(serverId);
        }
      }

      // إزالة الـ servers الميتة
      if (deadServers.length > 0) {
        for (const serverId of deadServers) {
          await this.redisClient.sRem('servers:active', serverId);
          await this.redisClient.del(`server:${serverId}`);
          logger.info(`Removed dead server: ${serverId}`);
        }
      }
    } catch (error) {
      logger.error('Error cleaning up dead servers:', error);
    }
  }

  /**
   * ✅ الحصول على جميع الـ Servers النشطة
   */
  async getActiveServers() {
    if (!this.redisClient || !this.redisClient.isReady) {
      return [this.serverId]; // Fallback to local server
    }

    try {
      const serverIds = await this.redisClient.sMembers('servers:active');
      const servers = [];

      for (const serverId of serverIds) {
        const serverData = await this.redisClient.get(`server:${serverId}`);
        if (serverData) {
          try {
            servers.push(JSON.parse(serverData));
          } catch (error) {
            logger.error(`Error parsing server data for ${serverId}:`, error);
          }
        }
      }

      return servers;
    } catch (error) {
      logger.error('Error getting active servers:', error);
      return [this.serverId]; // Fallback
    }
  }

  /**
   * ✅ تسجيل Room في Redis (للـ shared state)
   */
  async registerRoom(roomId, serverId = null) {
    if (!this.enabled || !this.redisClient || !this.redisClient.isReady) return;

    try {
      const server = serverId || this.serverId;
      await this.redisClient.setEx(
        `room:${roomId}:server`,
        this.serverTimeout / 1000,
        server
      );

      // إضافة Room للقائمة العامة
      await this.redisClient.sAdd(`server:${server}:rooms`, roomId);

      logger.debug(`Room registered: ${roomId} on server: ${server}`);
    } catch (error) {
      logger.error(`Error registering room ${roomId}:`, error);
    }
  }

  /**
   * ✅ إلغاء تسجيل Room
   */
  async unregisterRoom(roomId) {
    if (!this.enabled || !this.redisClient || !this.redisClient.isReady) return;

    try {
      const server = await this.redisClient.get(`room:${roomId}:server`);
      if (server) {
        await this.redisClient.sRem(`server:${server}:rooms`, roomId);
      }
      await this.redisClient.del(`room:${roomId}:server`);

      logger.debug(`Room unregistered: ${roomId}`);
    } catch (error) {
      logger.error(`Error unregistering room ${roomId}:`, error);
    }
  }

  /**
   * ✅ الحصول على Server الذي يستضيف Room
   */
  async getRoomServer(roomId) {
    if (!this.enabled || !this.redisClient || !this.redisClient.isReady) {
      return this.serverId; // Fallback to local server
    }

    try {
      const server = await this.redisClient.get(`room:${roomId}:server`);
      return server || this.serverId;
    } catch (error) {
      logger.error(`Error getting room server for ${roomId}:`, error);
      return this.serverId; // Fallback
    }
  }

  /**
   * ✅ إيقاف Scaling Service
   */
  async stop() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }

    if (this.enabled && this.redisClient && this.redisClient.isReady) {
      try {
        // إزالة Server من القائمة النشطة
        await this.redisClient.sRem('servers:active', this.serverId);
        await this.redisClient.del(`server:${this.serverId}`);

        logger.info(`Scaling service stopped for server: ${this.serverId}`);
      } catch (error) {
        logger.error('Error stopping scaling service:', error);
      }
    }
  }

  /**
   * ✅ الحصول على Server Statistics
   */
  async getServerStats() {
    const activeServers = await this.getActiveServers();
    return {
      serverId: this.serverId,
      enabled: this.enabled,
      activeServers: activeServers.length,
      servers: activeServers,
      localRooms: this.rooms.size,
    };
  }
}

module.exports = ScalingService;

