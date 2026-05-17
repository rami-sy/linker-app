const mongoose = require("mongoose");

const userSettingsSchema = new mongoose.Schema(
  {
    notifications: {
      type: Boolean,
      default: true,
    },
    isPrivate: {
      type: Boolean,
      default: false,
    },

    theme: {
      type: String,
      enum: ["light", "dark", "auto"], // Assuming you want to specify a theme preference
      default: "light",
    },
    language: {
      type: String,
      default: "en", // Default language
    },
    emailNotifications: {
      type: Boolean,
      default: true,
    },
    showOnlineStatus: {
      type: Boolean,
      default: true,
    },

    showGeoLocation: {
      type: Boolean,
      default: true,
    },
    showLastSeen: {
      type: Boolean,
      default: true,
    },
    showEmail: {
      type: Boolean,
      default: true,
    },
    showPhone: {
      type: Boolean,
      default: true,
    },
    showAddress: {
      type: Boolean,
      default: true,
    },
    showStatus: {
      type: Boolean,
      default: true,
    },
    showFriends: {
      type: Boolean,
      default: true,
    },
    allowComments: {
      type: Boolean,
      default: true,
    },
    allowTags: {
      type: Boolean,
      default: true,
    },
    // allow to send messages to the user form other users
    allowMessages: {
      type: Boolean,
      default: true,
    },
    allowFriendRequests: {
      type: Boolean,
      default: true,
    },

    // add more settings here as needed ...

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
userSettingsSchema.plugin(require("mongoose-autopopulate"));
const UserSettings = mongoose.model("UserSettings", userSettingsSchema);
// First, make sure your UserSettings schema has a geospatial index on the location.coordinates field. If not already done, you can define it in your schema like this:

module.exports = UserSettings;
