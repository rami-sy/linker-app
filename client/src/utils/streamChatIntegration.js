/**
 * ✅ Stream-Chat Integration Service
 * خدمة لإدارة التكامل بين الستريم والدردشة
 */

import logger from './logger';

/**
 * ✅ Stream-Chat Integration Manager
 * يدير التكامل بين Stream events و Chat state
 */
class StreamChatIntegration {
  constructor(dispatch, updateRoom) {
    this.dispatch = dispatch;
    this.updateRoom = updateRoom;
    this.activeStreams = new Map(); // Map<roomId, { streamId, broadcasterId, startedAt, viewersCount, settings }>
    this.listeners = new Map(); // Map<eventName, Set<listeners>>
  }

  /**
   * ✅ Handle stream started event
   */
  handleStreamStarted({ roomId, streamId, broadcasterId, broadcasterData, settings, startedAt }) {
    try {
      logger.streamEvent('Stream started - updating chat state', { roomId, streamId, broadcasterId });

      // ✅ استخدام viewersCount من settings إذا كان متوفراً، وإلا 0
      const initialViewersCount = settings?.viewersCount !== undefined && settings?.viewersCount !== null 
        ? settings.viewersCount 
        : 0;

      // ✅ Update Redux room state
      // ✅ skipAddIfNotExists: true لمنع إضافة room جديد للمشاهدين
      this.updateRoom({
        _id: roomId,
        hasActiveStream: true,
        activeStreamId: streamId,
        activeStreamBroadcaster: broadcasterData,
        activeStreamStartedAt: startedAt || new Date().toISOString(),
        activeStreamViewersCount: initialViewersCount, // ✅ استخدام viewersCount من settings
        activeStreamSettings: settings || {},
        // ✅ تحديث liveStreamSettings أيضاً للمشاهدين
        liveStreamSettings: {
          ...settings,
          isLive: true,
          startedAt: startedAt || new Date().toISOString(),
          viewersCount: initialViewersCount,
        },
        skipAddIfNotExists: true, // ✅ منع إضافة room جديد للمشاهدين
      });

      // ✅ Store stream info
      this.activeStreams.set(roomId, {
        streamId,
        broadcasterId,
        broadcasterData,
        startedAt: startedAt || new Date().toISOString(),
        viewersCount: initialViewersCount, // ✅ استخدام viewersCount من settings
        settings: settings || {},
      });

      // ✅ Notify listeners
      this.notifyListeners('streamStarted', { roomId, streamId, broadcasterId, settings });

      logger.streamEvent('Chat state updated for stream', { roomId, streamId, viewersCount: initialViewersCount });
    } catch (error) {
      logger.error('Error handling stream started:', error);
    }
  }

  /**
   * ✅ Handle stream ended event
   */
  handleStreamEnded({ roomId, streamId, duration, endedBy }) {
    try {
      logger.streamEvent('Stream ended - updating chat state', { roomId, streamId, duration });

      // ✅ Update Redux room state
      // ✅ skipAddIfNotExists: true لمنع إضافة room جديد للمشاهدين
      this.updateRoom({
        _id: roomId,
        hasActiveStream: false,
        activeStreamId: null,
        activeStreamBroadcaster: null,
        activeStreamStartedAt: null,
        activeStreamViewersCount: 0,
        activeStreamSettings: {},
        lastStreamDuration: duration,
        lastStreamEndedAt: new Date().toISOString(),
        lastStreamEndedBy: endedBy,
        // ✅ تحديث liveStreamSettings أيضاً
        liveStreamSettings: {
          isLive: false,
          endedAt: new Date().toISOString(),
          viewersCount: 0,
        },
        skipAddIfNotExists: true, // ✅ منع إضافة room جديد للمشاهدين
      });

      // ✅ Remove stream info
      this.activeStreams.delete(roomId);

      // ✅ Notify listeners
      this.notifyListeners('streamEnded', { roomId, streamId, duration });

      logger.streamEvent('Chat state updated for stream end', { roomId, streamId });
    } catch (error) {
      logger.error('Error handling stream ended:', error);
    }
  }

  /**
   * ✅ Handle viewer joined stream
   */
  handleViewerJoined({ roomId, userId, userData, viewersCount: serverViewersCount }) {
    try {
      let streamInfo = this.activeStreams.get(roomId);
      
      // ✅ إذا لم يكن الستريم في activeStreams، نحاول إضافته من Redux state
      if (!streamInfo) {
        // ✅ الحصول على room من Redux state (نحتاج إلى طريقة للوصول إليها)
        // لكن في هذه الحالة، سنحاول إضافة الستريم بشكل أساسي من البيانات المتوفرة
        logger.warn('Viewer joined but no active stream found in activeStreams Map', { roomId, userId });
        
        // ✅ محاولة إضافة الستريم بشكل أساسي (سيتم تحديثه لاحقاً عند استقبال liveStreamStarted)
        streamInfo = {
          streamId: roomId,
          broadcasterId: null,
          broadcasterData: null,
          startedAt: new Date().toISOString(),
          viewersCount: serverViewersCount || 0,
          settings: {},
        };
        this.activeStreams.set(roomId, streamInfo);
        logger.streamEvent('Stream added to activeStreams as fallback', { roomId });
      }

      // ✅ استخدام viewersCount من السيرفر إذا كان متوفراً، وإلا نزيده محلياً
      if (serverViewersCount !== undefined && serverViewersCount !== null) {
        streamInfo.viewersCount = serverViewersCount;
      } else {
        streamInfo.viewersCount = (streamInfo.viewersCount || 0) + 1;
      }

      // ✅ Update Redux room state
      this.updateRoom({
        _id: roomId,
        activeStreamViewersCount: streamInfo.viewersCount,
        // ✅ تحديث liveStreamSettings أيضاً
        liveStreamSettings: {
          ...streamInfo.settings,
          isLive: true,
          viewersCount: streamInfo.viewersCount,
        },
        skipAddIfNotExists: true, // ✅ منع إضافة room جديد للمشاهدين
      });

      // ✅ Notify listeners
      this.notifyListeners('viewerJoined', { roomId, userId, userData, viewersCount: streamInfo.viewersCount });

      logger.streamEvent('Viewer joined stream', { roomId, userId, viewersCount: streamInfo.viewersCount });
    } catch (error) {
      logger.error('Error handling viewer joined:', error);
    }
  }

  /**
   * ✅ Handle viewer left stream
   */
  handleViewerLeft({ roomId, userId, viewersCount: serverViewersCount }) {
    try {
      const streamInfo = this.activeStreams.get(roomId);
      if (!streamInfo) {
        logger.warn('Viewer left but no active stream found', { roomId, userId });
        return;
      }

      // ✅ استخدام viewersCount من السيرفر إذا كان متوفراً، وإلا ننقصه محلياً
      if (serverViewersCount !== undefined && serverViewersCount !== null) {
        streamInfo.viewersCount = Math.max(0, serverViewersCount);
      } else {
        streamInfo.viewersCount = Math.max(0, (streamInfo.viewersCount || 0) - 1);
      }

      // ✅ Update Redux room state
      this.updateRoom({
        _id: roomId,
        activeStreamViewersCount: streamInfo.viewersCount,
        // ✅ تحديث liveStreamSettings أيضاً
        liveStreamSettings: {
          ...streamInfo.settings,
          isLive: true,
          viewersCount: streamInfo.viewersCount,
        },
        skipAddIfNotExists: true, // ✅ منع إضافة room جديد للمشاهدين
      });

      // ✅ Notify listeners
      this.notifyListeners('viewerLeft', { roomId, userId, viewersCount: streamInfo.viewersCount });

      logger.streamEvent('Viewer left stream', { roomId, userId, viewersCount: streamInfo.viewersCount });
    } catch (error) {
      logger.error('Error handling viewer left:', error);
    }
  }

  /**
   * ✅ Handle stream comment
   */
  handleStreamComment({ roomId, streamId, comment, userId, userData, timestamp }) {
    try {
      logger.streamEvent('Stream comment received', { roomId, streamId, userId });

      // ✅ Notify listeners (chat component can handle displaying comments)
      this.notifyListeners('streamComment', {
        roomId,
        streamId,
        comment,
        userId,
        userData,
        timestamp: timestamp || new Date().toISOString(),
      });
    } catch (error) {
      logger.error('Error handling stream comment:', error);
    }
  }

  /**
   * ✅ Handle stream reaction
   */
  handleStreamReaction({ roomId, streamId, reaction, userId, userData }) {
    try {
      logger.streamEvent('Stream reaction received', { roomId, streamId, userId, reaction });

      // ✅ Notify listeners
      this.notifyListeners('streamReaction', {
        roomId,
        streamId,
        reaction,
        userId,
        userData,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('Error handling stream reaction:', error);
    }
  }

  /**
   * ✅ Handle stream state change
   */
  handleStreamStateChange({ roomId, oldState, newState, event }) {
    try {
      logger.streamEvent('Stream state changed', { roomId, oldState, newState, event });

      // ✅ Update Redux room state with stream state
      this.updateRoom({
        _id: roomId,
        activeStreamState: newState,
        activeStreamStateChangedAt: new Date().toISOString(),
        skipAddIfNotExists: true, // ✅ منع إضافة room جديد للمشاهدين
      });

      // ✅ Notify listeners
      this.notifyListeners('streamStateChanged', { roomId, oldState, newState, event });
    } catch (error) {
      logger.error('Error handling stream state change:', error);
    }
  }

  /**
   * ✅ Get active stream info for room
   */
  getActiveStreamInfo(roomId) {
    return this.activeStreams.get(roomId) || null;
  }

  /**
   * ✅ Check if room has active stream
   */
  hasActiveStream(roomId) {
    return this.activeStreams.has(roomId);
  }

  /**
   * ✅ Add event listener
   */
  on(eventName, callback) {
    if (!this.listeners.has(eventName)) {
      this.listeners.set(eventName, new Set());
    }
    this.listeners.get(eventName).add(callback);
    return () => this.off(eventName, callback);
  }

  /**
   * ✅ Remove event listener
   */
  off(eventName, callback) {
    if (this.listeners.has(eventName)) {
      this.listeners.get(eventName).delete(callback);
    }
  }

  /**
   * ✅ Notify all listeners for an event
   */
  notifyListeners(eventName, data) {
    if (this.listeners.has(eventName)) {
      this.listeners.get(eventName).forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          logger.error(`Error in listener for ${eventName}:`, error);
        }
      });
    }
  }

  /**
   * ✅ Cleanup
   */
  cleanup() {
    this.activeStreams.clear();
    this.listeners.clear();
    logger.debug('Stream-Chat Integration cleaned up');
  }
}

export default StreamChatIntegration;

