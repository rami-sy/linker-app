/**
 * ✅ Get Least Loaded Worker
 * الحصول على أقل worker محمل (Load-based distribution)
 * تم تحديثه لاستخدام Logger System
 */

const logger = require('../utils/logger');

function getWorker(workers) {
    return new Promise(async (resolve, reject) => {
        try {
            if (!workers || workers.length === 0) {
                const error = new Error('No workers available');
                logger.error('❌ No workers available:', error);
                return reject(error);
            }

            // Inside promises (in array) for each worker to calculate its usage
            const workersLoad = workers.map((worker, index) => {
                return new Promise(async (resolve, reject) => {
                    try {
                        const stats = await worker.getResourceUsage();
                        // This calculates cumulative load, not current.
                        // We'd need a setTimeout to do that
                        const cpuUsage = stats.ru_utime + stats.ru_stime; // Example calculation
                        // This worker is done, resolve it. Promise.all will run when all are done
                        resolve({
                            index,
                            cpuUsage,
                            worker,
                        });
                    } catch (error) {
                        logger.warn(`Failed to get resource usage for worker ${index}:`, error);
                        // Return high load as fallback
                        resolve({
                            index,
                            cpuUsage: Infinity,
                            worker,
                        });
                    }
                });
            });

            const workersLoadCalc = await Promise.all(workersLoad);
            
            // Find least loaded worker
            let leastLoadedWorker = 0;
            let leastWorkerLoad = workersLoadCalc[0]?.cpuUsage || Infinity;
            
            for (let i = 0; i < workersLoadCalc.length; i++) {
                if (workersLoadCalc[i].cpuUsage < leastWorkerLoad) {
                    leastLoadedWorker = i;
                    leastWorkerLoad = workersLoadCalc[i].cpuUsage;
                }
            }

            const selectedWorker = workersLoadCalc[leastLoadedWorker]?.worker || workers[leastLoadedWorker];
            
            logger.debug(`Selected worker ${leastLoadedWorker} with load ${leastWorkerLoad}`, {
                selectedWorkerIndex: leastLoadedWorker,
                load: leastWorkerLoad,
                totalWorkers: workers.length,
            });

            resolve(selectedWorker);
        } catch (error) {
            logger.error('❌ Error getting worker:', error);
            reject(error);
        }
    });
}

module.exports = getWorker;