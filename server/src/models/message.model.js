const mongoose = require("mongoose");
const messageSchema = new mongoose.Schema(
  {
    room: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Room",
      required: true,
    },
    type: {
      type: String,
      enum: [
        "text",
        "image",
        "video",
        "audio",
        "document",
        "location",
        "poll",
        "sticker",
        "reply",
        "forwarded",
        "linker",
        "call_event",
      ],
      default: "text",
    },
    text: { type: String },
    content: { type: String },
    reactions: [
      {
        reaction: { type: String, required: true },
        user: {
          ref: "User",
          type: mongoose.Schema.Types.ObjectId,
        },
        createdAt: { type: Date, default: Date.now },
      },
    ],
    deliveredTo: [
      {
        ref: "User",
        type: mongoose.Schema.Types.ObjectId,
      },
    ],
    sentTo: [
      {
        ref: "User",
        type: mongoose.Schema.Types.ObjectId,
      },
    ],
    seenBy: [
      {
        ref: "User",
        type: mongoose.Schema.Types.ObjectId,
      },
    ],
    user: {
      ref: "User",
      type: mongoose.Schema.Types.ObjectId,
    },
    forwardedFrom: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    forwardedAt: {
      type: Date,
    },
    replyTo: {
      type: String,
      default: null,
    },
    /** Root message id for replies inside a thread (same room) */
    threadRoot: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Message",
      default: null,
      index: true,
    },
    deletedForAll: {
      type: Boolean,
      default: false,
    },
    deletedForUsers: [
      {
        ref: "User",
        type: mongoose.Schema.Types.ObjectId,
      },
    ],
    uuId: {
      type: String,
    },
    /** Optional delayed delivery timestamp (sender-visible until dispatched). */
    scheduledAt: {
      type: Date,
      default: null,
      index: true,
    },
    /** Scheduler lifecycle state for delayed messages. */
    scheduleStatus: {
      type: String,
      enum: ["none", "scheduled", "sent", "cancelled", "failed"],
      default: "none",
      index: true,
    },
    /** Actual dispatch time for scheduled messages when they become visible to others. */
    dispatchedAt: {
      type: Date,
      default: null,
      index: true,
    },
    // ✅ Call Reference - for live stream message isolation
    call: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Call",
      required: false, // Optional - only set for live stream messages
      index: true, // For efficient querying of call-specific messages
    },
    senderSnapshot: {
      _id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
      userId: {
        type: String,
      },
      userName: { type: String },
      firstName: { type: String },
      lastName: { type: String },
      email: { type: String },
      images: [
        {
          path: String,
          thumbnail: String,
        },
      ],
      role: { type: String },
      // ✅ Add colors array for avatar display (UserImage will extract colors[0].code)
      colors: [
        {
          _id: mongoose.Schema.Types.ObjectId,
          name: String,
          code: String,
        },
      ],
    },
    // ✅ Expiration date for temporary/disappearing messages
    // Set based on room.autoDeleteTimer when message is created
    expiresAt: {
      type: Date,
      default: null,
      index: true, // Index for efficient cleanup queries
    },
    // ✅ State Version للـ synchronization
    stateVersion: {
      type: Number,
      default: 1,
      required: true,
    },
    editedAt: {
      type: Date,
      default: null,
    },
    /** Group chat @mentions — user ids (validated against room members on send) */
    mentions: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    /** Server-fetched Open Graph preview for the first URL in plaintext text messages */
    linkPreview: {
      url: { type: String },
      title: { type: String },
      description: { type: String },
      image: { type: String },
      siteName: { type: String },
      fetchedAt: { type: Date },
    },
    /** Encrypted payload (plaintext only on clients) */
    e2ee: {
      v: { type: Number },
      iv: { type: String },
      ciphertext: { type: String },
      aadVersion: { type: Number, default: 0 },
    },
    /** Ed25519 signature (hex) over signed payload */
    e2eeSignature: { type: String },
    /** Sender Ed25519 public key at send time (hex, 32 bytes) for signature verification */
    e2eeSignerPublic: { type: String },
    /** Server-authored call outcome rows for chat timeline */
    callEvent: {
      eventKind: {
        type: String,
        enum: ["missed", "rejected", "cancelled", "answered"],
      },
      status: {
        type: String,
        enum: ["missed", "rejected", "cancelled", "answered"],
      },
      isVideoCall: { type: Boolean, default: false },
      duration: { type: Number, default: 0 },
      endedAt: { type: Date },
      callId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Call",
      },
      actorUserId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
      callerUserId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
      actorSnapshot: {
        _id: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
        userId: { type: String },
        userName: { type: String },
        firstName: { type: String },
        lastName: { type: String },
        images: [
          {
            path: String,
            thumbnail: String,
          },
        ],
      },
      callerSnapshot: {
        _id: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
        userId: { type: String },
        userName: { type: String },
        firstName: { type: String },
        lastName: { type: String },
        images: [
          {
            path: String,
            thumbnail: String,
          },
        ],
      },
      isGroupCall: { type: Boolean, default: false },
      starterUserId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
      starterSnapshot: {
        _id: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
        userId: { type: String },
        userName: { type: String },
        firstName: { type: String },
        lastName: { type: String },
        images: [
          {
            path: String,
            thumbnail: String,
          },
        ],
      },
      endedByUserId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
      endedBySnapshot: {
        _id: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
        userId: { type: String },
        userName: { type: String },
        firstName: { type: String },
        lastName: { type: String },
        images: [
          {
            path: String,
            thumbnail: String,
          },
        ],
      },
      participantsSummary: {
        totalMembers: { type: Number, default: 0 },
        joinedMembers: { type: Number, default: 0 },
        activeMembers: { type: Number, default: 0 },
        answeredMembers: { type: Number, default: 0 },
      },
    },
  },
  { timestamps: true }
);

// ✅ Indexes لتحسين الأداء
// Index للبحث عن الرسائل في غرفة معينة (الأكثر استخداماً)
messageSchema.index({ room: 1, createdAt: -1 });
// Index للبحث عن الرسائل المرسلة من مستخدم معين
messageSchema.index({ user: 1, createdAt: -1 });
// Index للبحث عن الرسائل المحذوفة
messageSchema.index({ deletedForAll: 1, deletedForUsers: 1 });
// Index للبحث عن الرسائل غير المقروءة
messageSchema.index({ room: 1, seenBy: 1, createdAt: -1 });
// Index للبحث عن الرسائل المرسلة إلى مستخدمين معينين
messageSchema.index({ sentTo: 1, createdAt: -1 });
// Index للبحث عن الرسائل المرسلة إلى مستخدم معين
messageSchema.index({ deliveredTo: 1, createdAt: -1 });
// Compound index للبحث السريع عن الرسائل في غرفة معينة مع استثناء المحذوفة
messageSchema.index({
  room: 1,
  deletedForAll: 1,
  deletedForUsers: 1,
  createdAt: -1,
});
// Index للبحث عن الرسائل حسب النوع
messageSchema.index({ room: 1, type: 1, createdAt: -1 });
// Scheduled dispatch scans
messageSchema.index({ scheduleStatus: 1, scheduledAt: 1, room: 1 });
// ✅ Index للرسائل حسب المكالمة (live stream messages)
messageSchema.index({ call: 1, createdAt: -1 });
// ✅ Compound index للبحث السريع عن رسائل call معين في room معين
messageSchema.index({ room: 1, call: 1, createdAt: -1 });
// ✅ Index للـ stateVersion (للمراقبة والـ conflict resolution)
messageSchema.index({ _id: 1, stateVersion: 1 });
// Thread replies in a room
messageSchema.index({ room: 1, threadRoot: 1, createdAt: -1 });
// Server-authored call event rows
messageSchema.index({ room: 1, type: 1, "callEvent.callId": 1, createdAt: -1 });

// ✅ Middleware لتحديث stateVersion تلقائياً عند التعديل
messageSchema.pre("save", function (next) {
  // تحديث stateVersion فقط عند التعديل (ليس عند الإنشاء)
  if (!this.isNew && this.isModified()) {
    this.stateVersion = (this.stateVersion || 0) + 1;
  }
  next();
});

// ✅ Method للتحقق من conflict
messageSchema.methods.checkVersionConflict = function (clientVersion) {
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

const Message = mongoose.model("Message", messageSchema);

module.exports = Message;
