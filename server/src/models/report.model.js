const mongoose = require("mongoose");

const reportSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      required: true,
      trim: true,
      enum: [
        "spam",
        "abuse",
        "harassment",
        "impersonation",
        "child_safety",
        "privacy",
        "technical",
        "other",
      ],
    },
    description: {
      type: String,
      required: true,
      trim: true,
      maxlength: 4000,
    },
    email: {
      type: String,
      trim: true,
      default: "",
    },
    reporter: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    targetUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    room: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Room",
      default: null,
      index: true,
    },
    message: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Message",
      default: null,
      index: true,
    },
    status: {
      type: String,
      enum: ["open", "in_review", "resolved", "dismissed"],
      default: "open",
      index: true,
    },
    meta: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

reportSchema.index({ reporter: 1, createdAt: -1 });
reportSchema.index({ type: 1, status: 1, createdAt: -1 });
reportSchema.index({ targetUser: 1, room: 1, message: 1, createdAt: -1 });

module.exports = mongoose.model("Report", reportSchema);
