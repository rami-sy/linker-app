const mongoose = require("mongoose");

const interestSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Please enter a interest name"],
      unique: true,
    },
  },
  {
    timestamps: true,
  }
);

const Interest = mongoose.model("Interest", interestSchema);

module.exports = Interest;
