const mongoose = require("mongoose");

const roomSchema = new mongoose.Schema(
  {
    members: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    type: {
      type: String,
      enum: ["private", "public"],
    },
    passwords: [
      {
        user: {
          ref: "User",
          type: mongoose.Schema.Types.ObjectId,
        },
        password: {
          type: String,
        },
      },
    ],
    user: {
      ref: "User",
      type: mongoose.Schema.Types.ObjectId,
    },
    deletedForUsers: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    name: {
      type: String,
    },
    description: {
      type: String,
    },
    image: {
      type: String,
    },
    roles: [
      {
        user: {
          ref: "User",
          type: mongoose.Schema.Types.ObjectId,
        },
        role: {
          type: String,
          enum: ["admin", "moderator", "member"],
        },
      },
    ],
    isGroup: {
      type: Boolean,
    },
    // ✅ Message Request System - for messages from non-friends
    isRequest: {
      type: Boolean,
      default: false,
    },
    requestStatus: {
      type: String,
      enum: ["pending", "accepted", "declined"],
    },
    // ✅ State Version للـ synchronization
    stateVersion: {
      type: Number,
      default: 1,
      required: true,
    },
    // ✅ Room-level Chat Settings (الأولوية العليا للدردشة)
    // تُنسخ من User.defaultChatSettings عند إنشاء الغرفة
    chatSettings: {
      videoCall: {
        type: [String],
        enum: ["everyone", "admin", "moderator", "friends", "specific", "noOne"],
        default: [],
      },
      videoCallAllowedUsers: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      }],
      // Exception list - users excluded even if they match the setting
      videoCallExceptUsers: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      }],
      audioCall: {
        type: [String],
        enum: ["everyone", "admin", "moderator", "friends", "specific", "noOne"],
        default: [],
      },
      audioCallAllowedUsers: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      }],
      audioCallExceptUsers: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      }],
      canSend: {
        type: [String],
        enum: ["everyone", "admin", "moderator", "friends", "specific", "noOne"],
        default: [],
      },
      canSendAllowedUsers: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      }],
      canSendExceptUsers: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      }],
      // Edit Group Info - who can edit group name, photo, and description
      editGroupInfo: {
        type: [String],
        enum: ["everyone", "admin", "moderator", "friends", "specific", "noOne"],
        default: ["admin"],
      },
      editGroupInfoAllowedUsers: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      }],
      editGroupInfoExceptUsers: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      }],
    },
    // ✅ Room-level pre-call settings
    // تستخدم قبل بدء المكالمة وتُنسخ إلى Call.callSettings عند الإنشاء
    callSettings: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    
    // ✅ Auto Delete Timer for temporary/disappearing messages
    // null = disabled, or seconds (86400 = 24h, 604800 = 7d, 7776000 = 90d)
    autoDeleteTimer: {
      type: Number,
      default: null,
      enum: [null, 86400, 604800, 7776000], // off, 24 hours, 7 days, 90 days
    },

    /** End-to-end encryption metadata (room symmetric key wrapped per member) */
    e2ee: {
      enabled: { type: Boolean, default: false },
      keyVersion: { type: Number, default: 0 },
      algorithm: { type: String, default: "linker-e2ee-v1" },
    },
    /** Up to 5 pinned message ids (server enforces max) */
    pinnedMessages: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Message",
      },
    ],
    e2eeKeyPackages: [
      {
        userId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
          required: true,
        },
        keyVersion: { type: Number, required: true },
        ephemeralPublic: { type: String, required: true },
        ciphertext: { type: String, required: true },
        iv: { type: String, required: true },
        aad: { type: String, default: "" },
      },
    ],
    
    // ✅ Granular Admin Permissions - specific capabilities for admins/moderators
    adminPermissions: {
      // Can kick/remove members from the group
      canKickMembers: {
        enabled: { type: Boolean, default: true },
        roles: { type: [String], enum: ["admin", "moderator"], default: ["admin"] },
      },
      // Can delete other users' messages
      canDeleteMessages: {
        enabled: { type: Boolean, default: true },
        roles: { type: [String], enum: ["admin", "moderator"], default: ["admin"] },
      },
      // Can change member roles (promote/demote)
      canManageRoles: {
        enabled: { type: Boolean, default: true },
        roles: { type: [String], enum: ["admin", "moderator"], default: ["admin"] },
      },
      // Can add new members to the group
      canInviteMembers: {
        enabled: { type: Boolean, default: true },
        roles: { type: [String], enum: ["admin", "moderator"], default: ["admin", "moderator"] },
      },
      // Can pin messages
      canPinMessages: {
        enabled: { type: Boolean, default: true },
        roles: { type: [String], enum: ["admin", "moderator"], default: ["admin"] },
      },
      // ✅ NEW: Can modify chat settings (videoCall, audioCall, canSend, editGroupInfo permissions)
      // Default: false - only owner can modify chat settings
      canModifyChatSettings: {
        enabled: { type: Boolean, default: false },
        roles: { type: [String], enum: ["admin", "moderator"], default: [] },
      },
      // ✅ NEW: Can modify call settings during active calls (screenShare, recording, etc.)
      // Default: false - only call initiator/owner can modify
      canModifyCallSettings: {
        enabled: { type: Boolean, default: false },
        roles: { type: [String], enum: ["admin", "moderator"], default: [] },
      },
      // ✅ NEW: Can modify auto-delete timer (disappearing messages)
      // Default: false - only owner can modify
      canModifyAutoDelete: {
        enabled: { type: Boolean, default: false },
        roles: { type: [String], enum: ["admin", "moderator"], default: [] },
      },
    },
  },
  {
    timestamps: true,
  }
);

// ✅ Indexes لتحسين الأداء
// Index للبحث عن الغرف التي ينتمي إليها مستخدم معين
// ⚠️ Cannot create compound index on two array fields (members & deletedForUsers)
roomSchema.index({ members: 1 });
// Index للبحث عن غرفة محددة مع التحقق من العضوية
roomSchema.index({ _id: 1, members: 1 });
// Index للبحث عن الغرف المحذوفة لمستخدم معين
roomSchema.index({ deletedForUsers: 1 });
// ⚠️ Cannot create compound index on two array fields (members & deletedForUsers)
roomSchema.index({ isGroup: 1 });
// Index للبحث عن الغرف حسب النوع
roomSchema.index({ type: 1 });
// ✅ Index للـ stateVersion (للمراقبة والـ conflict resolution)
roomSchema.index({ _id: 1, stateVersion: 1 });
roomSchema.index({ user: 1, updatedAt: -1 });
roomSchema.index({ members: 1, updatedAt: -1 });

// ✅ Middleware لتحديث stateVersion تلقائياً عند التعديل
roomSchema.pre("save", function (next) {
  // تحديث stateVersion فقط عند التعديل (ليس عند الإنشاء)
  if (!this.isNew && this.isModified()) {
    this.stateVersion = (this.stateVersion || 0) + 1;
  }
  next();
});

// ✅ Validation: Room settings should only be used for group chats
// Clear room settings if room is not a group (private chat)
roomSchema.pre("save", function (next) {
  // If this is a private chat (isGroup: false), clear room-level settings
  // Room settings are only meaningful for group chats
  if (this.isGroup === false) {
    // Clear chatSettings (callSettings نُقلت إلى Call model)
    if (this.chatSettings) {
      Object.keys(this.chatSettings).forEach((key) => {
        if (key.endsWith("AllowedUsers")) {
          this.chatSettings[key] = [];
        } else {
          this.chatSettings[key] = [];
        }
      });
    }
  }
  next();
});

// ✅ Method للتحقق من conflict
roomSchema.methods.checkVersionConflict = function (clientVersion) {
  if (clientVersion === undefined || clientVersion === null) {
    return { hasConflict: false, reason: "No client version provided" };
  }

  if (this.stateVersion > clientVersion) {
    return {
      hasConflict: true,
      reason: "Server version is newer",
      serverVersion: this.stateVersion,
      clientVersion: clientVersion,
    };
  }

  return { hasConflict: false };
};

const Room = mongoose.model("Room", roomSchema);

module.exports = Room;
