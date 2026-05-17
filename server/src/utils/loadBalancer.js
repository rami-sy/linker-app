/**
 * ✅ Load Balancer Service
 * خدمة لتحسين توزيع الـ load على Workers و Servers
 * يدعم multiple load balancing strategies
 */

const logger = require('./logger');

class LoadBalancer {
  constructor() {
    this.strategy = process.env.LOAD_BALANCER_STRATEGY || 'least-connections'; // 'least-connections' | 'round-robin' | 'weighted' | 'ip-hash'
    this.serverId = process.env.SERVER_ID || `server-${Date.now()}`;
    this.serverWeight = parseInt(process.env.SERVER_WEIGHT) || 1;
    this.metrics = {
      connections: 0,
      rooms: 0,
      streams: 0,
      lastUpdate: Date.now(),
    };
  }

  /**
   * ✅ اختيار Worker بناءً على Load Balancing Strategy
   * @param {Array} workers - Array of workers with metrics
   * @returns {object} Selected worker
   */
  selectWorker(workers) {
    if (!workers || workers.length === 0) {
      throw new Error('No workers available');
    }

    try {
      switch (this.strategy) {
        case 'least-connections':
          return this.selectLeastConnections(workers);
        case 'round-robin':
          return this.selectRoundRobin(workers);
        case 'weighted':
          return this.selectWeighted(workers);
        case 'ip-hash':
          return this.selectIpHash(workers);
        default:
          logger.warn(`Unknown load balancing strategy: ${this.strategy}, using least-connections`);
          return this.selectLeastConnections(workers);
      }
    } catch (error) {
      logger.error('Error selecting worker:', error);
      // Fallback to first worker
      return workers[0];
    }
  }

  /**
   * ✅ Least Connections Strategy
   * اختيار Worker بأقل عدد من الاتصالات
   */
  selectLeastConnections(workers) {
    const workersWithMetrics = workers.map(worker => ({
      worker,
      connections: worker.connections || 0,
      load: worker.load || 0,
    }));

    const selected = workersWithMetrics.reduce((min, current) => {
      const currentScore = current.connections + (current.load * 0.1); // وزن للـ load
      const minScore = min.connections + (min.load * 0.1);
      return currentScore < minScore ? current : min;
    });

    logger.debug(`Selected worker using least-connections: ${selected.worker.pid}`, {
      connections: selected.connections,
      load: selected.load,
    });

    return selected.worker;
  }

  /**
   * ✅ Round Robin Strategy
   * توزيع متساوي على جميع Workers
   */
  selectRoundRobin(workers) {
    if (!this.roundRobinIndex) {
      this.roundRobinIndex = 0;
    }

    const selected = workers[this.roundRobinIndex];
    this.roundRobinIndex = (this.roundRobinIndex + 1) % workers.length;

    logger.debug(`Selected worker using round-robin: ${selected.pid}`, {
      index: this.roundRobinIndex - 1,
    });

    return selected;
  }

  /**
   * ✅ Weighted Strategy
   * توزيع بناءً على وزن كل Worker
   */
  selectWeighted(workers) {
    const workersWithWeights = workers.map(worker => ({
      worker,
      weight: worker.weight || 1,
      connections: worker.connections || 0,
    }));

    // حساب total weight
    const totalWeight = workersWithWeights.reduce((sum, w) => sum + w.weight, 0);

    // اختيار عشوائي بناءً على الأوزان
    let random = Math.random() * totalWeight;
    for (const workerInfo of workersWithWeights) {
      random -= workerInfo.weight;
      if (random <= 0) {
        logger.debug(`Selected worker using weighted: ${workerInfo.worker.pid}`, {
          weight: workerInfo.weight,
        });
        return workerInfo.worker;
      }
    }

    // Fallback
    return workersWithWeights[0].worker;
  }

  /**
   * ✅ IP Hash Strategy
   * توزيع بناءً على hash للـ IP (لضمان توجيه نفس IP لنفس Worker)
   */
  selectIpHash(workers, ip) {
    if (!ip) {
      logger.warn('IP not provided for IP hash strategy, using round-robin');
      return this.selectRoundRobin(workers);
    }

    // Simple hash function
    let hash = 0;
    for (let i = 0; i < ip.length; i++) {
      hash = ((hash << 5) - hash) + ip.charCodeAt(i);
      hash = hash & hash; // Convert to 32-bit integer
    }

    const index = Math.abs(hash) % workers.length;
    const selected = workers[index];

    logger.debug(`Selected worker using IP hash: ${selected.pid}`, {
      ip,
      hash,
      index,
    });

    return selected;
  }

  /**
   * ✅ تحديث Metrics
   */
  updateMetrics(metrics) {
    this.metrics = {
      ...this.metrics,
      ...metrics,
      lastUpdate: Date.now(),
    };
  }

  /**
   * ✅ الحصول على Metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
      serverId: this.serverId,
      serverWeight: this.serverWeight,
      strategy: this.strategy,
    };
  }

  /**
   * ✅ حساب Load Score للـ Worker
   * @param {object} worker - Worker object with metrics
   * @returns {number} Load score (lower is better)
   */
  calculateLoadScore(worker) {
    const connections = worker.connections || 0;
    const cpuUsage = worker.cpuUsage || 0;
    const memoryUsage = worker.memoryUsage || 0;
    const rooms = worker.rooms || 0;

    // Weighted score
    const score = (
      connections * 0.4 +
      cpuUsage * 0.3 +
      memoryUsage * 0.2 +
      rooms * 0.1
    );

    return score;
  }
}

// Singleton instance
const loadBalancer = new LoadBalancer();

module.exports = loadBalancer;

