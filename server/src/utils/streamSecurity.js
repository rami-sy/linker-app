/**
 * ✅ Stream Security Utility
 * DRM protection + watermarking للبث
 */

const logger = require('./logger');
const crypto = require('crypto');

/**
 * ✅ Stream Security Service Class
 */
class StreamSecurityService {
  constructor() {
    this.drmEnabled = process.env.DRM_ENABLED === 'true';
    this.watermarkingEnabled = process.env.WATERMARKING_ENABLED === 'true';
    
    // ✅ DRM keys (يجب أن تكون في environment variables في production)
    this.drmKeys = new Map(); // Map<streamId, { keyId, key }>
    
    logger.info('Stream Security Service initialized', {
      drmEnabled: this.drmEnabled,
      watermarkingEnabled: this.watermarkingEnabled,
    });
  }

  /**
   * ✅ Generate DRM key for stream
   */
  generateDRMKey(streamId) {
    if (!this.drmEnabled) {
      return null;
    }

    try {
      const keyId = crypto.randomBytes(16).toString('hex');
      const key = crypto.randomBytes(32).toString('hex'); // 256-bit key
      
      this.drmKeys.set(streamId, { keyId, key });
      
      logger.info('DRM key generated for stream', { streamId, keyId });
      
      return {
        keyId,
        key,
        // ✅ License server URL (if using external DRM service)
        licenseServerUrl: process.env.DRM_LICENSE_SERVER_URL || null,
      };
    } catch (error) {
      logger.error('Error generating DRM key:', error);
      return null;
    }
  }

  /**
   * ✅ Get DRM key for stream
   */
  getDRMKey(streamId) {
    return this.drmKeys.get(streamId) || null;
  }

  /**
   * ✅ Remove DRM key (when stream ends)
   */
  removeDRMKey(streamId) {
    const removed = this.drmKeys.delete(streamId);
    if (removed) {
      logger.info('DRM key removed for stream', { streamId });
    }
    return removed;
  }

  /**
   * ✅ Generate watermark data for user
   */
  generateWatermark(userId, streamId) {
    if (!this.watermarkingEnabled) {
      return null;
    }

    try {
      // ✅ Create invisible watermark (can be embedded in video stream)
      const watermarkData = {
        userId: userId.toString(),
        streamId: streamId.toString(),
        timestamp: Date.now(),
        // ✅ Hash for verification
        hash: crypto
          .createHash('sha256')
          .update(`${userId}:${streamId}:${Date.now()}`)
          .digest('hex')
          .substring(0, 16), // Short hash for embedding
      };

      logger.debug('Watermark generated', { userId, streamId });
      
      return watermarkData;
    } catch (error) {
      logger.error('Error generating watermark:', error);
      return null;
    }
  }

  /**
   * ✅ Verify watermark (for unauthorized recording detection)
   */
  verifyWatermark(watermarkData, expectedUserId, expectedStreamId) {
    if (!watermarkData || !this.watermarkingEnabled) {
      return { valid: false, reason: 'Watermarking disabled or no watermark data' };
    }

    try {
      // ✅ Verify hash
      const expectedHash = crypto
        .createHash('sha256')
        .update(`${expectedUserId}:${expectedStreamId}:${watermarkData.timestamp}`)
        .digest('hex')
        .substring(0, 16);

      if (watermarkData.hash !== expectedHash) {
        return { valid: false, reason: 'Invalid watermark hash' };
      }

      // ✅ Verify user and stream IDs
      if (
        watermarkData.userId !== expectedUserId.toString() ||
        watermarkData.streamId !== expectedStreamId.toString()
      ) {
        return { valid: false, reason: 'Watermark user/stream ID mismatch' };
      }

      return { valid: true };
    } catch (error) {
      logger.error('Error verifying watermark:', error);
      return { valid: false, reason: 'Watermark verification error' };
    }
  }

  /**
   * ✅ Get stream security info
   */
  getStreamSecurityInfo(streamId, userId) {
    const drmKey = this.getDRMKey(streamId);
    const watermark = this.generateWatermark(userId, streamId);

    return {
      drm: drmKey ? {
        enabled: true,
        keyId: drmKey.keyId,
        licenseServerUrl: drmKey.licenseServerUrl,
      } : {
        enabled: false,
      },
      watermark: watermark ? {
        enabled: true,
        data: watermark,
      } : {
        enabled: false,
      },
    };
  }

  /**
   * ✅ Cleanup security data for stream
   */
  cleanupStream(streamId) {
    this.removeDRMKey(streamId);
    logger.debug('Stream security data cleaned up', { streamId });
  }
}

// ✅ Singleton instance
const streamSecurityService = new StreamSecurityService();

module.exports = {
  StreamSecurityService,
  streamSecurityService,
};

