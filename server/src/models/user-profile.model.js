const mongoose = require("mongoose");

const userProfileSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      // autopopulate: true,
    },
  },
  {
    timestamps: true,
  }
);
userProfileSchema.index({ location: "2dsphere" });

const UserProfile = mongoose.model("UserProfile", userProfileSchema);

module.exports = UserProfile;
