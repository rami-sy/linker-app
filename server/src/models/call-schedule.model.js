const mongoose = require("mongoose");

const callScheduleSchema = new mongoose.Schema(
  {
    organizer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    participants: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    room: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Room",
    },
    title: {
      type: String,
      trim: true,
      maxlength: 120,
    },
    scheduledAt: {
      type: Date,
      required: true,
      index: true,
    },
    durationMinutes: {
      type: Number,
      default: 30,
      min: 5,
      max: 480,
    },
    status: {
      type: String,
      enum: ["scheduled", "cancelled", "completed"],
      default: "scheduled",
      index: true,
    },
    notes: {
      type: String,
      maxlength: 500,
    },
  },
  { timestamps: true }
);

callScheduleSchema.index({ organizer: 1, scheduledAt: 1 });

module.exports = mongoose.model("CallSchedule", callScheduleSchema);
