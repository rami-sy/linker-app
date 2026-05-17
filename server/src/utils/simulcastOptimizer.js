/**
 * ✅ Simulcast Layers Optimizer
 * تحسينات إضافية لـ Simulcast layers
 */

const logger = require('./logger');

/**
 * ✅ Simulcast Configuration
 * إعدادات محسّنة لـ Simulcast layers
 */
const SIMULCAST_CONFIG = {
  // ✅ Layer configurations
  layers: {
    low: {
      rid: 'r0',
      maxBitrate: 300000, // 300 kbps
      scaleResolutionDownBy: 4, // 1/4 resolution
      maxFramerate: 7.5,
      priority: 1, // Lowest priority
      active: true,
    },
    medium: {
      rid: 'r1',
      maxBitrate: 750000, // 750 kbps
      scaleResolutionDownBy: 2, // 1/2 resolution
      maxFramerate: 15,
      priority: 2, // Medium priority
      active: true,
    },
    high: {
      rid: 'r2',
      maxBitrate: 2500000, // 2.5 Mbps
      scaleResolutionDownBy: 1, // Full resolution
      maxFramerate: 30,
      priority: 3, // Highest priority
      active: true,
    },
  },

  // ✅ Adaptive layer selection thresholds (in bps)
  bandwidthThresholds: {
    low: 500000, // < 500 kbps → low layer
    medium: 1500000, // < 1.5 Mbps → medium layer
    high: 1500000, // >= 1.5 Mbps → high layer
  },

  // ✅ Network quality thresholds
  networkQualityThresholds: {
    excellent: 0.95, // > 95% → high layer
    good: 0.80, // > 80% → medium layer
    fair: 0.60, // > 60% → low layer
    poor: 0.60, // <= 60% → low layer
  },

  // ✅ Layer switching delays (to prevent rapid switching)
  switchingDelays: {
    lowToMedium: 2000, // 2 seconds
    mediumToHigh: 3000, // 3 seconds
    highToMedium: 1000, // 1 second
    mediumToLow: 1000, // 1 second
  },
};

/**
 * ✅ Simulcast Optimizer Class
 */
class SimulcastOptimizer {
  constructor() {
    this.layerHistory = new Map(); // Map<consumerId, { currentLayer, lastSwitchTime, switchCount }>
    this.bandwidthHistory = new Map(); // Map<consumerId, bandwidthHistory[]>
    this.maxHistorySize = 10; // Keep last 10 measurements
  }

  /**
   * ✅ Get optimal simulcast encoding parameters
   * بناءً على role (broadcaster/viewer) و network conditions
   */
  getEncodingParameters(options = {}) {
    const {
      role = 'member', // 'member', 'broadcaster', 'viewer'
      networkQuality = 'good',
      bandwidth = null,
      isScreenShare = false,
    } = options;

    // ✅ Screen sharing: use single high-quality layer
    if (isScreenShare) {
      return [{
        rid: 'r0',
        maxBitrate: 2000000, // 2 Mbps for screen share
        scaleResolutionDownBy: 1,
        maxFramerate: 30,
      }];
    }

    // ✅ Viewers: use conservative layers
    if (role === 'viewer') {
      return [
        {
          rid: 'r0',
          maxBitrate: SIMULCAST_CONFIG.layers.low.maxBitrate,
          scaleResolutionDownBy: SIMULCAST_CONFIG.layers.low.scaleResolutionDownBy,
          maxFramerate: SIMULCAST_CONFIG.layers.low.maxFramerate,
        },
        {
          rid: 'r1',
          maxBitrate: SIMULCAST_CONFIG.layers.medium.maxBitrate,
          scaleResolutionDownBy: SIMULCAST_CONFIG.layers.medium.scaleResolutionDownBy,
          maxFramerate: SIMULCAST_CONFIG.layers.medium.maxFramerate,
        },
      ];
    }

    // ✅ Broadcasters: use all layers
    return [
      {
        rid: 'r0',
        maxBitrate: SIMULCAST_CONFIG.layers.low.maxBitrate,
        scaleResolutionDownBy: SIMULCAST_CONFIG.layers.low.scaleResolutionDownBy,
        maxFramerate: SIMULCAST_CONFIG.layers.low.maxFramerate,
      },
      {
        rid: 'r1',
        maxBitrate: SIMULCAST_CONFIG.layers.medium.maxBitrate,
        scaleResolutionDownBy: SIMULCAST_CONFIG.layers.medium.scaleResolutionDownBy,
        maxFramerate: SIMULCAST_CONFIG.layers.medium.maxFramerate,
      },
      {
        rid: 'r2',
        maxBitrate: SIMULCAST_CONFIG.layers.high.maxBitrate,
        scaleResolutionDownBy: SIMULCAST_CONFIG.layers.high.scaleResolutionDownBy,
        maxFramerate: SIMULCAST_CONFIG.layers.high.maxFramerate,
      },
    ];
  }

  /**
   * ✅ Select optimal consumer layer based on bandwidth
   */
  selectConsumerLayer(consumerId, bandwidth, networkQuality = null) {
    // ✅ Get layer history
    const history = this.layerHistory.get(consumerId) || {
      currentLayer: 'medium',
      lastSwitchTime: 0,
      switchCount: 0,
    };

    // ✅ Determine target layer based on bandwidth
    let targetLayer = 'medium';
    if (bandwidth < SIMULCAST_CONFIG.bandwidthThresholds.low) {
      targetLayer = 'low';
    } else if (bandwidth >= SIMULCAST_CONFIG.bandwidthThresholds.high) {
      targetLayer = 'high';
    } else {
      targetLayer = 'medium';
    }

    // ✅ Adjust based on network quality if provided
    if (networkQuality) {
      const quality = SIMULCAST_CONFIG.networkQualityThresholds;
      if (networkQuality >= quality.excellent) {
        targetLayer = 'high';
      } else if (networkQuality >= quality.good) {
        targetLayer = 'medium';
      } else if (networkQuality >= quality.fair) {
        targetLayer = 'medium';
      } else {
        targetLayer = 'low';
      }
    }

    // ✅ Prevent rapid switching
    const now = Date.now();
    const timeSinceLastSwitch = now - history.lastSwitchTime;
    const currentLayer = history.currentLayer;

    if (targetLayer === currentLayer) {
      return currentLayer; // No change needed
    }

    // ✅ Check switching delay
    const delayKey = `${currentLayer}To${targetLayer.charAt(0).toUpperCase() + targetLayer.slice(1)}`;
    const requiredDelay = SIMULCAST_CONFIG.switchingDelays[delayKey] || 1000;

    if (timeSinceLastSwitch < requiredDelay) {
      logger.debug(`Layer switch delayed for consumer ${consumerId}`, {
        currentLayer,
        targetLayer,
        timeSinceLastSwitch,
        requiredDelay,
      });
      return currentLayer; // Keep current layer
    }

    // ✅ Update history
    this.layerHistory.set(consumerId, {
      currentLayer: targetLayer,
      lastSwitchTime: now,
      switchCount: history.switchCount + 1,
    });

    logger.debug(`Layer switch for consumer ${consumerId}`, {
      from: currentLayer,
      to: targetLayer,
      bandwidth,
      networkQuality,
    });

    return targetLayer;
  }

  /**
   * ✅ Get layer RID from layer name
   */
  getLayerRid(layer) {
    return SIMULCAST_CONFIG.layers[layer]?.rid || 'r1';
  }

  /**
   * ✅ Get layer priority
   */
  getLayerPriority(layer) {
    return SIMULCAST_CONFIG.layers[layer]?.priority || 2;
  }

  /**
   * ✅ Update bandwidth history
   */
  updateBandwidthHistory(consumerId, bandwidth) {
    if (!this.bandwidthHistory.has(consumerId)) {
      this.bandwidthHistory.set(consumerId, []);
    }

    const history = this.bandwidthHistory.get(consumerId);
    history.push({
      bandwidth,
      timestamp: Date.now(),
    });

    // ✅ Keep only last N measurements
    if (history.length > this.maxHistorySize) {
      history.shift();
    }

    this.bandwidthHistory.set(consumerId, history);
  }

  /**
   * ✅ Get average bandwidth for consumer
   */
  getAverageBandwidth(consumerId) {
    const history = this.bandwidthHistory.get(consumerId);
    if (!history || history.length === 0) {
      return null;
    }

    const sum = history.reduce((acc, entry) => acc + entry.bandwidth, 0);
    return sum / history.length;
  }

  /**
   * ✅ Cleanup consumer data
   */
  cleanupConsumer(consumerId) {
    this.layerHistory.delete(consumerId);
    this.bandwidthHistory.delete(consumerId);
    logger.debug(`Cleaned up simulcast data for consumer ${consumerId}`);
  }

  /**
   * ✅ Get simulcast statistics
   */
  getStats() {
    return {
      activeConsumers: this.layerHistory.size,
      layerDistribution: {
        low: Array.from(this.layerHistory.values()).filter(h => h.currentLayer === 'low').length,
        medium: Array.from(this.layerHistory.values()).filter(h => h.currentLayer === 'medium').length,
        high: Array.from(this.layerHistory.values()).filter(h => h.currentLayer === 'high').length,
      },
      averageSwitches: Array.from(this.layerHistory.values())
        .reduce((sum, h) => sum + h.switchCount, 0) / this.layerHistory.size || 0,
    };
  }
}

// ✅ Singleton instance
const simulcastOptimizer = new SimulcastOptimizer();

module.exports = {
  SimulcastOptimizer,
  simulcastOptimizer,
  SIMULCAST_CONFIG,
};

