const mongoose = require("mongoose");

const languageSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Please enter a language name"],
      unique: true,
    },
    label: {
      type: String,
      required: [true, "Please enter a language label"],
      unique: true,
    },
  },
  {
    timestamps: true,
  }
);

const Language = mongoose.model("Language", languageSchema);

module.exports = Language;
