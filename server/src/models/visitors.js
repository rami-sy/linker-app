// models/Visitor.js

const mongoose = require("mongoose");

const visitorSchema = new mongoose.Schema(
  {
    visitor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    visited: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    visitedAt: {
      type: Date,
      default: Date.now,
    },
    count: {
      type: Number,
      default: 1,
    },
  },
  {
    timestamps: true,
  }
);

// منع تكرار نفس الزائر على نفس البروفايل
visitorSchema.index({ visitor: 1, visited: 1 }, { unique: true });

const Visitor = mongoose.model("Visitor", visitorSchema);

module.exports = Visitor;
