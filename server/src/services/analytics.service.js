/**
 * ✅ Analytics Service
 * خدمة لإدارة تحليلات الستريمات
 */

const logger = require('../utils/logger');
const StreamAnalytics = require('../models/stream-analytics.model');
const Call = require('../models/call.model');

class AnalyticsService {
  constructor() {
    this.activeAnalytics = new Map(); // Map<callId, analyticsId>
  }

  /**
   * ✅ Start analytics tracking for a stream
   */
  async startStreamAnalytics(callId, roomId, broadcasterId) {
    try {
      const analytics = new StreamAnalytics({
        call: callId,
        room: roomId,
        broadcaster: broadcasterId,
        startedAt: new Date(),
      });

      await analytics.save();

      // Store in memory
      this.activeAnalytics.set(callId.toString(), analytics._id.toString());

      logger.streamEvent('Stream analytics started', {
        analyticsId: analytics._id,
        callId,
        broadcasterId,
      });

      return analytics;
    } catch (error) {
      logger.error('Error starting stream analytics:', error);
      throw error;
    }
  }

  /**
   * ✅ Update viewer count
   */
  async updateViewerCount(callId, count) {
    try {
      const analyticsId = this.activeAnalytics.get(callId.toString());
      if (!analyticsId) {
        // Try to find active analytics
        const analytics = await StreamAnalytics.findOne({
          call: callId,
          endedAt: null,
        });
        if (analytics) {
          await analytics.updateViewerCount(count);
          return analytics;
        }
        return null;
      }

      const analytics = await StreamAnalytics.findById(analyticsId);
      if (!analytics) {
        this.activeAnalytics.delete(callId.toString());
        return null;
      }

      await analytics.updateViewerCount(count);
      return analytics;
    } catch (error) {
      logger.error('Error updating viewer count:', error);
      throw error;
    }
  }

  /**
   * ✅ Add reaction
   */
  async addReaction(callId, reactionType) {
    try {
      const analyticsId = this.activeAnalytics.get(callId.toString());
      if (!analyticsId) {
        const analytics = await StreamAnalytics.findOne({
          call: callId,
          endedAt: null,
        });
        if (analytics) {
          await analytics.addReaction(reactionType);
          return analytics;
        }
        return null;
      }

      const analytics = await StreamAnalytics.findById(analyticsId);
      if (!analytics) {
        this.activeAnalytics.delete(callId.toString());
        return null;
      }

      await analytics.addReaction(reactionType);
      return analytics;
    } catch (error) {
      logger.error('Error adding reaction:', error);
      throw error;
    }
  }

  /**
   * ✅ Add comment
   */
  async addComment(callId) {
    try {
      const analyticsId = this.activeAnalytics.get(callId.toString());
      if (!analyticsId) {
        const analytics = await StreamAnalytics.findOne({
          call: callId,
          endedAt: null,
        });
        if (analytics) {
          await analytics.addComment();
          return analytics;
        }
        return null;
      }

      const analytics = await StreamAnalytics.findById(analyticsId);
      if (!analytics) {
        this.activeAnalytics.delete(callId.toString());
        return null;
      }

      await analytics.addComment();
      return analytics;
    } catch (error) {
      logger.error('Error adding comment:', error);
      throw error;
    }
  }

  /**
   * ✅ Update network statistics
   */
  async updateNetworkStats(callId, stats) {
    try {
      const analyticsId = this.activeAnalytics.get(callId.toString());
      if (!analyticsId) {
        const analytics = await StreamAnalytics.findOne({
          call: callId,
          endedAt: null,
        });
        if (analytics) {
          if (stats.bitrate) analytics.averageBitrate = stats.bitrate;
          if (stats.latency) analytics.averageLatency = stats.latency;
          if (stats.packetLoss !== undefined) analytics.packetLoss = stats.packetLoss;
          await analytics.save();
          return analytics;
        }
        return null;
      }

      const analytics = await StreamAnalytics.findById(analyticsId);
      if (!analytics) {
        this.activeAnalytics.delete(callId.toString());
        return null;
      }

      if (stats.bitrate) analytics.averageBitrate = stats.bitrate;
      if (stats.latency) analytics.averageLatency = stats.latency;
      if (stats.packetLoss !== undefined) analytics.packetLoss = stats.packetLoss;
      await analytics.save();

      return analytics;
    } catch (error) {
      logger.error('Error updating network stats:', error);
      throw error;
    }
  }

  /**
   * ✅ Finalize analytics
   */
  async finalizeAnalytics(callId) {
    try {
      const analyticsId = this.activeAnalytics.get(callId.toString());
      if (!analyticsId) {
        const analytics = await StreamAnalytics.findOne({
          call: callId,
          endedAt: null,
        });
        if (analytics) {
          await analytics.finalize();
          return analytics;
        }
        return null;
      }

      const analytics = await StreamAnalytics.findById(analyticsId);
      if (!analytics) {
        this.activeAnalytics.delete(callId.toString());
        return null;
      }

      await analytics.finalize();

      // Remove from memory
      this.activeAnalytics.delete(callId.toString());

      logger.streamEvent('Stream analytics finalized', {
        analyticsId: analytics._id,
        callId,
        duration: analytics.duration,
        peakViewers: analytics.peakViewers,
        totalComments: analytics.totalComments,
        totalReactions: analytics.totalReactions,
      });

      return analytics;
    } catch (error) {
      logger.error('Error finalizing analytics:', error);
      throw error;
    }
  }

  /**
   * ✅ Get analytics for a stream
   */
  async getStreamAnalytics(callId) {
    try {
      const analyticsId = this.activeAnalytics.get(callId.toString());
      if (analyticsId) {
        return await StreamAnalytics.findById(analyticsId)
          .populate('broadcaster', 'userName firstName lastName images')
          .populate('room', 'name image');
      }

      return await StreamAnalytics.findOne({ call: callId })
        .sort({ startedAt: -1 })
        .populate('broadcaster', 'userName firstName lastName images')
        .populate('room', 'name image');
    } catch (error) {
      logger.error('Error getting stream analytics:', error);
      throw error;
    }
  }

  /**
   * ✅ Get broadcaster's analytics summary
   */
  async getBroadcasterAnalytics(broadcasterId, limit = 10) {
    try {
      const analytics = await StreamAnalytics.find({
        broadcaster: broadcasterId,
        endedAt: { $ne: null },
      })
        .sort({ startedAt: -1 })
        .limit(limit)
        .populate('room', 'name image')
        .populate('call', 'startedAt endedAt duration');

      // Calculate summary
      const summary = {
        totalStreams: analytics.length,
        totalDuration: analytics.reduce((sum, a) => sum + (a.duration || 0), 0),
        totalViewers: analytics.reduce((sum, a) => sum + (a.totalViewers || 0), 0),
        averageViewers: analytics.length > 0
          ? Math.round(analytics.reduce((sum, a) => sum + (a.averageViewers || 0), 0) / analytics.length)
          : 0,
        peakViewers: Math.max(...analytics.map(a => a.peakViewers || 0), 0),
        totalComments: analytics.reduce((sum, a) => sum + (a.totalComments || 0), 0),
        totalReactions: analytics.reduce((sum, a) => sum + (a.totalReactions || 0), 0),
      };

      return {
        summary,
        streams: analytics,
      };
    } catch (error) {
      logger.error('Error getting broadcaster analytics:', error);
      throw error;
    }
  }
}

// Export singleton instance
const analyticsService = new AnalyticsService();
module.exports = analyticsService;

