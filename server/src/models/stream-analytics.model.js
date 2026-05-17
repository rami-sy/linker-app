/**
 * ✅ Stream Analytics Model
 * نموذج لتخزين إحصائيات وتحليلات الستريمات
 */

const mongoose = require('mongoose');

const streamAnalyticsSchema = new mongoose.Schema(
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
    // Viewer statistics
    peakViewers: {
      type: Number,
      default: 0,
    },
    averageViewers: {
      type: Number,
      default: 0,
    },
    totalViewers: {
      type: Number,
      default: 0, // Total unique viewers
    },
    viewersData: [
      {
        timestamp: Date,
        count: Number,
      },
    ],
    // Engagement statistics
    totalComments: {
      type: Number,
      default: 0,
    },
    totalReactions: {
      type: Number,
      default: 0,
    },
    reactionsBreakdown: {
      like: { type: Number, default: 0 },
      love: { type: Number, default: 0 },
      laugh: { type: Number, default: 0 },
      wow: { type: Number, default: 0 },
      sad: { type: Number, default: 0 },
      angry: { type: Number, default: 0 },
      fire: { type: Number, default: 0 },
      clap: { type: Number, default: 0 },
    },
    // Network statistics
    averageBitrate: {
      type: Number, // in kbps
      default: 0,
    },
    averageLatency: {
      type: Number, // in ms
      default: 0,
    },
    packetLoss: {
      type: Number, // percentage
      default: 0,
    },
    // Geographic statistics
    viewersByCountry: [
      {
        country: String,
        count: Number,
      },
    ],
    // Device statistics
    viewersByDevice: {
      mobile: { type: Number, default: 0 },
      desktop: { type: Number, default: 0 },
      tablet: { type: Number, default: 0 },
    },
    // Time-based statistics
    startedAt: {
      type: Date,
      required: true,
      index: true,
    },
    endedAt: {
      type: Date,
      index: true,
    },
    duration: {
      type: Number, // in seconds
      default: 0,
    },
    // Retention statistics
    averageWatchTime: {
      type: Number, // in seconds
      default: 0,
    },
    retentionData: [
      {
        timestamp: Date, // Time from start
        percentage: Number, // Percentage of viewers still watching
      },
    ],
  },
  {
    timestamps: true,
  }
);

// ✅ Indexes
streamAnalyticsSchema.index({ broadcaster: 1, startedAt: -1 });
streamAnalyticsSchema.index({ room: 1, startedAt: -1 });
streamAnalyticsSchema.index({ call: 1 });
streamAnalyticsSchema.index({ startedAt: -1 });

// Method to update viewer count
streamAnalyticsSchema.methods.updateViewerCount = function (count) {
  if (count > this.peakViewers) {
    this.peakViewers = count;
  }
  
  // Add to viewersData (keep last 1000 entries)
  this.viewersData.push({
    timestamp: new Date(),
    count,
  });
  
  if (this.viewersData.length > 1000) {
    this.viewersData.shift();
  }
  
  // Calculate average viewers
  if (this.viewersData.length > 0) {
    const sum = this.viewersData.reduce((acc, data) => acc + data.count, 0);
    this.averageViewers = Math.round(sum / this.viewersData.length);
  }
  
  return this.save();
};

// Method to add reaction
streamAnalyticsSchema.methods.addReaction = function (reactionType) {
  this.totalReactions++;
  if (this.reactionsBreakdown[reactionType] !== undefined) {
    this.reactionsBreakdown[reactionType]++;
  }
  return this.save();
};

// Method to add comment
streamAnalyticsSchema.methods.addComment = function () {
  this.totalComments++;
  return this.save();
};

// Method to finalize analytics
streamAnalyticsSchema.methods.finalize = function () {
  this.endedAt = new Date();
  if (this.startedAt) {
    this.duration = Math.floor((this.endedAt - this.startedAt) / 1000);
  }
  return this.save();
};

const StreamAnalytics = mongoose.model('StreamAnalytics', streamAnalyticsSchema);

module.exports = StreamAnalytics;

