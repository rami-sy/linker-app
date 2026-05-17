/**
 * ✅ Create MediaSoup Workers
 * إنشاء MediaSoup Workers - تم تحديثه لاستخدام Logger System
 */

const os = require('os');
const mediasoup = require('mediasoup');
const config = require('../config/media.config');
const logger = require('../utils/logger');

const totalThreads = os.cpus().length; // Maximum number of allowed workers

const createWorkers = () => new Promise(async (resolve, reject) => {
    try {
        logger.info(`🚀 Creating ${totalThreads} MediaSoup workers...`);
        let workers = [];
        
        // Loop to create each worker
        for (let i = 0; i < totalThreads; i++) {
            try {
                const worker = await mediasoup.createWorker({
                    // rtcMinPort and max are just arbitrary ports for our traffic
                    // useful for firewall or networking rules
                    rtcMinPort: config.workerSettings.rtcMinPort,
                    rtcMaxPort: config.workerSettings.rtcMaxPort,
                    logLevel: config.workerSettings.logLevel,
                    logTags: config.workerSettings.logTags,
                });
                
                worker.on('died', () => {
                    // Keep process alive and let supervisor/recovery recreate workers
                    logger.error(`❌ MediaSoup worker died [pid:${worker.pid}]`, {
                        workerId: i,
                        pid: worker.pid,
                    });
                });
                
                workers.push(worker);
                logger.info(`✅ Worker ${i + 1}/${totalThreads} created [pid:${worker.pid}]`, {
                    workerId: i,
                    pid: worker.pid,
                });
            } catch (error) {
                logger.error(`❌ Failed to create worker ${i + 1}:`, error);
                // Continue with other workers even if one fails
            }
        }

        if (workers.length === 0) {
            const error = new Error('Failed to create any MediaSoup workers');
            logger.error('❌ No workers created:', error);
            return reject(error);
        }

        logger.info(`✅ Successfully created ${workers.length}/${totalThreads} MediaSoup workers`);
        resolve(workers);
    } catch (error) {
        logger.error('❌ Error creating MediaSoup workers:', error);
        reject(error);
    }
});



module.exports = createWorkers