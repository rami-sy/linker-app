/**
 * ✅ Simulcast Layer Management Handlers
 * Socket handlers لإدارة Simulcast layers
 */

const logger = require('../../utils/logger');
const { simulcastOptimizer } = require('../../utils/simulcastOptimizer');
const roomManager = require('../../mediasoup/room-manager');

module.exports = ({ socket, io, redisClient }) => {
  /**
   * ✅ Set preferred layers for consumer (client-side optimization)
   */
  socket.on('setConsumerLayers', async ({ roomId, consumerId, spatialLayer, temporalLayer }, callback) => {
    try {
      const room = roomManager.getRoom(roomId);
      if (!room) {
        return callback({ success: false, error: 'Room not found' });
      }

      const peer = room.getPeer(socket.id);
      if (!peer) {
        return callback({ success: false, error: 'Peer not found' });
      }

      const consumer = peer.consumers.get(consumerId);
      if (!consumer) {
        return callback({ success: false, error: 'Consumer not found' });
      }

      // ✅ Update preferred layers
      await consumer.setPreferredLayers({
        spatialLayer: spatialLayer ?? 0,
        temporalLayer: temporalLayer ?? 0,
      });

      // ✅ Update simulcast optimizer
      const layerName = spatialLayer === 0 ? 'low' : spatialLayer === 1 ? 'medium' : 'high';
      simulcastOptimizer.selectConsumerLayer(consumerId, null, null); // Update layer tracking

      logger.debug('Consumer layers updated', {
        consumerId,
        spatialLayer,
        temporalLayer,
        roomId,
      });

      callback({ success: true });
    } catch (error) {
      logger.error('Error setting consumer layers:', error);
      callback({ success: false, error: error.message });
    }
  });

  /**
   * ✅ Get simulcast statistics
   */
  socket.on('getSimulcastStats', async ({ roomId }, callback) => {
    try {
      const room = roomManager.getRoom(roomId);
      if (!room) {
        return callback({ success: false, error: 'Room not found' });
      }
      const peer = room.getPeer(socket.id);
      if (!peer) {
        return callback({ success: false, error: 'Peer not found' });
      }
      const stats = simulcastOptimizer.getStats();
      callback({ success: true, stats });
    } catch (error) {
      logger.error('Error getting simulcast stats:', error);
      callback({ success: false, error: error.message });
    }
  });
};

