/**
 * ✅ Room Access Control Utility
 * نظام للتحكم في الوصول للغرف مع IP whitelist/blacklist و rate limiting
 */

const logger = require('./logger');
const { withRedisRetry } = require('./redisRetry');

/**
 * ✅ IP Access Control Service
 */
class RoomAccessControlService {
  constructor(redisClient) {
    this.redisClient = redisClient;
    this.ipWhitelist = new Set();
    this.ipBlacklist = new Set();
    this.rateLimitMap = new Map(); // Map<ip, { count, resetTime }>
    
    // ✅ Load whitelist/blacklist from environment variables
    this.loadAccessLists();
  }

  /**
   * ✅ تحميل whitelist/blacklist من environment variables
   */
  loadAccessLists() {
    // Whitelist
    const whitelistEnv = process.env.IP_WHITELIST;
    if (whitelistEnv) {
      whitelistEnv.split(',').forEach(ip => {
        this.ipWhitelist.add(ip.trim());
      });
      logger.info(`Loaded ${this.ipWhitelist.size} IPs to whitelist`);
    }

    // Blacklist
    const blacklistEnv = process.env.IP_BLACKLIST;
    if (blacklistEnv) {
      blacklistEnv.split(',').forEach(ip => {
        this.ipBlacklist.add(ip.trim());
      });
      logger.info(`Loaded ${this.ipBlacklist.size} IPs to blacklist`);
    }
  }

  /**
   * ✅ الحصول على IP address من socket
   */
  getClientIP(socket) {
    // ✅ محاولة الحصول من headers (عند وجود proxy)
    const forwarded = socket.handshake.headers['x-forwarded-for'];
    if (forwarded) {
      return forwarded.split(',')[0].trim();
    }

    // ✅ الحصول من socket address
    const address = socket.handshake.address;
    if (address) {
      return address.split(':').pop(); // إزالة IPv6 prefix إذا كان موجوداً
    }

    // ✅ Fallback
    return socket.conn.remoteAddress || 'unknown';
  }

  /**
   * ✅ التحقق من IP whitelist
   */
  isIPWhitelisted(ip) {
    if (this.ipWhitelist.size === 0) {
      return true; // إذا لم يكن هناك whitelist، جميع IPs مسموحة
    }
    return this.ipWhitelist.has(ip);
  }

  /**
   * ✅ التحقق من IP blacklist
   */
  isIPBlacklisted(ip) {
    return this.ipBlacklist.has(ip);
  }

  /**
   * ✅ التحقق من IP access
   */
  checkIPAccess(socket) {
    const ip = this.getClientIP(socket);

    // ✅ التحقق من blacklist أولاً
    if (this.isIPBlacklisted(ip)) {
      logger.warn(`❌ Blocked blacklisted IP: ${ip}`, {
        socketId: socket.id,
        ip,
      });
      return {
        allowed: false,
        reason: 'IP address is blacklisted',
        ip,
      };
    }

    // ✅ التحقق من whitelist
    if (!this.isIPWhitelisted(ip)) {
      logger.warn(`❌ Blocked non-whitelisted IP: ${ip}`, {
        socketId: socket.id,
        ip,
      });
      return {
        allowed: false,
        reason: 'IP address is not whitelisted',
        ip,
      };
    }

    return {
      allowed: true,
      ip,
    };
  }

  /**
   * ✅ Rate limiting per IP
   */
  async checkRateLimit(ip, action, maxRequests = 10, windowMs = 60000) {
    if (!this.redisClient) {
      // ✅ Fallback إلى in-memory rate limiting
      return this.checkRateLimitInMemory(ip, action, maxRequests, windowMs);
    }

    try {
      const key = `rate_limit:${ip}:${action}`;
      const current = await withRedisRetry(
        () => this.redisClient.get(key),
        {
          maxRetries: 2,
          initialDelay: 100,
          operationName: 'Get rate limit',
        }
      );

      const count = current ? parseInt(current, 10) : 0;

      if (count >= maxRequests) {
        const ttl = await withRedisRetry(
          () => this.redisClient.ttl(key),
          {
            maxRetries: 2,
            initialDelay: 100,
            operationName: 'Get rate limit TTL',
          }
        );

        return {
          allowed: false,
          count,
          maxRequests,
          resetIn: ttl * 1000, // Convert to milliseconds
        };
      }

      // ✅ زيادة العداد
      const newCount = count + 1;
      if (count === 0) {
        // ✅ إنشاء key جديد مع expiration
        await withRedisRetry(
          () => this.redisClient.setEx(key, Math.ceil(windowMs / 1000), newCount.toString()),
          {
            maxRetries: 2,
            initialDelay: 100,
            operationName: 'Set rate limit',
          }
        );
      } else {
        // ✅ تحديث العداد
        await withRedisRetry(
          () => this.redisClient.incr(key),
          {
            maxRetries: 2,
            initialDelay: 100,
            operationName: 'Increment rate limit',
          }
        );
      }

      return {
        allowed: true,
        count: newCount,
        maxRequests,
      };
    } catch (error) {
      logger.error('Error checking rate limit:', error);
      // ✅ في حالة الخطأ، نسمح بالوصول (fail open)
      return {
        allowed: true,
        error: error.message,
      };
    }
  }

  /**
   * ✅ In-memory rate limiting (fallback)
   */
  checkRateLimitInMemory(ip, action, maxRequests = 10, windowMs = 60000) {
    const key = `${ip}:${action}`;
    const now = Date.now();
    const record = this.rateLimitMap.get(key);

    if (!record || now > record.resetTime) {
      // ✅ إنشاء record جديد
      this.rateLimitMap.set(key, {
        count: 1,
        resetTime: now + windowMs,
      });
      return {
        allowed: true,
        count: 1,
        maxRequests,
      };
    }

    if (record.count >= maxRequests) {
      return {
        allowed: false,
        count: record.count,
        maxRequests,
        resetIn: record.resetTime - now,
      };
    }

    // ✅ زيادة العداد
    record.count++;
    this.rateLimitMap.set(key, record);

    return {
      allowed: true,
      count: record.count,
      maxRequests,
    };
  }

  /**
   * ✅ تنظيف rate limit map القديم
   */
  cleanupRateLimitMap() {
    const now = Date.now();
    for (const [key, record] of this.rateLimitMap.entries()) {
      if (now > record.resetTime) {
        this.rateLimitMap.delete(key);
      }
    }
  }

  /**
   * ✅ إضافة IP إلى whitelist
   */
  addToWhitelist(ip) {
    this.ipWhitelist.add(ip);
    logger.info(`Added IP to whitelist: ${ip}`);
  }

  /**
   * ✅ إزالة IP من whitelist
   */
  removeFromWhitelist(ip) {
    this.ipWhitelist.delete(ip);
    logger.info(`Removed IP from whitelist: ${ip}`);
  }

  /**
   * ✅ إضافة IP إلى blacklist
   */
  addToBlacklist(ip) {
    this.ipBlacklist.add(ip);
    logger.info(`Added IP to blacklist: ${ip}`);
  }

  /**
   * ✅ إزالة IP من blacklist
   */
  removeFromBlacklist(ip) {
    this.ipBlacklist.delete(ip);
    logger.info(`Removed IP from blacklist: ${ip}`);
  }

  /**
   * ✅ التحقق الشامل من الوصول (IP + Rate Limit)
   */
  async checkAccess(socket, action = 'default', rateLimitConfig = {}) {
    // ✅ التحقق من IP access
    const ipCheck = this.checkIPAccess(socket);
    if (!ipCheck.allowed) {
      return {
        allowed: false,
        reason: ipCheck.reason,
        ip: ipCheck.ip,
      };
    }

    // ✅ التحقق من rate limit
    const {
      maxRequests = 10,
      windowMs = 60000,
    } = rateLimitConfig;

    const rateLimitCheck = await this.checkRateLimit(
      ipCheck.ip,
      action,
      maxRequests,
      windowMs
    );

    if (!rateLimitCheck.allowed) {
      return {
        allowed: false,
        reason: 'Rate limit exceeded',
        ip: ipCheck.ip,
        count: rateLimitCheck.count,
        maxRequests: rateLimitCheck.maxRequests,
        resetIn: rateLimitCheck.resetIn,
      };
    }

    return {
      allowed: true,
      ip: ipCheck.ip,
      rateLimit: rateLimitCheck,
    };
  }
}

module.exports = {
  RoomAccessControlService,
};

