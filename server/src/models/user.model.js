const mongoose = require("mongoose");
const { isEmail } = require("validator");

function generateRandomUserID() {
  return Math.floor(1000000 + Math.random() * 9000000).toString();
}

const verificationSchema = new mongoose.Schema({
  code: {
    type: String,
    minlength: [6, "Minimum code length is 6 characters"],
    select: false,
  },
  expires: {
    type: Date,
    select: false,
  },
  verified: {
    type: Boolean,
    default: false,
  },
});

const userSchema = new mongoose.Schema(
  {
    userName: {
      type: String,
      lowercase: true,
    },
    email: {
      type: String,
      unique: true,
      validate: [isEmail, "Please enter a valid email"],
      sparse: true,
    },
    firstName: {
      type: String,
      lowercase: true,
    },
    lastName: {
      type: String,
      lowercase: true,
    },
    age: {
      type: Number,
      min: 18,
    },
    birthDate: {
      month: {
        type: Number,
        min: 1,
        max: 12,
      },
      day: {
        type: Number,
        min: 1,
        max: 31,
      },
      year: {
        type: Number,
        min: 1900,
        max: 2021,
      },
    },
    gender: {
      type: String,
      enum: ["male", "female", "other"],
    },
    maritalStatus: {
      // done
      type: String,
      enum: ["", "single", "married", "divorced", "widowed", "other"],
      default: "",
    },
    nationality: {
      // done
      type: String,
    },
    preferredGenders: [{ type: String, enum: ["male", "female", "other", ""] }],
    preferredAgeRange: [
      {
        type: Number,
        default: 18,
        min: 18,
        max: 100,
      },
      {
        type: Number,
        default: 100,
        min: 18,
        max: 100,
      },
    ],
    lookingFor: {
      type: [String],
      enum: [
        "friendship",
        "relationship",
        "chatting",
        "networking",
        "other",
        "",
      ],
    },
    preferredDistance: {
      type: Number,
      default: 150,
      min: 5,
      max: 1500,
    },
    preferredCommunications: [
      {
        type: String,
        enum: ["text", "voice", "video", "in person", "other", ""],
        required: false,
        default: ["text"],
      },
    ],
    smoking: {
      type: String,
      enum: [
        "yes",
        "no",
        "sometimes",
        "trying to quit",
        "in social events",
        "",
      ],
    },
    drinking: {
      type: String,
      enum: [
        "yes",
        "no",
        "sometimes",
        "trying to quit",
        "in social events",
        "",
      ],
    },
    exercise: {
      type: String,
      enum: ["never", "rarely", "sometimes", "daily", "weekly", "monthly", ""],
      default: "sometimes",
    },
    diet: {
      type: String,
      enum: [
        "anything",
        "vegetarian",
        "vegan",
        "pescatarian",
        "keto",
        "paleo",
        "gluten-free",
        "halal",
        "kosher",
        "other",
        "",
      ],
      default: "anything",
    },
    sleepSchedule: {
      type: String,
      enum: ["early bird", "night owl", "varies", ""],
      default: "varies",
    },
    hasPets: {
      type: Boolean,
      default: null, // null means no preference, true means must not have pets, false means must have pets
    },

    location: {
      enabled: {
        type: Boolean,
        default: false,
      },
      type: {
        type: String,
        enum: ["Point"], // 'location.type' must be 'Point'
        default: "Point",
      },
      coordinates: {
        type: [Number],
        index: "2dsphere",
        default: [0, 0], // Default coordinates
      },
      city: {
        type: String,
        default: "",
      },
      state: {
        type: String,
        default: "",
      },
      country: {
        type: String,
        default: "",
      },
      isoCountryCode: {
        type: String,
        default: "",
      },
      postalCode: {
        type: String,
        default: "000000",
      },
      address: {
        type: String,
        default: "",
      },
    },

    height: {
      type: Number,
    },
    weight: {
      type: Number,
    },
    bodyType: {
      type: String,
      enum: [
        "slim",
        "average",
        "athletic",
        "full-figured",
        "curvy",
        "muscular",
        "petite",
        "a little extra",
        "stocky",
        "other",
        "",
      ],
    },
    education: {
      type: String,
      enum: [
        "no high school diploma",
        "high school diploma",
        "some college, no degree",
        "associate degree",
        "bachelor's degree",
        "master's degree",
        "doctorate or higher",
        "other",
        "",
      ],
    },
    occupation: {
      type: String,
    },
    wantsKids: {
      type: Boolean,
      default: null, // null means no preference, true means must not want kids, false means must want kids
    },
    hasKids: {
      type: Boolean,
      default: null, // null means no preference, true means must not have kids, false means must have kids
    },
    religion: {
      type: String,
      enum: [
        "agnostic",
        "atheist",
        "buddhist",
        "christian",
        "catholic",
        "hindu",
        "jewish",
        "muslim",
        "sikh",
        "other",
        "",
      ],
    },
    // religiousBeliefIntensity: {
    //   type: String,
    //   enum: [
    //     "not important",
    //     "somewhat important",
    //     "very important",
    //     "strictly observant",
    //   ],
    //   required: false,
    // },
    zodiacSign: {
      type: String,
      enum: [
        "Aries",
        "Taurus",
        "Gemini",
        "Cancer",
        "Leo",
        "Virgo",
        "Libra",
        "Scorpio",
        "Sagittarius",
        "Capricorn",
        "Aquarius",
        "Pisces",
        "",
      ],
    },
    personalityType: {
      type: String,
      enum: [
        "INTJ",
        "ENTP",
        "ISFJ",
        "ENFJ",
        "ISTP",
        "ESFP",
        "ESTJ",
        "INFJ",
        "ISFP",
        "ESTP",
        "ENFP",
        "INTP",
        "ENTJ",
        "ISTJ",
        "INFP",
        "ESFJ",
        "",
      ], // Add all 16 MBTI types or other personality frameworks
      required: false,
    },
    languages: [
      {
        type: String,
      },
    ],

    interests: [
      {
        type: String,
      },
    ],
    politicalViews: {
      type: String,
      enum: [
        "anarchist",
        "centrist",
        "conservative",
        "liberal",
        "libertarian",
        "moderate",
        "progressive",
        "socialist",
        "other",
        "",
      ],
      default: "other", // Optional: You can set a default value if it makes sense for your application
    },
    images: [
      {
        ref: "Image",
        type: mongoose.Schema.Types.ObjectId,
        // autopopulate: true,
      },
    ],
    bio: {
      type: String,
    },
    isCompleted: {
      type: Boolean,
      default: false,
    },

    accountStatus: {
      type: String,
      enum: ["active", "suspended", "banned", "deactivated"],
      default: "active",
    },
    emailVerification: verificationSchema,
    identifiers: {
      googleId: {
        type: String,
        unique: true,
        sparse: true,
      },
      appleId: {
        type: String,
        unique: true,
        sparse: true,
      },
      facebookId: {
        type: String,
        unique: true,
        sparse: true,
      },
    },
    resetPassword: verificationSchema,
    password: {
      type: String,
      minlength: [6, "Minimum password length is 6 characters"],
      select: false,
    },
    phoneNumber: {
      type: String,
      unique: true,
      minlength: [10, "Minimum phone number length is 10 characters"],
      sparse: true,
    },
    userID: {
      type: String,
      unique: true,
      select: false,
      default: generateRandomUserID,
    },
    phoneVerification: verificationSchema,
    roles: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Role",
        select: false,
      },
    ],
    permissions: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Permission",
        select: false,
      },
    ],

    status: {
      type: String,
      enum: ["online", "offline", "busy", "away"],
      default: "offline",
    },
    // ✅ Subscription Tier for Rate Limiting
    subscriptionTier: {
      type: String,
      enum: ["free", "premium", "enterprise"],
      default: "free",
    },
    lastSeen: {
      type: Date,
      default: Date.now,
    },
    friends: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        select: false,
      },
    ],
    incomingFriendRequests: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        select: false,
      },
    ],
    outgoingFriendRequests: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        select: false,
      },
    ],
    blockedUsers: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        select: false,
      },
    ],
    // ✅ Muted Chats - notifications muted (still receive messages)
    mutedChats: [
      {
        roomId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Room",
        },
        until: {
          type: Date, // null = forever, Date = until that time
          default: null,
        },
        createdAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    // ✅ Muted Users - mute notifications from specific users globally
    mutedUsers: [
      {
        userId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
        until: {
          type: Date, // null = forever, Date = until that time
          default: null,
        },
        createdAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    colors: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Color",
      },
    ],
    devices: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Device",
      },
    ],
    settings: {
      darkMode: {
        type: Boolean,
        default: true,
      },
      notifications: {
        messages: {
          type: Boolean,
          default: true,
        },
        calls: {
          type: Boolean,
          default: true,
        },
        videoCalls: {
          type: Boolean,
          default: true,
        },
        friendRequests: {
          type: Boolean,
          default: true,
        },
        likes: {
          type: Boolean,
          default: true,
        },
        comments: {
          type: Boolean,
          default: true,
        },
        tags: {
          type: Boolean,
          default: true,
        },
        reminders: {
          type: Boolean,
          default: true,
        },
        events: {
          type: Boolean,
          default: true,
        },
        birthdays: {
          type: Boolean,
          default: true,
        },
        groups: {
          type: Boolean,
          default: true,
        },

        nearby: {
          type: Boolean,
          default: true,
        },
        live: {
          type: Boolean,
          default: true,
        },
        stories: {
          type: Boolean,
          default: true,
        },

        shares: {
          type: Boolean,
          default: true,
        },
      },
    },
    expoPushToken: {
      type: String,
      default: null,
    },
    /** E2EE chat: public keys only; private keys stay on device */
    chatDevices: [
      {
        deviceId: { type: String, required: true },
        x25519Public: { type: String, required: true },
        ed25519Public: { type: String, required: true },
        createdAt: { type: Date, default: Date.now },
        lastSeenAt: { type: Date, default: Date.now },
      },
    ],
    experiencePoints: {
      type: Number,
      default: 0,
    },
    level: {
      type: Number,
      default: 1,
      select: true,
    },
    privacySettings: {
      visibility: {
        fullName: {
          type: String,
          enum: ["everyone", "friends", "noOne"],
          default: "everyone",
        },
        email: {
          type: String,
          enum: ["everyone", "friends", "noOne"],
          default: "everyone",
        },
        phoneNumber: {
          type: String,
          enum: ["everyone", "friends", "noOne"],
          default: "everyone",
        },
        location: {
          type: String,
          enum: ["everyone", "friends", "noOne"],
          default: "everyone",
        },
        gender: {
          type: String,
          enum: ["everyone", "friends", "noOne"],
          default: "everyone",
        },
        age: {
          type: String,
          enum: ["everyone", "friends", "noOne"],
          default: "everyone",
        },
        nationality: {
          type: String,
          enum: ["everyone", "friends", "noOne"],
          default: "everyone",
        },
        bio: {
          type: String,
          enum: ["everyone", "friends", "noOne"],
          default: "everyone",
        },
        images: {
          type: String,
          enum: ["everyone", "friends", "noOne"],
          default: "everyone",
        },
        // new things
        profileInfo: {
          type: String,
          enum: ["everyone", "friends", "noOne"],
          default: "everyone",
        },
      },
      interactions: {
        status: {
          type: String,
          enum: ["everyone", "friends", "noOne"],
          default: "everyone",
        },
        readReceipts: {
          type: String,
          enum: ["everyone", "friends", "noOne"],
          default: "everyone",
        },
        calls: {
          type: String,
          enum: ["everyone", "friends", "noOne"],
          default: "everyone",
        },
        videoCalls: {
          type: String,
          enum: ["everyone", "friends", "noOne"],
          default: "everyone",
        },
        messages: {
          type: String,
          enum: ["everyone", "friends", "noOne"],
          default: "everyone",
        },
        // new things
        lastSeen: {
          type: String,
          enum: ["everyone", "friends", "noOne"],
          default: "everyone",
        },
        add: {
          type: String,
          enum: ["everyone", "friends", "noOne"],
          default: "everyone",
        },
        // ✅ Message Requests - if enabled, messages from non-friends go to requests
        messageRequestsEnabled: {
          type: Boolean,
          default: false, // Disabled by default - all messages are received normally
        },
        // ✅ Typing Indicator Privacy - who can see when you're typing
        typingIndicator: {
          type: String,
          enum: ["everyone", "friends", "noOne"],
          default: "everyone",
        },
      },
      content: {
        posts: {
          type: String,
          enum: ["everyone", "friends", "noOne"],
          default: "everyone",
        },
        images: {
          type: String,
          enum: ["everyone", "friends", "noOne"],
          default: "everyone",
        },
        videos: {
          type: String,
          enum: ["everyone", "friends", "noOne"],
          default: "everyone",
        },
        stories: {
          type: String,
          enum: ["everyone", "friends", "noOne"],
          default: "everyone",
        },
        likedPages: {
          type: String,
          enum: ["everyone", "friends", "noOne"],
          default: "everyone",
        },
      },
      networking: {
        friendsList: {
          type: String,
          enum: ["everyone", "friends", "noOne"],
          default: "friends",
        },
        followers: {
          type: String,
          enum: ["everyone", "friends", "noOne"],
          default: "friends",
        },
        following: {
          type: String,
          enum: ["everyone", "friends", "noOne"],
          default: "friends",
        },
        searchVisibility: {
          type: String,
          enum: ["everyone", "friends", "noOne"],
          default: "everyone",
        },
      },
      // ✅ Default Call Settings - تُنسخ إلى Call.callSettings عند إنشاء مكالمة جديدة
      defaultCallSettings: {
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
      // ✅ Default Chat Settings - تُنسخ إلى Room.chatSettings عند إنشاء غرفة جديدة
      defaultChatSettings: {
        videoCall: {
          type: [String],
          enum: ["everyone", "admin", "moderator", "friends", "specific", "noOne"],
          default: ["everyone"],
        },
        videoCallAllowedUsers: [{
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        }],
        videoCallExceptUsers: [{
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        }],
        audioCall: {
          type: [String],
          enum: ["everyone", "admin", "moderator", "friends", "specific", "noOne"],
          default: ["everyone"],
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
          default: ["everyone"],
        },
        canSendAllowedUsers: [{
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        }],
        canSendExceptUsers: [{
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        }],
      },
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform: function (doc, ret) {
        delete ret.password; // Exclude 'password' field from the JSON object
      },
    },
  }
);

userSchema.plugin(require("mongoose-autopopulate"));

userSchema.pre("save", async function (next) {
  const user = this;
  if (user.isNew || user.isModified("userID")) {
    let isUnique = false;
    while (!isUnique) {
      try {
        const existingUser = await mongoose
          .model("User")
          .findOne({ userID: user.userID });
        if (existingUser) {
          user.userID = generateRandomUserID();
        } else {
          isUnique = true;
        }
      } catch (error) {
        return next(error);
      }
    }
  }
  next();
});

function generateLevelThresholds() {
  const thresholds = [];
  let increment = 5;

  for (let i = 1; i <= 200; i++) {
    thresholds.push(increment);

    if (i < 10) {
      increment += 3;
    } else if (i < 20) {
      increment += 10;
    } else if (i < 50) {
      increment += 25;
    } else if (i < 100) {
      increment += 50;
    } else {
      increment = 4000;
    }
  }

  return thresholds;
}

const levelThresholds = generateLevelThresholds();

// Middleware لتحديث الليفل عند تسجيل الدخول
userSchema.pre("save", async function (next) {
  if (this.isModified("lastSeen")) {
    this.experiencePoints += 10; // زيادة نقاط الخبرة عند تسجيل الدخول

    while (
      this.level < levelThresholds.length &&
      this.experiencePoints >= levelThresholds[this.level - 1]
    ) {
      this.experiencePoints -= levelThresholds[this.level - 1];
      this.level += 1;
      console.log(`User has leveled up to level ${this.level}!`);
    }
  }
  next();
});

const User = mongoose.model("User", userSchema);

module.exports = User;
