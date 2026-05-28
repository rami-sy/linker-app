/**
 * Worker Manager
 * إدارة MediaSoup Workers - كل worker يعمل في process منفصل
 */

const mediasoup = require('mediasoup');
const os = require('os');
const config = require('../config/media.config');
const loadBalancer = require('../utils/loadBalancer'); // ✅ Load Balancer integration
const logger = require('../utils/logger');

class WorkerManager {
  constructor() {
    this.workers = [];
    this.nextWorkerIdx = 0;
  }

  async createWorker() {
    const worker = await mediasoup.createWorker({
      logLevel: config.worker.logLevel,
      logTags: config.worker.logTags,
      rtcMinPort: config.worker.rtcMinPort,
      rtcMaxPort: config.worker.rtcMaxPort,
    });

    worker.on('died', async () => {
      logger.error(
        `❌ MediaSoup worker died [pid:${worker.pid}], attempting recovery...`
      );
      try {
        this.workers = this.workers.filter((w) => w.pid !== worker.pid);
        const replacement = await this.createWorker();
        this.workers.push(replacement);
        logger.info(
          `✅ MediaSoup worker recovered [oldPid:${worker.pid} newPid:${replacement.pid}]`
        );
      } catch (recoveryError) {
        logger.error('❌ Failed to recover mediasoup worker after crash', recoveryError);
      }
    });

    return worker;
  }

  /**
   * تهيئة Workers بناءً على عدد CPU cores
   */
  async initialize() {
    const configuredWorkers = Number.parseInt(
      process.env.MEDIASOUP_WORKERS,
      10
    );
    const cpuCount = os.cpus().length;
    const defaultWorkers =
      process.env.NODE_ENV === "production" ? cpuCount : Math.min(2, cpuCount);
    const numWorkers =
      Number.isFinite(configuredWorkers) && configuredWorkers > 0
        ? configuredWorkers
        : defaultWorkers;
    logger.info(`🚀 Initializing ${numWorkers} MediaSoup workers...`);

    for (let i = 0; i < numWorkers; i++) {
      const worker = await this.createWorker();

      this.workers.push(worker);
      logger.info(`✅ Worker ${i + 1} created [pid:${worker.pid}]`);
    }

    logger.info(`✅ All ${numWorkers} MediaSoup workers initialized successfully`);
  }

  /**
   * ✅ الحصول على أقل worker محمل (Load-based distribution)
   * بدلاً من Round-robin البسيط
   * مع دعم Load Balancer Service
   */
  async getWorker() {
    if (this.workers.length === 0) {
      throw new Error('No workers available');
    }

    // ✅ Load-based distribution: اختيار worker بأقل load
    try {
      const workersInfo = await Promise.all(
        this.workers.map(async (worker, idx) => {
          try {
            const usage = await worker.getResourceUsage();
            const workerMetrics = {
              worker,
              index: idx,
              pid: worker.pid,
              // حساب load بناءً على CPU usage
              load: usage.ru_utime + usage.ru_stime,
              connections: worker.connections || 0,
              rooms: worker.rooms || 0,
              // يمكن إضافة metrics أخرى مثل memory
            };

            // ✅ حساب Load Score باستخدام Load Balancer
            workerMetrics.loadScore = loadBalancer.calculateLoadScore(workerMetrics);

            return workerMetrics;
          } catch (error) {
            // إذا فشل الحصول على usage، نستخدم worker كـ fallback
            logger.warn(`Failed to get resource usage for worker ${idx}:`, error);
            return {
              worker,
              index: idx,
              pid: worker.pid,
              load: Infinity,
              connections: 0,
              rooms: 0,
              loadScore: Infinity, // نعطيه أولوية منخفضة
            };
          }
        })
      );

      // ✅ استخدام Load Balancer لاختيار Worker
      const selectedWorker = loadBalancer.selectWorker(workersInfo.map(w => w.worker));

      return selectedWorker;
    } catch (error) {
      // Fallback إلى Round-robin إذا فشل load-based distribution
      logger.warn('Load-based distribution failed, falling back to round-robin:', error);
      const worker = this.workers[this.nextWorkerIdx];
      
      if (++this.nextWorkerIdx === this.workers.length) {
        this.nextWorkerIdx = 0;
      }

      return worker;
    }
  }

  /**
   * الحصول على worker باستخدام Round-robin (للتوافق مع الكود القديم)
   */
  getWorkerRoundRobin() {
    const worker = this.workers[this.nextWorkerIdx];
    
    if (++this.nextWorkerIdx === this.workers.length) {
      this.nextWorkerIdx = 0;
    }

    return worker;
  }

  /**
   * الحصول على معلومات Workers
   */
  async getWorkersInfo() {
    const workersInfo = await Promise.all(
      this.workers.map(async (worker, idx) => {
        const usage = await worker.getResourceUsage();
        return {
          id: idx,
          pid: worker.pid,
          cpuUsage: usage.ru_utime + usage.ru_stime,
        };
      })
    );
    return workersInfo;
  }
}

// Singleton instance
const workerManager = new WorkerManager();

module.exports = workerManager;

