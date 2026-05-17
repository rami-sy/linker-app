/**
 * ✅ Enhanced Socket Rate Limiter
 * Dynamic rate limiting based on user tier + Redis support
 */

require('dotenv').config();
const logger = require('../utils/logger');
const { withRedisRetry } = require('../utils/redisRetry');

/**
 * ✅ User Tiers for Rate Limiting
 */
const USER_TIERS = {
  FREE: 'free',
  PREMIUM: 'premium',
  ENTERPRISE: 'enterprise',
  ADMIN: 'admin',
};

/**
 * ✅ Tier Multipliers (how much more requests each tier gets)
 */
const TIER_MULTIPLIERS = {
  [USER_TIERS.FREE]: 1.0,      // Base rate
  [USER_TIERS.PREMIUM]: 2.0,    // 2x base rate
  [USER_TIERS.ENTERPRISE]: 5.0, // 5x base rate
  [USER_TIERS.ADMIN]: 10.0,     // 10x base rate (unlimited for practical purposes)
};
    
/**
 * ✅ Base Rate Limiting Configurations
 * سيتم ضربها بـ tier multiplier
 */
const BASE_RATE_LIMIT_CONFIGS = {
      // Call-related events (strict)
      callRequest: {
        windowMs: parseInt(process.env.CALL_RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
        max: parseInt(process.env.CALL_RATE_LIMIT_MAX) || 10, // 10 calls per window
        message: 'Too many call attempts, please try again later'
      },
      joinRoom: {
        windowMs: 60 * 1000, // 1 minute
    max: 10, // 10 joins per minute
        message: 'Too many join attempts, please try again later'
      },
      
      // Transport events (moderate)
      createWebRtcTransport: {
    windowMs: 60 * 1000,
    max: 20,
        message: 'Too many transport creation attempts, please slow down'
      },
      connectWebRtcTransport: {
    windowMs: 60 * 1000,
    max: 20,
        message: 'Too many transport connection attempts, please slow down'
      },
      
  // Producer/Consumer events
      produce: {
    windowMs: 60 * 1000,
    max: 15,
        message: 'Too many produce attempts, please slow down'
      },
      consume: {
    windowMs: 60 * 1000,
    max: 30,
        message: 'Too many consume attempts, please slow down'
      },
      resumeConsumer: {
    windowMs: 60 * 1000,
    max: 30,
        message: 'Too many consumer resume attempts, please slow down'
      },
      
  // Producer control events
      pauseProducer: {
    windowMs: 10 * 1000,
    max: 20,
        message: 'Too many pause attempts, please slow down'
      },
      resumeProducer: {
    windowMs: 10 * 1000,
    max: 20,
        message: 'Too many resume attempts, please slow down'
      },
      closeProducer: {
    windowMs: 60 * 1000,
    max: 10,
        message: 'Too many producer close attempts, please slow down'
      },
      
  // Room management events
      leaveRoom: {
    windowMs: 60 * 1000,
    max: 10,
        message: 'Too many leave attempts, please slow down'
      },
      endCall: {
    windowMs: 60 * 1000,
    max: 5,
        message: 'Too many end call attempts, please slow down'
      },
  deleteCall: {
    windowMs: 60 * 1000,
    max: 10,
    message: 'Too many delete call attempts, please slow down'
  },
      
  // Info/Discovery events
      getRouterRtpCapabilities: {
    windowMs: 60 * 1000,
    max: 20,
        message: 'Too many capability requests, please slow down'
      },
      getRoomInfo: {
    windowMs: 10 * 1000,
    max: 5,
        message: 'Too many room info requests, please slow down'
      },
  getCallHistory: {
    windowMs: 10 * 1000,
    max: 10,
    message: 'Too many call history requests, please slow down'
  },
  
  // Live Stream events
  startLiveStream: {
    windowMs: 60 * 1000,
    max: 3,
    message: 'Too many start stream attempts, please slow down'
  },
  stopLiveStream: {
    windowMs: 60 * 1000,
    max: 10,
    message: 'Too many stop stream attempts, please slow down'
  },
  getLiveStreams: {
    windowMs: 10 * 1000,
    max: 20,
    message: 'Too many get live streams requests, please slow down'
  },
  getStreamInfo: {
    windowMs: 10 * 1000,
    max: 30,
    message: 'Too many get stream info requests, please slow down'
  },
  sendStreamComment: {
    windowMs: 10 * 1000,
    max: 10,
    message: 'Too many comments, please slow down'
  },
  sendStreamReaction: {
    windowMs: 5 * 1000,
    max: 20,
    message: 'Too many reactions, please slow down'
  },
  requestLiveStream: {
    windowMs: 60 * 1000,
    max: 5,
    message: 'Too many live stream requests, please slow down'
  },
  respondToLiveStreamRequest: {
    windowMs: 60 * 1000,
    max: 10,
    message: 'Too many responses, please slow down'
  },
  
  // Message events
      message: {
    windowMs: 60 * 1000,
    max: 30,
        message: 'Too many messages, please slow down'
      },
      sendMessage: {
    windowMs: 60 * 1000,
    max: 30,
        message: 'Too many messages, please slow down'
      },

      // Room/User/Post management events
      updateRoom: {
    windowMs: 60 * 1000,
    max: 20,
        message: 'Too many room updates, please slow down'
      },
      createRoom: {
    windowMs: 60 * 1000,
    max: 15,
        message: 'Too many room creations, please slow down'
      },
      addMemberToRoom: {
    windowMs: 60 * 1000,
    max: 12,
        message: 'Too many member changes, please slow down'
      },
      removeMemberFromRoom: {
    windowMs: 60 * 1000,
    max: 12,
        message: 'Too many member changes, please slow down'
      },
      changeUserRole: {
    windowMs: 60 * 1000,
    max: 15,
        message: 'Too many role changes, please slow down'
      },
      searchUsers: {
    windowMs: 30 * 1000,
    max: 20,
        message: 'Too many user searches, please slow down'
      },
      searchUsersByMap: {
    windowMs: 30 * 1000,
    max: 20,
        message: 'Too many map searches, please slow down'
      },
      sendFriendRequest: {
    windowMs: 60 * 1000,
    max: 12,
        message: 'Too many friend requests, please slow down'
      },
      blockUser: {
    windowMs: 60 * 1000,
    max: 20,
        message: 'Too many block actions, please slow down'
      },
      reactToUser: {
    windowMs: 30 * 1000,
    max: 20,
        message: 'Too many reactions, please slow down'
      },
      likeUser: {
    windowMs: 30 * 1000,
    max: 20,
        message: 'Too many reactions, please slow down'
      },
      dislikeUser: {
    windowMs: 30 * 1000,
    max: 20,
        message: 'Too many reactions, please slow down'
      },
      getPosts: {
    windowMs: 15 * 1000,
    max: 25,
        message: 'Too many feed requests, please slow down'
      },
      searchRoomMessages: {
        windowMs: 60 * 1000,
        max: 25,
        message: 'Too many chat searches, please slow down'
      },
      editMessage: {
        windowMs: 60 * 1000,
        max: 30,
        message: 'Too many edit attempts, please slow down'
      },
      pinMessage: {
        windowMs: 60 * 1000,
        max: 25,
        message: 'Too many pin actions, please slow down'
      },
      unpinMessage: {
        windowMs: 60 * 1000,
        max: 25,
        message: 'Too many unpin actions, please slow down'
      }
    };
    
class SocketRateLimiter {
  constructor(redisClient = null) {
    this.redisClient = redisClient;
    this.rateLimitData = new Map(); // Fallback in-memory storage
    
    // ✅ Cache for user tiers (userId -> tier)
    this.userTierCache = new Map();
    this.tierCacheTTL = 5 * 60 * 1000; // 5 minutes
    
    // ✅ Load User model for tier lookup
    this.User = null;
    try {
      this.User = require('../models/user.model');
    } catch (error) {
      logger.warn('User model not available, using default tier for all users');
    }
    
    logger.info('Socket Rate Limiter initialized', {
      redisEnabled: !!this.redisClient,
      tiersSupported: Object.keys(USER_TIERS),
    });
  }
  
  /**
   * ✅ الحصول على user tier
   * مع caching لتقليل database queries
   */
  async getUserTier(userId) {
    if (!userId) {
      return USER_TIERS.FREE;
    }

    // ✅ التحقق من cache
    const cached = this.userTierCache.get(userId);
    if (cached && Date.now() < cached.expiresAt) {
      return cached.tier;
    }

    // ✅ الحصول من database
    if (this.User) {
      try {
        const user = await this.User.findById(userId).select('subscriptionTier role').lean();
        if (user) {
          // ✅ تحديد tier بناءً على subscriptionTier أو role
          let tier = USER_TIERS.FREE;
          
          if (user.role === 'admin' || user.role === 'Admin') {
            tier = USER_TIERS.ADMIN;
          } else if (user.subscriptionTier) {
            tier = user.subscriptionTier.toLowerCase();
            // ✅ التحقق من أن tier صحيح
            if (!Object.values(USER_TIERS).includes(tier)) {
              tier = USER_TIERS.FREE;
            }
          }
          
          // ✅ حفظ في cache
          this.userTierCache.set(userId, {
            tier,
            expiresAt: Date.now() + this.tierCacheTTL,
          });
          
          return tier;
        }
      } catch (error) {
        logger.error('Error fetching user tier:', error);
      }
    }

    // ✅ Default: FREE tier
    return USER_TIERS.FREE;
  }

  /**
   * ✅ حساب rate limit بناءً على tier
   */
  getRateLimitConfig(eventType, tier = USER_TIERS.FREE) {
    const baseConfig = BASE_RATE_LIMIT_CONFIGS[eventType];
    if (!baseConfig) {
      return null; // No rate limit for this event type
    }

    const multiplier = TIER_MULTIPLIERS[tier] || 1.0;
    const adjustedMax = Math.ceil(baseConfig.max * multiplier);

    return {
      ...baseConfig,
      max: adjustedMax,
      baseMax: baseConfig.max,
      tier,
      multiplier,
    };
  }

  /**
   * ✅ Check rate limit with Redis support
   */
  async checkRateLimit(socketId, eventType, userId = null, ip = null) {
    // ✅ الحصول على tier
    const tier = userId ? await this.getUserTier(userId) : USER_TIERS.FREE;
    const limitConfig = this.getRateLimitConfig(eventType, tier);
    
    if (!limitConfig) {
      return { allowed: true }; // No rate limit for this event type
    }

    // ✅ بناء key للـ rate limit
    // Format: rateLimit:socket:{socketId}:{eventType} أو rateLimit:user:{userId}:{eventType} أو rateLimit:ip:{ip}:{eventType}
    let key;
    if (userId && this.redisClient) {
      key = `rateLimit:user:${userId}:${eventType}`;
    } else if (ip && this.redisClient) {
      key = `rateLimit:ip:${ip}:${eventType}`;
    } else {
      key = `rateLimit:socket:${socketId}:${eventType}`;
    }

    // ✅ استخدام Redis إذا كان متاحاً
    if (this.redisClient && this.redisClient.isReady) {
      try {
        return await this.checkRateLimitRedis(key, limitConfig);
      } catch (error) {
        logger.error('Redis rate limit check failed, falling back to in-memory:', error);
        // Fallback to in-memory
      }
    }

    // ✅ Fallback: in-memory rate limiting
    return this.checkRateLimitInMemory(key, limitConfig);
  }

  /**
   * ✅ Redis-based rate limiting
   */
  async checkRateLimitRedis(key, limitConfig) {
    const now = Date.now();
    const windowSeconds = Math.ceil(limitConfig.windowMs / 1000);

    try {
      // ✅ استخدام Redis INCR مع EXPIRE
      const count = await withRedisRetry(
        async () => {
          const pipeline = this.redisClient.multi();
          pipeline.incr(key);
          pipeline.expire(key, windowSeconds);
          const results = await pipeline.exec();
          return parseInt(results[0].result, 10);
        },
        { operationName: `Check Redis rate limit for ${key}` }
      );

      if (count > limitConfig.max) {
        // ✅ الحصول على TTL
        const ttl = await withRedisRetry(
          () => this.redisClient.ttl(key),
          { operationName: `Get TTL for ${key}` }
        );

        return {
          allowed: false,
          count,
          max: limitConfig.max,
          resetIn: ttl * 1000, // Convert to milliseconds
          tier: limitConfig.tier,
          message: limitConfig.message,
        };
      }

      return {
        allowed: true,
        count,
        max: limitConfig.max,
        remaining: limitConfig.max - count,
        resetIn: windowSeconds * 1000,
        tier: limitConfig.tier,
      };
    } catch (error) {
      logger.error('Error in Redis rate limit check:', error);
      throw error;
    }
  }

  /**
   * ✅ In-memory rate limiting (fallback)
   */
  checkRateLimitInMemory(key, limitConfig) {
    const now = Date.now();
    
    if (!this.rateLimitData.has(key)) {
      this.rateLimitData.set(key, {
        count: 1,
        resetTime: now + limitConfig.windowMs,
      });
      return {
        allowed: true,
        count: 1,
        max: limitConfig.max,
        remaining: limitConfig.max - 1,
        resetIn: limitConfig.windowMs,
        tier: limitConfig.tier,
      };
    }
    
    const data = this.rateLimitData.get(key);
    
    // ✅ Reset if window has passed
    if (now > data.resetTime) {
      data.count = 1;
      data.resetTime = now + limitConfig.windowMs;
      return {
        allowed: true,
        count: 1,
        max: limitConfig.max,
        remaining: limitConfig.max - 1,
        resetIn: limitConfig.windowMs,
        tier: limitConfig.tier,
      };
    }
    
    // ✅ Check if limit exceeded
    if (data.count >= limitConfig.max) {
      return {
        allowed: false,
        count: data.count,
        max: limitConfig.max,
        resetIn: data.resetTime - now,
        tier: limitConfig.tier,
        message: limitConfig.message,
      };
    }
    
    // ✅ Increment count
    data.count++;
    return {
      allowed: true,
      count: data.count,
      max: limitConfig.max,
      remaining: limitConfig.max - data.count,
      resetIn: data.resetTime - now,
      tier: limitConfig.tier,
    };
  }
  
  /**
   * ✅ Get rate limit info
   */
  async getRateLimitInfo(socketId, eventType, userId = null, ip = null) {
    const tier = userId ? await this.getUserTier(userId) : USER_TIERS.FREE;
    const limitConfig = this.getRateLimitConfig(eventType, tier);

    if (!limitConfig) {
      return null;
    }

    let key;
    if (userId && this.redisClient) {
      key = `rateLimit:user:${userId}:${eventType}`;
    } else if (ip && this.redisClient) {
      key = `rateLimit:ip:${ip}:${eventType}`;
    } else {
      key = `rateLimit:socket:${socketId}:${eventType}`;
    }

    // ✅ الحصول من Redis أو in-memory
    if (this.redisClient && this.redisClient.isReady) {
      try {
        const count = await withRedisRetry(
          () => this.redisClient.get(key),
          { operationName: `Get rate limit count for ${key}` }
        );
        const ttl = await withRedisRetry(
          () => this.redisClient.ttl(key),
          { operationName: `Get rate limit TTL for ${key}` }
        );

        return {
          count: count ? parseInt(count, 10) : 0,
          max: limitConfig.max,
          baseMax: limitConfig.baseMax,
          remaining: limitConfig.max - (count ? parseInt(count, 10) : 0),
          resetIn: ttl > 0 ? ttl * 1000 : limitConfig.windowMs,
          windowMs: limitConfig.windowMs,
          tier: limitConfig.tier,
          multiplier: limitConfig.multiplier,
          isBlocked: count && parseInt(count, 10) >= limitConfig.max,
        };
      } catch (error) {
        logger.error('Error getting rate limit info from Redis:', error);
      }
    }

    // ✅ Fallback: in-memory
    const data = this.rateLimitData.get(key);
    if (!data) {
      return {
        count: 0,
        max: limitConfig.max,
        baseMax: limitConfig.baseMax,
        remaining: limitConfig.max,
        resetIn: limitConfig.windowMs,
        windowMs: limitConfig.windowMs,
        tier: limitConfig.tier,
        multiplier: limitConfig.multiplier,
        isBlocked: false,
      };
    }
    
    const now = Date.now();
    const remaining = Math.max(0, data.resetTime - now);
    
    return {
      count: data.count,
      max: limitConfig.max,
      baseMax: limitConfig.baseMax,
      remaining: limitConfig.max - data.count,
      resetTime: data.resetTime,
      resetIn: remaining,
      windowMs: limitConfig.windowMs,
      tier: limitConfig.tier,
      multiplier: limitConfig.multiplier,
      isBlocked: remaining > 0 && data.count >= limitConfig.max,
    };
  }
  
  /**
   * ✅ Clean up expired entries (in-memory only)
   */
  cleanup() {
    const now = Date.now();
    let cleaned = 0;
    for (const [key, data] of this.rateLimitData.entries()) {
      if (now > data.resetTime) {
        this.rateLimitData.delete(key);
        cleaned++;
      }
    }
    if (cleaned > 0) {
      logger.debug(`Cleaned up ${cleaned} expired rate limit entries`);
    }

    // ✅ Clean up expired tier cache
    for (const [userId, cached] of this.userTierCache.entries()) {
      if (Date.now() >= cached.expiresAt) {
        this.userTierCache.delete(userId);
      }
    }
  }
  
  /**
   * ✅ Middleware function for socket events
   */
  middleware(eventType) {
    return async (socket, next) => {
      const userId = socket.user?._id?.toString();
      const ip = socket.handshake?.address || socket.conn?.remoteAddress;
      
      const result = await this.checkRateLimit(socket.id, eventType, userId, ip);
      
      if (!result.allowed) {
        const error = new Error(result.message || 'Rate limit exceeded');
        error.rateLimitInfo = {
          ...result,
          eventType,
        };
        return next(error);
      }
      next();
    };
  }
  
  /**
   * ✅ Express-style middleware for socket events
   */
  rateLimitMiddleware(eventType) {
    return async (data, callback) => {
      const userId = data.userId?.toString();
      const ip = data.ip;
      const socketId = data.socketId;
      
      const result = await this.checkRateLimit(socketId, eventType, userId, ip);
      
      if (!result.allowed) {
        const limitConfig = this.getRateLimitConfig(eventType, result.tier || USER_TIERS.FREE);
        return callback({
          message: limitConfig?.message || 'Rate limit exceeded',
          type: 'error',
          rateLimitInfo: result,
        });
      }
      callback(null, data);
    };
  }
}

// ✅ Create singleton instance (will be initialized with Redis in app.js)
let socketRateLimiterInstance = null;

/**
 * ✅ Initialize rate limiter with Redis
 */
const initializeRateLimiter = (redisClient) => {
  if (!socketRateLimiterInstance) {
    socketRateLimiterInstance = new SocketRateLimiter(redisClient);
    logger.info('Socket Rate Limiter initialized with Redis');
  } else {
    socketRateLimiterInstance.redisClient = redisClient;
    logger.info('Socket Rate Limiter Redis client updated');
  }
  return socketRateLimiterInstance;
};

/**
 * ✅ Get rate limiter instance
 */
const getRateLimiter = () => {
  if (!socketRateLimiterInstance) {
    socketRateLimiterInstance = new SocketRateLimiter();
    logger.warn('Socket Rate Limiter initialized without Redis (fallback mode)');
  }
  return socketRateLimiterInstance;
};

// ✅ Clean up expired entries every 5 minutes
setInterval(() => {
  if (socketRateLimiterInstance) {
    socketRateLimiterInstance.cleanup();
  }
}, 5 * 60 * 1000);

module.exports = {
  SocketRateLimiter,
  initializeRateLimiter,
  getRateLimiter,
  USER_TIERS,
  TIER_MULTIPLIERS,
  BASE_RATE_LIMIT_CONFIGS,
};

// ✅ Export default for backward compatibility
module.exports.default = getRateLimiter();
