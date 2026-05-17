const { default: mongoose } = require("mongoose");
const Message = require("../../models/message.model");
const Room = require("../../models/room.model");
const User = require("../../models/user.model");
const escapeRegExp = require("../../utils/escape-reg-exp");
const logger = require("../../utils/logger");
const {
  copyDefaultChatSettingsToRoom,
  checkChatPermission,
  isRoomAdmin,
  checkAdminPermission,
} = require("../../utils/permissions");

const MAX_PINNED_MESSAGES = 5;

const extractSocketIdsFromRedisValue = (raw) => {
  if (!raw) return [];
  const text = String(raw).trim();
  if (!text) return [];
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) {
      return parsed.map((x) => String(x)).filter(Boolean);
    }
  } catch (_) {}
  if (text.includes(",")) {
    return text
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean);
  }
  return [text];
};

const emitToUserSockets = async ({ io, redisClient, userId, eventName, payload }) => {
  if (!io || !eventName || !userId) return;
  const ids = new Set();
  if (redisClient?.isReady) {
    try {
      const raw = await redisClient.get(`user:${String(userId)}`);
      extractSocketIdsFromRedisValue(raw).forEach((sid) => ids.add(String(sid)));
      const rawList = await redisClient.get(`user_sockets:${String(userId)}`);
      extractSocketIdsFromRedisValue(rawList).forEach((sid) =>
        ids.add(String(sid))
      );
    } catch (_) {}
  }
  const socketsMap = io?.sockets?.sockets;
  if (socketsMap && typeof socketsMap.forEach === "function") {
    socketsMap.forEach((s) => {
      if (String(s?.user?._id || "") === String(userId) && s?.id) {
        ids.add(String(s.id));
      }
    });
  }
  for (const sid of ids) {
    io.to(sid).emit(eventName, payload);
  }
};

const pinMessage = async ({ args, socket, io, redisClient, callback }) => {
  try {
    const { room: roomId, messageId } = args || {};
    if (!roomId || !messageId) {
      if (typeof callback === "function") {
        callback({ type: "error", message: "Room and message required" });
      }
      return;
    }
    const room = await Room.findById(roomId);
    if (!room) {
      if (typeof callback === "function") {
        callback({ type: "error", message: "Room not found" });
      }
      return;
    }
    const userId = socket.user._id;
    const userIdStr = String(userId);
    const inRoom =
      (room.members || []).some((m) => String(m) === userIdStr) ||
      String(room.user || "") === userIdStr;
    if (!inRoom) {
      if (typeof callback === "function") {
        callback({ type: "error", message: "Forbidden" });
      }
      return;
    }
    if (room.isGroup) {
      const can = await checkAdminPermission(userId, roomId, "canPinMessages");
      if (!can) {
        if (typeof callback === "function") {
          callback({ type: "error", message: "Forbidden" });
        }
        return;
      }
    }

    const msg = await Message.findOne({
      _id: messageId,
      room: roomId,
      deletedForAll: { $ne: true },
    });
    if (!msg) {
      if (typeof callback === "function") {
        callback({ type: "error", message: "Message not found" });
      }
      return;
    }

    const pins = [...(room.pinnedMessages || [])];
    if (pins.map(String).includes(String(messageId))) {
      if (typeof callback === "function") {
        callback({ type: "success", pinnedMessages: pins });
      }
      return;
    }
    if (pins.length >= MAX_PINNED_MESSAGES) {
      if (typeof callback === "function") {
        callback({
          type: "error",
          message: "Maximum pinned messages reached",
        });
      }
      return;
    }

    pins.push(messageId);
    room.pinnedMessages = pins;
    await room.save();

    io.to(String(roomId)).emit("pinsUpdated", {
      room: roomId,
      pinnedMessages: room.pinnedMessages,
    });

    if (typeof callback === "function") {
      callback({ type: "success", pinnedMessages: room.pinnedMessages });
    }
  } catch (error) {
    logger.error("Error in pinMessage:", error);
    if (typeof callback === "function") {
      callback({ type: "error", message: error.message || "Failed to pin" });
    }
  }
};

const unpinMessage = async ({ args, socket, io, redisClient, callback }) => {
  try {
    const { room: roomId, messageId } = args || {};
    if (!roomId || !messageId) {
      if (typeof callback === "function") {
        callback({ type: "error", message: "Room and message required" });
      }
      return;
    }
    const room = await Room.findById(roomId);
    if (!room) {
      if (typeof callback === "function") {
        callback({ type: "error", message: "Room not found" });
      }
      return;
    }
    const userId = socket.user._id;
    const userIdStr = String(userId);
    const inRoom =
      (room.members || []).some((m) => String(m) === userIdStr) ||
      String(room.user || "") === userIdStr;
    if (!inRoom) {
      if (typeof callback === "function") {
        callback({ type: "error", message: "Forbidden" });
      }
      return;
    }
    if (room.isGroup) {
      const can = await checkAdminPermission(userId, roomId, "canPinMessages");
      if (!can) {
        if (typeof callback === "function") {
          callback({ type: "error", message: "Forbidden" });
        }
        return;
      }
    }

    await Room.findByIdAndUpdate(roomId, {
      $pull: { pinnedMessages: messageId },
    });
    const updated = await Room.findById(roomId).select("pinnedMessages").lean();

    io.to(String(roomId)).emit("pinsUpdated", {
      room: roomId,
      pinnedMessages: updated?.pinnedMessages || [],
    });

    if (typeof callback === "function") {
      callback({
        type: "success",
        pinnedMessages: updated?.pinnedMessages || [],
      });
    }
  } catch (error) {
    logger.error("Error in unpinMessage:", error);
    if (typeof callback === "function") {
      callback({ type: "error", message: error.message || "Failed to unpin" });
    }
  }
};

const getOneRoom = async function ({ args, socket, io, redisClient }) {
  const { room, update = false, applyReadReceipts = false } = args;
  const userObjectId = new mongoose.Types.ObjectId(socket.user._id);
  const roomObjectId = new mongoose.Types.ObjectId(room);
  logger.debug("Room update", { update });
  
  // ✅ Join socket room for real-time updates
  const roomIdString = roomObjectId.toString();
  socket.join(roomIdString);
  logger.info("User joined socket room:", {
    userId: userObjectId.toString(),
    roomId: roomIdString,
    socketId: socket.id,
  });
  
  try {
    if (!update && applyReadReceipts === true) {
      const allowed = await Room.exists({
        _id: roomObjectId,
        members: userObjectId,
        deletedForUsers: { $ne: userObjectId },
      });
      if (allowed) {
        const { markRoomMessagesSeenByUser } = require("./message.services");
        await markRoomMessagesSeenByUser({
          roomDb: roomObjectId,
          roomSocket: roomIdString,
          readerId: socket.user._id,
          socket,
        });
      }
    }

    // Fetch current user's friends
    const currentUser = await User.findById(userObjectId)
      .select("+friends")
      .lean();
    const friendIds = currentUser.friends || [];

    const rooms = await Room.aggregate([
      {
        $match: {
          _id: roomObjectId,
          members: userObjectId,
          deletedForUsers: { $ne: userObjectId },
        },
      },
      // Exclude the current user from members
      {
        $addFields: {
          members: {
            $filter: {
              input: "$members",
              as: "member",
              cond: { $ne: ["$$member", userObjectId] },
            },
          },
        },
      },
      // Lookup member details with privacy settings
      {
        $lookup: {
          from: "users",
          let: { memberIds: "$members" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $in: ["$_id", "$$memberIds"],
                },
              },
            },

            // Lookup images for each member
            {
              $lookup: {
                from: "images",
                localField: "images",
                foreignField: "_id",
                as: "images",
              },
            },
            // Lookup colors for each member
            {
              $lookup: {
                from: "colors",
                localField: "colors",
                foreignField: "_id",
                as: "colors",
              },
            },
            // Determine if the member is a friend
            {
              $addFields: {
                isFriend: { $in: ["$_id", friendIds] },
              },
            },
            // Apply privacy settings to each member
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
                          $eq: [
                            "$privacySettings.interactions.status",
                            "everyone",
                          ],
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
                          $eq: [
                            "$privacySettings.interactions.lastSeen",
                            "everyone",
                          ],
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
                        {
                          $eq: [
                            "$privacySettings.visibility.userName",
                            "everyone",
                          ],
                        },
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
                        {
                          $eq: [
                            "$privacySettings.visibility.fullName",
                            "everyone",
                          ],
                        },
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
                        {
                          $eq: [
                            "$privacySettings.visibility.fullName",
                            "everyone",
                          ],
                        },
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
                        {
                          $eq: [
                            "$privacySettings.visibility.email",
                            "everyone",
                          ],
                        },
                        {
                          $and: [
                            {
                              $eq: [
                                "$privacySettings.visibility.email",
                                "friends",
                              ],
                            },
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
                        {
                          $eq: [
                            "$privacySettings.visibility.images",
                            "everyone",
                          ],
                        },
                        {
                          $and: [
                            {
                              $eq: [
                                "$privacySettings.visibility.images",
                                "friends",
                              ],
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
                        {
                          $eq: ["$privacySettings.visibility.age", "everyone"],
                        },
                        {
                          $and: [
                            {
                              $eq: [
                                "$privacySettings.visibility.age",
                                "friends",
                              ],
                            },
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
                        {
                          $eq: [
                            "$privacySettings.visibility.gender",
                            "everyone",
                          ],
                        },
                        {
                          $and: [
                            {
                              $eq: [
                                "$privacySettings.visibility.gender",
                                "friends",
                              ],
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
                        {
                          $eq: ["$privacySettings.visibility.bio", "everyone"],
                        },
                        {
                          $and: [
                            {
                              $eq: [
                                "$privacySettings.visibility.bio",
                                "friends",
                              ],
                            },
                            "$isFriend",
                          ],
                        },
                      ],
                    },
                    then: "$bio",
                    else: null,
                  },
                },
                privacySettings: 1,
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
                maritalStatus: 1,
                lookingFor: 1,
                smoking: 1,

                drinking: 1,
                preferredCommunications: 1,
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
                          $eq: [
                            "$privacySettings.visibility.location",
                            "everyone",
                          ],
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
                          $eq: [
                            "$privacySettings.interactions.messages",
                            "everyone",
                          ],
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
                        {
                          $eq: [
                            "$privacySettings.interactions.add",
                            "everyone",
                          ],
                        },
                        {
                          $and: [
                            {
                              $eq: [
                                "$privacySettings.interactions.add",
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
              },
            },
          ],
          as: "memberDetails",
        },
      },
      // Lookup the last message
      {
        $lookup: {
          from: "messages",
          let: { roomId: "$_id" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$room", "$$roomId"] },
                    { $ne: ["$deletedForAll", true] },
                    {
                      $not: {
                        $in: [
                          userObjectId,
                          { $ifNull: ["$deletedForUsers", []] },
                        ],
                      },
                    },
                    {
                      $or: [
                        { $ne: ["$scheduleStatus", "scheduled"] },
                        { $eq: ["$user", userObjectId] },
                      ],
                    },
                  ],
                },
              },
            },
            { $sort: { createdAt: -1 } },
            { $limit: 1 },
          ],
          as: "lastMessage",
        },
      },
      {
        $unwind: {
          path: "$lastMessage",
          preserveNullAndEmptyArrays: true,
        },
      },
      // Count unread messages
      {
        $addFields: {
          members: {
            $filter: {
              input: "$members",
              as: "member",
              cond: { $ne: ["$$member", userObjectId] },
            },
          },
        },
      },

      {
        $lookup: {
          from: "messages",
          let: { roomId: "$_id" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$room", "$$roomId"] },
                    { $ne: ["$deletedForAll", true] },
                    {
                      $not: {
                        $in: [
                          userObjectId,
                          { $ifNull: ["$deletedForUsers", []] },
                        ],
                      },
                    },
                    {
                      $or: [
                        { $ne: ["$scheduleStatus", "scheduled"] },
                        { $eq: ["$user", userObjectId] },
                      ],
                    },
                    { $not: { $in: [userObjectId, "$seenBy"] } },
                    { $ne: ["$user", userObjectId] },
                  ],
                },
              },
            },
            { $count: "unreadCount" },
          ],
          as: "unreadMessages",
        },
      },
      {
        $addFields: {
          unreadMessagesCount: {
            $ifNull: [{ $arrayElemAt: ["$unreadMessages.unreadCount", 0] }, 0],
          },
        },
      },
      // Project the necessary fields
      {
        $project: {
          _id: 1,
          members: "$memberDetails",
          lastMessage: 1,
          unreadMessagesCount: 1,
          isGroup: 1,
          name: 1,
          description: 1,
          image: 1,
          roles: 1,
          type: 1,
          deletedForUsers: 1,
          canMsg: 1,
          canAdd: 1,
          // Live Stream fields
          isLiveStream: 1,
          liveStreamSettings: 1,
          broadcasters: 1,
          user: 1,
          e2ee: 1,
          adminPermissions: 1, // ✅ Admin permissions settings
          chatSettings: 1, // ✅ Chat settings for permissions
          pinnedMessages: 1,
          // Include other necessary room fields
        },
      },
    ]);
    
    // ✅ Debug: Log privacySettings.chatSettings for members
    if (rooms.length > 0 && rooms[0].members) {
      logger.debug("Room members privacySettings.chatSettings:", {
        roomId: rooms[0]._id,
        membersCount: rooms[0].members.length,
        membersChatSettings: rooms[0].members.map(m => ({
          userId: m._id,
          userName: m.userName,
          hasPrivacySettings: !!m.privacySettings,
          hasChatSettings: !!m.privacySettings?.chatSettings,
          chatSettings: m.privacySettings?.chatSettings,
        })),
      });
    }
    
    logger.debug("User rooms", { rooms });
    if (rooms.length > 0) {
      socket.emit("getOneRoom", { room: rooms[0], update: update });
    } else {
      socket.emit("getOneRoom", null);
    }
  } catch (err) {
    logger.error("Error in getMyRooms", { err });
    socket.emit("getOneRoomError", err.message);
  }
};

const getMyRooms = async function (
  { args, socket, io, redisClient },
  callback
) {
  const { page = 1, size = 25, search = "" } = args;
  const pageSize = parseInt(size);
  const skip = (page - 1) * pageSize;
  const userObjectId = new mongoose.Types.ObjectId(socket.user._id);
  // logger.debug("getMyRooms", args);

  try {
    const searchRegex = new RegExp(
      escapeRegExp(search).replace(/\s+/g, ".*"),
      "i"
    );

    // Fetch current user's friends
    const currentUser = await User.findById(userObjectId)
      .select("+friends")
      .lean();
    const friendIds = currentUser?.friends || [];

    const rooms = await Room.aggregate([
      {
        $match: {
          members: userObjectId,
          deletedForUsers: { $ne: userObjectId },
        },
      },
      // Exclude the current user from members
      {
        $addFields: {
          members: {
            $filter: {
              input: "$members",
              as: "member",
              cond: { $ne: ["$$member", userObjectId] },
            },
          },
        },
      },
      // Lookup member details
      {
        $lookup: {
          from: "users",
          let: { memberIds: "$members" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $in: ["$_id", "$$memberIds"],
                },
              },
            },

            // Lookup images for each member
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
            // Determine if the member is a friend
            {
              $addFields: {
                isFriend: { $in: ["$_id", friendIds] },
              },
            },
            // Apply privacy settings to each member
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
                          $eq: [
                            "$privacySettings.interactions.status",
                            "everyone",
                          ],
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
                          $eq: [
                            "$privacySettings.interactions.lastSeen",
                            "everyone",
                          ],
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
                        {
                          $eq: [
                            "$privacySettings.visibility.userName",
                            "everyone",
                          ],
                        },
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
                        {
                          $eq: [
                            "$privacySettings.visibility.fullName",
                            "everyone",
                          ],
                        },
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
                        {
                          $eq: [
                            "$privacySettings.visibility.fullName",
                            "everyone",
                          ],
                        },
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
                        {
                          $eq: [
                            "$privacySettings.visibility.email",
                            "everyone",
                          ],
                        },
                        {
                          $and: [
                            {
                              $eq: [
                                "$privacySettings.visibility.email",
                                "friends",
                              ],
                            },
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
                        {
                          $eq: [
                            "$privacySettings.visibility.images",
                            "everyone",
                          ],
                        },
                        {
                          $and: [
                            {
                              $eq: [
                                "$privacySettings.visibility.images",
                                "friends",
                              ],
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
                          $eq: [
                            "$privacySettings.visibility.location",
                            "everyone",
                          ],
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
                          $eq: [
                            "$privacySettings.interactions.messages",
                            "everyone",
                          ],
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
                        {
                          $eq: [
                            "$privacySettings.interactions.add",
                            "everyone",
                          ],
                        },
                        {
                          $and: [
                            {
                              $eq: [
                                "$privacySettings.interactions.add",
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
              },
            },
          ],
          as: "memberDetails",
        },
      },
      // Lookup the last message
      {
        $lookup: {
          from: "messages",
          let: { roomId: "$_id" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$room", "$$roomId"] },
                    { $ne: ["$deletedForAll", true] },
                    {
                      $not: {
                        $in: [
                          userObjectId,
                          { $ifNull: ["$deletedForUsers", []] },
                        ],
                      },
                    },
                    {
                      $or: [
                        { $ne: ["$scheduleStatus", "scheduled"] },
                        { $eq: ["$user", userObjectId] },
                      ],
                    },
                  ],
                },
              },
            },
            { $sort: { createdAt: -1 } },
            { $limit: 1 },
          ],
          as: "lastMessage",
        },
      },
      {
        $unwind: {
          path: "$lastMessage",
          preserveNullAndEmptyArrays: true,
        },
      },
      // Filter rooms based on search
      {
        $match: {
          $or: [
            { "lastMessage.text": searchRegex },
            { "memberDetails.firstName": searchRegex },
            { "memberDetails.lastName": searchRegex },
            { "memberDetails.userName": searchRegex },
          ],
        },
      },
      // Count unread messages
      {
        $lookup: {
          from: "messages",
          let: { roomId: "$_id" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$room", "$$roomId"] },
                    { $ne: ["$deletedForAll", true] },
                    {
                      $not: {
                        $in: [
                          userObjectId,
                          { $ifNull: ["$deletedForUsers", []] },
                        ],
                      },
                    },
                    {
                      $or: [
                        { $ne: ["$scheduleStatus", "scheduled"] },
                        { $eq: ["$user", userObjectId] },
                      ],
                    },
                    { $not: { $in: [userObjectId, "$seenBy"] } },
                    { $ne: ["$user", userObjectId] },
                  ],
                },
              },
            },
            { $count: "unreadCount" },
          ],
          as: "unreadMessages",
        },
      },
      {
        $addFields: {
          unreadMessagesCount: {
            $ifNull: [{ $arrayElemAt: ["$unreadMessages.unreadCount", 0] }, 0],
          },
        },
      },
      {
        $match: {
          lastMessage: { $ne: null },
        },
      },
      {
        $sort: {
          "lastMessage.createdAt": -1,
        },
      },
      {
        $skip: skip,
      },
      {
        $limit: pageSize,
      },
      // Project the necessary fields
      {
        $project: {
          _id: 1,
          members: "$memberDetails",
          passwords: 1,
          lastMessage: 1,
          unreadMessagesCount: 1,
          isGroup: 1,
          name: 1,
          description: 1,
          image: 1,
          roles: 1,
          type: 1,
          deletedForUsers: 1,
          canMsg: 1,
          canAdd: 1,
          user: 1, // ✅ Room owner/creator
          e2ee: 1,
          adminPermissions: 1, // ✅ Admin permissions settings
          chatSettings: 1, // ✅ Chat settings for permissions
          // Include other necessary room fields
        },
      },
    ]);

    callback({
      message: "Fetching rooms successfully",
      data: rooms,
      type: "success",
    });
  } catch (err) {
    logger.error("Error in getMyRooms", { err });
    callback({
      message: "Failed to fetch rooms",
      data: err.message,
      type: "error",
    });
  }
};

const updateRoom = async function ({ args, socket, io, redisClient }) {
  const { room, data } = args;
  logger.debug("Update room data", { data });
  const userObjectId = new mongoose.Types.ObjectId(socket.user._id);
  const roomObjectId = new mongoose.Types.ObjectId(room);
  logger.debug("updateRoom", args);

  try {
    // Check if this is a group info update (name, image, description)
    const isGroupInfoUpdate = data.name || data.image || data.description;
    // Check if this is an autoDeleteTimer update
    const isAutoDeleteUpdate = data.autoDeleteTimer !== undefined;
    
    // Fetch room to check permissions
    const roomPermissionData = await Room.findById(roomObjectId)
      .select("isGroup user chatSettings roles members adminPermissions")
      .lean();
    
    // ✅ Check if user is owner
    const userIdStr = userObjectId.toString();
    const isOwner = roomPermissionData?.user?.toString() === userIdStr;
    
    // ✅ Check editGroupInfo permission for name/image/description updates
    if (isGroupInfoUpdate && roomPermissionData?.isGroup && !isOwner) {
      const hasEditPermission = await checkChatPermission(
        userIdStr,
        roomObjectId.toString(),
        "editGroupInfo"
      );
      
      if (!hasEditPermission) {
        logger.warn("Permission denied for editGroupInfo", {
          userId: userIdStr,
          roomId: roomObjectId.toString(),
        });
        socket.emit("updateRoomError", {
          message: "You do not have permission to edit group info",
          type: "permission_denied",
        });
        return;
      }
    }
    
    // ✅ Check canModifyAutoDelete permission for autoDeleteTimer updates
    if (isAutoDeleteUpdate && !isOwner) {
      const { checkAdminPermission } = require("../../utils/permissions");
      const hasAutoDeletePermission = await checkAdminPermission(
        userIdStr,
        roomObjectId.toString(),
        "canModifyAutoDelete"
      );
      
      if (!hasAutoDeletePermission) {
        logger.warn("Permission denied for autoDeleteTimer", {
          userId: userIdStr,
          roomId: roomObjectId.toString(),
        });
        socket.emit("updateRoomError", {
          message: "You do not have permission to modify disappearing messages",
          type: "permission_denied",
        });
        return;
      }
    }
    
    // Fetch current user's friends
    const currentUser = await User.findById(userObjectId)
      .select("+friends")
      .lean();
    const friendIds = currentUser.friends || [];

    // Update the room with the provided data
    const updatedRoom = await Room.findOneAndUpdate(
      {
        _id: roomObjectId,
      },
      {
        $set: data,
      },
      {
        new: true,
      }
    );

    if (!updatedRoom) {
      socket.emit("updateRoomError", {
        message: "Room not found",
      });
      return;
    }

    const populatedRoom = await Room.populate(updatedRoom, {
      path: "members",
      select:
        "email phoneNumber lastSeen status userName firstName lastName images privacySettings blockedUsers roles isGroup",
      populate: {
        path: "images",
        select: "path",
      },
      model: "User",
    });

    // تحويل البيانات إلى كائن لتعديله
    const roomData = populatedRoom.toObject();

    if (roomData) {
      // Get the current user who performed the action
      const currentUserData = await User.findById(userObjectId, {
        email: 1,
        phoneNumber: 1,
        userName: 1,
        firstName: 1,
        lastName: 1,
        privacySettings: 1,
        roles: 1,
      }).populate("images", "path");

      if (data.name) {
        socket.emit("sendLinkerMsg", {
          user: {
            ...currentUserData.toObject(),
          },
          performedBy: {
            ...currentUserData.toObject(),
          },
          room: roomData,
          action: "updatedRoomName",
        });
      }
      if (data.image) {
        socket.emit("sendLinkerMsg", {
          user: {
            ...currentUserData.toObject(),
          },
          performedBy: {
            ...currentUserData.toObject(),
          },
          room: roomData,
          action: "updatedRoomImage",
        });
      }

      roomData.members.forEach(async (member) => {
        await emitToUserSockets({
          io,
          redisClient,
          userId: member._id.toString(),
          eventName: "fetchUpdatedRoom",
          payload: { room: roomData._id },
        });
      });
    }
  } catch (err) {
    logger.error("Error in getMyRooms", { err });
    socket.emit("updateRoomError", {
      message: "An error occurred while updating the room",
    });
  }
};

const exitRoom = async function ({ args, socket, io, redisClient }) {
  const { room } = args;
  const roomObjectId = new mongoose.Types.ObjectId(room);
  const userObjectId = new mongoose.Types.ObjectId(socket.user._id);

  console.log("exitRoom", args);

  try {
    // Update the room by removing the user
    const updatedRoom = await Room.findByIdAndUpdate(
      roomObjectId,
      { $pull: { members: userObjectId } },
      { new: true }
    );

    if (!updatedRoom) {
      socket.emit("exitRoomError", {
        message: "Room not found or access denied",
      });
      return;
    }

    // إحضار تفاصيل العضو الجديد مع الأعضاء الموجودين
    const populatedRoom = await Room.populate(updatedRoom, {
      path: "members",
      select:
        "email phoneNumber lastSeen status userName firstName lastName images privacySettings blockedUsers roles isGroup",
      populate: {
        path: "images",
        select: "path",
      },
      model: "User",
    });

    // تحويل البيانات إلى كائن لتعديله
    const roomData = populatedRoom.toObject();

    if (roomData) {
      // Notify the exiting user that they have left the room
      socket.emit("removeRoom", {
        message: "You have successfully left the room",
        room: roomObjectId,
      });

      // Emit 'sendLinkerMsg' to the exiting user
      // Note: User object is sent to frontend in sendLinkerMsg event - frontend handles user object display
      socket.emit("sendLinkerMsg", {
        user: socket.user._id,
        room: roomData,
        action: "exitedTheRoom",
      });

      // Emit 'updateRoom' to all remaining members
      roomData.members.forEach(async (member) => {
        await emitToUserSockets({
          io,
          redisClient,
          userId: member._id.toString(),
          eventName: "fetchUpdatedRoom",
          payload: { room: roomData._id },
        });
      });
    } else {
      socket.emit("exitRoomError", {
        message: "Room not found or access denied",
      });
    }
  } catch (err) {
    logger.error("Error in getMyRooms", { err });
    socket.emit("exitRoomError", {
      message: "An error occurred while exiting the room",
    });
  }
};
const addMemberToRoom = async function ({ args, socket, io, redisClient }) {
  const { room, newMember } = args;
  const roomObjectId = new mongoose.Types.ObjectId(room);
  const newMemberObjectId = new mongoose.Types.ObjectId(newMember);
  const userObjectId = new mongoose.Types.ObjectId(socket.user._id);

  try {
    // ✅ Check if this is a group chat and verify canInviteMembers permission
    const roomCheck = await Room.findById(roomObjectId).select("isGroup members").lean();
    if (roomCheck?.isGroup || roomCheck?.members?.length >= 2) {
      const { checkAdminPermission } = require("../../utils/permissions");
      const hasPermission = await checkAdminPermission(
        userObjectId.toString(),
        roomObjectId.toString(),
        "canInviteMembers"
      );
      
      if (!hasPermission) {
        logger.warn("Permission denied for adding member", {
          userId: userObjectId.toString(),
          roomId: room,
          newMemberId: newMember,
        });
        socket.emit("addMemberToRoomError", {
          message: "You do not have permission to add members",
          type: "permission_denied",
        });
        return;
      }
    }
    
    // البحث عن الغرفة والتحقق مما إذا كان العضو الجديد موجودًا بالفعل
    const existingRoom = await Room.findOne({
      _id: roomObjectId,
      members: newMemberObjectId,
    });

    if (existingRoom) {
      socket.emit("addMemberToRoomError", {
        message: "User is already a member of the room",
      });
      return;
    }

    // تحديث الغرفة بإضافة العضو الجديد
    let updatedRoom = await Room.findByIdAndUpdate(
      roomObjectId,
      { $addToSet: { members: newMemberObjectId } }, // `addToSet` يمنع التكرار
      { new: true }
    );

    if (!updatedRoom) {
      socket.emit("addMemberToRoomError", {
        message: "Room not found or access denied",
      });
      return;
    }

    // التحقق مما إذا كانت الغرفة قد أصبحت مجموعة (أكثر من عضوين)
    const isGroup = updatedRoom.members.length > 2;
    if (isGroup) {
      updatedRoom = await Room.findByIdAndUpdate(
        roomObjectId,
        {
          $set: { isGroup: true },
        },
        { new: true }
      );
    }

    // إذا كانت هذه هي المرة الأولى التي يتم فيها تحويل الدردشة إلى مجموعة
    if (isGroup && updatedRoom.members.length === 3) {
      // تحديث صاحب الروم ليصبح الشخص الذي حوّل الدردشة إلى مجموعة
      // هذا يحل مشكلة: أ أنشأ دردشة مع ب، ثم ب أضاف ج → ب يصبح المالك
      updatedRoom = await Room.findByIdAndUpdate(
        roomObjectId,
        {
          $set: { user: userObjectId },
        },
        { new: true }
      );

      // التحقق مما إذا كان دور "admin" غير موجود بالفعل
      const hasAdmin = updatedRoom.roles.some((role) => role.role === "admin");

      if (!hasAdmin) {
        // إعطاء دور "admin" للمستخدم الذي أضاف العضو الثالث (المالك الجديد)
        updatedRoom = await Room.findByIdAndUpdate(
          roomObjectId,
          {
            $addToSet: { roles: { user: userObjectId, role: "admin" } },
          },
          { new: true }
        );
      }
    }

    // إحضار تفاصيل العضو الجديد مع الأعضاء الموجودين
    const populatedRoom = await Room.populate(updatedRoom, {
      path: "members",
      select:
        "email phoneNumber lastSeen status userName firstName lastName images privacySettings blockedUsers roles isGroup",
      populate: {
        path: "images",
        select: "path",
      },
      model: "User",
    });

    // تحويل البيانات إلى كائن لتعديله
    const roomData = populatedRoom.toObject();

    // جلب الأدوار من الغرفة
    const roles = updatedRoom.roles;

    // إضافة الأدوار إلى بيانات الغرفة
    roomData.roles = roles;

    // إرسال التحديث إلى جميع أعضاء الغرفة عبر Socket
    roomData.members.forEach(async (member) => {
      await emitToUserSockets({
        io,
        redisClient,
        userId: member._id.toString(),
        eventName: "fetchUpdatedRoom",
        payload: { room: roomData._id },
      });
    });

    // E2EE: ask an online member to wrap the room key for the new participant
    try {
      const rE2ee = await Room.findById(roomObjectId)
        .select("e2ee e2eeKeyPackages")
        .lean();
      if (rE2ee?.e2ee?.enabled) {
        const kv = rE2ee.e2ee.keyVersion || 1;
        const targetKeys = await User.findById(newMemberObjectId)
          .select("chatDevices")
          .lean();
        const devs = targetKeys?.chatDevices || [];
        const lastDev = devs.length ? devs[devs.length - 1] : null;
        io.to(roomObjectId.toString()).emit("e2eeRequestWrapForMember", {
          roomId: roomObjectId.toString(),
          targetUserId: newMemberObjectId.toString(),
          keyVersion: kv,
          x25519Public: lastDev?.x25519Public || null,
          ed25519Public: lastDev?.ed25519Public || null,
          deviceId: lastDev?.deviceId || null,
        });
      }
    } catch (e2eeErr) {
      logger.warn("e2eeRequestWrapForMember after addMember", e2eeErr);
    }

    // Note: Privacy settings are checked in authorization service before allowing room access
    const newMemberData = await User.findById(newMemberObjectId, {
      email: 1,
      phoneNumber: 1,
      userName: 1,
      firstName: 1,
      lastName: 1,
      privacySettings: 1,
      roles: 1,
    }).populate("images", "path");

    // إشعار العضو الجديد بأنه تمت إضافته إلى الغرفة
    const currentUserData = await User.findById(userObjectId, {
      email: 1,
      phoneNumber: 1,
      userName: 1,
      firstName: 1,
      lastName: 1,
      privacySettings: 1,
      roles: 1,
    }).populate("images", "path");

    socket.emit("sendLinkerMsg", {
      user: {
        ...newMemberData.toObject(),
      },
      performedBy: {
        ...currentUserData.toObject(),
      },
      room: roomData,
      action: "addedToTheRoom",
    });
  } catch (err) {
    logger.error("Error in getMyRooms", { err });
    socket.emit("addMemberToRoomError", {
      message: "An error occurred while adding the member to the room",
    });
  }
};

const removeMemberFromRoom = async function ({
  args,
  socket,
  io,
  redisClient,
}) {
  const { room, member } = args;
  const roomObjectId = new mongoose.Types.ObjectId(room);
  const memberObjectId = new mongoose.Types.ObjectId(member);
  const userObjectId = new mongoose.Types.ObjectId(socket.user._id);

  console.log("removeMemberFromRoom", args);

  try {
    // ✅ Check canKickMembers permission
    const { checkAdminPermission } = require("../../utils/permissions");
    const hasPermission = await checkAdminPermission(
      userObjectId.toString(),
      roomObjectId.toString(),
      "canKickMembers"
    );
    
    if (!hasPermission) {
      logger.warn("Permission denied for removing member", {
        userId: userObjectId.toString(),
        roomId: room,
        memberId: member,
      });
      socket.emit("removeMemberFromRoomError", {
        message: "You do not have permission to remove members",
        type: "permission_denied",
      });
      return;
    }
    
    // Find the room and check if the member to be removed is a part of it
    const existingRoom = await Room.findOne({
      _id: roomObjectId,
      members: memberObjectId,
    });

    if (!existingRoom) {
      socket.emit("removeMemberFromRoomError", {
        message: "User is not a member of the room",
      });
      return;
    }

    // Update the room by removing the member
    const updatedRoom = await Room.findByIdAndUpdate(
      roomObjectId,
      {
        $pull: {
          members: memberObjectId,
          roles: { user: memberObjectId }, // Remove the member's role if it exists
        },
      },
      { new: true }
    );

    if (!updatedRoom) {
      socket.emit("removeMemberFromRoomError", {
        message: "Room not found or access denied",
      });
      return;
    }

    // Populate the remaining members details
    const populatedRoom = await Room.populate(updatedRoom, {
      path: "members",
      select:
        "email phoneNumber lastSeen status userName firstName lastName images privacySettings blockedUsers roles isGroup",
      populate: {
        path: "images",
        select: "path",
      },
      model: "User",
    });

    // Notify the removed member that they have been removed from the room
    await emitToUserSockets({
      io,
      redisClient,
      userId: memberObjectId.toString(),
      eventName: "removeRoom",
      payload: {
        room: roomObjectId,
        message: "You have been removed from the room",
      },
    });

    const roomData = populatedRoom.toObject();

    roomData.members.forEach(async (member) => {
      await emitToUserSockets({
        io,
        redisClient,
        userId: member._id.toString(),
        eventName: "fetchUpdatedRoom",
        payload: { room: roomData._id },
      });
    });

    const memberData = await User.findById(memberObjectId, {
      email: 1,
      phoneNumber: 1,
      userName: 1,
      firstName: 1,
      lastName: 1,
      privacySettings: 1,
      roles: 1,
    }).populate("images", "path");

    // Notify the member that they have been removed from the room
    const currentUserData = await User.findById(userObjectId, {
      email: 1,
      phoneNumber: 1,
      userName: 1,
      firstName: 1,
      lastName: 1,
      privacySettings: 1,
      roles: 1,
    }).populate("images", "path");

    socket.emit("sendLinkerMsg", {
      user: {
        ...memberData.toObject(),
      },
      performedBy: {
        ...currentUserData.toObject(),
      },
      room: roomData,
      action: "removedFromTheRoom",
    });
  } catch (err) {
    logger.error("Error in getMyRooms", { err });
    socket.emit("removeMemberFromRoomError", {
      message: "An error occurred while removing the member from the room",
    });
  }
};

const changeUserRole = async function ({ args, socket, io, redisClient }) {
  const { room, member, newRole } = args;
  const roomObjectId = new mongoose.Types.ObjectId(room);
  const memberObjectId = new mongoose.Types.ObjectId(member);
  const userObjectId = new mongoose.Types.ObjectId(socket.user._id);

  console.log("changeUserRole", args);
  try {
    // Validate newRole
    const validRoles = ["admin", "moderator", "member"];
    if (!validRoles.includes(newRole)) {
      socket.emit("changeUserRoleError", {
        message: "Invalid role specified",
      });
      return;
    }

    // ✅ Check canManageRoles permission
    const { checkAdminPermission } = require("../../utils/permissions");
    const hasPermission = await checkAdminPermission(
      userObjectId.toString(),
      roomObjectId.toString(),
      "canManageRoles"
    );
    
    if (!hasPermission) {
      logger.warn("Permission denied for changing role", {
        userId: userObjectId.toString(),
        roomId: room,
        memberId: member,
        newRole,
      });
      socket.emit("changeUserRoleError", {
        message: "You do not have permission to manage roles",
        type: "permission_denied",
      });
      return;
    }

    // Find the room and check if the member is part of it
    const existingRoom = await Room.findOne({
      _id: roomObjectId,
      members: memberObjectId,
    });

    if (!existingRoom) {
      socket.emit("changeUserRoleError", {
        message: "Room or member not found",
      });
      return;
    }

    // Check if the current user is the room owner
    const isCurrentUserOwner = existingRoom.user?.toString() === userObjectId.toString();
    
    // Check if the target member is the room owner
    const isTargetOwner = existingRoom.user?.toString() === memberObjectId.toString();
    
    // Prevent changing the owner's role
    if (isTargetOwner) {
      socket.emit("changeUserRoleError", {
        message: "Cannot change the owner's role",
      });
      return;
    }

    // Get current user's role in the room
    const currentUserRole = existingRoom.roles.find(
      (role) => role.user.toString() === userObjectId.toString()
    );
    
    // Get target member's current role
    const targetMemberRole = existingRoom.roles.find(
      (role) => role.user.toString() === memberObjectId.toString()
    );

    // Permission check:
    // - Owner can change any role (including promoting to admin)
    // - Admins can only change moderators and members (not other admins)
    // - Admins cannot promote to admin (only owner can)
    if (!isCurrentUserOwner) {
      // Not owner, must be admin
      if (!currentUserRole || currentUserRole.role !== "admin") {
        socket.emit("changeUserRoleError", {
          message: "You do not have permission to change roles",
        });
        return;
      }
      
      // Admins cannot modify other admins
      if (targetMemberRole?.role === "admin") {
        socket.emit("changeUserRoleError", {
          message: "Only the owner can modify admin roles",
        });
        return;
      }
      
      // Admins cannot promote to admin
      if (newRole === "admin") {
        socket.emit("changeUserRoleError", {
          message: "Only the owner can assign admin role",
        });
        return;
      }
    }

    // Update the member's role
    let updatedRoom = await Room.findOneAndUpdate(
      {
        _id: roomObjectId,
        "roles.user": memberObjectId,
      },
      {
        $set: { "roles.$.role": newRole },
      },
      {
        new: true,
      }
    );

    if (!updatedRoom) {
      // If the member does not already have a role, add it
      updatedRoom = await Room.findByIdAndUpdate(
        roomObjectId,
        {
          $addToSet: { roles: { user: memberObjectId, role: newRole } },
        },
        { new: true }
      );
    }

    console.log({ updatedRoom, updatedRoomRoles: updatedRoom.roles });

    // Populate the room with the updated roles and member details
    const populatedRoom = await Room.populate(updatedRoom, {
      path: "members",
      select:
        "email phoneNumber lastSeen status userName firstName lastName images privacySettings blockedUsers roles isGroup",
      populate: {
        path: "images",
        select: "path",
      },
    });

    const roomData = populatedRoom.toObject();
    
    // Ensure roles are included in roomData
    roomData.roles = updatedRoom.roles;
    console.log("roomData before emit:", { 
      roomId: roomData._id, 
      roles: roomData.roles,
      rolesLength: roomData.roles?.length 
    });

    // Emit the role change update to all members of the room
    roomData.members.forEach(async (member) => {
      await emitToUserSockets({
        io,
        redisClient,
        userId: member._id.toString(),
        eventName: "fetchUpdatedRoom",
        payload: { room: roomData._id },
      });
    });

    // Emit the specific role change event to the member whose role was changed
    const memberData = await User.findById(memberObjectId, {
      email: 1,
      phoneNumber: 1,
      userName: 1,
      firstName: 1,
      lastName: 1,
      privacySettings: 1,
      roles: 1,
    }).populate("images", "path");

    // Get the current user who performed the action
    const currentUserData = await User.findById(userObjectId, {
      email: 1,
      phoneNumber: 1,
      userName: 1,
      firstName: 1,
      lastName: 1,
      privacySettings: 1,
      roles: 1,
    }).populate("images", "path");

    socket.emit("sendLinkerMsg", {
      user: {
        ...memberData.toObject(),
      },
      performedBy: {
        ...currentUserData.toObject(),
      },
      room: roomData,
      action: `roleChangedTo${newRole}`,
    });
  } catch (err) {
    logger.error("Error in changeUserRole", { err });
    socket.emit("changeUserRoleError", {
      message: "An error occurred while changing the user role",
    });
  }
};

// const createRoom = async function (
//   { args, socket, io, redisClient },
//   callback
// ) {
//   const { receiverId } = args;
//   const userObjectId = new mongoose.Types.ObjectId(socket.user._id);

//   try {
//     // إذا كان المستخدم يحاول إنشاء غرفة مع نفسه (محادثة ذاتية)
//     if (receiverId === userObjectId.toString()) {
//       // تحقق إذا كانت الغرفة موجودة مسبقاً
//       const selfRoomExists = await Room.findOne({
//         members: { $all: [userObjectId], $size: 1 },
//       })
//         .populate({
//           path: "members",
//           select:
//             "email phoneNumber lastSeen status userName firstName lastName images privacySettings blockedUsers roles isGroup",
//           populate: {
//             path: "images",
//             select: "path", // تحديد الصور لجلب الحقل 'path' فقط
//           },
//           model: "User",
//         })
//         .exec();

//       if (selfRoomExists) {
//         // socket.emit("createRoom", {
//         //   message: "Self-chat room already exists",
//         //   data: selfRoomExists,
//         //   type: "success",
//         // });
//         callback({
//           message: "Self-chat room already exists",
//           data: selfRoomExists,
//           type: "success",
//         });
//       } else {
//         // إنشاء غرفة جديدة للمحادثة الذاتية
//         const newRoom = new Room({
//           user: userObjectId,
//           members: [userObjectId],
//         });

//         const savedRoom = await newRoom.save();

//         const populatedRoom = await Room.findById(savedRoom._id)
//           .populate({
//             path: "members",
//             select:
//               "email phoneNumber lastSeen status userName firstName lastName images privacySettings blockedUsers roles isGroup",
//             populate: {
//               path: "images",
//               select: "path", // تحديد الصور لجلب الحقل 'path' فقط
//             },
//             model: "User",
//           })
//           .exec();

//         // socket.emit("createRoom", {
//         //   message: "Self-chat room created successfully!",
//         //   data: populatedRoom,
//         //   type: "success",
//         // });
//         callback({
//           message: "Self-chat room created successfully!",
//           data: populatedRoom,
//           type: "success",
//         });
//       }
//     } else {
//       // تحقق من وجود غرفة مسبقاً بين المستخدم والمستقبل
//       const roomExists = await Room.findOne({
//         members: { $all: [userObjectId, receiverId], $size: 2 },
//       })
//         .populate({
//           path: "members",
//           select:
//             "email phoneNumber lastSeen status userName firstName lastName images privacySettings blockedUsers roles isGroup",
//           populate: {
//             path: "images",
//             select: "path", // تحديد الصور لجلب الحقل 'path' فقط
//           },
//           model: "User",
//         })
//         .exec();

//       if (roomExists) {
//         // socket.emit("createRoom", {
//         //   message: "Room already exists",
//         //   data: roomExists,
//         //   type: "success",
//         // });
//         const populatedRoom = await Room.findById(roomExists._id)
//           .populate({
//             path: "members",
//             select:
//               "email phoneNumber lastSeen status userName firstName lastName images privacySettings blockedUsers roles isGroup",
//             populate: {
//               path: "images",
//               select: "path", // تحديد الصور لجلب الحقل 'path' فقط
//             },
//             model: "User",
//           })
//           .exec();
//         // populatedRoom.isGroup = populatedRoom.members.length > 2;

//         // Add fields for isGroup and filter members
//         const roomData = {
//           ...populatedRoom.toObject(),
//           isGroup: populatedRoom.members.length > 2,
//           members: populatedRoom.members.filter(
//             (member) => !member._id.equals(userObjectId)
//           ),
//         };

//         callback({
//           message: "Room already exists",
//           data: roomData,
//           type: "success",
//         });
//       } else {
//         const newRoom = new Room({
//           user: userObjectId,
//           members: [userObjectId, receiverId],
//         });

//         const savedRoom = await newRoom.save();

//         const populatedRoom = await Room.findById(savedRoom._id)
//           .populate({
//             path: "members",
//             select:
//               "email phoneNumber lastSeen status userName firstName lastName images privacySettings blockedUsers roles isGroup",
//             populate: {
//               path: "images",
//               select: "path", // تحديد الصور لجلب الحقل 'path' فقط
//             },
//             model: "User",
//           })
//           .exec();
//         const roomData = {
//           ...populatedRoom.toObject(),
//           isGroup: populatedRoom.members.length > 2,
//           members: populatedRoom.members.filter(
//             (member) => !member._id.equals(userObjectId)
//           ),
//         };

//         // socket.emit("createRoom", {
//         //   message: "Room created successfully!",
//         //   data: populatedRoom,
//         //   type: "success",
//         // });
//         callback({
//           message: "Room created successfully!",
//           data: roomData,
//           type: "success",
//         });
//       }
//     }
//   } catch (err) {
//     // socket.emit("createRoomError", { message: err.message, type: "error" });
//     callback({
//       message: err.message,
//       type: "error",
//     });
//   }
// };

const createRoom = async function (
  { args, socket, io, redisClient },
  callback
) {
  const { receiverId } = args;
  const userObjectId = new mongoose.Types.ObjectId(socket.user._id);

  try {
    // إذا كان المستخدم يحاول إنشاء غرفة مع نفسه (محادثة ذاتية)
    if (receiverId === userObjectId.toString()) {
      // تحقق إذا كانت الغرفة موجودة مسبقاً
      const selfRoomExists = await Room.findOne({
        members: { $all: [userObjectId], $size: 1 },
      })
        .populate({
          path: "members",
          select:
            "email phoneNumber lastSeen status userName firstName lastName images privacySettings blockedUsers roles isGroup colors passwords",
          populate: [
            {
              path: "images",
              select: "path", // تحديد الصور لجلب الحقل 'path' فقط
            },
            {
              path: "colors",
              select: "code users history _id name",
            },
          ],
          model: "User",
        })
        .exec();

      if (selfRoomExists) {
        const roomData = applyPrivacySettings(selfRoomExists, userObjectId);
        callback({
          message: "Self-chat room already exists",
          data: roomData,
          type: "success",
        });
      } else {
        // إنشاء غرفة جديدة للمحادثة الذاتية
        // ✅ Copy default chat settings from user
        const roomData = await copyDefaultChatSettingsToRoom(userObjectId, {
          user: userObjectId,
          members: [userObjectId],
        });
        
        const newRoom = new Room(roomData);

        const savedRoom = await newRoom.save();

        const populatedRoom = await Room.findById(savedRoom._id)
          .populate({
            path: "members",
            select:
              "email phoneNumber lastSeen status userName firstName lastName images privacySettings blockedUsers roles isGroup colors passwords",
            populate: [
              { 
                path: "images",
                select: "path", // تحديد الصور لجلب الحقل 'path' فقط
              },
              {
                path: "colors",
                select: "code users history _id name",
              },
            ],
            model: "User",
          })
          .exec();

        const finalRoomData = applyPrivacySettings(populatedRoom, userObjectId);
        callback({
          message: "Self-chat room created successfully!",
          data: finalRoomData,
          type: "success",
        });
      }
    } else {
      // تحقق من وجود غرفة مسبقاً بين المستخدم والمستقبل
      const roomExists = await Room.findOne({
        members: { $all: [userObjectId, receiverId], $size: 2 },
      })
        .populate({
          path: "members",
          select:
            "email phoneNumber lastSeen status userName firstName lastName images privacySettings blockedUsers roles isGroup colors passwords",
          populate: [
            {
              path: "images",
              select: "path", // تحديد الصور لجلب الحقل 'path' فقط
            },
            {
              path: "colors",
              select: "code users history _id name",
            },
          ],
          model: "User",
        })
        .exec();

      if (roomExists) {
        const populatedRoom = await Room.findById(roomExists._id)
          .populate({
            path: "members",
            select:
              "email phoneNumber lastSeen status userName firstName lastName images privacySettings blockedUsers roles isGroup colors passwords",
            populate: [
              {
                path: "images",
                select: "path", // تحديد الصور لجلب الحقل 'path' فقط
              },
              {
                path: "colors",
                select: "code users history _id name",
              },
            ],
            model: "User",
          })
          .exec();

        const roomData = applyPrivacySettings(populatedRoom, userObjectId);
        callback({
          message: "Room already exists",
          data: roomData,
          type: "success",
        });
      } else {
        // ✅ Check if receiver has messageRequestsEnabled and if they're not friends
        const receiverObjectId = new mongoose.Types.ObjectId(receiverId);
        const receiver = await User.findById(receiverObjectId)
          .select("friends privacySettings.interactions.messageRequestsEnabled")
          .lean();
        
        const senderIsFriend = receiver?.friends?.some(
          (friendId) => friendId?.toString() === userObjectId.toString()
        );
        const messageRequestsEnabled = receiver?.privacySettings?.interactions?.messageRequestsEnabled;
        
        // Determine if this should be a request
        const isRequest = messageRequestsEnabled && !senderIsFriend;
        
        // ✅ Copy default chat settings from user
        const roomData = await copyDefaultChatSettingsToRoom(userObjectId, {
          user: userObjectId,
          members: [userObjectId, receiverObjectId],
          isRequest: isRequest,
          ...(isRequest && { requestStatus: "pending" }),
        });
        
        const newRoom = new Room(roomData);

        const savedRoom = await newRoom.save();
        
        // Log if this is a message request
        if (isRequest) {
          logger.info("Message request created", {
            from: userObjectId.toString(),
            to: receiverId,
            roomId: savedRoom._id,
          });
        }

        const populatedRoom = await Room.findById(savedRoom._id)
          .populate({
            path: "members",
            select:
              "email phoneNumber lastSeen status userName firstName lastName images privacySettings blockedUsers roles isGroup colors passwords",
            populate: [
              {
                path: "images",
                select: "path", // تحديد الصور لجلب الحقل 'path' فقط
              },
              {
                path: "colors",
                select: "code users history _id name",
              },
            ],
            model: "User",
          })
          .exec();

        const finalRoomData = applyPrivacySettings(populatedRoom, userObjectId);
        callback({
          message: "Room created successfully!",
          data: finalRoomData,
          type: "success",
        });
      }
    }
  } catch (err) {
    callback({
      message: err.message,
      type: "error",
    });
  }
};

function applyPrivacySettings(room, currentUserId) {
  const roomData = room.toObject();
  roomData.members = roomData.members.map((member) => {
    if (member._id.equals(currentUserId)) {
      return member;
    }

    const privacySettings = member.privacySettings;
    return {
      ...member,
      userName:
        privacySettings?.visibility?.userName === "everyone" ||
        (privacySettings?.visibility?.userName === "friends" && member.isFriend)
          ? member.userName
          : null,
      firstName:
        privacySettings?.visibility?.fullName === "everyone" ||
        (privacySettings?.visibility?.fullName === "friends" && member.isFriend)
          ? member.firstName
          : null,
      lastName:
        privacySettings?.visibility?.fullName === "everyone" ||
        (privacySettings?.visibility?.fullName === "friends" && member.isFriend)
          ? member.lastName
          : null,
      email:
        privacySettings?.visibility?.email === "everyone" ||
        (privacySettings?.visibility?.email === "friends" && member.isFriend)
          ? member.email
          : null,
      phoneNumber:
        privacySettings?.visibility?.phoneNumber === "everyone" ||
        (privacySettings?.visibility?.phoneNumber === "friends" &&
          member.isFriend)
          ? member.phoneNumber
          : null,
      images:
        privacySettings?.visibility?.images === "everyone" ||
        (privacySettings?.visibility?.images === "friends" && member.isFriend)
          ? member.images
          : [],
      birthDate:
        privacySettings?.visibility?.age === "everyone" ||
        (privacySettings?.visibility?.age === "friends" && member.isFriend)
          ? member.birthDate
          : null,
      gender:
        privacySettings?.visibility?.gender === "everyone" ||
        (privacySettings?.visibility?.gender === "friends" && member.isFriend)
          ? member.gender
          : null,
      bio:
        privacySettings?.visibility?.bio === "everyone" ||
        (privacySettings?.visibility?.bio === "friends" && member.isFriend)
          ? member.bio
          : null,
      maritalStatus:
        privacySettings?.visibility?.maritalStatus === "everyone" ||
        (privacySettings?.visibility?.maritalStatus === "friends" &&
          member.isFriend)
          ? member.maritalStatus
          : null,
      nationality:
        privacySettings?.visibility?.nationality === "everyone" ||
        (privacySettings?.visibility?.nationality === "friends" &&
          member.isFriend)
          ? member.nationality
          : null,
      location:
        privacySettings?.visibility?.location === "everyone" ||
        (privacySettings?.visibility?.location === "friends" && member.isFriend)
          ? member.location
          : null,
      canMsg:
        privacySettings?.interactions?.messages === "everyone" ||
        (privacySettings?.interactions?.messages === "friends" &&
          member.isFriend),
      canAdd:
        privacySettings?.interactions?.add === "everyone" ||
        (privacySettings?.interactions?.add === "friends" && member.isFriend),
    };
  });

  return {
    ...roomData,
    members: roomData.members.filter(
      (member) => !member._id.equals(currentUserId)
    ),
  };
}

/**
 * Mute a chat/room for notifications
 * @param {Object} args - { roomId, duration } - duration in ms, null for forever
 */
const muteChat = async function ({ args, socket, io, redisClient }) {
  const { roomId, duration = null } = args;
  const userObjectId = new mongoose.Types.ObjectId(socket.user._id);
  const roomObjectId = new mongoose.Types.ObjectId(roomId);

  try {
    // Calculate until date (null = forever)
    const until = duration ? new Date(Date.now() + duration) : null;

    // Update user's mutedChats
    await User.findByIdAndUpdate(userObjectId, {
      $pull: { mutedChats: { roomId: roomObjectId } }, // Remove existing entry first
    });

    await User.findByIdAndUpdate(userObjectId, {
      $push: {
        mutedChats: {
          roomId: roomObjectId,
          until,
          createdAt: new Date(),
        },
      },
    });

    socket.emit("chatMuted", {
      success: true,
      roomId: roomId,
      until,
    });

    logger.info("Chat muted", {
      userId: userObjectId.toString(),
      roomId: roomId,
      until,
    });
  } catch (error) {
    logger.error("Error muting chat:", error);
    socket.emit("chatMuted", {
      success: false,
      error: error.message,
    });
  }
};

/**
 * Unmute a chat/room for notifications
 */
const unmuteChat = async function ({ args, socket, io, redisClient }) {
  const { roomId } = args;
  const userObjectId = new mongoose.Types.ObjectId(socket.user._id);
  const roomObjectId = new mongoose.Types.ObjectId(roomId);

  try {
    await User.findByIdAndUpdate(userObjectId, {
      $pull: { mutedChats: { roomId: roomObjectId } },
    });

    socket.emit("chatUnmuted", {
      success: true,
      roomId: roomId,
    });

    logger.info("Chat unmuted", {
      userId: userObjectId.toString(),
      roomId: roomId,
    });
  } catch (error) {
    logger.error("Error unmuting chat:", error);
    socket.emit("chatUnmuted", {
      success: false,
      error: error.message,
    });
  }
};

/**
 * Mute a user globally for notifications
 * @param {Object} args - { userId, duration } - duration in ms, null for forever
 */
const muteUser = async function ({ args, socket, io, redisClient }) {
  const { userId: targetUserId, duration = null } = args;
  const userObjectId = new mongoose.Types.ObjectId(socket.user._id);
  const targetUserObjectId = new mongoose.Types.ObjectId(targetUserId);

  try {
    const until = duration ? new Date(Date.now() + duration) : null;

    await User.findByIdAndUpdate(userObjectId, {
      $pull: { mutedUsers: { userId: targetUserObjectId } },
    });

    await User.findByIdAndUpdate(userObjectId, {
      $push: {
        mutedUsers: {
          userId: targetUserObjectId,
          until,
          createdAt: new Date(),
        },
      },
    });

    socket.emit("userMuted", {
      success: true,
      userId: targetUserId,
      until,
    });

    logger.info("User muted", {
      userId: userObjectId.toString(),
      targetUserId: targetUserId,
      until,
    });
  } catch (error) {
    logger.error("Error muting user:", error);
    socket.emit("userMuted", {
      success: false,
      error: error.message,
    });
  }
};

/**
 * Unmute a user globally for notifications
 */
const unmuteUser = async function ({ args, socket, io, redisClient }) {
  const { userId: targetUserId } = args;
  const userObjectId = new mongoose.Types.ObjectId(socket.user._id);
  const targetUserObjectId = new mongoose.Types.ObjectId(targetUserId);

  try {
    await User.findByIdAndUpdate(userObjectId, {
      $pull: { mutedUsers: { userId: targetUserObjectId } },
    });

    socket.emit("userUnmuted", {
      success: true,
      userId: targetUserId,
    });

    logger.info("User unmuted", {
      userId: userObjectId.toString(),
      targetUserId: targetUserId,
    });
  } catch (error) {
    logger.error("Error unmuting user:", error);
    socket.emit("userUnmuted", {
      success: false,
      error: error.message,
    });
  }
};

/**
 * Check if a chat is muted for a user
 * @param {String} userId - User ID
 * @param {String} roomId - Room ID
 * @returns {Object|null} - Mute info or null if not muted
 */
const isChatMuted = async function (userId, roomId) {
  try {
    const user = await User.findById(userId).select("mutedChats").lean();
    if (!user?.mutedChats) return null;

    const muteEntry = user.mutedChats.find(
      (m) => m.roomId?.toString() === roomId?.toString()
    );

    if (!muteEntry) return null;

    // Check if mute has expired
    if (muteEntry.until && new Date(muteEntry.until) < new Date()) {
      // Mute has expired, remove it
      await User.findByIdAndUpdate(userId, {
        $pull: { mutedChats: { roomId: new mongoose.Types.ObjectId(roomId) } },
      });
      return null;
    }

    return muteEntry;
  } catch (error) {
    logger.error("Error checking if chat is muted:", error);
    return null;
  }
};

/**
 * Check if a user is muted globally
 * @param {String} userId - Current user ID
 * @param {String} targetUserId - Target user ID to check
 * @returns {Object|null} - Mute info or null if not muted
 */
const isUserMuted = async function (userId, targetUserId) {
  try {
    const user = await User.findById(userId).select("mutedUsers").lean();
    if (!user?.mutedUsers) return null;

    const muteEntry = user.mutedUsers.find(
      (m) => m.userId?.toString() === targetUserId?.toString()
    );

    if (!muteEntry) return null;

    // Check if mute has expired
    if (muteEntry.until && new Date(muteEntry.until) < new Date()) {
      await User.findByIdAndUpdate(userId, {
        $pull: { mutedUsers: { userId: new mongoose.Types.ObjectId(targetUserId) } },
      });
      return null;
    }

    return muteEntry;
  } catch (error) {
    logger.error("Error checking if user is muted:", error);
    return null;
  }
};

/**
 * Accept a message request - converts room from request to normal chat
 */
const acceptMessageRequest = async function ({ args, socket, io, redisClient }) {
  const { roomId } = args;
  const userObjectId = new mongoose.Types.ObjectId(socket.user._id);
  const roomObjectId = new mongoose.Types.ObjectId(roomId);

  try {
    // Find the room and verify it's a request for this user
    const room = await Room.findOne({
      _id: roomObjectId,
      members: userObjectId,
      isRequest: true,
      requestStatus: "pending",
    });

    if (!room) {
      socket.emit("messageRequestError", {
        message: "Message request not found or already processed",
      });
      return;
    }

    // Verify the user is the recipient (not the sender)
    // The sender is room.user, recipient is the other member
    if (room.user?.toString() === userObjectId.toString()) {
      socket.emit("messageRequestError", {
        message: "Only the recipient can accept message requests",
      });
      return;
    }

    // Update room to accepted
    const updatedRoom = await Room.findByIdAndUpdate(
      roomObjectId,
      {
        $set: {
          isRequest: false,
          requestStatus: "accepted",
        },
      },
      { new: true }
    );

    // Notify both users
    io.to(roomId).emit("messageRequestAccepted", {
      roomId,
      acceptedBy: userObjectId,
    });

    socket.emit("messageRequestAcceptSuccess", {
      success: true,
      roomId,
    });

    logger.info("Message request accepted", {
      roomId,
      acceptedBy: userObjectId.toString(),
    });
  } catch (error) {
    logger.error("Error accepting message request:", error);
    socket.emit("messageRequestError", {
      message: error.message,
    });
  }
};

/**
 * Decline a message request - marks room as declined
 */
const declineMessageRequest = async function ({ args, socket, io, redisClient }) {
  const { roomId, deleteRoom: shouldDelete = false } = args;
  const userObjectId = new mongoose.Types.ObjectId(socket.user._id);
  const roomObjectId = new mongoose.Types.ObjectId(roomId);

  try {
    // Find the room and verify it's a request for this user
    const room = await Room.findOne({
      _id: roomObjectId,
      members: userObjectId,
      isRequest: true,
      requestStatus: "pending",
    });

    if (!room) {
      socket.emit("messageRequestError", {
        message: "Message request not found or already processed",
      });
      return;
    }

    // Verify the user is the recipient (not the sender)
    if (room.user?.toString() === userObjectId.toString()) {
      socket.emit("messageRequestError", {
        message: "Only the recipient can decline message requests",
      });
      return;
    }

    if (shouldDelete) {
      // Delete the room entirely
      await Room.findByIdAndDelete(roomObjectId);
      // Also delete any messages in this room
      await Message.deleteMany({ room: roomObjectId });
    } else {
      // Just mark as declined
      await Room.findByIdAndUpdate(roomObjectId, {
        $set: {
          requestStatus: "declined",
        },
      });
    }

    socket.emit("messageRequestDeclineSuccess", {
      success: true,
      roomId,
      deleted: shouldDelete,
    });

    logger.info("Message request declined", {
      roomId,
      declinedBy: userObjectId.toString(),
      deleted: shouldDelete,
    });
  } catch (error) {
    logger.error("Error declining message request:", error);
    socket.emit("messageRequestError", {
      message: error.message,
    });
  }
};

const roomServices = {
  getMyRooms,
  getOneRoom,
  updateRoom,
  addMemberToRoom,
  removeMemberFromRoom,
  exitRoom,
  changeUserRole,
  createRoom,
  muteChat,
  unmuteChat,
  muteUser,
  unmuteUser,
  isChatMuted,
  isUserMuted,
  acceptMessageRequest,
  declineMessageRequest,
  pinMessage,
  unpinMessage,
};

module.exports = roomServices;
