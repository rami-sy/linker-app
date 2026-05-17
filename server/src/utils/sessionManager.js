/**
 * ✅ Session Management Utility
 * Session timeout + automatic cleanup للـ inactive sessions
 */

const logger = require('./logger');
const { withRedisRetry } = require('./redisRetry');

/**
 * ✅ Session Manager Class
 */
class SessionManager {
  constructor(redisClient, io) {
    this.redisClient = redisClient;
    this.io = io;
    this.sessions = new Map(); // In-memory fallback: Map<socketId, { userId, lastActivity, createdAt }>
    
    // ✅ Configuration
    this.sessionTimeoutMs = parseInt(process.env.SESSION_TIMEOUT_MS) || 30 * 60 * 1000; // 30 minutes default
    this.heartbeatIntervalMs = parseInt(process.env.SESSION_HEARTBEAT_INTERVAL_MS) || 5 * 60 * 1000; // 5 minutes
    this.cleanupIntervalMs = parseInt(process.env.SESSION_CLEANUP_INTERVAL_MS) || 10 * 60 * 1000; // 10 minutes
    
    // ✅ Intervals
    this.heartbeatIntervalId = null;
    this.cleanupIntervalId = null;
    
    logger.info('Session Manager initialized', {
      sessionTimeoutMs: this.sessionTimeoutMs,
      heartbeatIntervalMs: this.heartbeatIntervalMs,
      cleanupIntervalMs: this.cleanupIntervalMs,
    });
  }

  /**
   * ✅ Register new session
   */
  async registerSession(socketId, userId) {
    const sessionData = {
      userId: userId.toString(),
      socketId,
      lastActivity: Date.now(),
      createdAt: Date.now(),
    };

    // ✅ Store in Redis if available
    if (this.redisClient && this.redisClient.isReady) {
      try {
        const sessionKey = `session:${socketId}`;
        const userSessionKey = `user_session:${userId}`;
        
        await withRedisRetry(
          async () => {
            const pipeline = this.redisClient.multi();
            pipeline.hSet(sessionKey, {
              userId: sessionData.userId,
              socketId: sessionData.socketId,
              lastActivity: sessionData.lastActivity.toString(),
              createdAt: sessionData.createdAt.toString(),
            });
            pipeline.expire(sessionKey, Math.ceil(this.sessionTimeoutMs / 1000));
            
            // ✅ Store user -> socket mapping
            pipeline.set(userSessionKey, socketId);
            pipeline.expire(userSessionKey, Math.ceil(this.sessionTimeoutMs / 1000));
            
            await pipeline.exec();
          },
          { operationName: `Register session ${socketId}` }
        );
      } catch (error) {
        logger.error('Error registering session in Redis:', error);
        // Fallback to in-memory
      }
    }

    // ✅ Store in-memory (fallback or primary)
    this.sessions.set(socketId, sessionData);

    logger.debug('Session registered', { socketId, userId });
  }

  /**
   * ✅ Update session activity (heartbeat)
   */
  async updateSessionActivity(socketId) {
    const now = Date.now();

    // ✅ Update in-memory
    const session = this.sessions.get(socketId);
    if (session) {
      session.lastActivity = now;
    }

    // ✅ Update in Redis if available
    if (this.redisClient && this.redisClient.isReady) {
      try {
        const sessionKey = `session:${socketId}`;
        await withRedisRetry(
          async () => {
            const pipeline = this.redisClient.multi();
            pipeline.hSet(sessionKey, 'lastActivity', now.toString());
            pipeline.expire(sessionKey, Math.ceil(this.sessionTimeoutMs / 1000));
            await pipeline.exec();
          },
          { operationName: `Update session activity ${socketId}` }
        );
      } catch (error) {
        logger.error('Error updating session activity in Redis:', error);
      }
    }
  }

  /**
   * ✅ Get session data
   */
  async getSession(socketId) {
    // ✅ Try Redis first
    if (this.redisClient && this.redisClient.isReady) {
      try {
        const sessionKey = `session:${socketId}`;
        const sessionData = await withRedisRetry(
          () => this.redisClient.hGetAll(sessionKey),
          { operationName: `Get session ${socketId}` }
        );

        if (sessionData && sessionData.userId) {
          return {
            userId: sessionData.userId,
            socketId: sessionData.socketId,
            lastActivity: parseInt(sessionData.lastActivity) || Date.now(),
            createdAt: parseInt(sessionData.createdAt) || Date.now(),
          };
        }
      } catch (error) {
        logger.error('Error getting session from Redis:', error);
      }
    }

    // ✅ Fallback to in-memory
    return this.sessions.get(socketId) || null;
  }

  /**
   * ✅ Check if session is active
   */
  async isSessionActive(socketId) {
    const session = await this.getSession(socketId);
    if (!session) {
      return false;
    }

    const inactiveTime = Date.now() - session.lastActivity;
    return inactiveTime < this.sessionTimeoutMs;
  }

  /**
   * ✅ Remove session
   */
  async removeSession(socketId) {
    const session = this.sessions.get(socketId);
    const userId = session?.userId;

    // ✅ Remove from Redis
    if (this.redisClient && this.redisClient.isReady) {
      try {
        const sessionKey = `session:${socketId}`;
        const userSessionKey = userId ? `user_session:${userId}` : null;
        
        await withRedisRetry(
          async () => {
            const pipeline = this.redisClient.multi();
            pipeline.del(sessionKey);
            if (userSessionKey) {
              pipeline.del(userSessionKey);
            }
            await pipeline.exec();
          },
          { operationName: `Remove session ${socketId}` }
        );
      } catch (error) {
        logger.error('Error removing session from Redis:', error);
      }
    }

    // ✅ Remove from in-memory
    this.sessions.delete(socketId);

    logger.debug('Session removed', { socketId, userId });
  }

  /**
   * ✅ Start heartbeat mechanism
   */
  startHeartbeat() {
    if (this.heartbeatIntervalId) {
      clearInterval(this.heartbeatIntervalId);
    }

    this.heartbeatIntervalId = setInterval(async () => {
      try {
        // ✅ Update all active socket sessions
        if (this.io) {
          const sockets = await this.io.fetchSockets();
          for (const socket of sockets) {
            if (socket.user?._id) {
              await this.updateSessionActivity(socket.id);
            }
          }
        }
      } catch (error) {
        logger.error('Error in session heartbeat:', error);
      }
    }, this.heartbeatIntervalMs);

    logger.info('Session heartbeat started', { interval: this.heartbeatIntervalMs });
  }

  /**
   * ✅ Stop heartbeat
   */
  stopHeartbeat() {
    if (this.heartbeatIntervalId) {
      clearInterval(this.heartbeatIntervalId);
      this.heartbeatIntervalId = null;
      logger.info('Session heartbeat stopped');
    }
  }

  /**
   * ✅ Cleanup inactive sessions
   */
  async cleanupInactiveSessions() {
    const now = Date.now();
    let cleanedCount = 0;

    try {
      // ✅ Cleanup in-memory sessions
      for (const [socketId, session] of this.sessions.entries()) {
        const inactiveTime = now - session.lastActivity;
        if (inactiveTime >= this.sessionTimeoutMs) {
          // ✅ Check if socket is still connected
          if (this.io) {
            const sockets = await this.io.fetchSockets();
            const socket = sockets.find(s => s.id === socketId);
            
            if (!socket) {
              // Socket is disconnected, remove session
              await this.removeSession(socketId);
              cleanedCount++;
            } else {
              // Socket is still connected but inactive, disconnect it
              logger.warn('Disconnecting inactive session', { socketId, userId: session.userId, inactiveTime });
              socket.disconnect(true);
              await this.removeSession(socketId);
              cleanedCount++;
            }
          } else {
            // No IO instance, just remove from memory
            this.sessions.delete(socketId);
            cleanedCount++;
          }
        }
      }

      // ✅ Cleanup Redis sessions
      if (this.redisClient && this.redisClient.isReady) {
        try {
          const sessionKeys = await withRedisRetry(
            () => this.redisClient.keys('session:*'),
            { operationName: 'Get all session keys' }
          );

          for (const sessionKey of sessionKeys) {
            const sessionData = await withRedisRetry(
              () => this.redisClient.hGetAll(sessionKey),
              { operationName: `Get session data for ${sessionKey}` }
            );

            if (sessionData && sessionData.lastActivity) {
              const lastActivity = parseInt(sessionData.lastActivity);
              const inactiveTime = now - lastActivity;

              if (inactiveTime >= this.sessionTimeoutMs) {
                const socketId = sessionKey.replace('session:', '');
                
                // ✅ Check if socket is still connected
                if (this.io) {
                  const sockets = await this.io.fetchSockets();
                  const socket = sockets.find(s => s.id === socketId);
                  
                  if (!socket) {
                    // Remove from Redis
                    await this.removeSession(socketId);
                    cleanedCount++;
                  }
                } else {
                  // Remove from Redis
                  await withRedisRetry(
                    () => this.redisClient.del(sessionKey),
                    { operationName: `Delete inactive session ${sessionKey}` }
                  );
                  cleanedCount++;
                }
              }
            }
          }
        } catch (error) {
          logger.error('Error cleaning up Redis sessions:', error);
        }
      }

      if (cleanedCount > 0) {
        logger.info(`Cleaned up ${cleanedCount} inactive session(s)`, { cleanedCount });
      }
    } catch (error) {
      logger.error('Error in session cleanup:', error);
    }
  }

  /**
   * ✅ Start periodic cleanup
   */
  startCleanup() {
    if (this.cleanupIntervalId) {
      clearInterval(this.cleanupIntervalId);
    }

    this.cleanupIntervalId = setInterval(async () => {
      await this.cleanupInactiveSessions();
    }, this.cleanupIntervalMs);

    logger.info('Session cleanup started', { interval: this.cleanupIntervalMs });
  }

  /**
   * ✅ Stop cleanup
   */
  stopCleanup() {
    if (this.cleanupIntervalId) {
      clearInterval(this.cleanupIntervalId);
      this.cleanupIntervalId = null;
      logger.info('Session cleanup stopped');
    }
  }

  /**
   * ✅ Start all session management (heartbeat + cleanup)
   */
  start() {
    this.startHeartbeat();
    this.startCleanup();
  }

  /**
   * ✅ Stop all session management
   */
  stop() {
    this.stopHeartbeat();
    this.stopCleanup();
  }

  /**
   * ✅ Get session statistics
   */
  async getStats() {
    const now = Date.now();
    let activeSessions = 0;
    let inactiveSessions = 0;

    // ✅ Count in-memory sessions
    for (const session of this.sessions.values()) {
      const inactiveTime = now - session.lastActivity;
      if (inactiveTime < this.sessionTimeoutMs) {
        activeSessions++;
      } else {
        inactiveSessions++;
      }
    }

    // ✅ Count Redis sessions (if available)
    let redisActiveSessions = 0;
    let redisInactiveSessions = 0;
    
    if (this.redisClient && this.redisClient.isReady) {
      try {
        const sessionKeys = await withRedisRetry(
          () => this.redisClient.keys('session:*'),
          { operationName: 'Get all session keys for stats' }
        );

        for (const sessionKey of sessionKeys) {
          const sessionData = await withRedisRetry(
            () => this.redisClient.hGetAll(sessionKey),
            { operationName: `Get session data for stats ${sessionKey}` }
          );

          if (sessionData && sessionData.lastActivity) {
            const lastActivity = parseInt(sessionData.lastActivity);
            const inactiveTime = now - lastActivity;
            
            if (inactiveTime < this.sessionTimeoutMs) {
              redisActiveSessions++;
            } else {
              redisInactiveSessions++;
            }
          }
        }
      } catch (error) {
        logger.error('Error getting Redis session stats:', error);
      }
    }

    return {
      inMemory: {
        total: this.sessions.size,
        active: activeSessions,
        inactive: inactiveSessions,
      },
      redis: {
        active: redisActiveSessions,
        inactive: redisInactiveSessions,
      },
      total: {
        active: activeSessions + redisActiveSessions,
        inactive: inactiveSessions + redisInactiveSessions,
      },
      config: {
        sessionTimeoutMs: this.sessionTimeoutMs,
        heartbeatIntervalMs: this.heartbeatIntervalMs,
        cleanupIntervalMs: this.cleanupIntervalMs,
      },
    };
  }
}

// ✅ Singleton instance
let sessionManagerInstance = null;

/**
 * ✅ Initialize session manager
 */
const initializeSessionManager = (redisClient, io) => {
  if (!sessionManagerInstance) {
    sessionManagerInstance = new SessionManager(redisClient, io);
    sessionManagerInstance.start();
    logger.info('Session Manager initialized and started');
  }
  return sessionManagerInstance;
};

/**
 * ✅ Get session manager instance
 */
const getSessionManager = () => {
  if (!sessionManagerInstance) {
    logger.warn('Session Manager not initialized, creating instance without Redis/IO');
    sessionManagerInstance = new SessionManager(null, null);
  }
  return sessionManagerInstance;
};

module.exports = {
  SessionManager,
  initializeSessionManager,
  getSessionManager,
};

