/**
 * ✅ Stream Recording Model
 * نموذج لتخزين معلومات تسجيلات الستريمات
 */

const mongoose = require('mongoose');

const streamRecordingSchema = new mongoose.Schema(
  {
    call: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Call',
      required: true,
      index: true,
    },
    room: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Room',
      required: true,
      index: true,
    },
    broadcaster: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ['recording', 'processing', 'completed', 'failed', 'cancelled'],
      default: 'recording',
      index: true,
    },
    startedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    endedAt: {
      type: Date,
    },
    duration: {
      type: Number, // in seconds
      default: 0,
    },
    filePath: {
      type: String, // Path to the recorded file
    },
    fileUrl: {
      type: String, // Public URL for the recording
    },
    fileSize: {
      type: Number, // in bytes
    },
    format: {
      type: String,
      enum: ['mp4', 'webm', 'mkv'],
      default: 'mp4',
    },
    quality: {
      type: String,
      enum: ['low', 'medium', 'high', 'ultra'],
      default: 'high',
    },
    resolution: {
      width: Number,
      height: Number,
    },
    bitrate: {
      type: Number, // in kbps
    },
    fps: {
      type: Number, // frames per second
    },
    thumbnailUrl: {
      type: String, // Thumbnail image URL
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed, // Additional metadata
    },
    error: {
      message: String,
      code: String,
      timestamp: Date,
    },
    viewersCount: {
      type: Number,
      default: 0,
    },
    isPublic: {
      type: Boolean,
      default: false,
      index: true,
    },
    deletedAt: {
      type: Date,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// ✅ Indexes
streamRecordingSchema.index({ broadcaster: 1, startedAt: -1 });
streamRecordingSchema.index({ room: 1, startedAt: -1 });
streamRecordingSchema.index({ status: 1, startedAt: -1 });
streamRecordingSchema.index({ isPublic: 1, status: 1, startedAt: -1 });
streamRecordingSchema.index({ deletedAt: 1, startedAt: -1 });

// Method to calculate duration
streamRecordingSchema.methods.calculateDuration = function () {
  if (this.startedAt && this.endedAt) {
    this.duration = Math.floor((this.endedAt - this.startedAt) / 1000);
  }
  return this.duration;
};

// Method to end recording
streamRecordingSchema.methods.endRecording = function () {
  this.endedAt = new Date();
  this.calculateDuration();
  if (this.status === 'recording') {
    this.status = 'processing';
  }
  return this.save();
};

// Method to mark as completed
streamRecordingSchema.methods.markAsCompleted = function (filePath, fileUrl, fileSize) {
  this.status = 'completed';
  this.filePath = filePath;
  this.fileUrl = fileUrl;
  this.fileSize = fileSize;
  return this.save();
};

// Method to mark as failed
streamRecordingSchema.methods.markAsFailed = function (error) {
  this.status = 'failed';
  this.error = {
    message: error.message || 'Unknown error',
    code: error.code || 'UNKNOWN',
    timestamp: new Date(),
  };
  return this.save();
};

const StreamRecording = mongoose.model('StreamRecording', streamRecordingSchema);

module.exports = StreamRecording;

