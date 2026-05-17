/**
 * ✅ Screen Share Optimizer
 * أداة لتحسين جودة مشاركة الشاشة (Client-side)
 */

// Note: logger is optional for client-side
const logger = {
  info: (...args) => console.log('[ScreenShareOptimizer]', ...args),
  error: (...args) => console.error('[ScreenShareOptimizer]', ...args),
};

class ScreenShareOptimizer {
  constructor() {
    this.defaultSettings = {
      quality: 'high',
      frameRate: 30,
      bitrate: 3000000, // 3 Mbps
      resolution: { width: 1920, height: 1080 },
    };
    
    this.qualityPresets = {
      low: {
        bitrate: 1000000, // 1 Mbps
        frameRate: 15,
        resolution: { width: 1280, height: 720 },
      },
      medium: {
        bitrate: 2000000, // 2 Mbps
        frameRate: 24,
        resolution: { width: 1600, height: 900 },
      },
      high: {
        bitrate: 3000000, // 3 Mbps
        frameRate: 30,
        resolution: { width: 1920, height: 1080 },
      },
      ultra: {
        bitrate: 5000000, // 5 Mbps
        frameRate: 60,
        resolution: { width: 2560, height: 1440 },
      },
    };
  }

  /**
   * ✅ Get optimal screen share settings
   */
  getOptimalSettings(options = {}) {
    const quality = options.quality || this.defaultSettings.quality;
    const preset = this.qualityPresets[quality] || this.qualityPresets.high;
    
    // Override with custom options if provided
    return {
      bitrate: options.bitrate || preset.bitrate,
      frameRate: options.frameRate || preset.frameRate,
      resolution: options.resolution || preset.resolution,
      cursor: options.cursor !== undefined ? options.cursor : 'always',
      displaySurface: options.displaySurface || 'monitor',
    };
  }

  /**
   * ✅ Get MediaStream constraints for screen share
   */
  getDisplayMediaConstraints(quality = 'high', options = {}) {
    const settings = this.getOptimalSettings({ quality, ...options });
    
    return {
      video: {
        width: { ideal: settings.resolution.width },
        height: { ideal: settings.resolution.height },
        frameRate: { ideal: settings.frameRate },
        cursor: settings.cursor,
        displaySurface: settings.displaySurface,
      },
      audio: options.audio !== undefined ? options.audio : false,
    };
  }

  /**
   * ✅ Get encoding parameters for screen share producer
   */
  getEncodingParameters(quality = 'high', options = {}) {
    const settings = this.getOptimalSettings({ quality, ...options });
    
    return [
      {
        rid: 'r0',
        maxBitrate: Math.floor(settings.bitrate * 0.3), // Low layer
        scaleResolutionDownBy: 4,
      },
      {
        rid: 'r1',
        maxBitrate: Math.floor(settings.bitrate * 0.6), // Medium layer
        scaleResolutionDownBy: 2,
      },
      {
        rid: 'r2',
        maxBitrate: settings.bitrate, // High layer
        scaleResolutionDownBy: 1,
      },
    ];
  }

  /**
   * ✅ Adjust quality based on network conditions
   */
  adjustQualityForNetwork(currentQuality, networkStats) {
    const { bandwidth, packetLoss, latency } = networkStats || {};
    
    // If network is poor, reduce quality
    if (bandwidth < 2000000 || packetLoss > 5 || latency > 500) {
      if (currentQuality === 'ultra') return 'high';
      if (currentQuality === 'high') return 'medium';
      if (currentQuality === 'medium') return 'low';
      return 'low';
    }
    
    // If network is excellent, can increase quality
    if (bandwidth > 10000000 && packetLoss < 1 && latency < 100) {
      if (currentQuality === 'low') return 'medium';
      if (currentQuality === 'medium') return 'high';
      if (currentQuality === 'high') return 'ultra';
      return currentQuality;
    }
    
    return currentQuality;
  }

  /**
   * ✅ Validate screen share capabilities
   */
  async validateScreenShareSupport() {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices) {
      return {
        supported: false,
        reason: 'MediaDevices API not available',
      };
    }

    if (!navigator.mediaDevices.getDisplayMedia) {
      return {
        supported: false,
        reason: 'getDisplayMedia not supported',
      };
    }

    try {
      // Check if we can get display media (without actually starting)
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: false,
      });
      
      // Immediately stop the stream
      stream.getTracks().forEach(track => track.stop());
      
      return {
        supported: true,
        capabilities: {
          video: true,
          audio: false, // Most browsers don't support audio in screen share
        },
      };
    } catch (error) {
      return {
        supported: false,
        reason: error.message,
        error: error.name,
      };
    }
  }
}

// Export singleton instance
const screenShareOptimizer = new ScreenShareOptimizer();
export default screenShareOptimizer;
// Also export as CommonJS for compatibility
if (typeof module !== 'undefined' && module.exports) {
  module.exports = screenShareOptimizer;
}

