const mongoose = require("mongoose");

const callSchema = new mongoose.Schema(
  {
    room: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Room",
      required: true,
    },
    caller: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    participants: [
      {
        user: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
          required: true,
        },
        joinedAt: {
          type: Date,
          default: Date.now,
        },
        leftAt: {
          type: Date,
        },
        duration: {
          type: Number, // in seconds
          default: 0,
        },
      },
    ],
    isVideoCall: {
      type: Boolean,
      default: false,
    },
    startedAt: {
      type: Date,
      default: Date.now,
    },
    endedAt: {
      type: Date,
    },
    duration: {
      type: Number, // total duration in seconds
      default: 0,
    },
    status: {
      type: String,
      enum: ["missed", "rejected", "answered", "cancelled"],
      default: "answered",
    },
    endedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    deletedForUsers: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    // ✅ Live Streaming Fields - نقلت من Room لأن الستريم مرتبط بمكالمة محددة
    isLiveStream: {
      type: Boolean,
      default: false,
    },
    liveStreamSettings: {
      allowAnonymousViewers: {
        type: Boolean,
        default: false,
      },
      maxViewers: {
        type: Number,
        default: 1000,
      },
      allowViewersToSpeak: {
        type: Boolean,
        default: false,
      },
      isLive: {
        type: Boolean,
        default: false,
      },
      startedAt: Date,
      endedAt: Date,
      viewersCount: {
        type: Number,
        default: 0,
      },
    },
    broadcasters: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    // ✅ Voicemail
    voicemail: {
      filePath: {
        type: String, // Path to the voicemail audio file
      },
      fileUrl: {
        type: String, // Public URL for the voicemail
      },
      duration: {
        type: Number, // Duration in milliseconds
      },
      recordedAt: {
        type: Date,
      },
      leftBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    },
    // ✅ Group Call Settings
    isGroupCall: {
      type: Boolean,
      default: false,
    },
    groupCallSettings: {
      maxParticipants: {
        type: Number,
        default: 50, // Based on mediaConfig.room.maxPeers
      },
      requireApproval: {
        type: Boolean,
        default: false,
      },
      muteOnJoin: {
        type: Boolean,
        default: false,
      },
      allowScreenShare: {
        type: Boolean,
        default: true,
      },
      allowRecording: {
        type: Boolean,
        default: false,
      },
      host: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
      moderators: [
        {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
      ],
    },
    // ✅ Raise Hand (Group Calls)
    raisedHands: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    speakingLocks: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    handRaisePriorities: [
      {
        user: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
        priority: {
          type: Number,
          default: 0,
        },
      },
    ],
    // ✅ Call-level Settings (الأولوية العليا داخل المكالمة)
    // تُنسخ من caller.defaultCallSettings عند إنشاء المكالمة
    callSettings: {
      screenShare: {
        type: [String],
        enum: ["everyone", "admin", "moderator", "friends", "specific", "noOne"],
        default: ["everyone"],
      },
      screenShareAllowedUsers: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      }],
      screenShareExceptUsers: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      }],
      recording: {
        type: [String],
        enum: ["everyone", "admin", "moderator", "friends", "specific", "noOne"],
        default: ["noOne"],
      },
      recordingAllowedUsers: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      }],
      recordingExceptUsers: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      }],
      callTransfer: {
        type: [String],
        enum: ["everyone", "admin", "moderator", "friends", "specific", "noOne"],
        default: ["admin"],
      },
      callTransferAllowedUsers: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      }],
      callTransferExceptUsers: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      }],
      liveStream: {
        type: [String],
        enum: ["everyone", "admin", "moderator", "friends", "specific", "noOne"],
        default: ["admin"],
      },
      liveStreamAllowedUsers: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      }],
      liveStreamExceptUsers: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      }],
      muteOthers: {
        type: [String],
        enum: ["everyone", "admin", "moderator", "friends", "specific", "noOne"],
        default: ["admin"],
      },
      muteOthersAllowedUsers: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      }],
      muteOthersExceptUsers: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      }],
      kickFromCall: {
        type: [String],
        enum: ["everyone", "admin", "moderator", "friends", "specific", "noOne"],
        default: ["admin"],
      },
      kickFromCallAllowedUsers: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      }],
      kickFromCallExceptUsers: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      }],
      endCallForAll: {
        type: [String],
        enum: ["everyone", "admin", "moderator", "friends", "specific", "noOne"],
        default: ["admin"],
      },
      endCallForAllAllowedUsers: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      }],
      endCallForAllExceptUsers: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      }],
    },
    // ✅ Call Admins - المستخدمين المعينين كأدمن للمكالمة من قبل المنشئ
    callAdmins: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
  },
  {
    timestamps: true,
  }
);

// ✅ Indexes لتحسين الأداء
// Index للبحث عن المكالمات في غرفة معينة (مرتبة حسب تاريخ البدء)
callSchema.index({ room: 1, startedAt: -1 });
// Index للبحث عن المكالمات التي بدأها مستخدم معين
callSchema.index({ caller: 1, startedAt: -1 });
// Index للبحث عن المكالمات التي شارك فيها مستخدم معين
callSchema.index({ "participants.user": 1, startedAt: -1 });
// ✅ Index للستريم النشط
callSchema.index({ "liveStreamSettings.isLive": 1, endedAt: 1 });
callSchema.index({ isLiveStream: 1, "liveStreamSettings.isLive": 1 });
// ✅ Index للمكالمات النشطة (غير المنتهية)
callSchema.index({ endedAt: 1, startedAt: -1 });
// ✅ Index للمكالمات المحذوفة لمستخدم معين
callSchema.index({ deletedForUsers: 1, startedAt: -1 });
// ✅ Compound index للبحث السريع عن المكالمات النشطة في غرفة معينة
callSchema.index({ room: 1, endedAt: 1, startedAt: -1 });
// ✅ Index للبحث عن المكالمات حسب الحالة
callSchema.index({ status: 1, startedAt: -1 });
// ✅ Index للبحث عن broadcasters في ستريم نشط
callSchema.index({ broadcasters: 1, "liveStreamSettings.isLive": 1 });
// ✅ Compound index محسّن للـ getCallHistory query (caller + deletedForUsers + startedAt)
// ⚠️ لا يمكن استخدام compound index مع deletedForUsers (array) و caller (non-array) في نفس الوقت
// ✅ استخدام index منفصل لكل field
// ✅ Compound index محسّن للـ getCallHistory query (participants.user + startedAt)
// ⚠️ لا يمكن استخدام compound index مع deletedForUsers (array) و participants.user (array) في نفس الوقت
// ✅ استخدام index منفصل لكل field
// ✅ Index للمكالمات الجماعية
callSchema.index({ isGroupCall: 1, endedAt: 1, startedAt: -1 });

// Method to calculate duration
callSchema.methods.calculateDuration = function () {
  if (!this.endedAt) {
    this.duration = 0;
    return this.duration;
  }

  // For normal calls, duration starts when someone answers (first non-caller joinedAt).
  // For live streams, keep using call startedAt.
  const callerId = this.caller?.toString?.() || String(this.caller || "");
  const participants = Array.isArray(this.participants) ? this.participants : [];
  const answeredAtMs = participants
    .filter((participant) => {
      const participantUserId =
        participant?.user?.toString?.() || String(participant?.user || "");
      return !!participantUserId && participantUserId !== callerId;
    })
    .map((participant) => {
      if (!participant?.joinedAt) return null;
      const ms = new Date(participant.joinedAt).getTime();
      return Number.isFinite(ms) ? ms : null;
    })
    .filter((ms) => ms !== null)
    .sort((a, b) => a - b)[0];

  const startedAtMs = this.startedAt ? new Date(this.startedAt).getTime() : null;
  const effectiveStartMs = this.isLiveStream
    ? startedAtMs
    : Number.isFinite(answeredAtMs)
      ? answeredAtMs
      : null;
  const endedAtMs = new Date(this.endedAt).getTime();

  if (!Number.isFinite(effectiveStartMs) || !Number.isFinite(endedAtMs)) {
    this.duration = 0;
    return this.duration;
  }

  this.duration = Math.max(0, Math.floor((endedAtMs - effectiveStartMs) / 1000));
  return this.duration;
};

// Method to end call
callSchema.methods.endCall = function (endedByUserId) {
  this.endedAt = new Date();
  this.calculateDuration();

  const callerId = this.caller?.toString?.() || String(this.caller || "");
  const participants = Array.isArray(this.participants) ? this.participants : [];
  const answeredAtMs = participants
    .filter((participant) => {
      const participantUserId =
        participant?.user?.toString?.() || String(participant?.user || "");
      return !!participantUserId && participantUserId !== callerId;
    })
    .map((participant) => {
      if (!participant?.joinedAt) return null;
      const ms = new Date(participant.joinedAt).getTime();
      return Number.isFinite(ms) ? ms : null;
    })
    .filter((ms) => ms !== null)
    .sort((a, b) => a - b)[0];
  const effectiveStartMs = this.isLiveStream
    ? this.startedAt
      ? new Date(this.startedAt).getTime()
      : null
    : Number.isFinite(answeredAtMs)
      ? answeredAtMs
      : null;
  const endedAtMs = this.endedAt ? new Date(this.endedAt).getTime() : null;
  
  // Update participants who are still in call
  this.participants.forEach((participant) => {
    if (!participant.leftAt) {
      participant.leftAt = this.endedAt;
      const joinedAtMs = participant?.joinedAt
        ? new Date(participant.joinedAt).getTime()
        : null;
      const participantStartMs = Number.isFinite(effectiveStartMs)
        ? Math.max(joinedAtMs || effectiveStartMs, effectiveStartMs)
        : joinedAtMs;
      if (!Number.isFinite(participantStartMs) || !Number.isFinite(endedAtMs)) {
        participant.duration = 0;
      } else {
        participant.duration = Math.max(
          0,
          Math.floor((endedAtMs - participantStartMs) / 1000)
        );
      }
    }
  });
  
  // ✅ إنهاء الستريم تلقائياً عند انتهاء المكالمة
  if (this.isLiveStream && this.liveStreamSettings?.isLive) {
    this.liveStreamSettings.isLive = false;
    this.liveStreamSettings.endedAt = this.endedAt;
    this.liveStreamSettings.viewersCount = 0;
  }
  
  if (endedByUserId) {
    this.endedBy = endedByUserId;
  }
  
  return this.save();
};

// ✅ Method to add participant to group call
callSchema.methods.addParticipant = function (userId) {
  const existingParticipant = this.participants.find(
    p => p.user.toString() === userId.toString()
  );
  
  if (!existingParticipant) {
    this.participants.push({
      user: userId,
      joinedAt: new Date(),
    });
  }
  
  return this.save();
};

// ✅ Method to remove participant from group call
callSchema.methods.removeParticipant = function (userId) {
  const participant = this.participants.find(
    p => p.user.toString() === userId.toString() && !p.leftAt
  );
  
  if (participant) {
    participant.leftAt = new Date();
    participant.duration = Math.floor(
      (participant.leftAt - participant.joinedAt) / 1000
    );
  }
  
  return this.save();
};

// ✅ Method to check if user is moderator
callSchema.methods.isModerator = function (userId) {
  if (!this.isGroupCall) return false;
  return this.groupCallSettings.moderators.some(
    id => id.toString() === userId.toString()
  ) || this.groupCallSettings.host?.toString() === userId.toString();
};

// ✅ Method to check if user is host
callSchema.methods.isHost = function (userId) {
  if (!this.isGroupCall) return false;
  return this.groupCallSettings.host?.toString() === userId.toString();
};

// ✅ Method to check if user is call admin (caller + callAdmins + room admins)
callSchema.methods.isCallAdmin = function (userId, roomRoles = []) {
  const userIdStr = userId?.toString();
  
  // 1. Check if user is the caller (call initiator)
  if (this.caller?.toString() === userIdStr) {
    return true;
  }
  
  // 2. Check if user is in callAdmins
  if (this.callAdmins?.some(id => id?.toString() === userIdStr)) {
    return true;
  }
  
  // 3. Check if user is admin in the room
  const userRole = roomRoles?.find(
    role => role.user?.toString() === userIdStr
  );
  if (userRole?.role === "admin") {
    return true;
  }
  
  return false;
};

// ✅ Method to add call admin
callSchema.methods.addCallAdmin = function (userId) {
  const userIdStr = userId?.toString();
  const isAlreadyAdmin = this.callAdmins?.some(id => id?.toString() === userIdStr);
  
  if (!isAlreadyAdmin) {
    this.callAdmins.push(userId);
  }
  
  return this.save();
};

// ✅ Method to remove call admin
callSchema.methods.removeCallAdmin = function (userId) {
  const userIdStr = userId?.toString();
  this.callAdmins = this.callAdmins.filter(id => id?.toString() !== userIdStr);
  return this.save();
};

const Call = mongoose.model("Call", callSchema);

module.exports = Call;
