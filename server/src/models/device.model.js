const mongoose = require("mongoose");

const deviceSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    deviceId: {
      type: String,
      required: true,
    },
    deviceType: {
      type: String,
    },
    osName: {
      type: String, // نظام التشغيل (مثلاً Windows, Android, iOS)
    },
    ipAddress: {
      type: String, // عنوان IP الخاص بالجهاز
    },
    modelId: {
      type: String,
    },
    modelName: {
      type: String,
    },
    deviceName: {
      type: String,
    },
    lastLogin: {
      type: Date,
      default: Date.now,
    },
    forceLogout: {
      type: Boolean,
      default: false,
    },
    refreshTokenHash: {
      type: String,
      default: null,
    },
    refreshTokenExpiresAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Prevent duplicate device rows per user.
deviceSchema.index({ user: 1, deviceId: 1 }, { unique: true });

const Device = mongoose.model("Device", deviceSchema);

module.exports = Device;
