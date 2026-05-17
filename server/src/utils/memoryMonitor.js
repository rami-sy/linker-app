/**
 * ✅ Memory Monitoring Utility
 * لمراقبة استخدام الذاكرة والكشف عن memory leaks
 * مع ربط بجميع الموارد: Redis, Database, Sockets, MediaSoup, Message Queue, Rooms
 */

const logger = require('./logger');
const v8 = require('v8');

class MemoryMonitor {
  constructor(options = {}) {
    this.enabled = options.enabled !== false; // Default: enabled
    this.interval = options.interval || 60000; // Default: 1 minute
    this.warningThreshold = options.warningThreshold || 0.8; // 80% of heap
    this.criticalThreshold = options.criticalThreshold || 0.9; // 90% of heap
    this.intervalId = null;
    this.metrics = {
      heapUsed: [],
      heapTotal: [],
      external: [],
      rss: [],
      timestamp: [],
    };
    this.maxHistorySize = options.maxHistorySize || 100; // Keep last 100 measurements
    
    // ✅ References للموارد المراقبة
    this.resources = {
      redisClient: null,
      mongoose: null,
      io: null,
      workerManager: null,
      roomManager: null,
      messageQueue: null,
    };
  }
  
  /**
   * ✅ تسجيل الموارد للمراقبة
   */
  registerResources(resources) {
    this.resources = { ...this.resources, ...resources };
    logger.debug('Memory monitor resources registered', {
      resources: Object.keys(resources),
    });
  }

  /**
   * ✅ بدء المراقبة
   */
  start() {
    if (!this.enabled) {
      logger.debug('Memory monitoring is disabled');
      return;
    }

    if (this.intervalId) {
      logger.warn('Memory monitoring is already running');
      return;
    }

    logger.info('Starting memory monitoring', {
      interval: this.interval,
      warningThreshold: this.warningThreshold,
      criticalThreshold: this.criticalThreshold,
    });

    // ✅ قياس أولي
    this.measure();

    // ✅ مراقبة دورية
    this.intervalId = setInterval(async () => {
      await this.measure();
      await this.checkThresholds();
    }, this.interval);
  }

  /**
   * ✅ إيقاف المراقبة
   */
  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      logger.info('Memory monitoring stopped');
    }
  }

  /**
   * ✅ قياس استخدام الذاكرة مع إحصائيات الموارد
   */
  async measure() {
    try {
      const memUsage = process.memoryUsage();
      const heapStats = v8.getHeapStatistics();
      const timestamp = Date.now();

      // ✅ جمع إحصائيات الموارد
      const resourcesStats = await this.getResourcesStats();

      const measurement = {
        timestamp,
        heapUsed: memUsage.heapUsed,
        heapTotal: memUsage.heapTotal,
        external: memUsage.external,
        rss: memUsage.rss,
        arrayBuffers: memUsage.arrayBuffers,
        // V8 heap statistics
        heapSizeLimit: heapStats.heap_size_limit,
        totalHeapSize: heapStats.total_heap_size,
        usedHeapSize: heapStats.used_heap_size,
        totalAvailableSize: heapStats.total_available_size,
        totalPhysicalSize: heapStats.total_physical_size,
        // Calculated metrics
        heapUsagePercent: (memUsage.heapUsed / memUsage.heapTotal) * 100,
        heapLimitUsagePercent: (memUsage.heapUsed / heapStats.heap_size_limit) * 100,
        // ✅ إحصائيات الموارد
        resources: resourcesStats,
      };

      // ✅ حفظ القياس
      this.metrics.heapUsed.push(measurement.heapUsed);
      this.metrics.heapTotal.push(measurement.heapTotal);
      this.metrics.external.push(measurement.external);
      this.metrics.rss.push(measurement.rss);
      this.metrics.timestamp.push(timestamp);

      // ✅ الحفاظ على حجم التاريخ
      if (this.metrics.heapUsed.length > this.maxHistorySize) {
        this.metrics.heapUsed.shift();
        this.metrics.heapTotal.shift();
        this.metrics.external.shift();
        this.metrics.rss.shift();
        this.metrics.timestamp.shift();
      }

      return measurement;
    } catch (error) {
      logger.error('Error measuring memory:', error);
      return null;
    }
  }

  /**
   * ✅ التحقق من thresholds مع معلومات الموارد
   */
  async checkThresholds() {
    const measurement = await this.getCurrentMeasurement();
    if (!measurement) return;

    const heapLimitUsage = measurement.heapLimitUsagePercent / 100;

    if (heapLimitUsage >= this.criticalThreshold) {
      logger.error('🚨 CRITICAL: Memory usage is critical', {
        heapLimitUsagePercent: measurement.heapLimitUsagePercent.toFixed(2),
        heapUsed: this.formatBytes(measurement.heapUsed),
        heapTotal: this.formatBytes(measurement.heapTotal),
        heapSizeLimit: this.formatBytes(measurement.heapSizeLimit),
        resources: measurement.resources, // ✅ إضافة معلومات الموارد
      });
      
      // ✅ إجراءات إضافية عند critical threshold
      // - إجبار garbage collection
      if (global.gc) {
        logger.info('Forcing garbage collection due to critical memory usage');
        global.gc();
      }
      
      // - تنظيف الغرف الفارغة
      if (this.resources.roomManager) {
        try {
          this.resources.roomManager.cleanupStaleRooms();
          logger.info('Cleaned up stale rooms due to critical memory usage');
        } catch (error) {
          logger.error('Error cleaning up stale rooms:', error);
        }
      }
    } else if (heapLimitUsage >= this.warningThreshold) {
      logger.warn('⚠️ WARNING: Memory usage is high', {
        heapLimitUsagePercent: measurement.heapLimitUsagePercent.toFixed(2),
        heapUsed: this.formatBytes(measurement.heapUsed),
        heapTotal: this.formatBytes(measurement.heapTotal),
        heapSizeLimit: this.formatBytes(measurement.heapSizeLimit),
        resources: measurement.resources, // ✅ إضافة معلومات الموارد
      });
      
      // ✅ تنظيف الغرف الفارغة عند warning
      if (this.resources.roomManager) {
        try {
          this.resources.roomManager.cleanupStaleRooms();
        } catch (error) {
          logger.error('Error cleaning up stale rooms:', error);
        }
      }
    }
  }

  /**
   * ✅ الحصول على إحصائيات الموارد
   */
  async getResourcesStats() {
    const stats = {};
    
    try {
      // ✅ Redis Stats
      if (this.resources.redisClient) {
        try {
          const info = await this.resources.redisClient.info('memory');
          const memoryMatch = info.match(/used_memory:(\d+)/);
          stats.redis = {
            connected: this.resources.redisClient.isReady || false,
            memoryUsed: memoryMatch ? parseInt(memoryMatch[1]) : null,
          };
        } catch (error) {
          stats.redis = { connected: false, error: error.message };
        }
      }
      
      // ✅ Database Stats (Mongoose)
      if (this.resources.mongoose) {
        const connections = this.resources.mongoose.connections || [];
        stats.database = {
          connections: connections.length,
          readyState: connections.map(conn => ({
            name: conn.name,
            readyState: conn.readyState, // 0 = disconnected, 1 = connected, 2 = connecting, 3 = disconnecting
          })),
        };
      }
      
      // ✅ Socket.IO Stats
      if (this.resources.io) {
        const sockets = await this.resources.io.fetchSockets();
        stats.sockets = {
          connected: sockets.length,
          rooms: this.resources.io.sockets.adapter.rooms?.size || 0,
        };
      }
      
      // ✅ MediaSoup Workers Stats
      if (this.resources.workerManager) {
        try {
          const workersInfo = await this.resources.workerManager.getWorkersInfo();
          stats.workers = {
            count: workersInfo.length,
            totalCpuUsage: workersInfo.reduce((sum, w) => sum + (w.cpuUsage || 0), 0),
            workers: workersInfo,
          };
        } catch (error) {
          stats.workers = { error: error.message };
        }
      }
      
      // ✅ Room Manager Stats
      if (this.resources.roomManager) {
        try {
          const roomStats = this.resources.roomManager.getMemoryStats();
          stats.rooms = roomStats;
        } catch (error) {
          stats.rooms = { error: error.message };
        }
      }
      
      // ✅ Message Queue Stats
      if (this.resources.messageQueue) {
        try {
          const [waiting, active, completed, failed, delayed] = await Promise.all([
            this.resources.messageQueue.getWaitingCount(),
            this.resources.messageQueue.getActiveCount(),
            this.resources.messageQueue.getCompletedCount(),
            this.resources.messageQueue.getFailedCount(),
            this.resources.messageQueue.getDelayedCount(),
          ]);
          stats.messageQueue = {
            waiting,
            active,
            completed,
            failed,
            delayed,
            total: waiting + active + completed + failed + delayed,
          };
        } catch (error) {
          stats.messageQueue = { error: error.message };
        }
      }
    } catch (error) {
      logger.error('Error getting resources stats:', error);
    }
    
    return stats;
  }

  /**
   * ✅ الحصول على القياس الحالي
   */
  async getCurrentMeasurement() {
    if (this.metrics.heapUsed.length === 0) {
      return await this.measure();
    }
    const lastIndex = this.metrics.heapUsed.length - 1;
    const memUsage = process.memoryUsage();
    const heapStats = v8.getHeapStatistics();
    const resourcesStats = await this.getResourcesStats();
    
    return {
      timestamp: this.metrics.timestamp[lastIndex],
      heapUsed: this.metrics.heapUsed[lastIndex],
      heapTotal: this.metrics.heapTotal[lastIndex],
      external: this.metrics.external[lastIndex],
      rss: this.metrics.rss[lastIndex],
      heapSizeLimit: heapStats.heap_size_limit,
      heapLimitUsagePercent: (this.metrics.heapUsed[lastIndex] / heapStats.heap_size_limit) * 100,
      resources: resourcesStats,
    };
  }

  /**
   * ✅ الحصول على إحصائيات الذاكرة الشاملة
   */
  async getStats() {
    const current = await this.getCurrentMeasurement();
    if (!current || this.metrics.heapUsed.length < 2) {
      return current;
    }

    // ✅ حساب الاتجاه (trend)
    const recent = this.metrics.heapUsed.slice(-10); // آخر 10 قياسات
    const firstHalf = recent.slice(0, Math.floor(recent.length / 2));
    const secondHalf = recent.slice(Math.floor(recent.length / 2));
    const avgFirst = firstHalf.reduce((sum, val) => sum + val, 0) / firstHalf.length;
    const avgSecond = secondHalf.reduce((sum, val) => sum + val, 0) / secondHalf.length;
    const trend = avgSecond > avgFirst ? 'increasing' : avgSecond < avgFirst ? 'decreasing' : 'stable';

    return {
      current,
      trend,
      history: {
        count: this.metrics.heapUsed.length,
        min: Math.min(...this.metrics.heapUsed),
        max: Math.max(...this.metrics.heapUsed),
        avg: this.metrics.heapUsed.reduce((sum, val) => sum + val, 0) / this.metrics.heapUsed.length,
      },
    };
  }
  
  /**
   * ✅ الحصول على تقرير شامل للذاكرة والموارد
   */
  async getComprehensiveReport() {
    const stats = await this.getStats();
    const resourcesStats = await this.getResourcesStats();
    
    return {
      memory: stats,
      resources: resourcesStats,
      timestamp: Date.now(),
      formatted: {
        heapUsed: this.formatBytes(stats.current.heapUsed),
        heapTotal: this.formatBytes(stats.current.heapTotal),
        heapSizeLimit: this.formatBytes(stats.current.heapSizeLimit),
        heapLimitUsagePercent: stats.current.heapLimitUsagePercent.toFixed(2) + '%',
        rss: this.formatBytes(stats.current.rss),
        external: this.formatBytes(stats.current.external),
        trend: stats.trend,
      },
    };
  }

  /**
   * ✅ تنسيق البايتات
   */
  formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  }

  /**
   * ✅ إجبار garbage collection (إذا كان متاحاً)
   */
  forceGC() {
    if (global.gc) {
      logger.info('Forcing garbage collection...');
      global.gc();
      logger.info('Garbage collection completed');
      return true;
    } else {
      logger.warn('Garbage collection is not available. Run Node with --expose-gc flag');
      return false;
    }
  }
}

// ✅ Singleton instance
let memoryMonitorInstance = null;

/**
 * ✅ الحصول على Memory Monitor instance
 */
const getMemoryMonitor = (options) => {
  if (!memoryMonitorInstance) {
    memoryMonitorInstance = new MemoryMonitor(options);
  }
  return memoryMonitorInstance;
};

module.exports = {
  MemoryMonitor,
  getMemoryMonitor,
};

