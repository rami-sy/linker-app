const mongoose = require("mongoose");

const userColorSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    percentage: {
      type: Number,
    },
  },
  { _id: false }
);

const historySchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    percentage: {
      type: Number,
    },
    date: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false }
);

const colorSchema = new mongoose.Schema(
  {
    name: {
      type: String,
    },
    code: {
      type: String,
      unique: true,
      sparse: true,
      lowercase: true,
    },
    users: [userColorSchema],
    history: [historySchema],
  },
  {
    timestamps: true,
  }
);

const Color = mongoose.model("Color", colorSchema);

module.exports = Color;
