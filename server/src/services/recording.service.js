/**
 * ✅ Recording Service
 * خدمة لإدارة تسجيلات الستريمات والمكالمات
 */

const logger = require('../utils/logger');
const StreamRecording = require('../models/stream-recording.model');
const CallRecording = require('../models/call-recording.model');
const path = require('path');
const fs = require('fs').promises;
const { promisify } = require('util');

class RecordingService {
  constructor() {
    this.recordings = new Map(); // Map<callId, recordingInfo>
    this.recordingPath = process.env.RECORDING_PATH || path.join(__dirname, '../../recordings');
    this.ensureRecordingDirectory();
  }

  /**
   * ✅ Ensure recording directory exists
   */
  async ensureRecordingDirectory() {
    try {
      await fs.mkdir(this.recordingPath, { recursive: true });
      logger.info('Recording directory ensured:', this.recordingPath);
    } catch (error) {
      logger.error('Error creating recording directory:', error);
    }
  }

  /**
   * ✅ Start recording a stream
   */
  async startStreamRecording(callId, roomId, broadcasterId, options = {}) {
    try {
      const recording = new StreamRecording({
        call: callId,
        room: roomId,
        broadcaster: broadcasterId,
        status: 'recording',
        quality: options.quality || 'high',
        format: options.format || 'mp4',
        resolution: options.resolution || { width: 1920, height: 1080 },
        bitrate: options.bitrate || 5000,
        fps: options.fps || 30,
        isPublic: options.isPublic || false,
      });

      await recording.save();

      // Store recording info in memory
      this.recordings.set(callId.toString(), {
        recordingId: recording._id,
        type: 'stream',
        startedAt: recording.startedAt,
      });

      logger.callEvent('Stream recording started', {
        recordingId: recording._id,
        callId,
        broadcasterId,
      });

      return recording;
    } catch (error) {
      logger.error('Error starting stream recording:', error);
      throw error;
    }
  }

  /**
   * ✅ Start recording a call
   */
  async startCallRecording(callId, roomId, callerId, participants, isVideoCall, options = {}) {
    try {
      const recording = new CallRecording({
        call: callId,
        room: roomId,
        caller: callerId,
        participants: participants || [],
        isVideoCall: isVideoCall || false,
        status: 'recording',
        quality: options.quality || 'high',
        format: options.format || (isVideoCall ? 'mp4' : 'mp3'),
        resolution: isVideoCall ? (options.resolution || { width: 1280, height: 720 }) : undefined,
        bitrate: options.bitrate || (isVideoCall ? 3000 : 128),
        fps: isVideoCall ? (options.fps || 30) : undefined,
        isPublic: options.isPublic || false,
      });

      await recording.save();

      // Store recording info in memory
      this.recordings.set(callId.toString(), {
        recordingId: recording._id,
        type: 'call',
        startedAt: recording.startedAt,
      });

      logger.callEvent('Call recording started', {
        recordingId: recording._id,
        callId,
        callerId,
        isVideoCall,
      });

      return recording;
    } catch (error) {
      logger.error('Error starting call recording:', error);
      throw error;
    }
  }

  /**
   * ✅ Stop recording
   */
  async stopRecording(callId) {
    try {
      const recordingInfo = this.recordings.get(callId.toString());
      
      // ✅ If not in memory, try to find in database
      if (!recordingInfo) {
        logger.warn(`Recording not found in memory for callId: ${callId}, searching in database...`);
        
        // Try to find in database
        let recording = await StreamRecording.findOne({ call: callId, status: { $in: ['recording', 'processing'] } });
        if (!recording) {
          recording = await CallRecording.findOne({ call: callId, status: { $in: ['recording', 'processing'] } });
        }
        
        if (recording) {
          // Found in database, end it
          await recording.endRecording();
          logger.callEvent('Recording stopped from database', {
            recordingId: recording._id,
            callId,
            duration: recording.duration,
          });
          return recording;
        }
        
        throw new Error('Recording not found in memory or database');
      }

      let recording;
      if (recordingInfo.type === 'stream') {
        recording = await StreamRecording.findById(recordingInfo.recordingId);
      } else {
        recording = await CallRecording.findById(recordingInfo.recordingId);
      }

      if (!recording) {
        throw new Error('Recording document not found');
      }

      await recording.endRecording();

      // Remove from memory
      this.recordings.delete(callId.toString());

      logger.callEvent('Recording stopped', {
        recordingId: recording._id,
        callId,
        duration: recording.duration,
      });

      return recording;
    } catch (error) {
      logger.error('Error stopping recording:', error);
      throw error;
    }
  }

  /**
   * ✅ Mark recording as completed with file info
   */
  async markRecordingCompleted(callId, filePath, fileUrl, fileSize) {
    try {
      const recordingInfo = this.recordings.get(callId.toString());
      if (!recordingInfo) {
        // Try to find by callId
        let recording = await StreamRecording.findOne({ call: callId, status: 'processing' });
        if (!recording) {
          recording = await CallRecording.findOne({ call: callId, status: 'processing' });
        }
        if (recording) {
          await recording.markAsCompleted(filePath, fileUrl, fileSize);
          return recording;
        }
        throw new Error('Recording not found');
      }

      let recording;
      if (recordingInfo.type === 'stream') {
        recording = await StreamRecording.findById(recordingInfo.recordingId);
      } else {
        recording = await CallRecording.findById(recordingInfo.recordingId);
      }

      if (!recording) {
        throw new Error('Recording document not found');
      }

      await recording.markAsCompleted(filePath, fileUrl, fileSize);

      logger.callEvent('Recording marked as completed', {
        recordingId: recording._id,
        callId,
        fileUrl,
        fileSize,
      });

      // ✅ إشعار المستخدمين عند اكتمال التسجيل
      // سيتم إرسال الإشعار من خلال Socket handler
      // لأن recording service لا يمكنه الوصول إلى io مباشرة

      return recording;
    } catch (error) {
      logger.error('Error marking recording as completed:', error);
      throw error;
    }
  }

  /**
   * ✅ Mark recording as failed
   */
  async markRecordingFailed(callId, error) {
    try {
      const recordingInfo = this.recordings.get(callId.toString());
      if (!recordingInfo) {
        // Try to find by callId
        let recording = await StreamRecording.findOne({ call: callId, status: { $in: ['recording', 'processing'] } });
        if (!recording) {
          recording = await CallRecording.findOne({ call: callId, status: { $in: ['recording', 'processing'] } });
        }
        if (recording) {
          await recording.markAsFailed(error);
          return recording;
        }
        throw new Error('Recording not found');
      }

      let recording;
      if (recordingInfo.type === 'stream') {
        recording = await StreamRecording.findById(recordingInfo.recordingId);
      } else {
        recording = await CallRecording.findById(recordingInfo.recordingId);
      }

      if (!recording) {
        throw new Error('Recording document not found');
      }

      await recording.markAsFailed(error);

      // Remove from memory
      this.recordings.delete(callId.toString());

      logger.error('Recording marked as failed', {
        recordingId: recording._id,
        callId,
        error: error.message,
      });

      return recording;
    } catch (error) {
      logger.error('Error marking recording as failed:', error);
      throw error;
    }
  }

  /**
   * ✅ Get recording info
   */
  async getRecordingInfo(callId) {
    try {
      const recordingInfo = this.recordings.get(callId.toString());
      if (recordingInfo) {
        if (recordingInfo.type === 'stream') {
          return await StreamRecording.findById(recordingInfo.recordingId);
        } else {
          return await CallRecording.findById(recordingInfo.recordingId);
        }
      }

      // Try to find in database
      let recording = await StreamRecording.findOne({ call: callId }).sort({ startedAt: -1 });
      if (!recording) {
        recording = await CallRecording.findOne({ call: callId }).sort({ startedAt: -1 });
      }

      return recording;
    } catch (error) {
      logger.error('Error getting recording info:', error);
      throw error;
    }
  }

  /**
   * ✅ Get user's recordings
   */
  async getUserRecordings(userId, type = 'all', limit = 20, offset = 0) {
    try {
      const query = type === 'stream' 
        ? { broadcaster: userId, deletedAt: null }
        : type === 'call'
        ? { caller: userId, deletedAt: null }
        : { $or: [{ broadcaster: userId }, { caller: userId }], deletedAt: null };

      const streamRecordings = type === 'call' ? [] : await StreamRecording.find(query)
        .sort({ startedAt: -1 })
        .limit(limit)
        .skip(offset)
        .populate('call', 'room startedAt endedAt')
        .populate('room', 'name image')
        .populate('broadcaster', 'userName firstName lastName images');

      const callRecordings = type === 'stream' ? [] : await CallRecording.find(
        type === 'all' ? { caller: userId, deletedAt: null } : query
      )
        .sort({ startedAt: -1 })
        .limit(limit)
        .skip(offset)
        .populate('call', 'room startedAt endedAt')
        .populate('room', 'name image')
        .populate('caller', 'userName firstName lastName images')
        .populate('participants', 'userName firstName lastName images');

      return {
        streamRecordings: streamRecordings || [],
        callRecordings: callRecordings || [],
        total: (streamRecordings?.length || 0) + (callRecordings?.length || 0),
      };
    } catch (error) {
      logger.error('Error getting user recordings:', error);
      throw error;
    }
  }

  /**
   * ✅ Delete recording (soft delete)
   */
  async deleteRecording(recordingId, userId, type = 'auto') {
    try {
      let recording;
      if (type === 'stream') {
        recording = await StreamRecording.findById(recordingId);
      } else if (type === 'call') {
        recording = await CallRecording.findById(recordingId);
      } else {
        // Auto-detect
        recording = await StreamRecording.findById(recordingId);
        if (!recording) {
          recording = await CallRecording.findById(recordingId);
        }
      }

      if (!recording) {
        throw new Error('Recording not found');
      }

      // Check ownership
      const ownerId = recording.broadcaster || recording.caller;
      if (ownerId.toString() !== userId.toString()) {
        throw new Error('Unauthorized: You can only delete your own recordings');
      }

      recording.deletedAt = new Date();
      await recording.save();

      logger.callEvent('Recording deleted', {
        recordingId: recording._id,
        userId,
      });

      return recording;
    } catch (error) {
      logger.error('Error deleting recording:', error);
      throw error;
    }
  }
}

// Export singleton instance
const recordingService = new RecordingService();
module.exports = recordingService;

