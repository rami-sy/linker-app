/**
 * ✅ Stream Schedule Model
 * نموذج لتخزين معلومات جدولة الستريمات
 */

const mongoose = require('mongoose');

const streamScheduleSchema = new mongoose.Schema(
  {
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
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    scheduledAt: {
      type: Date,
      required: true,
      index: true,
    },
    duration: {
      type: Number, // Expected duration in minutes
      default: 60,
    },
    status: {
      type: String,
      enum: ['scheduled', 'live', 'completed', 'cancelled', 'missed'],
      default: 'scheduled',
      index: true,
    },
    settings: {
      allowAnonymousViewers: {
        type: Boolean,
        default: false,
      },
      maxViewers: {
        type: Number,
        default: 1000,
      },
      allowViewersToSpeak: {
        type: Boolean,
        default: false,
      },
      autoRecord: {
        type: Boolean,
        default: false,
      },
      quality: {
        type: String,
        enum: ['low', 'medium', 'high', 'ultra'],
        default: 'high',
      },
    },
    reminderSent: {
      type: Boolean,
      default: false,
    },
    reminderSentAt: {
      type: Date,
    },
    startedAt: {
      type: Date,
    },
    endedAt: {
      type: Date,
    },
    call: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Call',
    },
    recording: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'StreamRecording',
    },
    cancelledAt: {
      type: Date,
    },
    cancelledBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed, // Additional metadata
    },
  },
  {
    timestamps: true,
  }
);

// ✅ Indexes
streamScheduleSchema.index({ broadcaster: 1, scheduledAt: -1 });
streamScheduleSchema.index({ room: 1, scheduledAt: -1 });
streamScheduleSchema.index({ status: 1, scheduledAt: 1 });
streamScheduleSchema.index({ scheduledAt: 1, status: 1 }); // For finding upcoming streams

// Method to mark as live
streamScheduleSchema.methods.markAsLive = function (callId) {
  this.status = 'live';
  this.startedAt = new Date();
  this.call = callId;
  return this.save();
};

// Method to mark as completed
streamScheduleSchema.methods.markAsCompleted = function (recordingId) {
  this.status = 'completed';
  this.endedAt = new Date();
  if (recordingId) {
    this.recording = recordingId;
  }
  return this.save();
};

// Method to cancel
streamScheduleSchema.methods.cancel = function (userId) {
  this.status = 'cancelled';
  this.cancelledAt = new Date();
  this.cancelledBy = userId;
  return this.save();
};

// Method to mark reminder as sent
streamScheduleSchema.methods.markReminderSent = function () {
  this.reminderSent = true;
  this.reminderSentAt = new Date();
  return this.save();
};

// Static method to find upcoming streams
streamScheduleSchema.statics.findUpcoming = function (limit = 10) {
  return this.find({
    status: 'scheduled',
    scheduledAt: { $gte: new Date() },
  })
    .sort({ scheduledAt: 1 })
    .limit(limit)
    .populate('broadcaster', 'userName firstName lastName images')
    .populate('room', 'name image');
};

// Static method to find streams starting soon (within next hour)
streamScheduleSchema.statics.findStartingSoon = function () {
  const now = new Date();
  const oneHourLater = new Date(now.getTime() + 60 * 60 * 1000);
  
  return this.find({
    status: 'scheduled',
    scheduledAt: { $gte: now, $lte: oneHourLater },
    reminderSent: false,
  })
    .populate('broadcaster', 'userName firstName lastName images')
    .populate('room', 'name image');
};

const StreamSchedule = mongoose.model('StreamSchedule', streamScheduleSchema);

module.exports = StreamSchedule;

