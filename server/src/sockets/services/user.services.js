const Message = require("../../models/message.model");
const Room = require("../../models/room.model");
const User = require("../../models/user.model");
const mongoose = require("mongoose");
const escapeRegExp = require("../../utils/escape-reg-exp");
const { sendPushNotification } = require("../../../notification");
const getFullName = require("../../utils/get-full-user-name");
const Device = require("../../models/device.model");
const Like = require("../../models/like.model");
const Visitor = require("../../models/visitors");
const {
  NotificationTypes,
  createNotificationEvent,
  toPushData,
} = require("../../utils/notificationContract");
const USER_SOCKETS_KEY_PREFIX = "user_sockets:";
const USER_SOCKET_LIST_MAX = 20;

const sanitizeUser = (user) => {
  delete user.incomingFriendRequests;
  delete user.outgoingFriendRequests;
  delete user.friends;
  delete user.blockedUsers;
  return user;
};

const extractSocketIdsFromRedisValue = (raw) => {
  if (!raw) return [];
  const str = String(raw).trim();
  if (!str) return [];
  try {
    const parsed = JSON.parse(str);
    if (Array.isArray(parsed)) {
      return parsed.map((x) => String(x)).filter(Boolean);
    }
  } catch (_) {}
  if (str.includes(",")) {
    return str
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean);
  }
  return [str];
};

const getRedisUserSocketsKey = (userId) =>
  `${USER_SOCKETS_KEY_PREFIX}${String(userId || "")}`;

const addUserSocketMapping = async ({ redisClient, userId, socketId }) => {
  if (!redisClient?.isReady || !userId || !socketId) return [];
  const uid = String(userId);
  const sid = String(socketId);
  const key = getRedisUserSocketsKey(uid);
  let sockets = [];
  try {
    const raw = await redisClient.get(key);
    sockets = extractSocketIdsFromRedisValue(raw);
  } catch (_) {
    sockets = [];
  }
  const next = [sid, ...sockets.filter((x) => String(x) !== sid)].slice(
    0,
    USER_SOCKET_LIST_MAX
  );
  try {
    await redisClient.multi().set(`user:${uid}`, sid).set(key, JSON.stringify(next)).exec();
  } catch (_) {}
  return next;
};

const removeUserSocketMapping = async ({ redisClient, userId, socketId }) => {
  if (!redisClient?.isReady || !userId) return [];
  const uid = String(userId);
  const sid = String(socketId || "");
  const key = getRedisUserSocketsKey(uid);
  let sockets = [];
  try {
    const raw = await redisClient.get(key);
    sockets = extractSocketIdsFromRedisValue(raw);
  } catch (_) {
    sockets = [];
  }
  const next = sockets.filter((x) => String(x) && String(x) !== sid);
  try {
    const pipeline = redisClient.multi();
    if (next.length) {
      pipeline.set(`user:${uid}`, String(next[0]));
      pipeline.set(key, JSON.stringify(next));
    } else {
      pipeline.del(`user:${uid}`);
      pipeline.del(key);
    }
    await pipeline.exec();
  } catch (_) {}
  return next;
};

const resolveSocketIdsForUser = async ({
  redisClient,
  io,
  userId,
  excludeSocketId = null,
}) => {
  const uid = String(userId || "");
  if (!uid) return [];
  const excluded = String(excludeSocketId || "");
  const ids = new Set();
  if (redisClient?.isReady) {
    try {
      const raw = await redisClient.get(`user:${uid}`);
      extractSocketIdsFromRedisValue(raw).forEach((sid) => {
        const val = String(sid);
        if (!excluded || val !== excluded) ids.add(val);
      });
      const rawList = await redisClient.get(getRedisUserSocketsKey(uid));
      extractSocketIdsFromRedisValue(rawList).forEach((sid) => {
        const val = String(sid);
        if (!excluded || val !== excluded) ids.add(val);
      });
    } catch (_) {}
  }
  const socketsMap = io?.sockets?.sockets;
  if (socketsMap && typeof socketsMap.forEach === "function") {
    socketsMap.forEach((s) => {
      if (
        String(s?.user?._id || "") === uid &&
        s?.id &&
        (!excluded || String(s.id) !== excluded)
      ) {
        ids.add(String(s.id));
      }
    });
  }
  return [...ids];
};

const emitToUserSockets = async ({
  socket,
  io,
  redisClient,
  userId,
  eventName,
  payload,
}) => {
  const socketIds = await resolveSocketIdsForUser({ redisClient, io, userId });
  for (const sid of socketIds) {
    if (socket && typeof socket.to === "function") {
      socket.to(sid).emit(eventName, payload);
    } else if (io && typeof io.to === "function") {
      io.to(sid).emit(eventName, payload);
    }
  }
  return socketIds.length;
};

const resolveSocketIdsForDevices = async ({ redisClient, deviceIds }) => {
  if (!redisClient?.isReady || !Array.isArray(deviceIds) || !deviceIds.length) {
    return [];
  }
  let raws = [];
  try {
    raws = await redisClient.mGet(deviceIds.map((id) => `device:${id}`));
  } catch (_) {
    raws = [];
  }
  const ids = new Set();
  for (const raw of raws || []) {
    extractSocketIdsFromRedisValue(raw).forEach((sid) => ids.add(String(sid)));
  }
  return [...ids];
};

const emitToDeviceSockets = async ({
  socket,
  io,
  redisClient,
  deviceIds,
  eventName,
  payload,
}) => {
  const socketIds = await resolveSocketIdsForDevices({ redisClient, deviceIds });
  for (const sid of socketIds) {
    if (socket && typeof socket.to === "function") {
      socket.to(sid).emit(eventName, payload);
    } else if (io && typeof io.to === "function") {
      io.to(sid).emit(eventName, payload);
    }
  }
  return socketIds.length;
};

async function emitAndMaybePushNotification({
  socket,
  io,
  redisClient,
  targetUserId,
  targetUser,
  event,
  pushAllowed = true,
}) {
  if (!targetUserId || !targetUser || !event) return;
  await emitToUserSockets({
    socket,
    io,
    redisClient,
    userId: targetUserId,
    eventName: "notificationEvent",
    payload: event,
  });
  // Smart suppression: only send push when user is offline.
  if (!pushAllowed || targetUser.status === "online") return;
  if (!targetUser.expoPushToken) return;
  await sendPushNotification(
    targetUser.expoPushToken,
    event.body || event.title,
    event.title || "Notification",
    toPushData(event)
  );
}

function applyPrivacySettings(userData, isFriend) {
  const privacy = userData.privacySettings || {};
  const visibility = privacy.visibility || {};

  const sanitizedData = {
    _id: userData._id,
    userName: userData.userName,
    status: userData.status,
    isFriend: isFriend,
  };

  // Apply privacy settings to each field

  // firstName and lastName
  if (
    visibility.fullName === "everyone" ||
    (visibility.fullName === "friends" && isFriend)
  ) {
    sanitizedData.firstName = userData.firstName;
    sanitizedData.lastName = userData.lastName;
  } else {
    sanitizedData.firstName = null;
    sanitizedData.lastName = null;
  }

  // userName
  if (
    visibility.userName === "everyone" ||
    (visibility.userName === "friends" && isFriend)
  ) {
    sanitizedData.userName = userData.userName;
  } else {
    sanitizedData.userName = null;
  }

  // email
  if (
    visibility.email === "everyone" ||
    (visibility.email === "friends" && isFriend)
  ) {
    sanitizedData.email = userData.email;
  } else {
    sanitizedData.email = null;
  }

  // phoneNumber
  if (
    visibility.phoneNumber === "everyone" ||
    (visibility.phoneNumber === "friends" && isFriend)
  ) {
    sanitizedData.phoneNumber = userData.phoneNumber;
  } else {
    sanitizedData.phoneNumber = null;
  }

  // images
  if (
    visibility.images === "everyone" ||
    (visibility.images === "friends" && isFriend)
  ) {
    sanitizedData.images = (userData.images || []).map((image) => ({
      _id: image._id,
      path: image.path,
    }));
  } else {
    sanitizedData.images = [];
  }

  // colors
  sanitizedData.colors = (userData.colors || []).map((color) => ({
    _id: color._id,
    code: color.code,
    users: color.users,
    history: color.history,
  }));

  // birthDate
  if (
    visibility.age === "everyone" ||
    (visibility.age === "friends" && isFriend)
  ) {
    sanitizedData.birthDate = userData.birthDate;
  } else {
    sanitizedData.birthDate = null;
  }

  // gender
  if (
    visibility.gender === "everyone" ||
    (visibility.gender === "friends" && isFriend)
  ) {
    sanitizedData.gender = userData.gender;
  } else {
    sanitizedData.gender = null;
  }

  // bio
  if (
    visibility.bio === "everyone" ||
    (visibility.bio === "friends" && isFriend)
  ) {
    sanitizedData.bio = userData.bio;
  } else {
    sanitizedData.bio = null;
  }

  return sanitizedData;
}

const getMyConnections = async function ({ args, socket }, callback) {
  const { page = 1, size = 10, search = "", type } = args;
  const pageSize = parseInt(size);
  const skip = (page - 1) * pageSize;
  const userObjectId = new mongoose.Types.ObjectId(socket.user._id);

  let populatedField;
  let isFriendStatus = false; // Default to false for non-friend connections

  switch (type) {
    case "friends":
      populatedField = "friends";
      isFriendStatus = true; // All connections are friends
      break;
    case "sent":
      populatedField = "outgoingFriendRequests";
      break;
    case "received":
      populatedField = "incomingFriendRequests";
      break;
    case "blocked":
      populatedField = "blockedUsers";
      break;
    case "fans":
      populatedField = "fans";
      break;
    case "following":
      populatedField = "following";
      break;
    case "visitors":
      populatedField = "visitors";
      break;

    default:
      // socket.emit("error", { message: "Invalid connection type" });
      callback({
        message: "getMyConnectionsError",
        data: "Invalid connection type",
        type: "error",
      });
      return;
  }

  try {
    // Fetch current user's connections based on the type
    let connectionIds = [];
    if (type === "fans" || type === "following" || type === "visitors") {
      if (type === "fans") {
        const fans = await Like.find({
          targetModel: "User",
          target: userObjectId,
          reaction: { $ne: "dislike" },
        });
        console.log("fans", fans);
        connectionIds = fans.map((fan) => fan.liker);
      }
      if (type === "following") {
        const following = await Like.find({
          targetModel: "User",
          liker: userObjectId,
          reaction: { $ne: "dislike" },
        });
        connectionIds = following.map((following) => following.target);
      }

      if (type === "visitors") {
        const visitors = await Visitor.find({
          visited: userObjectId,
        });
        connectionIds = visitors.map((visitor) => visitor.visitor);
      }
    } else {
      const currentUser = await User.findById(userObjectId)
        .select(`+${populatedField}`)
        .lean();

      if (!currentUser) {
        // socket.emit("error", { message: "User not found" })
        callback({
          message: "getMyConnectionsError",
          data: "User not found",
          type: "error",
        });
        return;
      }

      const connections = currentUser[populatedField] || [];
      connectionIds = connections.map((conn) => conn._id);
    }

    const searchRegex = new RegExp(
      escapeRegExp(search).replace(/\s+/g, ".*"),
      "i"
    );

    // Build aggregation pipeline
    const aggregationPipeline = [
      {
        $match: { _id: { $in: connectionIds } },
      },
      {
        $match: {
          $or: [
            { email: searchRegex },
            { phoneNumber: searchRegex },
            { userName: searchRegex },
            { firstName: searchRegex },
            { lastName: searchRegex },
            {
              $expr: {
                $regexMatch: {
                  input: { $concat: ["$firstName", " ", "$lastName"] },
                  regex: searchRegex,
                },
              },
            },
          ],
        },
      },

      // Lookup images
      {
        $lookup: {
          from: "images",
          localField: "images",
          foreignField: "_id",
          as: "images",
        },
      },
      // Lookup colors
      {
        $lookup: {
          from: "colors",
          localField: "colors",
          foreignField: "_id",
          as: "colors",
        },
      },
      // Add isFriend field
      {
        $addFields: {
          isFriend: isFriendStatus, // Set based on connection type
        },
      },
      // Pagination
      {
        $skip: skip,
      },
      {
        $limit: pageSize,
      },
      // Apply privacy settings in projection
      {
        $project: {
          _id: 1,
          userName: 1,
          isFriend: 1,
          blockedUsers: 1,
          colors: 1,
          status: {
            $cond: {
              if: {
                $or: [
                  {
                    $eq: ["$privacySettings.interactions.status", "everyone"],
                  },
                  {
                    $and: [
                      {
                        $eq: [
                          "$privacySettings.interactions.status",
                          "friends",
                        ],
                      },
                      "$isFriend",
                    ],
                  },
                ],
              },
              then: "$status",
              else: null,
            },
          },
          lastSeen: {
            $cond: {
              if: {
                $or: [
                  {
                    $eq: ["$privacySettings.interactions.lastSeen", "everyone"],
                  },
                  {
                    $and: [
                      {
                        $eq: [
                          "$privacySettings.interactions.lastSeen",
                          "friends",
                        ],
                      },
                      "$isFriend",
                    ],
                  },
                ],
              },
              then: "$lastSeen",
              else: null,
            },
          },
          userName: {
            $cond: {
              if: {
                $or: [
                  { $eq: ["$privacySettings.visibility.userName", "everyone"] },
                  {
                    $and: [
                      {
                        $eq: [
                          "$privacySettings.visibility.userName",
                          "friends",
                        ],
                      },
                      "$isFriend",
                    ],
                  },
                ],
              },
              then: "$userName",
              else: null,
            },
          },
          firstName: {
            $cond: {
              if: {
                $or: [
                  { $eq: ["$privacySettings.visibility.fullName", "everyone"] },
                  {
                    $and: [
                      {
                        $eq: [
                          "$privacySettings.visibility.fullName",
                          "friends",
                        ],
                      },
                      "$isFriend",
                    ],
                  },
                ],
              },
              then: "$firstName",
              else: null,
            },
          },
          lastName: {
            $cond: {
              if: {
                $or: [
                  { $eq: ["$privacySettings.visibility.fullName", "everyone"] },
                  {
                    $and: [
                      {
                        $eq: [
                          "$privacySettings.visibility.fullName",
                          "friends",
                        ],
                      },
                      "$isFriend",
                    ],
                  },
                ],
              },
              then: "$lastName",
              else: null,
            },
          },
          email: {
            $cond: {
              if: {
                $or: [
                  { $eq: ["$privacySettings.visibility.email", "everyone"] },
                  {
                    $and: [
                      { $eq: ["$privacySettings.visibility.email", "friends"] },
                      "$isFriend",
                    ],
                  },
                ],
              },
              then: "$email",
              else: null,
            },
          },
          phoneNumber: {
            $cond: {
              if: {
                $or: [
                  {
                    $eq: [
                      "$privacySettings.visibility.phoneNumber",
                      "everyone",
                    ],
                  },
                  {
                    $and: [
                      {
                        $eq: [
                          "$privacySettings.visibility.phoneNumber",
                          "friends",
                        ],
                      },
                      "$isFriend",
                    ],
                  },
                ],
              },
              then: "$phoneNumber",
              else: null,
            },
          },
          images: {
            $cond: {
              if: {
                $or: [
                  { $eq: ["$privacySettings.visibility.images", "everyone"] },
                  {
                    $and: [
                      {
                        $eq: ["$privacySettings.visibility.images", "friends"],
                      },
                      "$isFriend",
                    ],
                  },
                ],
              },
              then: {
                $map: {
                  input: "$images",
                  as: "image",
                  in: {
                    _id: "$$image._id",
                    path: "$$image.path",
                  },
                },
              },
              else: [],
            },
          },
          location: {
            $cond: {
              if: {
                $or: [
                  {
                    $eq: ["$privacySettings.visibility.location", "everyone"],
                  },
                  {
                    $and: [
                      {
                        $eq: [
                          "$privacySettings.visibility.location",
                          "friends",
                        ],
                      },
                      "$isFriend",
                    ],
                  },
                ],
              },
              then: "$location",
              else: null,
            },
          },
          canMsg: {
            // إضافة خاصية canMsg
            $cond: {
              if: {
                $or: [
                  {
                    $eq: ["$privacySettings.interactions.messages", "everyone"],
                  },
                  {
                    $and: [
                      {
                        $eq: [
                          "$privacySettings.interactions.messages",
                          "friends",
                        ],
                      },
                      "$isFriend",
                    ],
                  },
                ],
              },
              then: true,
              else: false,
            },
          },
          canAdd: {
            // إضافة خاصية canAdd
            $cond: {
              if: {
                $or: [
                  { $eq: ["$privacySettings.interactions.add", "everyone"] },
                  {
                    $and: [
                      { $eq: ["$privacySettings.interactions.add", "friends"] },
                      "$isFriend",
                    ],
                  },
                ],
              },
              then: true,
              else: false,
            },
          },
        },
      },
    ];

    const result = await User.aggregate(aggregationPipeline);
    // socket.emit("getMyConnections", result);
    callback({
      message: "getMyConnections",
      data: result,
      type: "success",
    });
  } catch (error) {
    console.error("Error in getMyConnections:", error);
    // socket.emit("error", { message: "Failed to fetch connections" });
    callback({
      message: "getMyConnectionsError",
      data: error?.message || "Failed to fetch connections",
      type: "error",
    });
  }
};

const getRecentRooms = async (userId) => {
  try {
    const rooms = await Room.find({ members: userId })
      .limit(5)
      .populate({
        path: "members",
        select:
          "email phoneNumber lastSeen status firstName lastName images privacySettings blockedUsers roles isGroup",
        populate: {
          path: "images",
          select: "path",
        },
      })
      .lean();

    let users = [];
    rooms.forEach((room) => {
      room.members.forEach((member) => {
        if (member._id.toString() !== userId.toString()) {
          users.push({ ...member, isRecent: true });
        }
      });
    });

    return users;
  } catch (error) {
    console.error("Error fetching recent rooms for user:", error);
    throw error;
  }
};

const getFriendsNRecentChats = async ({ args, socket }, callback) => {
  const { page = 1, size = 25, search = "", isOld } = args;
  const pageSize = parseInt(size);
  const skip = (page - 1) * pageSize;
  const userObjectId = new mongoose.Types.ObjectId(socket.user._id);

  try {
    const searchRegex = new RegExp(
      escapeRegExp(search).replace(/\s+/g, ".*"),
      "i"
    );

    // Fetch current user's friends
    const currentUser = await User.findById(userObjectId)
      .select("+friends")
      .lean();
    const friendIds = currentUser.friends || [];

    // Build aggregation pipeline
    const aggregationPipeline = [
      {
        $match: { _id: { $in: friendIds } },
      },
      {
        $match: {
          $or: [
            { email: searchRegex },
            { phoneNumber: searchRegex },
            { userName: searchRegex },
            { firstName: searchRegex },
            { lastName: searchRegex },
            {
              $expr: {
                $regexMatch: {
                  input: { $concat: ["$firstName", " ", "$lastName"] },
                  regex: searchRegex,
                },
              },
            },
          ],
        },
      },

      // Lookup images
      {
        $lookup: {
          from: "images",
          localField: "images",
          foreignField: "_id",
          as: "images",
        },
      },
      // Lookup colors
      {
        $lookup: {
          from: "colors",
          localField: "colors",
          foreignField: "_id",
          as: "colors",
        },
      },
      // Add isFriend field
      {
        $addFields: {
          isFriend: true, // All users in this list are friends
        },
      },
      // Pagination
      {
        $skip: skip,
      },
      {
        $limit: pageSize,
      },
      // Apply privacy settings in projection
      {
        $project: {
          _id: 1,
          userName: 1,
          isFriend: 1,
          canMsg: 1,
          blockedUsers: 1,
          colors: 1,
          status: {
            $cond: {
              if: {
                $or: [
                  {
                    $eq: ["$privacySettings.interactions.status", "everyone"],
                  },
                  {
                    $and: [
                      {
                        $eq: [
                          "$privacySettings.interactions.status",
                          "friends",
                        ],
                      },
                      "$isFriend",
                    ],
                  },
                ],
              },
              then: "$status",
              else: null,
            },
          },
          lastSeen: {
            $cond: {
              if: {
                $or: [
                  {
                    $eq: ["$privacySettings.interactions.lastSeen", "everyone"],
                  },
                  {
                    $and: [
                      {
                        $eq: [
                          "$privacySettings.interactions.lastSeen",
                          "friends",
                        ],
                      },
                      "$isFriend",
                    ],
                  },
                ],
              },
              then: "$lastSeen",
              else: null,
            },
          },
          firstName: {
            $cond: {
              if: {
                $or: [
                  { $eq: ["$privacySettings.visibility.fullName", "everyone"] },
                  {
                    $and: [
                      {
                        $eq: [
                          "$privacySettings.visibility.fullName",
                          "friends",
                        ],
                      },
                      "$isFriend",
                    ],
                  },
                ],
              },
              then: "$firstName",
              else: null,
            },
          },
          lastName: {
            $cond: {
              if: {
                $or: [
                  { $eq: ["$privacySettings.visibility.fullName", "everyone"] },
                  {
                    $and: [
                      {
                        $eq: [
                          "$privacySettings.visibility.fullName",
                          "friends",
                        ],
                      },
                      "$isFriend",
                    ],
                  },
                ],
              },
              then: "$lastName",
              else: null,
            },
          },
          email: {
            $cond: {
              if: {
                $or: [
                  { $eq: ["$privacySettings.visibility.email", "everyone"] },
                  {
                    $and: [
                      { $eq: ["$privacySettings.visibility.email", "friends"] },
                      "$isFriend",
                    ],
                  },
                ],
              },
              then: "$email",
              else: null,
            },
          },
          phoneNumber: {
            $cond: {
              if: {
                $or: [
                  {
                    $eq: [
                      "$privacySettings.visibility.phoneNumber",
                      "everyone",
                    ],
                  },
                  {
                    $and: [
                      {
                        $eq: [
                          "$privacySettings.visibility.phoneNumber",
                          "friends",
                        ],
                      },
                      "$isFriend",
                    ],
                  },
                ],
              },
              then: "$phoneNumber",
              else: null,
            },
          },
          images: {
            $cond: {
              if: {
                $or: [
                  { $eq: ["$privacySettings.visibility.images", "everyone"] },
                  {
                    $and: [
                      {
                        $eq: ["$privacySettings.visibility.images", "friends"],
                      },
                      "$isFriend",
                    ],
                  },
                ],
              },
              then: {
                $map: {
                  input: "$images",
                  as: "image",
                  in: {
                    _id: "$$image._id",
                    path: "$$image.path",
                  },
                },
              },
              else: [],
            },
          },
          colors: {
            $map: {
              input: "$colors",
              as: "color",
              in: {
                _id: "$$color._id",
                code: "$$color.code",
                users: "$$color.users",
                history: "$$color.history",
              },
            },
          },
          birthDate: {
            $cond: {
              if: {
                $or: [
                  { $eq: ["$privacySettings.visibility.age", "everyone"] },
                  {
                    $and: [
                      { $eq: ["$privacySettings.visibility.age", "friends"] },
                      "$isFriend",
                    ],
                  },
                ],
              },
              then: "$birthDate",
              else: null,
            },
          },
          gender: {
            $cond: {
              if: {
                $or: [
                  { $eq: ["$privacySettings.visibility.gender", "everyone"] },
                  {
                    $and: [
                      {
                        $eq: ["$privacySettings.visibility.gender", "friends"],
                      },
                      "$isFriend",
                    ],
                  },
                ],
              },
              then: "$gender",
              else: null,
            },
          },
          bio: {
            $cond: {
              if: {
                $or: [
                  { $eq: ["$privacySettings.visibility.bio", "everyone"] },
                  {
                    $and: [
                      { $eq: ["$privacySettings.visibility.bio", "friends"] },
                      "$isFriend",
                    ],
                  },
                ],
              },
              then: "$bio",
              else: null,
            },
          },
          maritalStatus: 1,
          nationality: {
            $cond: {
              if: {
                $or: [
                  {
                    $eq: [
                      "$privacySettings.visibility.nationality",
                      "everyone",
                    ],
                  },
                  {
                    $and: [
                      {
                        $eq: [
                          "$privacySettings.visibility.nationality",
                          "friends",
                        ],
                      },
                      "$isFriend",
                    ],
                  },
                ],
              },
              then: "$nationality",
              else: null,
            },
          },
          privacySettings: 1,
          lookingFor: 1,
          preferredCommunications: 1,

          smoking: 1,
          drinking: 1,
          education: 1,
          languages: 1,
          interests: 1,
          zodiacSign: 1,
          religion: 1,
          personalityType: 1,
          location: {
            $cond: {
              if: {
                $or: [
                  {
                    $eq: ["$privacySettings.visibility.location", "everyone"],
                  },
                  {
                    $and: [
                      {
                        $eq: [
                          "$privacySettings.visibility.location",
                          "friends",
                        ],
                      },
                      "$isFriend",
                    ],
                  },
                ],
              },
              then: "$location",
              else: null,
            },
          },
          canMsg: {
            // إضافة خاصية canMsg
            $cond: {
              if: {
                $or: [
                  {
                    $eq: ["$privacySettings.interactions.messages", "everyone"],
                  },
                  {
                    $and: [
                      {
                        $eq: [
                          "$privacySettings.interactions.messages",
                          "friends",
                        ],
                      },
                      "$isFriend",
                    ],
                  },
                ],
              },
              then: true,
              else: false,
            },
          },
          canAdd: {
            // إضافة خاصية canAdd
            $cond: {
              if: {
                $or: [
                  { $eq: ["$privacySettings.interactions.add", "everyone"] },
                  {
                    $and: [
                      { $eq: ["$privacySettings.interactions.add", "friends"] },
                      "$isFriend",
                    ],
                  },
                ],
              },
              then: true,
              else: false,
            },
          },
        },
      },
    ];

    const friends = await User.aggregate(aggregationPipeline);

    // Get recent rooms if needed
    let recentRooms = [];
    if (page === 1 && search === "") {
      recentRooms = await getRecentRooms(socket.user._id);
    }

    // Filter out friends who are already in recent rooms
    const filteredFriends = friends.filter((friend) => {
      return !recentRooms.some((roomMember) => {
        return roomMember?._id?.toString() === friend?._id?.toString();
      });
    });

    // Combine data
    const combinedData = {
      friends: friends,
      recentRooms: [],
      isOld: isOld,
    };

    // socket.emit("getFriendsNRecentChats", combinedData);
    callback({
      message: "getFriendsNRecentChats",
      data: combinedData,
      type: "success",
    });
  } catch (error) {
    console.error("Error in getFriendsNRecentChats:", error);
    callback({
      message: "getFriendsNRecentChatsError",
      data: error?.message || "Failed to fetch friends and recent chats",
      type: "error",
    });
  }
};

const buildSearchAggregationPipeline = (
  searchQuery,
  searchRegex,
  sortBy,
  friendIds,
  includePagination = true,
  skip = 0,
  pageSize = 25
) => {
  const aggregationPipeline = [];

  aggregationPipeline.push(
    {
      $lookup: {
        from: "images",
        localField: "images",
        foreignField: "_id",
        as: "images",
      },
    },
    {
      $lookup: {
        from: "colors",
        localField: "colors",
        foreignField: "_id",
        as: "colors",
      },
    },
    {
      $match: {
        $or: [
          { firstName: searchRegex },
          { lastName: searchRegex },
          { userName: searchRegex },
          { email: searchRegex },
          { phoneNumber: searchRegex },
          {
            $expr: {
              $regexMatch: {
                input: { $concat: ["$firstName", " ", "$lastName"] },
                regex: searchRegex,
              },
            },
          },
        ],
      },
    }
  );

  const addMatchStage = (field, condition) => {
    if (condition) {
      aggregationPipeline.push({
        $match: {
          [field]: condition,
        },
      });
    }
  };

  // Fields that remain in the User model
  addMatchStage(
    "interests",
    searchQuery.interests && searchQuery.interests.length > 0
      ? { $in: searchQuery.interests }
      : null
  );
  addMatchStage(
    "gender",
    searchQuery.preferredGenders && searchQuery.preferredGenders.length > 0
      ? { $in: searchQuery.preferredGenders }
      : null
  );

  // Fields that remain in the model
  addMatchStage(
    "lookingFor",
    searchQuery.lookingFor && searchQuery.lookingFor.length > 0
      ? { $in: searchQuery.lookingFor }
      : null
  );
  addMatchStage(
    "smoking",
    searchQuery.smoking && searchQuery.smoking.length > 0
      ? { $in: searchQuery.smoking }
      : null
  );
  addMatchStage(
    "drinking",
    searchQuery.drinking && searchQuery.drinking.length > 0
      ? { $in: searchQuery.drinking }
      : null
  );
  addMatchStage(
    "birthDate.year",
    searchQuery.preferredAgeRange && searchQuery.preferredAgeRange.length === 2
      ? {
          $gte: new Date().getFullYear() - searchQuery.preferredAgeRange[1],
          $lte: new Date().getFullYear() - searchQuery.preferredAgeRange[0],
        }
      : null
  );

  // Location fields
  addMatchStage(
    "location.coordinates",
    searchQuery.locationType === "nearby" &&
      searchQuery.location &&
      searchQuery.location.coordinates
      ? {
          $geoWithin: {
            $centerSphere: [
              searchQuery.location.coordinates,
              ((searchQuery.preferredDistance > 0
                ? searchQuery.preferredDistance
                : 1) *
                1000) /
                6378137 || 1, // Convert distance in kilometers to radians
            ],
          },
        }
      : null
  );

  if (
    searchQuery.locationType === "country" &&
    searchQuery.country &&
    searchQuery.country.length > 0
  ) {
    addMatchStage("location.country", { $in: searchQuery.country });
  }

  addMatchStage(
    "preferredCommunications",
    searchQuery.preferredCommunications &&
      searchQuery.preferredCommunications.length > 0
      ? { $in: searchQuery.preferredCommunications }
      : null
  );
  addMatchStage(
    "education",
    searchQuery.education && searchQuery.education.length > 0
      ? { $in: searchQuery.education }
      : null
  );
  addMatchStage(
    "languages",
    searchQuery.languages && searchQuery.languages.length > 0
      ? { $in: searchQuery.languages }
      : null
  );

  addMatchStage(
    "interests",
    searchQuery.interests && searchQuery.interests.length > 0
      ? { $in: searchQuery.interests }
      : null
  );

  addMatchStage(
    "zodiacSign",
    searchQuery.zodiacSign && searchQuery.zodiacSign.length > 0
      ? { $in: searchQuery.zodiacSign }
      : null
  );
  addMatchStage(
    "religion",
    searchQuery.religion && searchQuery.religion.length > 0
      ? { $in: searchQuery.religion }
      : null
  );
  addMatchStage(
    "maritalStatus",
    searchQuery.maritalStatus && searchQuery.maritalStatus.length > 0
      ? { $in: searchQuery.maritalStatus }
      : null
  );
  addMatchStage(
    "nationality",
    searchQuery.nationality && searchQuery.nationality.length > 0
      ? { $in: searchQuery.nationality }
      : null
  );
  addMatchStage(
    "personalityType",
    searchQuery.personalityType && searchQuery.personalityType.length > 0
      ? { $in: searchQuery.personalityType }
      : null
  );

  // Sorting stage (excluding nearest which is handled by $geoNear)
  const sortStage = {};
  // if (sortBy === "nearest") {
  //   if (searchQuery.location && searchQuery.location.coordinates) {
  //     console.log("nearestss");
  //     aggregationPipeline.push({
  //       $match: {
  //         "location.coordinates": {
  //           $geoWithin: {
  //             $centerSphere: [
  //               searchQuery.location.coordinates,
  //               (searchQuery.preferredDistance * 1000) / 6378137 || 1,
  //             ],
  //           },
  //         },
  //       },
  //     });

  //     addMatchStage("location.coordinates", { $ne: [0, 0] });
  //   } else {
  switch (sortBy) {
    case "oldest":
      sortStage["birthDate.year"] = 1; // Ascending: Oldest first
      break;
    case "youngest":
      sortStage["birthDate.year"] = -1; // Descending: Youngest first
      break;
    case "alphabetically":
      sortStage["firstName"] = 1; // Ascending: A-Z
      sortStage["lastName"] = 1; // Ascending: A-Z
      break;
    case "newest":
      sortStage["_id"] = -1; // Descending: Newest first (Assuming _id is an ObjectId with creation date)
      break;
    case "active":
      sortStage["lastActiveAt"] = -1; // Descending: Most active first (Requires lastActiveAt field)
      break;
    default:
      sortStage["_id"] = -1; // Default to newest
  }
  // }
  // }
  if (Object.keys(sortStage).length > 0) {
    aggregationPipeline.push({ $sort: sortStage });
  }

  // Add isFriend field using friendIds
  aggregationPipeline.push({
    $addFields: {
      isFriend: { $in: ["$_id", friendIds] },
    },
  });

  aggregationPipeline.push({
    $match: {
      $or: [
        { "privacySettings.networking.searchVisibility": "everyone" },
        {
          "privacySettings.networking.searchVisibility": "friends",
          isFriend: true,
        },
      ],
    },
  });

  if (includePagination) {
    // Pagination stages
    aggregationPipeline.push({ $skip: skip }, { $limit: pageSize });
  }

  // Projection stage with conditional fields based on privacy settings
  aggregationPipeline.push({
    $project: {
      _id: 1,
      userName: 1,
      isFriend: 1,
      blockedUsers: 1,
      colors: 1,
      status: {
        $cond: {
          if: {
            $or: [
              {
                $eq: ["$privacySettings.interactions.status", "everyone"],
              },
              {
                $and: [
                  {
                    $eq: ["$privacySettings.interactions.status", "friends"],
                  },
                  "$isFriend",
                ],
              },
            ],
          },
          then: "$status",
          else: null,
        },
      },
      lastSeen: {
        $cond: {
          if: {
            $or: [
              {
                $eq: ["$privacySettings.interactions.lastSeen", "everyone"],
              },
              {
                $and: [
                  {
                    $eq: ["$privacySettings.interactions.lastSeen", "friends"],
                  },
                  "$isFriend",
                ],
              },
            ],
          },
          then: "$lastSeen",
          else: null,
        },
      },
      userName: {
        $cond: {
          if: {
            $or: [
              { $eq: ["$privacySettings.visibility.userName", "everyone"] },
              {
                $and: [
                  { $eq: ["$privacySettings.visibility.userName", "friends"] },
                  "$isFriend",
                ],
              },
            ],
          },
          then: "$userName",
          else: null,
        },
      },
      firstName: {
        $cond: {
          if: {
            $or: [
              { $eq: ["$privacySettings.visibility.fullName", "everyone"] },
              {
                $and: [
                  { $eq: ["$privacySettings.visibility.fullName", "friends"] },
                  "$isFriend",
                ],
              },
            ],
          },
          then: "$firstName",
          else: null,
        },
      },
      lastName: {
        $cond: {
          if: {
            $or: [
              { $eq: ["$privacySettings.visibility.fullName", "everyone"] },
              {
                $and: [
                  { $eq: ["$privacySettings.visibility.fullName", "friends"] },
                  "$isFriend",
                ],
              },
            ],
          },
          then: "$lastName",
          else: null,
        },
      },
      email: {
        $cond: {
          if: {
            $or: [
              { $eq: ["$privacySettings.visibility.email", "everyone"] },
              {
                $and: [
                  { $eq: ["$privacySettings.visibility.email", "friends"] },
                  "$isFriend",
                ],
              },
            ],
          },
          then: "$email",
          else: null,
        },
      },
      phoneNumber: {
        $cond: {
          if: {
            $or: [
              { $eq: ["$privacySettings.visibility.phoneNumber", "everyone"] },
              {
                $and: [
                  {
                    $eq: ["$privacySettings.visibility.phoneNumber", "friends"],
                  },
                  "$isFriend",
                ],
              },
            ],
          },
          then: "$phoneNumber",
          else: null,
        },
      },
      images: {
        $cond: {
          if: {
            $or: [
              { $eq: ["$privacySettings.visibility.images", "everyone"] },
              {
                $and: [
                  { $eq: ["$privacySettings.visibility.images", "friends"] },
                  "$isFriend",
                ],
              },
            ],
          },
          then: {
            $map: {
              input: "$images",
              as: "image",
              in: {
                _id: "$$image._id",
                path: "$$image.path",
              },
            },
          },
          else: [],
        },
      },
      location: {
        $cond: {
          if: {
            $or: [
              { $eq: ["$privacySettings.visibility.location", "everyone"] },
              {
                $and: [
                  {
                    $eq: ["$privacySettings.visibility.location", "friends"],
                  },
                  "$isFriend",
                ],
              },
            ],
          },
          then: "$location",
          else: null,
        },
      },
      canMsg: {
        // إضافة خاصية canMsg
        $cond: {
          if: {
            $or: [
              { $eq: ["$privacySettings.interactions.messages", "everyone"] },
              {
                $and: [
                  {
                    $eq: ["$privacySettings.interactions.messages", "friends"],
                  },
                  "$isFriend",
                ],
              },
            ],
          },
          then: true,
          else: false,
        },
      },
      canAdd: {
        // إضافة خاصية canAdd
        $cond: {
          if: {
            $or: [
              { $eq: ["$privacySettings.interactions.add", "everyone"] },
              {
                $and: [
                  { $eq: ["$privacySettings.interactions.add", "friends"] },
                  "$isFriend",
                ],
              },
            ],
          },
          then: true,
          else: false,
        },
      },
    },
  });

  return aggregationPipeline;
};

const isValidCoordinates = (coordinates) =>
  Array.isArray(coordinates) &&
  coordinates.length === 2 &&
  Number.isFinite(coordinates[0]) &&
  Number.isFinite(coordinates[1]) &&
  !(coordinates[0] === 0 && coordinates[1] === 0);

const toUserIdSet = (ids = []) => new Set(ids.map((id) => id?.toString()));

const countOverlap = (left = [], right = []) => {
  if (!Array.isArray(left) || !Array.isArray(right) || !left.length || !right.length) {
    return 0;
  }
  const rightSet = new Set(right.filter(Boolean));
  return left.filter((value) => rightSet.has(value)).length;
};

const haversineDistanceKm = (fromCoordinates, toCoordinates) => {
  if (!isValidCoordinates(fromCoordinates) || !isValidCoordinates(toCoordinates)) {
    return null;
  }
  const [lon1, lat1] = fromCoordinates;
  const [lon2, lat2] = toCoordinates;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return 6371 * c;
};

const buildRecommendationMeta = ({ currentUser, candidate, friendIdSet }) => {
  const reasons = [];
  let score = 0;

  const candidateFriendIds = (candidate?.friends || []).map((id) => id?.toString());
  const mutualFriendsCount = candidateFriendIds.filter((id) => friendIdSet.has(id)).length;
  if (mutualFriendsCount > 0) {
    score += Math.min(mutualFriendsCount, 5) * 18;
    reasons.push({ key: "mutualFriends", count: mutualFriendsCount });
  }

  const sharedInterestsCount = countOverlap(
    currentUser?.interests || [],
    candidate?.interests || []
  );
  if (sharedInterestsCount > 0) {
    score += Math.min(sharedInterestsCount, 5) * 14;
    reasons.push({ key: "sharedInterests", count: sharedInterestsCount });
  }

  const distanceKm = haversineDistanceKm(
    currentUser?.location?.coordinates,
    candidate?.location?.coordinates
  );
  if (distanceKm != null) {
    score += Math.max(0, 35 - distanceKm * 0.5);
    reasons.push({ key: "nearby", km: Math.round(distanceKm) });
  }

  const latestActivity = candidate?.lastActiveAt || candidate?.lastSeen;
  if (latestActivity) {
    const ageHours = (Date.now() - new Date(latestActivity).getTime()) / 36e5;
    if (ageHours <= 24) {
      score += 16;
      reasons.push({ key: "recentlyActive" });
    } else if (ageHours <= 72) {
      score += 8;
    }
  }

  if ((candidate?.images || []).length > 0) {
    score += 4;
  }

  return {
    score: Number(score.toFixed(2)),
    reasons: reasons.slice(0, 3),
  };
};

const searchUsers = async ({ args, socket }, callback) => {
  const {
    searchQuery,
    page = 1,
    size = 25,
    sortBy = "newest",
    screen = "explore",
  } = args;
  const skip = (page - 1) * size;
  const userId = new mongoose.Types.ObjectId(socket.user._id);
  const searchText = searchQuery.search?.trim() || "";
  const rankingMode = sortBy === "recommended" || sortBy === "smart";
  console.log({ searchQuery, page, size, sortBy });
  try {
    const currentUser = await User.findById(userId)
      .select("+friends interests location")
      .lean();
    if (!currentUser)
      return callback({ message: "User not found", type: "error" });

    const friendIds = currentUser.friends || [];
    const friendIdSet = toUserIdSet(friendIds);

    // Build base query
    const query = { $and: [] };
    query.$and.push({ _id: { $ne: userId } });
    if (searchText) {
      const regex = new RegExp(escapeRegExp(searchText), "i");
      query.$and.push({
        $or: [
          { firstName: regex },
          { lastName: regex },
          { userName: regex },
          { email: regex },
          { phoneNumber: regex },
          { fullName: regex },
        ],
      });
    }
    let excludedUserIds = [];

    if (screen === "swipe") {
      const reactedUsers = await Like.find({
        liker: userId,
        targetModel: "User",
      })
        .select("target")
        .lean();
      console.log({ reactedUsers });

      excludedUserIds = reactedUsers.map((reaction) => reaction.target);

      if (excludedUserIds.length > 0) {
        query.$and.push({ _id: { $nin: excludedUserIds } });
      }
    }
    const filter = (field, arr) =>
      arr?.length ? { [field]: { $in: arr } } : null;

    const filters = [
      filter("gender", searchQuery.preferredGenders),
      filter("interests", searchQuery.interests),
      filter("education", searchQuery.education),
      filter("languages", searchQuery.languages),
      filter("lookingFor", searchQuery.lookingFor),
      filter("smoking", searchQuery.smoking),
      filter("drinking", searchQuery.drinking),
      filter("zodiacSign", searchQuery.zodiacSign),
      filter("religion", searchQuery.religion),
      filter("maritalStatus", searchQuery.maritalStatus),
      filter("nationality", searchQuery.nationality),
      filter("personalityType", searchQuery.personalityType),
      filter("preferredCommunications", searchQuery.preferredCommunications),
      filter("exercise", searchQuery.exercise),
      filter("diet", searchQuery.diet),
      filter("sleepSchedule", searchQuery.sleepSchedule),
      filter("hasPets", searchQuery.hasPets),
      filter("height", searchQuery.height),
      filter("weight", searchQuery.weight),
      filter("bodyType", searchQuery.bodyType),
      filter("hasKids", searchQuery.hasKids),
      filter("wantsKids", searchQuery.wantsKids),
      filter("occupation", searchQuery.occupation),
      filter("religion", searchQuery.religion),
      filter("politicalViews", searchQuery.politicalViews),
    ].filter(Boolean);

    query.$and.push(...filters);

    if (searchQuery.preferredAgeRange?.length === 2) {
      // check if firstNumber is 18 and secound is 100 then do nothing
      const [minAge, maxAge] = searchQuery.preferredAgeRange;
      if (minAge === 18 && maxAge === 100) {
      } else {
        const thisYear = new Date().getFullYear();
        const minYear = thisYear - maxAge;
        const maxYear = thisYear - minAge;
        query.$and.push({ "birthDate.year": { $gte: minYear, $lte: maxYear } });
      }
    }

    if (searchQuery.locationType === "country" && searchQuery.country?.length) {
      query.$and.push({ "location.country": { $in: searchQuery.country } });
    }

    if (
      searchQuery.locationType === "nearby" &&
      searchQuery.location?.coordinates
    ) {
      const radiusInKm = searchQuery.preferredDistance || 1;
      query.$and.push({
        location: {
          $geoWithin: {
            $centerSphere: [
              searchQuery.location.coordinates,
              radiusInKm / 6378.1,
            ],
          },
        },
      });
    }

    const sort = {};
    switch (sortBy) {
      case "recommended":
      case "smart":
        sort["lastSeen"] = -1;
        break;
      case "oldest":
        sort["birthDate.year"] = 1;
        break;
      case "youngest":
        sort["birthDate.year"] = -1;
        break;
      case "alphabetically":
        sort["firstName"] = 1;
        sort["lastName"] = 1;
        break;
      case "active":
        sort["lastActiveAt"] = -1;
        break;
      default:
        sort["_id"] = -1;
    }

    const total = await User.countDocuments(query);
    const users = await User.find(query)
      .sort(sort)
      .skip(skip)
      .limit(size)
      .select("+friends")
      .populate("images", "path")
      .populate("colors", "name code")
      .lean();

    // Final result after applying privacy and isFriend logic
    const filteredUsers = [];

    for (const user of users) {
      const isFriend = friendIds.some((id) => id.equals(user._id));
      const recommendationMeta = rankingMode
        ? buildRecommendationMeta({
            currentUser,
            candidate: user,
            friendIdSet,
          })
        : null;

      const checkPrivacy = (fieldPath) => {
        const setting = fieldPath
          ?.split(".")
          .reduce((obj, key) => obj?.[key], user.privacySettings);
        if (setting === "everyone") return true;
        if (setting === "friends" && isFriend) return true;
        return false;
      };

      const allowSearch =
        user.privacySettings?.networking?.searchVisibility === "everyone" ||
        (user.privacySettings?.networking?.searchVisibility === "friends" &&
          isFriend);

      filteredUsers.push({
        _id: user._id,
        isFriend,
        blockedUsers: user.blockedUsers,
        colors: user.colors,
        userName: checkPrivacy("visibility.userName") ? user.userName : null,
        firstName: checkPrivacy("visibility.fullName") ? user.firstName : null,
        lastName: checkPrivacy("visibility.fullName") ? user.lastName : null,
        email: checkPrivacy("visibility.email") ? user.email : null,
        phoneNumber: checkPrivacy("visibility.phoneNumber")
          ? user.phoneNumber
          : null,
        images: checkPrivacy("visibility.images") ? user.images : [],
        location: checkPrivacy("visibility.location") ? user.location : null,
        lastSeen: checkPrivacy("interactions.lastSeen") ? user.lastSeen : null,
        status: checkPrivacy("interactions.status") ? user.status : null,
        canMsg: checkPrivacy("interactions.messages"),
        canAdd: checkPrivacy("interactions.add"),
        allowSearch: allowSearch,
        privacySettings: user.privacySettings,
        recommendationScore: recommendationMeta?.score ?? 0,
        recommendationReasons: recommendationMeta?.reasons || [],
      });
    }

    const responseUsers = rankingMode
      ? [...filteredUsers].sort((a, b) => {
          if (b.recommendationScore !== a.recommendationScore) {
            return b.recommendationScore - a.recommendationScore;
          }
          const aTime = a?.lastSeen ? new Date(a.lastSeen).getTime() : 0;
          const bTime = b?.lastSeen ? new Date(b.lastSeen).getTime() : 0;
          return bTime - aTime;
        })
      : filteredUsers;

    if (screen === "explore") {
      socket.emit("searchUsers", {
        data: responseUsers,
        total: total,
        currentPage: page,
        pageSize: size,
        message: "Search completed",
        type: "success",
      });
      callback({
        data: responseUsers,
        total: total,
        currentPage: page,
        pageSize: size,
        message: "Search completed",
        type: "success",
      });
    } else if (screen === "swipe") {
      socket.emit("swipeUsers", {
        data: responseUsers,
        total: total,
        currentPage: page,
        pageSize: size,
        message: "Swipe completed",
        type: "success",
      });
      callback({
        data: responseUsers,
        total: total,
        currentPage: page,
        pageSize: size,
        message: "Swipe completed",
        type: "success",
      });
    }
  } catch (err) {
    console.error("searchUsers error:", err);
    callback({ message: "Search failed", type: "error" });
  }
};

const searchUsersByMap = async function ({ args, socket }, callback) {
  const { bounds, latitude, longitude, zoom } = args || {};
  const userObjectId = new mongoose.Types.ObjectId(socket.user._id);

  try {
    const currentUser = await User.findById(userObjectId)
      .select("+friends")
      .lean();
    const friendIds = currentUser?.friends || [];
    const normalizedBounds = normalizeBoundsForSearch(bounds, {
      latitude,
      longitude,
      zoom,
    });
    const limit = getLimitFromZoom(zoom);

    const aggregationPipeline = [
      {
        $match: {
          _id: { $ne: userObjectId },
          $and: [
            {
              "location.coordinates": {
                $ne: [0, 0],
              },
            },
            {
              "location.coordinates": {
                $geoWithin: {
                  $box: [
                    [normalizedBounds.west, normalizedBounds.south],
                    [normalizedBounds.east, normalizedBounds.north],
                  ],
                },
              },
            },
          ],
        },
      },
      {
        $addFields: {
          isFriend: { $in: ["$_id", friendIds] },
        },
      },
      {
        $match: {
          $or: [
            { "privacySettings.networking.searchVisibility": "everyone" },
            {
              "privacySettings.networking.searchVisibility": "friends",
              isFriend: true,
            },
          ],
        },
      },
      { $sort: { updatedAt: -1 } },
      { $limit: limit },
      {
        $lookup: {
          from: "images",
          localField: "images",
          foreignField: "_id",
          as: "images",
        },
      },
      {
        $lookup: {
          from: "colors",
          localField: "colors",
          foreignField: "_id",
          as: "colors",
        },
      },
      {
        $project: {
          _id: 1,
          userName: 1,
          isFriend: 1,
          blockedUsers: 1,
          colors: 1,

          status: {
            $cond: {
              if: {
                $or: [
                  {
                    $eq: ["$privacySettings.interactions.status", "everyone"],
                  },
                  {
                    $and: [
                      {
                        $eq: [
                          "$privacySettings.interactions.status",
                          "friends",
                        ],
                      },
                      "$isFriend",
                    ],
                  },
                ],
              },
              then: "$status",
              else: null,
            },
          },
          lastSeen: {
            $cond: {
              if: {
                $or: [
                  {
                    $eq: ["$privacySettings.interactions.lastSeen", "everyone"],
                  },
                  {
                    $and: [
                      {
                        $eq: [
                          "$privacySettings.interactions.lastSeen",
                          "friends",
                        ],
                      },
                      "$isFriend",
                    ],
                  },
                ],
              },
              then: "$lastSeen",
              else: null,
            },
          },
          userName: {
            $cond: {
              if: {
                $or: [
                  { $eq: ["$privacySettings.visibility.userName", "everyone"] },
                  {
                    $and: [
                      {
                        $eq: [
                          "$privacySettings.visibility.userName",
                          "friends",
                        ],
                      },
                      "$isFriend",
                    ],
                  },
                ],
              },
              then: "$userName",
              else: null,
            },
          },
          firstName: {
            $cond: {
              if: {
                $or: [
                  { $eq: ["$privacySettings.visibility.fullName", "everyone"] },
                  {
                    $and: [
                      {
                        $eq: [
                          "$privacySettings.visibility.fullName",
                          "friends",
                        ],
                      },
                      "$isFriend",
                    ],
                  },
                ],
              },
              then: "$firstName",
              else: null,
            },
          },
          lastName: {
            $cond: {
              if: {
                $or: [
                  { $eq: ["$privacySettings.visibility.fullName", "everyone"] },
                  {
                    $and: [
                      {
                        $eq: [
                          "$privacySettings.visibility.fullName",
                          "friends",
                        ],
                      },
                      "$isFriend",
                    ],
                  },
                ],
              },
              then: "$lastName",
              else: null,
            },
          },
          email: {
            $cond: {
              if: {
                $or: [
                  { $eq: ["$privacySettings.visibility.email", "everyone"] },
                  {
                    $and: [
                      { $eq: ["$privacySettings.visibility.email", "friends"] },
                      "$isFriend",
                    ],
                  },
                ],
              },
              then: "$email",
              else: null,
            },
          },
          phoneNumber: {
            $cond: {
              if: {
                $or: [
                  {
                    $eq: [
                      "$privacySettings.visibility.phoneNumber",
                      "everyone",
                    ],
                  },
                  {
                    $and: [
                      {
                        $eq: [
                          "$privacySettings.visibility.phoneNumber",
                          "friends",
                        ],
                      },
                      "$isFriend",
                    ],
                  },
                ],
              },
              then: "$phoneNumber",
              else: null,
            },
          },
          images: {
            $cond: {
              if: {
                $or: [
                  { $eq: ["$privacySettings.visibility.images", "everyone"] },
                  {
                    $and: [
                      {
                        $eq: ["$privacySettings.visibility.images", "friends"],
                      },
                      "$isFriend",
                    ],
                  },
                ],
              },
              then: {
                $map: {
                  input: "$images",
                  as: "image",
                  in: {
                    _id: "$$image._id",
                    path: "$$image.path",
                  },
                },
              },
              else: [],
            },
          },

          location: {
            $cond: {
              if: {
                $or: [
                  {
                    $eq: ["$privacySettings.visibility.location", "everyone"],
                  },
                  {
                    $and: [
                      {
                        $eq: [
                          "$privacySettings.visibility.location",
                          "friends",
                        ],
                      },
                      "$isFriend",
                    ],
                  },
                ],
              },
              then: "$location",
              else: null,
            },
          },
          canMsg: {
            $cond: {
              if: {
                $or: [
                  {
                    $eq: ["$privacySettings.interactions.messages", "everyone"],
                  },
                  {
                    $and: [
                      {
                        $eq: [
                          "$privacySettings.interactions.messages",
                          "friends",
                        ],
                      },
                      "$isFriend",
                    ],
                  },
                ],
              },
              then: true,
              else: false,
            },
          },
          canAdd: {
            $cond: {
              if: {
                $or: [
                  { $eq: ["$privacySettings.interactions.add", "everyone"] },
                  {
                    $and: [
                      { $eq: ["$privacySettings.interactions.add", "friends"] },
                      "$isFriend",
                    ],
                  },
                ],
              },
              then: true,
              else: false,
            },
          },
        },
      },
    ];

    const results = await User.aggregate(aggregationPipeline);

    callback({
      data: results,
      type: "success",
      message: "search users by map",
    });
  } catch (error) {
    console.warn({ error });
    callback({
      message: error?.message || "search users by map error",
      type: "error",
    });
  }
};

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

function normalizeBoundsForSearch(bounds, fallback = {}) {
  if (
    bounds &&
    Number.isFinite(bounds.north) &&
    Number.isFinite(bounds.south) &&
    Number.isFinite(bounds.east) &&
    Number.isFinite(bounds.west)
  ) {
    return {
      north: clamp(Number(bounds.north), -85, 85),
      south: clamp(Number(bounds.south), -85, 85),
      east: clamp(Number(bounds.east), -180, 180),
      west: clamp(Number(bounds.west), -180, 180),
    };
  }
  const lat = Number(fallback.latitude || 0);
  const lng = Number(fallback.longitude || 0);
  const zoom = clamp(Number(fallback.zoom || 10), 2, 20);
  const lngDelta = 360 / Math.pow(2, zoom);
  const latDelta = lngDelta / 1.7;
  return {
    north: clamp(lat + latDelta / 2, -85, 85),
    south: clamp(lat - latDelta / 2, -85, 85),
    east: clamp(lng + lngDelta / 2, -180, 180),
    west: clamp(lng - lngDelta / 2, -180, 180),
  };
}

function getLimitFromZoom(zoom) {
  const z = clamp(Number(zoom || 10), 2, 20);
  if (z <= 5) return 120;
  if (z <= 8) return 90;
  if (z <= 11) return 70;
  if (z <= 14) return 50;
  return 35;
}

const sendFriendRequest = async function ({ args, socket, redisClient }) {
  const { targetUserId } = args;

  try {
    const targetUser = await User.findById(targetUserId)
      .select(
        "+incomingFriendRequests +friends +outgoingFriendRequests +blockedUsers +colors +images +expoPushToken +privacySettings "
      )
      .populate("images colors");
    const user = await User.findById(socket.user._id)
      .select(
        "+incomingFriendRequests +friends +outgoingFriendRequests +blockedUsers +colors +images +expoPushToken +privacySettings "
      )
      .populate("images colors");

    if (!targetUser) {
      throw new Error("Target user not found");
    }

    if (!user) {
      throw new Error("User not found");
    }

    const targetUserObj = targetUser.toObject();
    const userObj = user.toObject();

    const isFriend = userObj.friends.some((friendId) =>
      friendId.equals(targetUserId)
    );

    const isFriendOfTarget = targetUserObj.friends.some((friendId) =>
      friendId.equals(socket.user._id)
    );
    const notifyTargetUser = async ({
      user,
      targetUser,
      triggeredBySender,
    }) => {
      await emitToUserSockets({
        socket,
        redisClient,
        userId: targetUserId,
        eventName: "sendFriendRequest",
        payload: {
          user: targetUser,
          targetUser: user,
          triggeredBySender,
        },
      });
      const userName = getFullName(user, true) || "Someone";
      const event = createNotificationEvent({
        type: NotificationTypes.FRIEND_REQUEST,
        title: "New friend request",
        body: `${userName} sent you a friend request`,
        entityType: "user",
        entityId: user?._id,
        route: "/users?tab=received",
        priority: "high",
        dedupeKey: `friend_request:${String(user?._id || "")}:${String(targetUser?._id || "")}`,
      });
      await emitAndMaybePushNotification({
        socket,
        io: null,
        redisClient,
        targetUserId,
        targetUser,
        event,
        pushAllowed: !!targetUser?.settings?.notifications?.friendRequests,
      });
    };

    if (
      !targetUser.incomingFriendRequests.includes(socket.user._id) &&
      !targetUser.friends.includes(socket.user._id)
    ) {
      targetUser.incomingFriendRequests.push(socket.user._id);
      user.outgoingFriendRequests.push(targetUserId);

      await targetUser.save();
      await user.save();
      // console.log("sendFriendRequest", user, targetUser, isFriend);
      socket.emit("sendFriendRequest", {
        user,
        targetUser: applyPrivacySettings(targetUserObj, isFriend),
        triggeredBySender: true,
      });
      notifyTargetUser({
        user: applyPrivacySettings(userObj, isFriendOfTarget),
        targetUser,
        triggeredBySender: false,
      });
    } else {
      console.warn("Friend request already sent");
    }
  } catch (error) {
    console.warn({ error });
  }
};

const cancelFriendRequest = async function ({ args, socket, redisClient }) {
  const { targetUserId } = args;

  try {
    const targetUser = await User.findById(targetUserId)
      .select(
        "+incomingFriendRequests +friends +outgoingFriendRequests +blockedUsers +colors +images +expoPushToken +privacySettings"
      )
      .populate("images colors");
    const user = await User.findById(socket.user._id)
      .select(
        "+incomingFriendRequests +friends +outgoingFriendRequests +blockedUsers +colors +images +expoPushToken +privacySettings"
      )
      .populate("images colors");

    if (!targetUser) {
      throw new Error("Target user not found");
    }

    if (!user) {
      throw new Error("User not found");
    }

    const targetUserObj = targetUser.toObject();
    const userObj = user.toObject();

    const isFriend = userObj.friends.some((friendId) =>
      friendId.equals(targetUserId)
    );

    const isFriendOfTarget = targetUserObj.friends.some((friendId) =>
      friendId.equals(socket.user._id)
    );

    const notifyTargetUser = async ({
      user,
      targetUser,
      triggeredBySender,
    }) => {
      await emitToUserSockets({
        socket,
        redisClient,
        userId: targetUserId,
        eventName: "friendRequestCanceled",
        payload: {
          user: targetUser,
          targetUser: user,
          triggeredBySender,
        },
      });
    };

    if (
      targetUser.outgoingFriendRequests.includes(socket.user._id) &&
      user.incomingFriendRequests.includes(targetUserId)
    ) {
      targetUser.outgoingFriendRequests =
        targetUser.outgoingFriendRequests.filter(
          (request) => request != socket.user._id
        );
      user.incomingFriendRequests = user.incomingFriendRequests.filter(
        (request) => request != targetUserId
      );

      await targetUser.save();
      await user.save();

      socket.emit("cancelFriendRequest", {
        user,
        targetUser: sanitizeUser(targetUserObj),
        triggeredBySender: false,
      });

      notifyTargetUser({
        user: sanitizeUser(userObj),
        targetUser: targetUser,
        triggeredBySender: false,
      });
    } else if (
      targetUser.incomingFriendRequests.includes(socket.user._id) &&
      user.outgoingFriendRequests.includes(targetUserId)
    ) {
      targetUser.incomingFriendRequests =
        targetUser.incomingFriendRequests.filter(
          (request) => request != socket.user._id
        );
      user.outgoingFriendRequests = user.outgoingFriendRequests.filter(
        (request) => request != targetUserId
      );

      await user.save();
      await targetUser.save();

      socket.emit("cancelFriendRequest", {
        user,
        targetUser: applyPrivacySettings(targetUserObj, isFriend),
        triggeredBySender: true,
      });
      notifyTargetUser({
        user: applyPrivacySettings(userObj, isFriendOfTarget),
        targetUser: targetUser,
        triggeredBySender: true,
      });
    } else {
      console.warn("No pending friend request to cancel");
    }
  } catch (error) {
    console.warn({ error });
  }
};

const acceptFriendRequest = async function ({ args, socket, redisClient }) {
  const { targetUserId } = args;

  try {
    const requestingUser = await User.findById(targetUserId)
      .select(
        "+incomingFriendRequests +friends +outgoingFriendRequests +blockedUsers +colors +images +expoPushToken +privacySettings"
      )
      .populate("images colors");
    const targetUser = await User.findById(socket.user._id)
      .select(
        "+incomingFriendRequests +friends +outgoingFriendRequests +blockedUsers +colors +images +expoPushToken +privacySettings"
      )
      .populate("images colors");

    if (!requestingUser) {
      throw new Error("User not found");
    }

    const requestingUserObj = requestingUser.toObject();
    const targetUserObj = targetUser.toObject();

    const isFriend = targetUser.friends.some((friendId) =>
      friendId.equals(targetUserId)
    );

    const isFriendOfTarget = requestingUserObj.friends.some((friendId) =>
      friendId.equals(socket.user._id)
    );

    const notifyRequestingUser = async ({ user }) => {
      await emitToUserSockets({
        socket,
        redisClient,
        userId: targetUserId,
        eventName: "friendRequestAccepted",
        payload: { user },
      });
      const accepterName = getFullName(user, true) || "Someone";
      const event = createNotificationEvent({
        type: NotificationTypes.FRIEND_ACCEPTED,
        title: "Friend request accepted",
        body: `${accepterName} accepted your friend request`,
        entityType: "user",
        entityId: user?._id,
        route: "/users?tab=friends",
        priority: "normal",
        dedupeKey: `friend_accepted:${String(user?._id || "")}:${String(targetUserId || "")}`,
      });
      await emitAndMaybePushNotification({
        socket,
        io: null,
        redisClient,
        targetUserId,
        targetUser: requestingUser,
        event,
        pushAllowed: !!requestingUser?.settings?.notifications?.friendRequests,
      });
    };

    if (targetUser.incomingFriendRequests.includes(targetUserId)) {
      targetUser.incomingFriendRequests =
        targetUser.incomingFriendRequests.filter(
          (request) => request.toString() !== targetUserId
        );
      requestingUser.outgoingFriendRequests =
        requestingUser.outgoingFriendRequests.filter(
          (request) => request.toString() !== socket.user._id
        );

      targetUser.friends.push(targetUserId);
      requestingUser.friends.push(socket.user._id);

      await targetUser.save();
      await requestingUser.save();

      socket.emit("friendRequestAccepted", {
        user: applyPrivacySettings(requestingUserObj, isFriendOfTarget),
      });
      notifyRequestingUser({
        user: applyPrivacySettings(targetUserObj, isFriend),
      });
    } else {
      throw new Error("No incoming friend request from this user.");
    }
  } catch (error) {
    console.warn({ error });
  }
};

const removeFriend = async function ({ args, socket, redisClient }) {
  const { targetUserId } = args;

  try {
    const currentUser = await User.findById(socket.user._id).select("+friends");
    const targetUser = await User.findById(targetUserId).select("+friends");

    if (!currentUser || !targetUser) {
      throw new Error("User not found");
    }

    currentUser.friends = currentUser.friends.filter(
      (friendId) => friendId.toString() !== targetUserId
    );
    targetUser.friends = targetUser.friends.filter(
      (friendId) => friendId.toString() !== socket.user._id
    );

    await currentUser.save();
    await targetUser.save();

    socket.emit("removeFriend", { user: targetUser });

    await emitToUserSockets({
      socket,
      redisClient,
      userId: targetUserId,
      eventName: "removeFriend",
      payload: { user: currentUser },
    });
  } catch (error) {
    console.warn({ error });
  }
};

const blockUser = async function ({ args, socket, redisClient }) {
  const { targetUser, block, room } = args;

  try {
    const targetUserData = await User.findById(targetUser)
      .select("+blockedUsers")
      .populate("colors images");
    const userData = await User.findById(socket.user._id)
      .select("+blockedUsers")
      .populate("colors images");

    if (!targetUserData) {
      throw new Error("Target user not found");
    }

    if (!userData) {
      throw new Error("User not found");
    }

    if (block) {
      if (!userData.blockedUsers.includes(targetUser)) {
        userData.blockedUsers.push(targetUser);
        await userData.save();
      }
    } else {
      const index = userData.blockedUsers.indexOf(targetUser);
      if (index !== -1) {
        userData.blockedUsers.splice(index, 1);
        await userData.save();
      }
    }
    const roomData = await Room.findById(room);

    socket.emit("sendLinkerMsg", {
      user: {
        ...userData.toObject(),
      },
      targetUser: {
        ...targetUserData.toObject(),
      },
      room: roomData,
      action: `${block ? "wasBlockedBy" : "wasUnblockedBy"}`,
    });

    socket.emit("blockUser", {
      user: userData,
      block,
      targetUser: targetUserData,
      room,
    });

    await emitToUserSockets({
      socket,
      redisClient,
      userId: targetUser,
      eventName: "blockedByUser",
      payload: { user: userData, room },
    });
  } catch (error) {
    console.log({ error });
  }
};

const setUserOnlineStatus = async (userId, status) => {
  const user = await User.findById(userId)
    .select(
      "+incomingFriendRequests +friends +outgoingFriendRequests +blockedUsers +colors +password +images"
    )
    .populate("colors images")
    .exec();

  if (!user) return null;

  let doseUserHavePassword = user.password ? true : false;
  let userObject = user.toObject();
  delete userObject.password;

  user.status = status;
  user.lastSeen = new Date();
  await user.save();

  return { ...userObject, doseUserHavePassword };
};

const getUndeliveredMessages = async (userId) => {
  return await Message.find({
    sentTo: { $in: [userId] },
    deliveredTo: { $nin: [userId] },
    scheduleStatus: { $ne: "scheduled" },
  });
};

const disconnectDevice = async (
  { args, socket, io, redisClient },
  callback
) => {
  try {
    // console.log("disconnectDevice", args._id);
    await Device.findByIdAndUpdate(args._id, { forceLogout: true });
    // console.log("device updated");

    // await redisClient.del(`device:${args.deviceId}`);
    const getRedisDeviceId = await redisClient.get(`device:${args._id}`);

    // console.log({ getRedisDeviceId });

    const devices = await Device.find({ user: socket.user._id });

    // socket.emit("getDevices", devices);
    const deviceIds = devices
      .filter((device) => device?._id)
      .map((device) => device._id);

    await emitToDeviceSockets({
      socket,
      io,
      redisClient,
      deviceIds,
      eventName: "getDevices",
      payload: devices,
    });

    // delete device

    callback({
      message: "Device disconnected successfully",
      data: args._id,
      type: "success",
    });
    extractSocketIdsFromRedisValue(getRedisDeviceId).forEach((sid) => {
      io.to(sid).emit("deviceDisconnected", { _id: args._id });
    });
  } catch (error) {
    console.warn({ error });
  }
};

const userConnected = async ({ args, socket, redisClient }, callback) => {
  try {
    console.log("user connected", socket.user._id);
    const redisReady = !!redisClient?.isReady;

    // Store user->socket mapping in Redis (multi-socket aware).
    if (redisReady) {
      await addUserSocketMapping({
        redisClient,
        userId: socket.user._id,
        socketId: socket.id,
      });
      await redisClient.set(`lastSeen:${socket.user._id}`, Date.now());
    }

    // Set user status to online
    const user = await setUserOnlineStatus(socket.user._id, "online");
    if (!user) return;
    // console.log({ args: args });

    if (args.device) {
      let device;
      // // set device id
      if (args.device) {
        device = await Device.findOne({
          user: socket.user._id,
          deviceId: args.device.deviceId,
        });
        if (!device) {
          device = new Device({
            ...args.device,
            user: socket.user._id,
          });
          await device.save();
        }
      }
      if (redisReady) {
        await redisClient.set(`device:${device._id}`, socket.id);
      }

      // console.log({ device });

      // await redisClient.set(`device:${socket.device.deviceId}`, socket.id);

      const devices = await Device.find({ user: socket.user._id });

      const deviceIds = devices
        .filter((device) => device?._id)
        .map((device) => device._id);

      await emitToDeviceSockets({
        socket,
        redisClient,
        deviceIds,
        eventName: "getDevices",
        payload: devices,
      });

      // Emit "userConnected" event to the connected user
      // console.log({ socket: socket.user });
      callback({
        message: "User connected successfully",
        data: user,
        type: "success",
      });

      socket.emit("getDevices", devices);
    }

    // Fetch undelivered messages, friends, and rooms in parallel
    const [undeliveredMessages, userWithFriends, roomsToNotify] =
      await Promise.all([
        getUndeliveredMessages(socket.user._id),
        User.findById(socket.user._id)
          .select(
            "friends incomingFriendRequests outgoingFriendRequests privacySettings"
          )
          .lean(),
        Room.find({ members: socket.user._id }).select("_id members").lean(),
      ]);
    // Emit undelivered messages
    undeliveredMessages.forEach((message) => {
      socket.emit("deliveredMessage", { message, room: message.room });
    });

    // Extract friends and privacy settings
    const friendIds = userWithFriends.friends || [];
    const incomingFriendRequests = userWithFriends.incomingFriendRequests || [];
    const outgoingFriendRequests = userWithFriends.outgoingFriendRequests || [];
    const privacySettings = userWithFriends.privacySettings;

    // status
    let friendsToNotifyStatus = [];
    let incomingRequestsToNotifyStatus = [];
    let outgoingRequestsToNotifyStatus = [];
    let roomMembersToNotifyStatus = [];

    // lastSeen
    let friendsToNotifyLastSeen = [];
    let incomingRequestsToNotifyLastSeen = [];
    let outgoingRequestsToNotifyLastSeen = [];
    let roomMembersToNotifyLastSeen = [];

    // console.log({ privacySettings });

    if (privacySettings.interactions.status === "none") {
      // Notify no one
    } else if (privacySettings.interactions.status === "everyone") {
      // Notify all friends, incoming, and outgoing friend requests
      friendsToNotifyStatus = friendIds;
      incomingRequestsToNotifyStatus = incomingFriendRequests;
      outgoingRequestsToNotifyStatus = outgoingFriendRequests;
      roomMembersToNotifyStatus = roomsToNotify.flatMap((room) =>
        room.members.filter(
          (memberId) => memberId && !memberId.equals(socket.user._id)
        )
      );
    } else if (privacySettings.interactions.status === "friends") {
      // Notify only friends
      friendsToNotifyStatus = friendIds;

      // Notify room members only if they are friends
      roomMembersToNotifyStatus = roomsToNotify.flatMap((room) =>
        room.members.filter(
          (memberId) =>
            memberId &&
            !memberId.equals(socket.user._id) &&
            friendIds.some((friendId) => friendId.equals(memberId))
        )
      );
    }

    // Consolidate all user IDs that need to be notified
    const allUserIdsToNotifyStatus = [
      ...friendsToNotifyStatus,
      ...incomingRequestsToNotifyStatus,
      ...outgoingRequestsToNotifyStatus,
      ...roomMembersToNotifyStatus,
    ];

    // Remove duplicates from the list of user IDs
    const uniqueUserIdsToNotifyStatus = [
      ...new Set(allUserIdsToNotifyStatus.map(String).filter((id) => id)),
    ];

    if (uniqueUserIdsToNotifyStatus.length > 0) {
      for (const targetId of uniqueUserIdsToNotifyStatus) {
        await emitToUserSockets({
          socket,
          redisClient,
          userId: targetId,
          eventName: "otherUserStatusChanged",
          payload: {
            userId: user._id,
            status: args.status,
          },
        });
      }
    } else {
      console.log("No keys to fetch for mGet.");
    }

    if (privacySettings.interactions.lastSeen === "noOne") {
      // Notify no one
    } else if (privacySettings.interactions.lastSeen === "everyone") {
      // Notify everyone
      friendsToNotifyLastSeen = friendIds;
      incomingRequestsToNotifyLastSeen = incomingFriendRequests;
      outgoingRequestsToNotifyLastSeen = outgoingFriendRequests;
      roomMembersToNotifyLastSeen = roomsToNotify.flatMap((room) =>
        room.members.filter(
          (memberId) => memberId && !memberId.equals(socket.user._id)
        )
      );
    } else if (privacySettings.interactions.lastSeen === "friends") {
      // Notify friends
      friendsToNotifyLastSeen = friendIds;
      roomMembersToNotifyLastSeen = roomsToNotify.flatMap((room) =>
        room.members.filter(
          (memberId) =>
            memberId &&
            !memberId.equals(socket.user._id) &&
            friendIds.some((friendId) => friendId.equals(memberId))
        )
      );
    }

    // Consolidate all user IDs that need to be notified
    const allUserIdsToNotifyLastSeen = [
      ...friendsToNotifyLastSeen,
      ...incomingRequestsToNotifyLastSeen,
      ...outgoingRequestsToNotifyLastSeen,
      ...roomMembersToNotifyLastSeen,
    ];

    const uniqueUserIdsToNotifyLastSeen = [
      ...new Set(allUserIdsToNotifyLastSeen.map(String).filter((id) => id)),
    ];

    if (uniqueUserIdsToNotifyLastSeen.length > 0) {
      for (const targetId of uniqueUserIdsToNotifyLastSeen) {
        await emitToUserSockets({
          socket,
          redisClient,
          userId: targetId,
          eventName: "otherUserLastSeenChanged",
          payload: {
            userId: user._id,
            lastSeen: user.lastSeen,
          },
        });
      }
    } else {
      console.log("No keys to fetch for mGet.");
    }
  } catch (error) {
    console.log({ error });
  }
};

const userDisconnected = async (
  { args, socket, redisClient, io },
  callback
) => {
  console.log("user disconnectedsss", socket.user._id);
  const redisReady = !!redisClient?.isReady;
  if (redisReady) {
    await removeUserSocketMapping({
      redisClient,
      userId: socket.user._id,
      socketId: socket.id,
    });
  }
  const remainingSockets = await resolveSocketIdsForUser({
    redisClient,
    io,
    userId: socket.user._id,
    excludeSocketId: socket.id,
  });

  if (args.deviceId) {
    const deviceId = args?.deviceId;

    await Device.findOneAndUpdate(
      { deviceId, user: socket.user._id },
      { forceLogout: true }
    );

    // await Device.findByIdAndUpdate(args._id, { forceLogout: true });

    const devices = await Device.find({ user: socket.user._id });

    // socket.emit("getDevices", devices);
    const deviceIds = devices
      .filter((device) => device?._id)
      .map((device) => device._id);

    await emitToDeviceSockets({
      socket,
      io,
      redisClient,
      deviceIds,
      eventName: "getDevices",
      payload: devices,
    });

    callback({
      message: "User disconnected successfully",
      data: {
        _id: socket.user._id,
        status: remainingSockets.length > 0 ? "online" : "offline",
        activeSockets: remainingSockets.length,
      },
      type: "success",
    });
  }
  if (remainingSockets.length > 0) {
    // Another session for this user is still connected; skip offline transition.
    return;
  }
  if (redisReady) {
    await redisClient.del(`lastSeen:${socket.user._id}`);
  }
  const user = await setUserOnlineStatus(socket.user._id, "offline");
  if (!user) return;

  // Fetch undelivered messages, friends, and rooms in parallel
  const [userWithFriends, roomsToNotify] = await Promise.all([
    User.findById(socket.user._id)
      .select(
        "friends incomingFriendRequests outgoingFriendRequests privacySettings"
      )
      .lean(),
    Room.find({ members: socket.user._id }).select("_id members").lean(),
  ]);

  // Extract friends and privacy settings
  const friendIds = userWithFriends.friends || [];
  const incomingFriendRequests = userWithFriends.incomingFriendRequests || [];
  const outgoingFriendRequests = userWithFriends.outgoingFriendRequests || [];
  const privacySettings = userWithFriends.privacySettings;

  // status
  let friendsToNotifyStatus = [];
  let incomingRequestsToNotifyStatus = [];
  let outgoingRequestsToNotifyStatus = [];
  let roomMembersToNotifyStatus = [];

  // lastSeen
  let friendsToNotifyLastSeen = [];
  let incomingRequestsToNotifyLastSeen = [];
  let outgoingRequestsToNotifyLastSeen = [];
  let roomMembersToNotifyLastSeen = [];

  // console.log({ privacySettings });

  if (privacySettings.interactions.status === "none") {
    // Notify no one
  } else if (privacySettings.interactions.status === "everyone") {
    // Notify all friends, incoming, and outgoing friend requests
    friendsToNotifyStatus = friendIds;
    incomingRequestsToNotifyStatus = incomingFriendRequests;
    outgoingRequestsToNotifyStatus = outgoingFriendRequests;
    roomMembersToNotifyStatus = roomsToNotify.flatMap((room) =>
      room.members.filter(
        (memberId) => memberId && !memberId.equals(socket.user._id)
      )
    );
  } else if (privacySettings.interactions.status === "friends") {
    // Notify only friends
    friendsToNotifyStatus = friendIds;

    // Notify room members only if they are friends
    roomMembersToNotifyStatus = roomsToNotify.flatMap((room) =>
      room.members.filter(
        (memberId) =>
          memberId &&
          !memberId.equals(socket.user._id) &&
          friendIds.some((friendId) => friendId.equals(memberId))
      )
    );
  }

  // Consolidate all user IDs that need to be notified
  const allUserIdsToNotifyStatus = [
    ...friendsToNotifyStatus,
    ...incomingRequestsToNotifyStatus,
    ...outgoingRequestsToNotifyStatus,
    ...roomMembersToNotifyStatus,
  ];

  // Remove duplicates from the list of user IDs
  const uniqueUserIdsToNotifyStatus = [
    ...new Set(allUserIdsToNotifyStatus.map(String).filter((id) => id)),
  ];

  if (uniqueUserIdsToNotifyStatus.length > 0) {
    for (const targetId of uniqueUserIdsToNotifyStatus) {
      await emitToUserSockets({
        socket,
        redisClient,
        userId: targetId,
        eventName: "otherUserStatusChanged",
        payload: {
          userId: user._id,
          status: "offline",
        },
      });
    }
  } else {
    console.warn("No keys to fetch for mGet.");
  }

  if (privacySettings.interactions.lastSeen === "noOne") {
    // Notify no one
  } else if (privacySettings.interactions.lastSeen === "everyone") {
    // Notify everyone
    friendsToNotifyLastSeen = friendIds;
    incomingRequestsToNotifyLastSeen = incomingFriendRequests;
    outgoingRequestsToNotifyLastSeen = outgoingFriendRequests;
    roomMembersToNotifyLastSeen = roomsToNotify.flatMap((room) =>
      room.members.filter(
        (memberId) => memberId && !memberId.equals(socket.user._id)
      )
    );
  } else if (privacySettings.interactions.lastSeen === "friends") {
    // Notify friends
    friendsToNotifyLastSeen = friendIds;
    roomMembersToNotifyLastSeen = roomsToNotify.flatMap((room) =>
      room.members.filter(
        (memberId) =>
          memberId &&
          !memberId.equals(socket.user._id) &&
          friendIds.some((friendId) => friendId.equals(memberId))
      )
    );
  }

  // Consolidate all user IDs that need to be notified
  const allUserIdsToNotifyLastSeen = [
    ...friendsToNotifyLastSeen,
    ...incomingRequestsToNotifyLastSeen,
    ...outgoingRequestsToNotifyLastSeen,
    ...roomMembersToNotifyLastSeen,
  ];

  const uniqueUserIdsToNotifyLastSeen = [
    ...new Set(allUserIdsToNotifyLastSeen.map(String).filter((id) => id)),
  ];

  if (uniqueUserIdsToNotifyLastSeen.length > 0) {
    for (const targetId of uniqueUserIdsToNotifyLastSeen) {
      await emitToUserSockets({
        socket,
        redisClient,
        userId: targetId,
        eventName: "otherUserLastSeenChanged",
        payload: {
          userId: user._id,
          lastSeen: user.lastSeen,
        },
      });
    }
  } else {
    console.warn("No keys to fetch for mGet.");
  }
};

const userChangeStatus = async (
  { args, socket, redisClient, io },
  callback
) => {
  const user = await setUserOnlineStatus(socket.user._id, args.status);
  if (!user) return;
  console.log({ user: user.status, args: args.status });

  // Fetch undelivered messages, friends, and rooms in parallel
  const [userWithFriends, roomsToNotify] = await Promise.all([
    User.findById(socket.user._id)
      .select(
        "friends incomingFriendRequests outgoingFriendRequests privacySettings"
      )
      .lean(),
    Room.find({ members: socket.user._id }).select("_id members").lean(),
  ]);

  callback({
    message: "User status changed successfully",
    data: user,
    type: "success",
  });

  console.log({ userWithFriends, roomsToNotify });
  // Extract friends and privacy settings
  const friendIds = userWithFriends.friends || [];
  const incomingFriendRequests = userWithFriends.incomingFriendRequests || [];
  const outgoingFriendRequests = userWithFriends.outgoingFriendRequests || [];
  const privacySettings = userWithFriends?.privacySettings;

  // status
  let friendsToNotifyStatus = [];
  let incomingRequestsToNotifyStatus = [];
  let outgoingRequestsToNotifyStatus = [];
  let roomMembersToNotifyStatus = [];

  // lastSeen
  let friendsToNotifyLastSeen = [];
  let incomingRequestsToNotifyLastSeen = [];
  let outgoingRequestsToNotifyLastSeen = [];
  let roomMembersToNotifyLastSeen = [];

  console.log({ privacySettings });

  if (privacySettings?.interactions?.status === "none") {
    // Notify no one
  } else if (privacySettings?.interactions?.status === "everyone") {
    // Notify all friends, incoming, and outgoing friend requests
    friendsToNotifyStatus = friendIds;
    incomingRequestsToNotifyStatus = incomingFriendRequests;
    outgoingRequestsToNotifyStatus = outgoingFriendRequests;
    roomMembersToNotifyStatus = roomsToNotify.flatMap((room) =>
      room.members.filter(
        (memberId) => memberId && !memberId.equals(socket.user._id)
      )
    );
  } else if (privacySettings?.interactions?.status === "friends") {
    // Notify only friends
    friendsToNotifyStatus = friendIds;

    // Notify room members only if they are friends
    roomMembersToNotifyStatus = roomsToNotify.flatMap((room) =>
      room.members.filter(
        (memberId) =>
          memberId &&
          !memberId.equals(socket.user._id) &&
          friendIds.some((friendId) => friendId.equals(memberId))
      )
    );
  }

  // Consolidate all user IDs that need to be notified
  const allUserIdsToNotifyStatus = [
    ...friendsToNotifyStatus,
    ...incomingRequestsToNotifyStatus,
    ...outgoingRequestsToNotifyStatus,
    ...roomMembersToNotifyStatus,
  ];

  // Remove duplicates from the list of user IDs
  const uniqueUserIdsToNotifyStatus = [
    ...new Set(allUserIdsToNotifyStatus.map(String).filter((id) => id)),
  ];

  if (uniqueUserIdsToNotifyStatus.length > 0) {
    for (const targetId of uniqueUserIdsToNotifyStatus) {
      await emitToUserSockets({
        socket,
        redisClient,
        userId: targetId,
        eventName: "otherUserStatusChanged",
        payload: {
          userId: user._id,
          status: args.status,
        },
      });
    }
  } else {
    console.log("No keys to fetch for mGet.");
  }

  if (privacySettings?.interactions?.lastSeen === "noOne") {
    // Notify no one
  } else if (privacySettings?.interactions?.lastSeen === "everyone") {
    // Notify everyone
    friendsToNotifyLastSeen = friendIds;
    incomingRequestsToNotifyLastSeen = incomingFriendRequests;
    outgoingRequestsToNotifyLastSeen = outgoingFriendRequests;
    roomMembersToNotifyLastSeen = roomsToNotify.flatMap((room) =>
      room.members.filter(
        (memberId) => memberId && !memberId.equals(socket.user._id)
      )
    );
  } else if (privacySettings?.interactions?.lastSeen === "friends") {
    // Notify friends
    friendsToNotifyLastSeen = friendIds;
    roomMembersToNotifyLastSeen = roomsToNotify.flatMap((room) =>
      room.members.filter(
        (memberId) =>
          memberId &&
          !memberId.equals(socket.user._id) &&
          friendIds.some((friendId) => friendId.equals(memberId))
      )
    );
  }

  // Consolidate all user IDs that need to be notified
  const allUserIdsToNotifyLastSeen = [
    ...friendsToNotifyLastSeen,
    ...incomingRequestsToNotifyLastSeen,
    ...outgoingRequestsToNotifyLastSeen,
    ...roomMembersToNotifyLastSeen,
  ];

  const uniqueUserIdsToNotifyLastSeen = [
    ...new Set(allUserIdsToNotifyLastSeen.map(String).filter((id) => id)),
  ];

  if (uniqueUserIdsToNotifyLastSeen.length > 0) {
    for (const targetId of uniqueUserIdsToNotifyLastSeen) {
      await emitToUserSockets({
        socket,
        redisClient,
        userId: targetId,
        eventName: "otherUserLastSeenChanged",
        payload: {
          userId: user._id,
          lastSeen: user.lastSeen,
        },
      });
    }
  } else {
    console.log("No keys to fetch for mGet.");
  }
};

const getOneUser = async function ({ args, socket, redisClient }, callback) {
  console.log("getOneUser");
  const { targetUserId } = args; // معرّف المستخدم الهدف الذي نريد جلب بياناته
  // console.log({ targetUserId });
  try {
    // نتحقق إذا كانت قائمة الأصدقاء موجودة أو لا قبل استخدام $in
    const friends = socket.user.friends || [];

    // بناء الـ aggregation pipeline للبحث عن المستخدم بناءً على الـ targetUserId
    const aggregationPipeline = [
      {
        $match: {
          _id: new mongoose.Types.ObjectId(targetUserId), // تصفية حسب targetUserId
        },
      },

      {
        $lookup: {
          from: "images",
          localField: "images",
          foreignField: "_id",
          as: "images",
        },
      },
      {
        $lookup: {
          from: "colors",
          localField: "colors",
          foreignField: "_id",
          as: "colors",
        },
      },
      // إضافة isFriend بناءً على حالة الصداقة بين المستخدمين
      {
        $addFields: {
          isFriend: { $in: ["$_id", friends] }, // التأكد من أن friends ليست null أو undefined
        },
      },
      {
        $project: {
          _id: 1,
          userName: 1,
          isFriend: 1,
          blockedUsers: 1,
          colors: 1,
          status: {
            $cond: {
              if: {
                $or: [
                  {
                    $eq: ["$privacySettings.interactions.status", "everyone"],
                  },
                  {
                    $and: [
                      {
                        $eq: [
                          "$privacySettings.interactions.status",
                          "friends",
                        ],
                      },
                      "$isFriend",
                    ],
                  },
                ],
              },
              then: "$status",
              else: null,
            },
          },
          lastSeen: {
            $cond: {
              if: {
                $or: [
                  {
                    $eq: ["$privacySettings.interactions.lastSeen", "everyone"],
                  },
                  {
                    $and: [
                      {
                        $eq: [
                          "$privacySettings.interactions.lastSeen",
                          "friends",
                        ],
                      },
                      "$isFriend",
                    ],
                  },
                ],
              },
              then: "$lastSeen",
              else: null,
            },
          },
          userName: {
            $cond: {
              if: {
                $or: [
                  { $eq: ["$privacySettings.visibility.userName", "everyone"] },
                  {
                    $and: [
                      {
                        $eq: [
                          "$privacySettings.visibility.userName",
                          "friends",
                        ],
                      },
                      "$isFriend",
                    ],
                  },
                ],
              },
              then: "$userName",
              else: null,
            },
          },
          firstName: {
            $cond: {
              if: {
                $or: [
                  { $eq: ["$privacySettings.visibility.fullName", "everyone"] },
                  {
                    $and: [
                      {
                        $eq: [
                          "$privacySettings.visibility.fullName",
                          "friends",
                        ],
                      },
                      "$isFriend",
                    ],
                  },
                ],
              },
              then: "$firstName",
              else: null,
            },
          },
          lastName: {
            $cond: {
              if: {
                $or: [
                  { $eq: ["$privacySettings.visibility.fullName", "everyone"] },
                  {
                    $and: [
                      {
                        $eq: [
                          "$privacySettings.visibility.fullName",
                          "friends",
                        ],
                      },
                      "$isFriend",
                    ],
                  },
                ],
              },
              then: "$lastName",
              else: null,
            },
          },
          email: {
            $cond: {
              if: {
                $or: [
                  { $eq: ["$privacySettings.visibility.email", "everyone"] },
                  {
                    $and: [
                      { $eq: ["$privacySettings.visibility.email", "friends"] },
                      "$isFriend",
                    ],
                  },
                ],
              },
              then: "$email",
              else: null,
            },
          },
          phoneNumber: {
            $cond: {
              if: {
                $or: [
                  {
                    $eq: [
                      "$privacySettings.visibility.phoneNumber",
                      "everyone",
                    ],
                  },
                  {
                    $and: [
                      {
                        $eq: [
                          "$privacySettings.visibility.phoneNumber",
                          "friends",
                        ],
                      },
                      "$isFriend",
                    ],
                  },
                ],
              },
              then: "$phoneNumber",
              else: null,
            },
          },
          images: {
            $cond: {
              if: {
                $or: [
                  { $eq: ["$privacySettings.visibility.images", "everyone"] },
                  {
                    $and: [
                      {
                        $eq: ["$privacySettings.visibility.images", "friends"],
                      },
                      "$isFriend",
                    ],
                  },
                ],
              },
              then: {
                $map: {
                  input: "$images",
                  as: "image",
                  in: {
                    _id: "$$image._id",
                    path: "$$image.path",
                    // sort order
                    index: "$$image.index",
                  },
                },
              },
              else: [],
            },
          },
          colors: {
            $map: {
              input: "$colors",
              as: "color",
              in: {
                _id: "$$color._id",
                code: "$$color.code",
                users: "$$color.users",
                history: "$$color.history",
              },
            },
          },
          birthDate: {
            $cond: {
              if: {
                $or: [
                  { $eq: ["$privacySettings.visibility.age", "everyone"] },
                  {
                    $and: [
                      { $eq: ["$privacySettings.visibility.age", "friends"] },
                      "$isFriend",
                    ],
                  },
                ],
              },
              then: "$birthDate",
              else: null,
            },
          },
          gender: {
            $cond: {
              if: {
                $or: [
                  { $eq: ["$privacySettings.visibility.gender", "everyone"] },
                  {
                    $and: [
                      {
                        $eq: ["$privacySettings.visibility.gender", "friends"],
                      },
                      "$isFriend",
                    ],
                  },
                ],
              },
              then: "$gender",
              else: null,
            },
          },
          bio: {
            $cond: {
              if: {
                $or: [
                  { $eq: ["$privacySettings.visibility.bio", "everyone"] },
                  {
                    $and: [
                      { $eq: ["$privacySettings.visibility.bio", "friends"] },
                      "$isFriend",
                    ],
                  },
                ],
              },
              then: "$bio",
              else: null,
            },
          },
          maritalStatus: 1,
          nationality: {
            $cond: {
              if: {
                $or: [
                  {
                    $eq: [
                      "$privacySettings.visibility.nationality",
                      "everyone",
                    ],
                  },
                  {
                    $and: [
                      {
                        $eq: [
                          "$privacySettings.visibility.nationality",
                          "friends",
                        ],
                      },
                      "$isFriend",
                    ],
                  },
                ],
              },
              then: "$nationality",
              else: null,
            },
          },
          privacySettings: 1,
          lookingFor: 1,
          preferredCommunications: 1,

          smoking: 1,
          drinking: 1,
          education: 1,
          languages: 1,
          interests: 1,
          zodiacSign: 1,
          religion: 1,

          personalityType: 1,
          location: {
            $cond: {
              if: {
                $or: [
                  {
                    $eq: ["$privacySettings.visibility.location", "everyone"],
                  },
                  {
                    $and: [
                      {
                        $eq: [
                          "$privacySettings.visibility.location",
                          "friends",
                        ],
                      },
                      "$isFriend",
                    ],
                  },
                ],
              },
              then: "$location",
              else: null,
            },
          },
          canMsg: {
            // إضافة خاصية canMsg
            $cond: {
              if: {
                $or: [
                  {
                    $eq: ["$privacySettings.interactions.messages", "everyone"],
                  },
                  {
                    $and: [
                      {
                        $eq: [
                          "$privacySettings.interactions.messages",
                          "friends",
                        ],
                      },
                      "$isFriend",
                    ],
                  },
                ],
              },
              then: true,
              else: false,
            },
          },
          canAdd: {
            // إضافة خاصية canAdd
            $cond: {
              if: {
                $or: [
                  { $eq: ["$privacySettings.interactions.add", "everyone"] },
                  {
                    $and: [
                      { $eq: ["$privacySettings.interactions.add", "friends"] },
                      "$isFriend",
                    ],
                  },
                ],
              },
              then: true,
              else: false,
            },
          },
        },
      },
    ];

    // تنفيذ التجميع باستخدام الـ aggregation pipeline
    const result = await User.aggregate(aggregationPipeline);

    if (result.length === 0) {
      return callback({
        message: "User not found",
        type: "error",
      });
    }

    await visitUser({ args: { target: result[0]._id }, socket, redisClient });

    const fans = await Like.find({
      targetModel: "User",
      target: result[0]._id,
      reaction: { $ne: "dislike" },
    });

    const following = await Like.find({
      targetModel: "User",
      liker: result[0]._id,
      reaction: { $ne: "dislike" },
    });

    const visitors = await Visitor.find({
      visited: result[0]._id,
    });

    // إرسال البيانات عبر الـ socket و callback
    callback({
      message: "getOneUser",
      data: {
        ...result[0],
        fans,
        following,
        visitors,
      }, // المستخدم المسترجع بعد تطبيق الخصوصية
      type: "success",
    });
  } catch (error) {
    console.error("Error in getOneUser:", error);
    callback({
      message: "getOneUserError",
      data: error?.message || "Failed to fetch user details",
      type: "error",
    });
  }
};

const reactToUser = async ({ args, socket, redisClient }, callback) => {
  try {
    const { target, reaction, targetModel } = args;
    // console.log({ target, reaction, targetModel });

    const like = await Like.findOne({
      liker: socket.user._id,
      target,
      targetModel,
      reaction,
    });

    // if the user already liked the target, remove the like
    if (like) {
      await Like.findByIdAndDelete(like._id);
      callback({
        message: "react removed",
        data: like,
        type: "success",
        action: "remove",
      });
    } else {
      // if the user did not like the target, add the like
      const newLike = await Like.create({
        liker: socket.user._id,
        target,
        targetModel,
        reaction,
      });
      callback({
        message: "react added",
        data: newLike,
        type: "success",
        action: "add",
      });
      if (
        reaction !== "dislike" &&
        targetModel === "User" &&
        String(target) !== String(socket.user._id)
      ) {
        const [targetUser, likerUser] = await Promise.all([
          User.findById(target).select("+expoPushToken +settings +status"),
          User.findById(socket.user._id).select("firstName lastName userName"),
        ]);
        if (targetUser) {
          const likerName = getFullName(likerUser, true) || "Someone";
          const event = createNotificationEvent({
            type: NotificationTypes.LIKE_RECEIVED,
            title: "New like",
            body: `${likerName} liked your profile`,
            entityType: "user",
            entityId: likerUser?._id,
            route: "/users?tab=fans",
            priority: "normal",
            dedupeKey: `like_received:${String(likerUser?._id || "")}:${String(target)}`,
          });
          await emitAndMaybePushNotification({
            socket,
            redisClient,
            targetUserId: target,
            targetUser,
            event,
            pushAllowed: !!targetUser?.settings?.notifications?.likes,
          });
        }
      }
    }
  } catch (error) {
    console.warn({ error });
    callback({
      message: "reactToUserError",
      data: error?.message || "Failed to react to user",
      type: "error",
    });
  }
};

const likeUser = async ({ args, socket, redisClient }, callback) => {
  try {
    const { target } = args;

    // إزالة dislike لو موجود
    await Like.deleteOne({
      liker: socket.user._id,
      target,
      targetModel: "User",
      reaction: "dislike",
    });

    // التحقق إن كان like موجود
    const like = await Like.findOne({
      liker: socket.user._id,
      target,
      targetModel: "User",
      reaction: "like",
    });

    if (like) {
      callback({
        message: "like already exists",
        data: like,
        type: "success",
        action: "nothing",
      });
    } else {
      const newLike = await Like.create({
        liker: socket.user._id,
        target,
        targetModel: "User",
        reaction: "like",
      });

      callback({
        message: "like added",
        data: newLike,
        type: "success",
        action: "add",
      });
      if (String(target) !== String(socket.user._id)) {
        const [targetUser, likerUser] = await Promise.all([
          User.findById(target).select("+expoPushToken +settings +status"),
          User.findById(socket.user._id).select("firstName lastName userName"),
        ]);
        if (targetUser) {
          const likerName = getFullName(likerUser, true) || "Someone";
          const event = createNotificationEvent({
            type: NotificationTypes.LIKE_RECEIVED,
            title: "New like",
            body: `${likerName} liked your profile`,
            entityType: "user",
            entityId: likerUser?._id,
            route: "/users?tab=fans",
            priority: "normal",
            dedupeKey: `like_received:${String(likerUser?._id || "")}:${String(target)}`,
          });
          await emitAndMaybePushNotification({
            socket,
            redisClient,
            targetUserId: target,
            targetUser,
            event,
            pushAllowed: !!targetUser?.settings?.notifications?.likes,
          });
        }
      }
    }
  } catch (error) {
    console.warn({ error });
    callback({
      message: "likeUserError",
      data: error?.message || "Failed to like user",
      type: "error",
    });
  }
};

const dislikeUser = async ({ args, socket }, callback) => {
  try {
    const { target } = args;

    // إزالة like لو موجود
    const like = await Like.findOne({
      liker: socket.user._id,
      target,
      targetModel: "User",
      reaction: "like",
    });

    if (like) {
      await Like.findByIdAndDelete(like._id);
    }

    // التحقق إن كان dislike موجود
    const dislike = await Like.findOne({
      liker: socket.user._id,
      target,
      targetModel: "User",
      reaction: "dislike",
    });

    if (dislike) {
      callback({
        message: "dislike already exists",
        data: dislike,
        type: "success",
        action: "nothing",
      });
    } else {
      const newDislike = await Like.create({
        liker: socket.user._id,
        target,
        targetModel: "User",
        reaction: "dislike",
      });

      callback({
        message: "dislike added",
        data: newDislike,
        like,
        type: "success",
        action: "remove",
      });
    }
  } catch (error) {
    console.warn({ error });
    callback({
      message: "dislikeUserError",
      data: error?.message || "Failed to dislike user",
      type: "error",
    });
  }
};

const undoLikeOrDislike = async ({ args, socket }, callback) => {
  try {
    const { target } = args;
    const reaction = await Like.findOne({
      liker: socket.user._id,
      target,
      targetModel: "User",
    });

    if (reaction) {
      await Like.findByIdAndDelete(reaction._id);
      callback({
        message: "reaction removed",
        data: reaction,
        type: "success",
      });
    } else {
      callback({
        message: "reaction not found",
        data: null,
        type: "error",
      });
    }
  } catch (error) {
    console.warn({ error });
  }
};

const getSenderReactions = async ({ args, socket }, callback) => {
  try {
    const { targetModel } = args;
    const reactions = await Like.find({
      liker: socket.user._id,
      targetModel,
    });

    callback({
      message: "getSenderReactions",
      data: reactions,
      type: "success",
    });
  } catch (error) {
    console.warn({ error });
    callback({
      message: "getSenderReactionsError",
      data: error?.message || "Failed to get sender reactions",
      type: "error",
    });
  }
};

const getUserReactions = async ({ args, socket }, callback) => {
  try {
    const { targetModel, target } = args;
    const reactions = await Like.find({ targetModel, target });

    callback({
      message: "getUserReactions",
      data: reactions,
      type: "success",
    });
  } catch (error) {
    console.warn({ error });
    callback({
      message: "getUserReactionsError",
      data: error?.message || "Failed to get user reactions",
      type: "error",
    });
  }
};

const visitUser = async ({ args, socket, redisClient }) => {
  try {
    const { target } = args;

    if (socket.user._id.toString() === target.toString()) {
      return;
    }

    const existingVisitor = await Visitor.findOne({
      visitor: socket.user._id,
      visited: target,
    }).lean();

    const updatedVisitor = await Visitor.findOneAndUpdate(
      { visitor: socket.user._id, visited: target },
      {
        $inc: { count: 1 },
        $set: { visitedAt: new Date() },
      },
      { new: true, upsert: true }
    );

    const shouldNotifyVisit =
      !existingVisitor ||
      !existingVisitor.visitedAt ||
      Date.now() - new Date(existingVisitor.visitedAt).getTime() > 3 * 60 * 60 * 1000;
    if (shouldNotifyVisit) {
      const [targetUser, visitorUser] = await Promise.all([
        User.findById(target).select("+expoPushToken +settings +status"),
        User.findById(socket.user._id).select("firstName lastName userName"),
      ]);
      if (targetUser) {
        const visitorName = getFullName(visitorUser, true) || "Someone";
        const event = createNotificationEvent({
          type: NotificationTypes.PROFILE_VISITED,
          title: "Profile visit",
          body: `${visitorName} visited your profile`,
          entityType: "user",
          entityId: visitorUser?._id,
          route: "/users?tab=visitors",
          priority: "low",
          dedupeKey: `profile_visited:${String(visitorUser?._id || "")}:${String(target)}`,
        });
        await emitAndMaybePushNotification({
          socket,
          redisClient,
          targetUserId: target,
          targetUser,
          event,
          pushAllowed: true,
        });
      }
    }

    return updatedVisitor;
  } catch (error) {
    console.warn({ error });
  }
};

const userServices = {
  searchUsers,
  sendFriendRequest,
  cancelFriendRequest,
  acceptFriendRequest,
  removeFriend,
  getFriendsNRecentChats,
  blockUser,
  getMyConnections,
  userConnected,
  userDisconnected,
  disconnectDevice,
  searchUsersByMap,
  getOneUser,
  reactToUser,
  dislikeUser,
  likeUser,
  getSenderReactions,
  getUserReactions,
  userChangeStatus,
  undoLikeOrDislike,
  addUserSocketMapping,
  removeUserSocketMapping,
};

module.exports = userServices;
