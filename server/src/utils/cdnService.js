/**
 * ✅ CDN Service
 * خدمة لإدارة CDN integration للستريم
 * يدعم Cloudflare Stream و AWS CloudFront
 */

const logger = require('./logger');

class CDNService {
  constructor() {
    this.enabled = process.env.CDN_ENABLED === 'true';
    this.provider = process.env.CDN_PROVIDER || 'cloudflare'; // 'cloudflare' | 'cloudfront' | 'custom'
    this.config = {
      cloudflare: {
        accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
        apiToken: process.env.CLOUDFLARE_API_TOKEN,
        streamUrl: process.env.CLOUDFLARE_STREAM_URL,
      },
      cloudfront: {
        distributionId: process.env.CLOUDFRONT_DISTRIBUTION_ID,
        domainName: process.env.CLOUDFRONT_DOMAIN_NAME,
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        region: process.env.AWS_REGION || 'us-east-1',
      },
    };
  }

  /**
   * ✅ التحقق من أن CDN مفعّل
   */
  isEnabled() {
    return this.enabled;
  }

  /**
   * ✅ الحصول على CDN URL للستريم
   * @param {string} streamId - Stream ID
   * @param {string} quality - Video quality ('high' | 'medium' | 'low')
   * @returns {string} CDN URL
   */
  getStreamUrl(streamId, quality = 'high') {
    if (!this.enabled) {
      return null;
    }

    try {
      switch (this.provider) {
        case 'cloudflare':
          return this.getCloudflareStreamUrl(streamId, quality);
        case 'cloudfront':
          return this.getCloudfrontStreamUrl(streamId, quality);
        default:
          logger.warn(`Unknown CDN provider: ${this.provider}`);
          return null;
      }
    } catch (error) {
      logger.error('Error getting CDN stream URL:', error);
      return null;
    }
  }

  /**
   * ✅ الحصول على Cloudflare Stream URL
   */
  getCloudflareStreamUrl(streamId, quality) {
    const { streamUrl } = this.config.cloudflare;
    if (!streamUrl) {
      logger.warn('Cloudflare stream URL not configured');
      return null;
    }

    // Cloudflare Stream URLs format: https://customer-{code}.cloudflarestream.com/{video-id}/manifest/video.m3u8
    // For different qualities, we can use query parameters or different endpoints
    const qualityMap = {
      high: '1080p',
      medium: '720p',
      low: '480p',
    };

    return `${streamUrl}/${streamId}/manifest/video.m3u8?quality=${qualityMap[quality] || '1080p'}`;
  }

  /**
   * ✅ الحصول على CloudFront Stream URL
   */
  getCloudfrontStreamUrl(streamId, quality) {
    const { domainName } = this.config.cloudfront;
    if (!domainName) {
      logger.warn('CloudFront domain name not configured');
      return null;
    }

    const qualityMap = {
      high: '1080p',
      medium: '720p',
      low: '480p',
    };

    return `https://${domainName}/streams/${streamId}/${qualityMap[quality] || '1080p'}/manifest.m3u8`;
  }

  /**
   * ✅ إنشاء CDN stream (للـ recording)
   * @param {string} streamId - Stream ID
   * @param {object} options - Stream options
   * @returns {Promise<object>} CDN stream info
   */
  async createStream(streamId, options = {}) {
    if (!this.enabled) {
      return null;
    }

    try {
      switch (this.provider) {
        case 'cloudflare':
          return await this.createCloudflareStream(streamId, options);
        case 'cloudfront':
          return await this.createCloudfrontStream(streamId, options);
        default:
          logger.warn(`Stream creation not supported for provider: ${this.provider}`);
          return null;
      }
    } catch (error) {
      logger.error('Error creating CDN stream:', error);
      return null;
    }
  }

  /**
   * ✅ إنشاء Cloudflare Stream
   */
  async createCloudflareStream(streamId, options) {
    const { accountId, apiToken } = this.config.cloudflare;
    if (!accountId || !apiToken) {
      logger.warn('Cloudflare credentials not configured');
      return null;
    }

    // في production، يمكن استخدام Cloudflare API
    // هنا نرجع معلومات أساسية فقط
    logger.info(`Creating Cloudflare stream for: ${streamId}`);
    return {
      streamId,
      provider: 'cloudflare',
      uploadUrl: `https://api.cloudflare.com/client/v4/accounts/${accountId}/stream`,
      playbackUrl: this.getCloudflareStreamUrl(streamId, 'high'),
    };
  }

  /**
   * ✅ إنشاء CloudFront Stream
   */
  async createCloudfrontStream(streamId, options) {
    const { domainName } = this.config.cloudfront;
    if (!domainName) {
      logger.warn('CloudFront domain name not configured');
      return null;
    }

    logger.info(`Creating CloudFront stream for: ${streamId}`);
    return {
      streamId,
      provider: 'cloudfront',
      playbackUrl: this.getCloudfrontStreamUrl(streamId, 'high'),
    };
  }

  /**
   * ✅ الحصول على CDN metrics
   */
  async getMetrics(streamId) {
    if (!this.enabled) {
      return null;
    }

    // في production، يمكن جلب metrics من CDN provider
    return {
      streamId,
      provider: this.provider,
      views: 0,
      bandwidth: 0,
      latency: 0,
    };
  }
}

// Singleton instance
const cdnService = new CDNService();

module.exports = cdnService;

