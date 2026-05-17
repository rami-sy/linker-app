const { sendPushNotification } = require("../../../notification");
const Message = require("../../models/message.model");
const Room = require("../../models/room.model");
const User = require("../../models/user.model");
const Call = require("../../models/call.model");
const getFullName = require("../../utils/get-full-user-name");
const logger = require("../../utils/logger");
// ✅ استخدام Job Queue بدلاً من setTimeout
const { addPushNotificationJob } = require("../../queues/messageQueue");
// ✅ Permission checking utilities
const { checkChatPermission, checkBlockedInRoom } = require("../../utils/permissions");
const { validateMessageE2eePayload } = require("./e2ee.services");
const {
  NotificationTypes,
  createNotificationEvent,
} = require("../../utils/notificationContract");

const chatTelemetryCounters = (() => {
  if (!global.__chatTelemetryCounters) {
    global.__chatTelemetryCounters = {
      sendAttempts: 0,
      sendSuccess: 0,
      sendFailure: 0,
      sendDeduped: 0,
      editSuccess: 0,
      editFailure: 0,
      reactionSuccess: 0,
      reactionFailure: 0,
      searchCount: 0,
      mentionLimitRejected: 0,
    };
  }
  return global.__chatTelemetryCounters;
})();
const MAX_MENTIONS_PER_MESSAGE =
  parseInt(process.env.MAX_MENTIONS_PER_MESSAGE || "15", 10) || 15;
const SCHEDULED_DISPATCH_INTERVAL_MS =
  parseInt(process.env.SCHEDULED_DISPATCH_INTERVAL_MS || "5000", 10) || 5000;
const MIN_SCHEDULE_LEAD_MS = 15 * 1000;
const CHAT_SUMMARY_CACHE_TTL_MS =
  parseInt(process.env.CHAT_SUMMARY_CACHE_TTL_MS || "15000", 10) || 15000;

let scheduledDispatcherTimer = null;
let scheduledDispatcherRunning = false;
const chatSummaryCache = new Map();

const visibilityConditionsForUser = (userId) => [
  {
    $or: [
      { scheduleStatus: { $ne: "scheduled" } },
      { user: userId },
    ],
  },
];

const invalidateChatSummaryCacheForRoom = (roomId) => {
  if (!roomId) return;
  const roomPrefix = `${String(roomId)}:`;
  for (const key of chatSummaryCache.keys()) {
    if (String(key).startsWith(roomPrefix)) {
      chatSummaryCache.delete(key);
    }
  }
};

/** Normalize Mongo ObjectId, populated doc, or string for Redis keys like user:<id> */
const resolveRedisUserId = (member) => {
  if (member == null) return null;
  if (typeof member === "object" && member._id != null) {
    return String(member._id);
  }
  return String(member);
};

const extractSocketIdsFromRedisValue = (raw) => {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw.map((x) => String(x)).filter(Boolean);
  }
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

const resolveSocketIdsForUser = async ({ io, redisClient, userId }) => {
  const uid = String(userId || "");
  if (!uid) return [];
  const ids = new Set();
  if (redisClient?.isReady) {
    try {
      const raw = await redisClient.get(`user:${uid}`);
      extractSocketIdsFromRedisValue(raw).forEach((sid) => ids.add(String(sid)));
      const rawList = await redisClient.get(`user_sockets:${uid}`);
      extractSocketIdsFromRedisValue(rawList).forEach((sid) =>
        ids.add(String(sid))
      );
    } catch (_) {}
  }
  try {
    const socketsMap = io?.sockets?.sockets;
    if (socketsMap && typeof socketsMap.forEach === "function") {
      socketsMap.forEach((s) => {
        if (String(s?.user?._id || "") === uid && s?.id) {
          ids.add(String(s.id));
        }
      });
    }
  } catch (_) {}
  return [...ids];
};

const emitToOnlineRecipients = async ({
  io,
  redisClient,
  recipientIds = [],
  eventName,
  payload,
}) => {
  if (!io || !redisClient?.isReady || !Array.isArray(recipientIds) || !eventName) {
    return { attempted: 0, delivered: 0 };
  }
  const unique = [...new Set(recipientIds.map((id) => String(id)).filter(Boolean))];
  let delivered = 0;
  for (const uid of unique) {
    const socketIds = await resolveSocketIdsForUser({ io, redisClient, userId: uid });
    if (!socketIds.length) continue;
    for (const sid of socketIds) {
      io.to(sid).emit(eventName, payload);
      delivered += 1;
    }
  }
  return { attempted: unique.length, delivered };
};

const buildSenderSnapshot = (user = {}) => {
  // ✅ Ensure images array is properly formatted
  const imagesArray = Array.isArray(user?.images) 
    ? user.images.map(img => ({
        path: img?.path || img || null,
        thumbnail: img?.thumbnail || null,
      })).filter(img => img.path) // ✅ Filter out invalid images
    : [];
  
  return {
    _id: user._id || user.id || null,
    userId:
      user._id?.toString() ||
      user.id?.toString() ||
      user.userId?.toString() ||
      null,
    userName: user.userName || null,
    firstName: user.firstName || null,
    lastName: user.lastName || null,
    email: user.email || null,
    images: imagesArray, // ✅ Properly formatted images array
    role: user.role || null,
    colors: user.colors || [], // ✅ Include full colors array (UserImage will extract colors[0].code)
  };
};

const buildCallEventUserSnapshot = (user = {}) => {
  const base = buildSenderSnapshot(user);
  return {
    _id: base?._id || null,
    userId: base?.userId || null,
    userName: base?.userName || null,
    firstName: base?.firstName || null,
    lastName: base?.lastName || null,
    images: Array.isArray(base?.images) ? base.images : [],
  };
};

const deriveGroupSummaryStatus = (incomingStatus, callDoc) => {
  const allowed = new Set(["missed", "rejected", "cancelled", "answered"]);
  const fromCall = String(callDoc?.status || "");
  if (allowed.has(fromCall)) return fromCall;
  const normalizedIncoming = String(incomingStatus || "");
  if (allowed.has(normalizedIncoming)) return normalizedIncoming;
  return "answered";
};

const buildParticipantsSummary = ({ roomMembers = [], callDoc, callerUserId }) => {
  const callerIdStr = callerUserId ? String(callerUserId) : "";
  const participants = Array.isArray(callDoc?.participants) ? callDoc.participants : [];

  const nonCallerParticipants = participants.filter((participant) => {
    const participantId = participant?.user?._id || participant?.user;
    return String(participantId || "") !== callerIdStr;
  });

  const answeredMembers = nonCallerParticipants.filter((participant) => {
    const duration = Number(participant?.duration || 0);
    if (duration > 0) return true;
    return Boolean(participant?.joinedAt && !participant?.leftAt);
  }).length;

  const activeMembers = nonCallerParticipants.filter(
    (participant) => !participant?.leftAt
  ).length;

  return {
    totalMembers: Math.max(0, Number(roomMembers.length || 0) - 1),
    joinedMembers: nonCallerParticipants.length,
    activeMembers,
    answeredMembers,
  };
};

/**
 * Create server-authored call outcome message in chat timeline.
 * Used by mediasoup lifecycle handlers so clients cannot spoof these rows.
 */
const createServerCallEventMessage = async ({
  io,
  roomId,
  callId,
  eventKind,
  status,
  isVideoCall = false,
  duration = 0,
  endedAt = new Date(),
  actorUserId = null,
  callerUserId = null,
}) => {
  try {
    if (!roomId || !eventKind || !status) return null;
    const allowed = new Set(["missed", "rejected", "cancelled", "answered"]);
    if (!allowed.has(String(eventKind)) || !allowed.has(String(status))) {
      logger.warn("createServerCallEventMessage:invalid_event", {
        roomId,
        callId,
        eventKind,
        status,
      });
      return null;
    }

    const room = await Room.findById(roomId).select("members isGroup").lean();
    if (!room) return null;

    const isGroupCallRoom =
      Boolean(room?.isGroup) || (Array.isArray(room?.members) && room.members.length > 2);
    const callDoc = callId
      ? await Call.findById(callId)
          .select(
            "participants caller status isGroupCall isVideoCall duration startedAt endedAt endedBy"
          )
          .lean()
      : null;
    const normalizedCallerUserId = callerUserId || callDoc?.caller || null;
    const normalizedActorUserId = actorUserId || callDoc?.endedBy || null;
    const normalizedIsVideoCall =
      typeof callDoc?.isVideoCall === "boolean"
        ? callDoc.isVideoCall
        : Boolean(isVideoCall);
    const normalizedDuration =
      Number.isFinite(Number(callDoc?.duration))
        ? Number(callDoc?.duration || 0)
        : Number(duration) || 0;
    const normalizedEndedAt = callDoc?.endedAt || (endedAt ? new Date(endedAt) : new Date());
    const normalizedStatus = deriveGroupSummaryStatus(status, callDoc);
    const normalizedEvent = deriveGroupSummaryStatus(eventKind, callDoc);

    const participantIdsToLoad = [normalizedActorUserId, normalizedCallerUserId].filter(Boolean);
    const loadedUsers = participantIdsToLoad.length
      ? await User.find({ _id: { $in: participantIdsToLoad } })
          .select("userName firstName lastName email images colors")
          .populate("colors", "name code")
          .populate("images", "path")
          .lean()
      : [];
    const userById = new Map(
      loadedUsers.map((u) => [String(u?._id || ""), u])
    );
    const actor = normalizedActorUserId
      ? userById.get(String(normalizedActorUserId)) || null
      : null;
    const caller = normalizedCallerUserId
      ? userById.get(String(normalizedCallerUserId)) || null
      : null;

    const members = Array.isArray(room.members) ? room.members : [];
    const senderUserId =
      normalizedActorUserId || normalizedCallerUserId || members[0] || null;
    const senderSnapshot = buildSenderSnapshot(actor || { _id: senderUserId });
    const actorSnapshot = normalizedActorUserId
      ? buildCallEventUserSnapshot(actor || { _id: normalizedActorUserId })
      : null;
    const callerSnapshot = normalizedCallerUserId
      ? buildCallEventUserSnapshot(caller || { _id: normalizedCallerUserId })
      : null;
    const participantsSummary = buildParticipantsSummary({
      roomMembers: members,
      callDoc,
      callerUserId: normalizedCallerUserId,
    });
    const starterUserId = normalizedCallerUserId || null;
    const endedByUserId = normalizedActorUserId || null;

    const payload = {
      eventKind: normalizedEvent,
      isVideoCall: normalizedIsVideoCall,
      duration: normalizedDuration,
      status: normalizedStatus,
      endedAt: normalizedEndedAt
        ? new Date(normalizedEndedAt).toISOString()
        : new Date().toISOString(),
      callId: callId ? String(callId) : null,
      actorUserId: normalizedActorUserId ? String(normalizedActorUserId) : null,
      callerUserId: normalizedCallerUserId ? String(normalizedCallerUserId) : null,
      actorSnapshot,
      callerSnapshot,
      isGroupCall: Boolean(isGroupCallRoom),
      starterUserId: starterUserId ? String(starterUserId) : null,
      starterSnapshot: callerSnapshot,
      endedByUserId: endedByUserId ? String(endedByUserId) : null,
      endedBySnapshot: actorSnapshot,
      participantsSummary,
    };

    const dedupeQuery = {
      room: roomId,
      type: "call_event",
      ...(callId ? { "callEvent.callId": callId } : { "callEvent.callId": null }),
      ...(
        isGroupCallRoom && callId
          ? {}
          : { "callEvent.eventKind": normalizedEvent }
      ),
    };

    const existing = await Message.findOne(dedupeQuery);
    if (existing) {
      existing.user = senderUserId;
      existing.content = JSON.stringify(payload);
      existing.createdAt = normalizedEndedAt || existing.createdAt || new Date();
      existing.senderSnapshot = senderSnapshot;
      existing.callEvent = {
        eventKind: normalizedEvent,
        status: normalizedStatus,
        isVideoCall: normalizedIsVideoCall,
        duration: normalizedDuration,
        endedAt: normalizedEndedAt || new Date(),
        callId: callId || null,
        actorUserId: normalizedActorUserId || null,
        callerUserId: normalizedCallerUserId || null,
        actorSnapshot,
        callerSnapshot,
        isGroupCall: Boolean(isGroupCallRoom),
        starterUserId: starterUserId || null,
        starterSnapshot: callerSnapshot,
        endedByUserId: endedByUserId || null,
        endedBySnapshot: actorSnapshot,
        participantsSummary,
      };
      await existing.save();

      if (io && typeof io.to === "function") {
        io.to(String(roomId)).emit("receiveMessage", {
          message: existing.toObject(),
          room: roomId,
          user: senderUserId,
          stateVersion: existing.stateVersion,
        });
      }
      return existing;
    }

    const newMessage = new Message({
      room: roomId,
      user: senderUserId,
      type: "call_event",
      text: "",
      content: JSON.stringify(payload),
      sentTo: members.filter((memberId) => String(memberId) !== String(senderUserId)),
      deliveredTo: [],
      stateVersion: 1,
      createdAt: normalizedEndedAt || new Date(),
      senderSnapshot,
      callEvent: {
        eventKind: normalizedEvent,
        status: normalizedStatus,
        isVideoCall: normalizedIsVideoCall,
        duration: normalizedDuration,
        endedAt: normalizedEndedAt || new Date(),
        callId: callId || null,
        actorUserId: normalizedActorUserId || null,
        callerUserId: normalizedCallerUserId || null,
        actorSnapshot,
        callerSnapshot,
        isGroupCall: Boolean(isGroupCallRoom),
        starterUserId: starterUserId || null,
        starterSnapshot: callerSnapshot,
        endedByUserId: endedByUserId || null,
        endedBySnapshot: actorSnapshot,
        participantsSummary,
      },
    });
    await newMessage.save();

    if (io && typeof io.to === "function") {
      io.to(String(roomId)).emit("receiveMessage", {
        message: newMessage.toObject(),
        room: roomId,
        user: senderUserId,
        stateVersion: newMessage.stateVersion,
      });
    }
    return newMessage;
  } catch (error) {
    logger.error("createServerCallEventMessage:error", {
      roomId,
      callId,
      eventKind,
      status,
      message: error?.message,
    });
    return null;
  }
};

/** Mark all visible messages in a room as seen by readerId; used by joinChat and getOneRoom(open). */
const markRoomMessagesSeenByUser = async ({
  roomDb,
  roomSocket,
  readerId,
  socket,
}) => {
  const filter = {
    room: roomDb,
    seenBy: { $nin: [readerId] },
    deletedForAll: { $ne: true },
    deletedForUsers: { $nin: [readerId] },
  };
  const unseenIds = await Message.find(filter).select("_id").lean();
  if (!unseenIds.length) return;

  const ids = unseenIds.map((m) => m._id);
  await Message.updateMany(
    { _id: { $in: ids } },
    { $addToSet: { seenBy: readerId } }
  );

  const updatedMessages = await Message.find({ _id: { $in: ids } }).lean();
  for (const message of updatedMessages) {
    logger.messageEvent("Message seen", {
      messageId: message._id,
      roomId: roomSocket,
      userId: readerId,
    });
    socket.to(roomSocket).emit("messageSeen", { message, room: roomSocket });
  }
};

const joinChat = async function ({ args, socket, redisClient, callback }) {
  try {
    const { room } = args;
    const chatRoom = await Room.findById(room).select("members user");
    if (!chatRoom) {
      if (typeof callback === "function") {
        callback({ ok: false, error: "Room not found" });
      }
      return;
    }

    // ✅ Check if user is a viewer by examining their peer metadata
    const roomManager = require("../../mediasoup/room-manager");
    const mediasoupRoom = roomManager.getRoom(room);
    const peer = mediasoupRoom?.getPeer(socket.id);
    const isViewer = peer?.metadata?.role === "viewer";

    const userIdStr = String(socket.user._id);
    const ownerIdStr = String(chatRoom.user || "");
    const isRoomMember = (chatRoom.members || []).some(
      (member) => String(member) === userIdStr
    );

    // Viewers are not allowed to attach to chat channel unless they are already members.
    if (!isRoomMember && ownerIdStr !== userIdStr) {
      logger.warn("Unauthorized joinChat attempt", {
        roomId: room,
        userId: socket.user._id,
        isViewer: !!isViewer,
      });
      if (typeof callback === "function") {
        callback({ ok: false, error: "Forbidden" });
      }
      return;
    }

    socket.join(room);

    socket.broadcast
      .to(room)
      .emit("userJoin", `${socket.user._id} joined the chat`);

    await markRoomMessagesSeenByUser({
      roomDb: room,
      roomSocket: room,
      readerId: socket.user._id,
      socket,
    });
    if (typeof callback === "function") {
      callback({ ok: true });
    }
  } catch (error) {
    logger.error("Error in joinChat:", error);
    // ✅ إرسال خطأ sanitized للعميل
    const { formatErrorForResponse } = require("../../utils/errorSanitizer");
    const errorResponse = formatErrorForResponse(error, {
      operation: "joinChat",
      userId: socket.user?._id?.toString(),
      socketId: socket.id,
    });
    socket.emit("chatError", {
      message: errorResponse.error,
      type: "error",
    });
    if (typeof callback === "function") {
      callback({ ok: false });
    }
  }
};

const sendMessage = async function ({ args, socket, io, redisClient }) {
  try {
    chatTelemetryCounters.sendAttempts += 1;
    const sendStartedAt = Date.now();
    const {
      room,
      text,
      createdAt,
      type,
      content,
      uuId,
      replyTo,
      callId,
      e2ee: e2eePayload,
      e2eeSignature,
      e2eeSignerPublic,
      mentions: mentionsFromClient,
      threadRoot: threadRootFromClient,
      scheduledAt: scheduledAtFromClient,
    } = args.message;
    const members = args.members || [];
    logger.debug("sendMessage:entry", {
      room,
      type,
      hasText: typeof text === "string" && text.length > 0,
      membersCount: members.length,
      socketId: socket.id,
    });

    // ✅ Detect if sender is in an active live stream call
    let targetCallId = callId; // Use provided callId if exists
    let isStreamMessage = false;

    if (!targetCallId) {
      // Check if sender is participating in an active stream
      const roomManager = require("../../mediasoup/room-manager");
      const mediasoupRoom = roomManager.getRoom(room);
      const senderPeer = mediasoupRoom
        ? mediasoupRoom.getPeer(socket.id)
        : null;

      // If peer exists and has activeCallId in metadata, this is a stream message
      if (senderPeer && senderPeer.metadata?.activeCallId) {
        targetCallId = senderPeer.metadata.activeCallId;
        isStreamMessage = true;
        logger.debug("Stream message detected via peer metadata", {
          callId: targetCallId,
          socketId: socket.id,
        });
      }
    } else {
      isStreamMessage = true;
    }

    // ✅ Resolve user profile (same logic as sendStreamComment)
    let resolvedUserProfile = socket.user || {};
    const userId = socket.user?._id;
    
    // ✅ Check if user is blocked by any member in the room
    const blockCheck = await checkBlockedInRoom(userId?.toString(), room);
    logger.debug("sendMessage:afterBlockedCheck", {
      room,
      isBlocked: !!blockCheck?.isBlocked,
      elapsedMs: Date.now() - sendStartedAt,
    });
    if (blockCheck.isBlocked) {
      logger.warn("Message blocked: user is blocked in room", {
        userId: userId?.toString(),
        roomId: room,
        blockedBy: blockCheck.blockedBy,
      });
      socket.emit("messageError", {
        message: "You cannot send messages in this chat",
        type: "blocked",
      });
      return { type: "error", message: "You cannot send messages in this chat" };
    }
    
    // ✅ Server-side permission check for canSend (controls all message types)
    const hasPermission = await checkChatPermission(userId?.toString(), room, "canSend");
    logger.debug("sendMessage:afterPermissionCheck", {
      room,
      hasPermission: !!hasPermission,
      elapsedMs: Date.now() - sendStartedAt,
    });
    if (!hasPermission) {
      logger.warn("Permission denied for message", {
        userId: userId?.toString(),
        roomId: room,
        type,
        requiredPermission: "canSend",
      });
      socket.emit("messageError", {
        message: "Permission denied: You are not allowed to send messages",
        type: "permission_denied",
        requiredPermission: "canSend",
      });
      return {
        type: "error",
        message: "Permission denied: You are not allowed to send messages",
      };
    }
    
    // ✅ If socket.user is incomplete, fetch full user profile from database
    // Colors are stored in colors array (ObjectId references), need to populate
    if (
      userId &&
      (!resolvedUserProfile?.userName && !resolvedUserProfile?.firstName)
    ) {
      try {
        const User = require("../../models/user.model");
        const dbUserProfile = await User.findById(userId)
          .select("userName firstName lastName email images colors")
          .populate("colors", "name code")
          .populate("images", "path")
          .lean();
        if (dbUserProfile) {
          resolvedUserProfile = { ...dbUserProfile, _id: userId };
          logger.debug("Fetched full user profile for message sender", { userId });
        }
      } catch (profileError) {
        logger.warn("Unable to load user profile for message sender", {
          userId,
          error: profileError?.message,
        });
      }
    }
    
    const senderSnapshot = buildSenderSnapshot(resolvedUserProfile);

    let expiresAt = null;
    let roomDocForSend = null;
    try {
      roomDocForSend = await Room.findById(room)
        .select("members autoDeleteTimer e2ee isGroup")
        .lean();
      logger.debug("sendMessage:afterLoadRoom", {
        room,
        roomFound: !!roomDocForSend,
        roomMembers: roomDocForSend?.members?.length || 0,
        elapsedMs: Date.now() - sendStartedAt,
      });
      if (roomDocForSend?.autoDeleteTimer) {
        expiresAt = new Date(
          Date.now() + roomDocForSend.autoDeleteTimer * 1000
        );
        logger.debug("Setting message expiration", {
          roomId: room,
          autoDeleteTimer: roomDocForSend.autoDeleteTimer,
          expiresAt,
        });
      }
    } catch (error) {
      logger.warn("Error loading room for sendMessage:", error);
    }

    const roomE2eeEnabled = !!roomDocForSend?.e2ee?.enabled;
    const requiresE2ee =
      roomE2eeEnabled && !targetCallId && type === "text";

    if (e2eePayload && !roomE2eeEnabled) {
      logger.warn("sendMessage:abort:e2ee_not_enabled", {
        room,
        type,
        hasE2eePayload: !!e2eePayload,
      });
      socket.emit("messageError", {
        message: "Room is not E2EE-enabled",
        type: "e2ee_not_enabled",
      });
      return { type: "error", message: "Room is not E2EE-enabled" };
    }

    if (requiresE2ee) {
      const v = validateMessageE2eePayload(
        e2eePayload,
        e2eeSignature,
        e2eeSignerPublic
      );
      if (!v.ok) {
        logger.warn("sendMessage:abort:e2ee_required", {
          room,
          type,
          validationError: v.error,
          hasE2eePayload: !!e2eePayload,
          hasSignature: !!e2eeSignature,
          hasSignerPublic: !!e2eeSignerPublic,
        });
        socket.emit("messageError", {
          message: v.error,
          type: "e2ee_required",
        });
        return { type: "error", message: v.error };
      }
      if (
        Number(e2eePayload.v) !== Number(roomDocForSend.e2ee.keyVersion)
      ) {
        logger.warn("sendMessage:abort:e2ee_version_mismatch", {
          room,
          type,
          payloadVersion: Number(e2eePayload.v),
          roomVersion: Number(roomDocForSend.e2ee.keyVersion),
        });
        socket.emit("messageError", {
          message: "E2EE key version mismatch",
          type: "e2ee_version_mismatch",
        });
        return { type: "error", message: "E2EE key version mismatch" };
      }
    }

    const dbMemberIds = roomDocForSend?.members || [];
    const sentToFromDb = dbMemberIds.filter(
      (m) => String(m) !== String(userId)
    );
    const sentToRecipients =
      sentToFromDb.length > 0 ? sentToFromDb : [...members];

    let resolvedThreadRoot = null;
    if (threadRootFromClient && !targetCallId && type === "text") {
      try {
        const rootCandidate = await Message.findOne({
          _id: threadRootFromClient,
          room,
          deletedForAll: { $ne: true },
        })
          .select("threadRoot")
          .lean();
        if (rootCandidate) {
          resolvedThreadRoot = rootCandidate.threadRoot || rootCandidate._id;
        }
      } catch (e) {
        logger.warn("threadRoot validation failed", { message: e?.message });
      }
    }
    let resolvedReplyTo = replyTo || null;
    if (resolvedReplyTo && !targetCallId) {
      try {
        const replyCandidate = await Message.findOne({
          _id: resolvedReplyTo,
          room,
          deletedForAll: { $ne: true },
          deletedForUsers: { $nin: [userId] },
        })
          .select("_id")
          .lean();
        if (!replyCandidate) {
          socket.emit("messageError", {
            message: "Reply target not found in this room",
            type: "reply_not_found",
          });
          return {
            type: "error",
            message: "Reply target not found in this room",
          };
        }
        resolvedReplyTo = replyCandidate._id;
      } catch (e) {
        logger.warn("replyTo validation failed", { message: e?.message });
        socket.emit("messageError", {
          message: "Invalid reply target",
          type: "reply_invalid",
        });
        return { type: "error", message: "Invalid reply target" };
      }
    }
    let validatedMentions = [];
    if (
      roomDocForSend?.isGroup &&
      Array.isArray(mentionsFromClient) &&
      mentionsFromClient.length > 0
    ) {
      if (mentionsFromClient.length > MAX_MENTIONS_PER_MESSAGE) {
        chatTelemetryCounters.mentionLimitRejected += 1;
        socket.emit("messageError", {
          message: "Too many mentions in one message",
          type: "mention_limit_exceeded",
        });
        return {
          type: "error",
          message: "Too many mentions in one message",
        };
      }
      const memberSet = new Set(
        (roomDocForSend.members || []).map((id) => String(id))
      );
      const seen = new Set();
      for (const raw of mentionsFromClient) {
        const sid = String(raw);
        if (!memberSet.has(sid) || sid === String(userId)) continue;
        if (seen.has(sid)) continue;
        seen.add(sid);
        validatedMentions.push(sid);
      }
    }
    logger.debug("sendMessage:afterThreadAndMentionsValidation", {
      room,
      type,
      hasThreadRoot: !!resolvedThreadRoot,
      mentionsCount: validatedMentions.length,
      elapsedMs: Date.now() - sendStartedAt,
    });

    if (uuId) {
      const existingMessage = await Message.findOne({
        room,
        user: userId,
        uuId,
        deletedForAll: { $ne: true },
      })
        .select("_id")
        .lean();
      if (existingMessage?._id) {
        chatTelemetryCounters.sendDeduped += 1;
        return { type: "success", messageId: String(existingMessage._id) };
      }
    }

    const isSchedulableMessageType = type === "text" || type === "call_event";
    const parsedScheduledAt = scheduledAtFromClient
      ? new Date(scheduledAtFromClient)
      : null;
    const requestedScheduling =
      scheduledAtFromClient != null &&
      scheduledAtFromClient !== "" &&
      !targetCallId &&
      isSchedulableMessageType;
    if (scheduledAtFromClient && (!type || !isSchedulableMessageType || targetCallId)) {
      const errMessage = "Scheduling is only supported for text and call reminders";
      socket.emit("messageError", {
        message: errMessage,
        type: "schedule_not_supported",
      });
      return { type: "error", message: errMessage };
    }
    if (requestedScheduling && type === "call_event") {
      let parsedContent = {};
      try {
        parsedContent = content ? JSON.parse(content) : {};
      } catch (_) {
        parsedContent = {};
      }
      const eventKind = String(
        parsedContent?.eventKind || parsedContent?.status || ""
      ).toLowerCase();
      if (eventKind !== "scheduled") {
        const errMessage = "Scheduled call_event must use eventKind=scheduled";
        socket.emit("messageError", {
          message: errMessage,
          type: "schedule_invalid_call_event",
        });
        return { type: "error", message: errMessage };
      }
    }
    if (requestedScheduling) {
      if (!(parsedScheduledAt instanceof Date) || Number.isNaN(parsedScheduledAt.getTime())) {
        const errMessage = "Invalid schedule time";
        socket.emit("messageError", {
          message: errMessage,
          type: "schedule_invalid_time",
        });
        return { type: "error", message: errMessage };
      }
      if (parsedScheduledAt.getTime() - Date.now() < MIN_SCHEDULE_LEAD_MS) {
        const errMessage = "Scheduled time must be in the near future";
        socket.emit("messageError", {
          message: errMessage,
          type: "schedule_too_soon",
        });
        return { type: "error", message: errMessage };
      }
    }
    const shouldSchedule =
      requestedScheduling &&
      parsedScheduledAt instanceof Date &&
      !Number.isNaN(parsedScheduledAt.getTime());

    const newMessage = new Message({
      room,
      text: requiresE2ee ? "" : text,
      user: userId,
      content: requiresE2ee ? null : content,
      expiresAt,
      createdAt,
      deliveredTo: [],
      sentTo: sentToRecipients,
      forwardedFrom: args?.message?.forwardedFrom,
      forwardedAt: args?.message?.forwardedAt,
      type,
      uuId,
      scheduledAt: shouldSchedule ? parsedScheduledAt : null,
      scheduleStatus: shouldSchedule ? "scheduled" : "none",
      dispatchedAt: shouldSchedule ? null : new Date(),
      replyTo: resolvedReplyTo,
      call: targetCallId || null, // ✅ Set call field for stream messages
      stateVersion: 1,
      senderSnapshot,
      ...(validatedMentions.length
        ? { mentions: validatedMentions }
        : {}),
      ...(resolvedThreadRoot ? { threadRoot: resolvedThreadRoot } : {}),
      ...(requiresE2ee
        ? {
            e2ee: {
              v: Number(e2eePayload.v),
              iv: String(e2eePayload.iv).toLowerCase(),
              ciphertext: String(e2eePayload.ciphertext).toLowerCase(),
              aadVersion: Number(e2eePayload.aadVersion) || 0,
            },
            e2eeSignature: String(e2eeSignature).toLowerCase(),
            e2eeSignerPublic: String(e2eeSignerPublic).toLowerCase(),
          }
        : {}),
    });
    logger.debug("sendMessage:beforeSave", {
      room,
      uuId,
      requiresE2ee,
      sentToCount: sentToRecipients.length,
      elapsedMs: Date.now() - sendStartedAt,
    });
    await newMessage.save();
    logger.debug("sendMessage:afterSave", {
      room,
      messageId: String(newMessage._id),
      elapsedMs: Date.now() - sendStartedAt,
    });

    // ✅ تحويل Mongoose document إلى object للحفاظ على senderSnapshot
    const messageObject = newMessage.toObject();

    if (shouldSchedule) {
      invalidateChatSummaryCacheForRoom(room);
      socket.emit("scheduledMessageCreated", {
        message: messageObject,
        room,
        scheduledAt: parsedScheduledAt.toISOString(),
      });
      chatTelemetryCounters.sendSuccess += 1;
      return {
        type: "scheduled",
        messageId: String(newMessage._id),
        scheduledAt: parsedScheduledAt.toISOString(),
      };
    }

    // ✅ Smart Routing: Send to call-specific room or regular room
    if (targetCallId) {
      // Stream message: send to call-specific socket room only
      const callRoomName = `call:${targetCallId}`;
      logger.debug("Sending stream message to call room", {
        callRoomName,
        messageId: newMessage._id,
      });
      io.to(callRoomName).emit("receiveMessage", {
        message: messageObject,
        room,
        user: socket.user._id,
        callId: targetCallId,
        stateVersion: newMessage.stateVersion,
      });
    } else {
      // Regular room message: send to all room members
    const receivePayload = {
      message: messageObject,
      room,
      user: socket.user._id,
      stateVersion: newMessage.stateVersion,
    };
    io.to(room).emit("receiveMessage", receivePayload);

      const directRecipients = (sentToRecipients || []).map((id) =>
        resolveRedisUserId(id)
      );
      const directEmitStats = await emitToOnlineRecipients({
        io,
        redisClient,
        recipientIds: directRecipients,
        eventName: "receiveMessage",
        payload: receivePayload,
      });

      if (type === "text" && !requiresE2ee) {
        const { extractFirstHttpUrl, tryFetchLinkPreview } = require("../../utils/linkPreview");
        const firstUrl = extractFirstHttpUrl(text || "");
        if (firstUrl) {
          setImmediate(() => {
            void (async () => {
              try {
                const preview = await tryFetchLinkPreview(firstUrl);
                if (
                  !preview ||
                  (!preview.title && !preview.description && !preview.image)
                ) {
                  return;
                }
                const updated = await Message.findByIdAndUpdate(
                  newMessage._id,
                  {
                    $set: {
                      linkPreview: {
                        ...preview,
                        fetchedAt: new Date(),
                      },
                    },
                  },
                  { new: true }
                ).lean();
                if (!updated) return;
                io.to(String(room)).emit("messageLinkPreview", {
                  message: updated,
                  room,
                });
              } catch (err) {
                logger.warn("messageLinkPreview pipeline error", {
                  message: err?.message,
                });
              }
            })();
          });
        }
      }
    }

    const currentRoom =
      roomDocForSend && roomDocForSend.members
        ? { members: roomDocForSend.members }
        : await Room.findById(room);
    const allMembers = currentRoom?.members.filter(
      (member) => member != socket.user._id
    );
    logger.debug("Sending message to members", {
      roomId: room,
      membersCount: allMembers?.length,
    });

    // ✅ استخدام Redis retry mechanism
    const { withRedisRetry } = require("../../utils/redisRetry");

    allMembers?.forEach(async (member) => {
      try {
        const socketId = await withRedisRetry(
          () => redisClient.get(`user:${member}`),
          {
            maxRetries: 2,
            initialDelay: 500,
            operationName: `Get socket ID for user ${member}`,
          }
        );

        if (socketId) {
          logger.debug("Delivering message", {
            socketId,
            messageId: newMessage._id,
            roomId: room,
          });
          // ✅ استخدام messageObject المحفوظ مسبقاً
          io.to(socketId).emit("deliveredMessage", {
            message: messageObject,
            room,
          });
          const inAppEvent = createNotificationEvent({
            type: NotificationTypes.CHAT_MESSAGE,
            title: getFullName(socket.user, true) || "New message",
            body: messageObject?.text || "You received a new message",
            entityType: "room",
            entityId: String(room),
            route: `/chats/${String(room)}`,
            priority:
              validatedMentions?.some((id) => String(id) === String(member))
                ? "high"
                : "normal",
            dedupeKey: `chat_message:${String(newMessage?._id || "")}`,
            meta: {
              roomId: String(room),
              messageId: String(newMessage?._id || ""),
              mention:
                validatedMentions?.some((id) => String(id) === String(member))
                  ? "1"
                  : "0",
            },
          });
          io.to(socketId).emit("notificationEvent", inAppEvent);
              } else {
          logger.debug("User not connected, skipping message delivery", {
            userId: member,
            messageId: newMessage._id,
          });
        }
      } catch (error) {
        logger.error(`Error getting socket ID for user ${member}:`, error);
        // نكمل مع باقي الأعضاء حتى لو فشل أحدهم
      }
    });

    // ✅ استخدام Job Queue بدلاً من setTimeout
    // إضافة job لإرسال push notifications بعد 1.5 ثانية
    try {
      await addPushNotificationJob(
        {
          messageId: newMessage._id.toString(),
          senderId: socket.user._id.toString(),
          members: sentToRecipients,
          ...(validatedMentions.length > 0
            ? {
                mentionUserIds: validatedMentions.map((id) => String(id)),
                roomNameForPush:
                  roomDocForSend?.isGroup && roomDocForSend?.name
                    ? String(roomDocForSend.name)
                    : undefined,
              }
            : {}),
        },
        1500 // Delay: 1.5 seconds
      );
      logger.debug("Push notification job added to queue", {
        messageId: newMessage._id,
        membersCount: sentToRecipients.length,
      });
    } catch (error) {
      logger.error("Error adding push notification job:", error);
      // لا نرمي الخطأ - نكمل العملية حتى لو فشل إضافة الـ job
    }
    logger.debug("sendMessage:success", {
      room,
      messageId: String(newMessage._id),
      elapsedMs: Date.now() - sendStartedAt,
    });
    invalidateChatSummaryCacheForRoom(room);
    chatTelemetryCounters.sendSuccess += 1;
    return { type: "success", messageId: String(newMessage._id) };
  } catch (error) {
    chatTelemetryCounters.sendFailure += 1;
    logger.error("Error in sendMessage:", error);
    // إرسال خطأ للعميل
    socket.emit("messageError", {
      message: "Failed to send message",
      error: error.message,
    });
    return { type: "error", message: "Failed to send message" };
  }
};
const deleteMessage = async function ({ args, socket, io, redisClient }) {
  try {
    const { message, room, forEveryOne } = args;
    if (!message || !room) {
      return socket.emit("messageError", {
        message: "Message and room are required",
        error: "Message and room are required",
      });
    }
    const allowed = await assertUserInRoom(socket.user._id, room);
    if (!allowed) {
      return socket.emit("messageError", {
        message: "Forbidden",
        error: "Forbidden",
      });
    }
    const existingMessage = await Message.findOne({ _id: message, room });
    if (!existingMessage) {
      return socket.emit("messageError", {
        message: "Message not found",
        error: "Message not found",
      });
    }

    if (forEveryOne) {
      if (String(existingMessage.user || "") !== String(socket.user._id || "")) {
        return socket.emit("messageError", {
          message: "Forbidden",
          error: "Only sender can delete for everyone",
        });
      }
      // Delete message for everyone
      await Message.findByIdAndUpdate(message, { deletedForAll: true });
    } else {
      // Delete message for the individual user
      await Message.findByIdAndUpdate(message, {
        $addToSet: { deletedForUsers: socket.user._id },
      });
    }
    logger.info("AUDIT:deleteMessage", {
      actorUserId: String(socket.user?._id || ""),
      roomId: String(room || ""),
      messageId: String(message || ""),
      forEveryOne: Boolean(forEveryOne),
    });

    // Fetch the updated message
    const updatedMessage = await Message.findById(message);

    // ✅ تحويل Mongoose document إلى object للحفاظ على senderSnapshot
    const messageObject = updatedMessage.toObject();
    // Emit socket ev // الانتظار لمدة 10 ثوانٍent to update other clients
    io.to(room).emit("deleteMessage", {
      message: messageObject,
      room,
    });
    invalidateChatSummaryCacheForRoom(room);
  } catch (error) {
    logger.error("Error in deleteMessage:", error);
    socket.emit("messageError", {
      message: "Failed to delete message",
      error: error.message,
    });
  }
};
const messageSeen = async function ({ args, socket, io, redisClient }) {
  try {
    const { message, room, clientVersion } = args; // ✅ استقبال clientVersion
    const currentMessage = await Message.findById(message);

    if (!currentMessage) {
      return socket.emit("messageError", {
        message: "Message not found",
        error: "Message not found",
      });
    }

    // ✅ التحقق من conflict
    const conflictCheck = currentMessage.checkVersionConflict(clientVersion);
    if (conflictCheck.hasConflict) {
      logger.warn("Version conflict detected in messageSeen", {
        messageId: message,
        serverVersion: conflictCheck.serverVersion,
        clientVersion: conflictCheck.clientVersion,
      });
      // إرسال الرسالة المحدثة للعميل
      const conflictMessageObject = currentMessage.toObject();
      const roomForEmit = room || String(currentMessage.room);
      io.to(roomForEmit).emit("messageSeen", {
        message: conflictMessageObject,
        room: roomForEmit,
        conflict: true,
        serverVersion: conflictCheck.serverVersion,
      });
      return;
    }

    logger.messageEvent("Message marked as seen", {
      messageId: message,
      roomId: room,
      userId: socket.user._id,
    });
    const readerId = socket.user._id;
    const roomDoc = await Room.findById(currentMessage.room)
      .select("members user")
      .lean();
    const readerIdStr = String(readerId);
    const inRoom =
      !!roomDoc &&
      (((roomDoc.members || []).some((m) => String(m) === readerIdStr)) ||
        String(roomDoc.user || "") === readerIdStr);
    if (!inRoom) {
      logger.warn("Rejecting messageSeen from non-room-member", {
        messageId: String(message || ""),
        roomId: String(currentMessage.room || ""),
        userId: readerIdStr,
      });
      return;
    }
    if (String(currentMessage.user || "") === readerIdStr) {
      // Sender should not mark own message as "seen".
      return;
    }
    await Message.updateOne(
      { _id: message },
      {
        $addToSet: { seenBy: readerId, deliveredTo: readerId },
        $inc: { stateVersion: 1 },
      }
    );
    const freshMessage = await Message.findById(message);
    if (!freshMessage) {
      return socket.emit("messageError", {
        message: "Message not found",
        error: "Message not found",
      });
    }
    const messageObject = freshMessage.toObject();
    const roomForEmit = room || String(freshMessage.room);
    io.to(roomForEmit).emit("messageSeen", {
      message: messageObject,
      room: roomForEmit,
      stateVersion: freshMessage.stateVersion,
    });
  } catch (error) {
    logger.error("Error in messageSeen:", error);
    socket.emit("messageError", {
      message: "Failed to mark message as seen",
      error: error.message,
    });
  }
};

const reactToMessage = async function ({ args, socket, io, redisClient }) {
  try {
    // console.log({ args });
    const { message, reaction, type, room, clientVersion } = args; // ✅ استقبال clientVersion
    if (!message) {
      return { type: "error", message: "Message required" };
    }
    const findMessage = await Message.findById(message);

    if (!findMessage) {
      return socket.emit("messageError", {
        message: "Message not found",
        error: "Message not found",
      });
    }
    const roomForEmit = room || String(findMessage.room || "");
    const allowed = await assertUserInRoom(socket.user._id, roomForEmit);
    if (!allowed) {
      return { type: "error", message: "Forbidden" };
    }
    if (String(findMessage.room || "") !== String(roomForEmit || "")) {
      return { type: "error", message: "Message does not belong to room" };
    }

    // ✅ التحقق من conflict
    const conflictCheck = findMessage.checkVersionConflict(clientVersion);
    if (conflictCheck.hasConflict) {
      logger.warn("Version conflict detected in reactToMessage", {
        messageId: message,
        serverVersion: conflictCheck.serverVersion,
        clientVersion: conflictCheck.clientVersion,
      });
      // إرسال الرسالة المحدثة للعميل
      const conflictMessageObject = findMessage.toObject();
      io.to(roomForEmit).emit("reactToMessage", {
        message: conflictMessageObject,
        room: roomForEmit,
        conflict: true,
        serverVersion: conflictCheck.serverVersion,
      });
      return;
    }

    let reactions = findMessage.reactions;
    if (type === "remove") {
      const data = reactions.filter(
        (react) => react.user !== socket.user._id && react.reaction !== reaction
      );

      reactions = data;
    } else {
      reactions.push({ user: socket.user._id, reaction });
    }

    findMessage.reactions = reactions;
    await findMessage.save(); // ✅ سيتم تحديث stateVersion تلقائياً

    // ✅ تحويل Mongoose document إلى object للحفاظ على senderSnapshot
    const messageObject = findMessage.toObject();
    io.to(roomForEmit).emit("reactToMessage", {
      message: messageObject,
      room: roomForEmit,
      stateVersion: findMessage.stateVersion, // ✅ إرسال stateVersion المحدث
    });
    chatTelemetryCounters.reactionSuccess += 1;
    return { type: "success", message: messageObject, room: roomForEmit };
  } catch (error) {
    chatTelemetryCounters.reactionFailure += 1;
    logger.error("Error in reactToMessage:", error);
    socket.emit("messageError", {
      message: "Failed to react to message",
      error: error.message,
    });
    return { type: "error", message: error?.message || "Failed to react to message" };
  }
};

const votePoll = async function ({ args, socket, io, callback }) {
  try {
    const { message: messageId, room, optionIds, optionId } = args || {};
    if (!messageId || !room) {
      if (typeof callback === "function") {
        callback({ type: "error", message: "Message and room are required" });
      }
      return;
    }

    const allowed = await assertUserInRoom(socket.user._id, room);
    if (!allowed) {
      if (typeof callback === "function") {
        callback({ type: "error", message: "Forbidden" });
      }
      return;
    }

    const pollMessage = await Message.findOne({
      _id: messageId,
      room,
      type: "poll",
      deletedForAll: { $ne: true },
      deletedForUsers: { $nin: [socket.user._id] },
    });

    if (!pollMessage) {
      if (typeof callback === "function") {
        callback({ type: "error", message: "Poll message not found" });
      }
      return;
    }

    let parsedContent = {};
    try {
      parsedContent = pollMessage.content ? JSON.parse(pollMessage.content) : {};
    } catch (_) {
      parsedContent = {};
    }

    const options = Array.isArray(parsedContent?.options)
      ? parsedContent.options
      : [];
    if (!options.length) {
      if (typeof callback === "function") {
        callback({ type: "error", message: "Poll options are invalid" });
      }
      return;
    }

    const allowMultiple = Boolean(parsedContent?.allowMultiple);
    const requestedRaw = Array.isArray(optionIds)
      ? optionIds
      : optionId != null
      ? [optionId]
      : [];
    const requested = [...new Set(requestedRaw.map((x) => String(x)).filter(Boolean))];
    if (!requested.length) {
      if (typeof callback === "function") {
        callback({ type: "error", message: "Option is required" });
      }
      return;
    }
    if (!allowMultiple && requested.length > 1) {
      if (typeof callback === "function") {
        callback({ type: "error", message: "This poll accepts one option only" });
      }
      return;
    }

    const optionIdSet = new Set(
      options.map((option, idx) =>
        String(option?.id != null ? option.id : idx)
      )
    );
    const invalidOption = requested.find((id) => !optionIdSet.has(String(id)));
    if (invalidOption) {
      if (typeof callback === "function") {
        callback({ type: "error", message: "Invalid poll option" });
      }
      return;
    }

    const voterId = String(socket.user._id);
    const nextOptions = options.map((option, idx) => {
      const sid = String(option?.id != null ? option.id : idx);
      const voters = Array.isArray(option?.voterIds)
        ? option.voterIds.map((v) => String(v))
        : [];
      const withoutMe = voters.filter((id) => id !== voterId);
      const shouldSelect = requested.includes(sid);
      return {
        ...option,
        id: sid,
        voterIds: shouldSelect ? [...withoutMe, voterId] : withoutMe,
      };
    });

    pollMessage.content = JSON.stringify({
      ...parsedContent,
      options: nextOptions,
      updatedAt: new Date().toISOString(),
    });
    pollMessage.markModified("content");
    pollMessage.stateVersion = Number(pollMessage.stateVersion || 0) + 1;
    await pollMessage.save();

    const messageObject = pollMessage.toObject();
    io.to(room).emit("pollUpdated", {
      message: messageObject,
      room,
      stateVersion: pollMessage.stateVersion,
    });

    if (typeof callback === "function") {
      callback({
        type: "success",
        messageId: String(pollMessage._id),
        room,
        stateVersion: pollMessage.stateVersion,
      });
    }
  } catch (error) {
    logger.error("Error in votePoll:", error);
    if (typeof callback === "function") {
      callback({ type: "error", message: error?.message || "Failed to vote poll" });
    }
  }
};

const deliveredTo = async function ({ args, socket, io, redisClient }) {
  try {
    const { message, room } = args;
    if (!message) {
      return socket.emit("messageError", {
        message: "Message required",
        error: "Message required",
      });
    }
    const currentMessage = await Message.findById(message);
    if (!currentMessage) {
      return socket.emit("messageError", {
        message: "Message not found",
        error: "Message not found",
      });
    }
    const roomForEmit = room || String(currentMessage.room);
    const allowed = await assertUserInRoom(socket.user._id, roomForEmit);
    if (!allowed) {
      return socket.emit("messageError", {
        message: "Forbidden",
        error: "Forbidden",
      });
    }
    if (String(currentMessage.user || "") === String(socket.user._id || "")) {
      return;
    }
    const ackUserId = socket.user._id;
    const upd = await Message.updateOne(
      { _id: message },
      { $addToSet: { deliveredTo: ackUserId } }
    );
    if (upd.matchedCount === 0) {
      return socket.emit("messageError", {
        message: "Message not found",
        error: "Message not found",
      });
    }
    const freshMessage = await Message.findById(message);
    if (!freshMessage) return;
    const messageObject = freshMessage.toObject();
    // Broadcast delivery update to all room participants.
    // More reliable than per-user redis socket lookup (can be stale or single-socket only).
    io.to(roomForEmit).emit("deliveredTo", {
      message: messageObject,
      room: roomForEmit,
    });
  } catch (error) {
    logger.error("Error in deliveredTo:", error);
    socket.emit("messageError", {
      message: "Failed to mark message as delivered",
      error: error.message,
    });
  }
};

const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const assertUserInRoom = async (userId, roomId) => {
  const chatRoom = await Room.findById(roomId).select("members user").lean();
  if (!chatRoom) return false;
  const userIdStr = String(userId);
  const ownerIdStr = String(chatRoom.user || "");
  const isRoomMember = (chatRoom.members || []).some(
    (m) => String(m) === userIdStr
  );
  return isRoomMember || ownerIdStr === userIdStr;
};

const searchRoomMessages = async function ({ args, socket, callback }) {
  const {
    room,
    query,
    limit = 25,
    type = "all",
    from = null,
    to = null,
    hasMentions = null,
  } = args || {};
  const q = String(query || "").trim();
  try {
    if (!room || !q) {
      if (typeof callback === "function") {
        callback({ type: "error", message: "Room and query required" });
      }
      return;
    }
    if (q.length < 2) {
      if (typeof callback === "function") {
        callback({ type: "error", message: "Query too short" });
      }
      return;
    }
    const maxLimit = Math.min(Math.max(Number(limit) || 25, 1), 50);
    const allowed = await assertUserInRoom(socket.user._id, room);
    if (!allowed) {
      if (typeof callback === "function") {
        callback({ type: "error", message: "Forbidden" });
      }
      return;
    }
    chatTelemetryCounters.searchCount += 1;
    const regex = new RegExp(escapeRegex(q), "i");
    const baseQuery = {
      room,
      deletedForAll: { $ne: true },
      deletedForUsers: { $nin: [socket.user._id] },
      text: regex,
    };
    if (type === "attachments") {
      baseQuery.type = { $in: ["image", "video", "audio", "document"] };
    } else if (type === "call_events") {
      baseQuery.type = "call_event";
    } else if (type && type !== "all") {
      baseQuery.type = type;
    }
    if (from || to) {
      baseQuery.createdAt = {};
      if (from) baseQuery.createdAt.$gte = new Date(from);
      if (to) baseQuery.createdAt.$lte = new Date(to);
    }
    if (hasMentions === true) {
      baseQuery.mentions = { $exists: true, $ne: [] };
    } else if (hasMentions === false) {
      baseQuery.$or = [{ mentions: { $exists: false } }, { mentions: { $size: 0 } }];
    }
    const searchFilter = {
      $and: [baseQuery, ...visibilityConditionsForUser(socket.user._id)],
    };
    const messages = await Message.find(searchFilter)
      .sort({ createdAt: -1 })
      .limit(maxLimit)
      .lean();

    if (typeof callback === "function") {
      callback({ type: "success", messages, room });
    }
  } catch (error) {
    logger.error("Error in searchRoomMessages:", error);
    if (typeof callback === "function") {
      callback({
        type: "error",
        message: error.message || "Search failed",
      });
    }
  }
};

const searchGlobalMessages = async function ({ args, socket, callback }) {
  const {
    query,
    limit = 25,
    type = "all",
    from = null,
    to = null,
    hasMentions = null,
  } = args || {};
  const q = String(query || "").trim();
  try {
    if (!q) {
      if (typeof callback === "function") {
        callback({ type: "error", message: "Query required" });
      }
      return;
    }
    if (q.length < 2) {
      if (typeof callback === "function") {
        callback({ type: "error", message: "Query too short" });
      }
      return;
    }

    const maxLimit = Math.min(Math.max(Number(limit) || 25, 1), 50);
    const userId = socket.user._id;
    const roomDocs = await Room.find({
      $or: [{ members: userId }, { user: userId }],
      deletedForUsers: { $ne: userId },
    })
      .select("_id")
      .lean();
    const roomIds = (roomDocs || []).map((r) => r._id);
    if (!roomIds.length) {
      if (typeof callback === "function") {
        callback({ type: "success", messages: [] });
      }
      return;
    }

    chatTelemetryCounters.searchCount += 1;
    const regex = new RegExp(escapeRegex(q), "i");
    const baseQuery = {
      room: { $in: roomIds },
      deletedForAll: { $ne: true },
      deletedForUsers: { $nin: [userId] },
      text: regex,
    };
    if (type === "attachments") {
      baseQuery.type = { $in: ["image", "video", "audio", "document"] };
    } else if (type === "call_events") {
      baseQuery.type = "call_event";
    } else if (type && type !== "all") {
      baseQuery.type = type;
    }
    if (from || to) {
      baseQuery.createdAt = {};
      if (from) baseQuery.createdAt.$gte = new Date(from);
      if (to) baseQuery.createdAt.$lte = new Date(to);
    }
    if (hasMentions === true) {
      baseQuery.mentions = { $exists: true, $ne: [] };
    } else if (hasMentions === false) {
      baseQuery.$or = [{ mentions: { $exists: false } }, { mentions: { $size: 0 } }];
    }
    const searchFilter = {
      $and: [baseQuery, ...visibilityConditionsForUser(userId)],
    };
    const messages = await Message.find(searchFilter)
      .sort({ createdAt: -1 })
      .limit(maxLimit)
      .select("_id uuId room text type user createdAt scheduleStatus")
      .lean();

    if (typeof callback === "function") {
      callback({ type: "success", messages });
    }
  } catch (error) {
    logger.error("Error in searchGlobalMessages:", error);
    if (typeof callback === "function") {
      callback({
        type: "error",
        message: error.message || "Search failed",
      });
    }
  }
};

const EDIT_MESSAGE_MAX_LEN = 5000;
const EDIT_MESSAGE_WINDOW_MS =
  parseInt(process.env.MESSAGE_EDIT_WINDOW_MS, 10) || 15 * 60 * 1000;

const editMessage = async function ({
  args,
  socket,
  io,
  redisClient,
  callback,
}) {
  try {
    const { room, messageId, uuId, text, clientVersion } = args || {};
    const newText = String(text ?? "").trim();
    if (!room || (!messageId && !uuId)) {
      if (typeof callback === "function") {
        callback({ type: "error", message: "Room and message id required" });
      }
      return;
    }
    if (!newText) {
      if (typeof callback === "function") {
        callback({ type: "error", message: "Message text required" });
      }
      return;
    }
    if (newText.length > EDIT_MESSAGE_MAX_LEN) {
      if (typeof callback === "function") {
        callback({ type: "error", message: "Message too long" });
      }
      return;
    }

    const allowed = await assertUserInRoom(socket.user._id, room);
    if (!allowed) {
      if (typeof callback === "function") {
        callback({ type: "error", message: "Forbidden" });
      }
      return;
    }

    const query = { room };
    if (messageId) query._id = messageId;
    else query.uuId = uuId;

    const msg = await Message.findOne(query);
    if (!msg) {
      if (typeof callback === "function") {
        callback({ type: "error", message: "Message not found" });
      }
      return;
    }
    if (String(msg.user) !== String(socket.user._id)) {
      if (typeof callback === "function") {
        callback({ type: "error", message: "Forbidden" });
      }
      return;
    }
    if (msg.type !== "text") {
      if (typeof callback === "function") {
        callback({
          type: "error",
          message: "Only text messages can be edited",
        });
      }
      return;
    }
    if (msg.deletedForAll) {
      if (typeof callback === "function") {
        callback({ type: "error", message: "Message deleted" });
      }
      return;
    }
    const delUsers = msg.deletedForUsers || [];
    if (delUsers.map(String).includes(String(socket.user._id))) {
      if (typeof callback === "function") {
        callback({ type: "error", message: "Message not available" });
      }
      return;
    }
    if (msg.e2ee?.ciphertext) {
      if (typeof callback === "function") {
        callback({
          type: "error",
          message: "Editing encrypted messages is not supported",
        });
      }
      return;
    }
    const age = Date.now() - new Date(msg.createdAt).getTime();
    if (age > EDIT_MESSAGE_WINDOW_MS) {
      if (typeof callback === "function") {
        callback({ type: "error", message: "Edit window expired" });
      }
      return;
    }

    if (clientVersion != null && clientVersion !== undefined) {
      const conflict = msg.checkVersionConflict(Number(clientVersion));
      if (conflict.hasConflict) {
        if (typeof callback === "function") {
          callback({
            type: "error",
            message: "Version conflict",
            serverVersion: conflict.serverVersion,
            clientVersion: conflict.clientVersion,
          });
        }
        return;
      }
    }

    msg.text = newText;
    msg.editedAt = new Date();
    await msg.save();

    const messageObject = msg.toObject();
    io.to(room).emit("messageEdited", { message: messageObject, room });
    invalidateChatSummaryCacheForRoom(room);
    chatTelemetryCounters.editSuccess += 1;

    if (typeof callback === "function") {
      callback({ type: "success", message: messageObject });
    }
  } catch (error) {
    chatTelemetryCounters.editFailure += 1;
    logger.error("Error in editMessage:", error);
    if (typeof callback === "function") {
      callback({ type: "error", message: error.message || "Edit failed" });
    }
  }
};

const getThreadMessages = async function ({ args, socket, io, redisClient }) {
  const { room, threadRoot, page = 1, limit = 25 } = args || {};
  logger.messageEvent("Getting thread messages", {
    roomId: room,
    threadRoot,
    page,
    limit,
    userId: socket.user._id,
  });
  try {
    if (!room || !threadRoot) {
      socket.emit("getThreadMessagesError", {
        room: room || null,
        threadRoot: threadRoot || null,
        message: "Room and threadRoot are required",
      });
      return;
    }
    const allowed = await assertUserInRoom(socket.user._id, room);
    if (!allowed) {
      socket.emit("getThreadMessagesError", {
        room,
        threadRoot,
        message: "Forbidden",
      });
      return;
    }
    const maxLimit = Math.min(Math.max(Number(limit) || 25, 1), 100);
    const skip = (page - 1) * maxLimit;

    const root = await Message.findOne({
      _id: threadRoot,
      room,
      deletedForAll: { $ne: true },
      deletedForUsers: { $nin: [socket.user._id] },
    })
      .select("_id")
      .lean();
    if (!root) {
      socket.emit("getThreadMessagesError", {
        room,
        threadRoot,
        message: "Thread root not found",
      });
      return;
    }

    const baseFilter = {
      room,
      deletedForAll: { $ne: true },
      deletedForUsers: { $nin: [socket.user._id] },
      $or: [{ _id: threadRoot }, { threadRoot }],
    };

    const visibleThreadFilter = {
      $and: [baseFilter, ...visibilityConditionsForUser(socket.user._id)],
    };

    const messages = await Message.find(visibleThreadFilter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(maxLimit)
      .lean();

    const totalThread = await Message.countDocuments(visibleThreadFilter);
    const hasMore = totalThread > skip + messages.length;

    const reversedMessages = messages.reverse();
    socket.emit("getThreadMessages", {
      messages: reversedMessages,
      currentPage: page,
      hasMore,
      room,
      threadRoot,
      override: false,
      stateVersions: reversedMessages.reduce((acc, msg) => {
        acc[msg._id.toString()] = msg.stateVersion || 1;
        return acc;
      }, {}),
    });
  } catch (error) {
    logger.error("Error in getThreadMessages:", error);
    socket.emit("getThreadMessagesError", {
      room: args?.room,
      threadRoot: args?.threadRoot,
      message: "Failed to get thread messages",
      error: error.message,
    });
  }
};

const getMessages = async function ({ args, socket, io, redisClient }) {
  const { room, page = 1, limit = 25, override = false } = args;
  logger.messageEvent("Getting messages", {
    roomId: room,
    page,
    limit,
    override,
    userId: socket.user._id,
  });
  try {
    if (!room) {
      return socket.emit("messageError", {
        message: "Room required",
        error: "Room required",
      });
    }
    const allowed = await assertUserInRoom(socket.user._id, room);
    if (!allowed) {
      return socket.emit("messageError", {
        message: "Forbidden",
        error: "Forbidden",
      });
    }
    const maxLimit = Math.min(Math.max(Number(limit) || 25, 1), 100);
    const safePage = Math.max(Number(page) || 1, 1);
    const skip = (safePage - 1) * maxLimit;
    const visibleMessagesFilter = {
      room,
      deletedForAll: { $ne: true },
      deletedForUsers: { $nin: [socket.user._id] },
      $and: visibilityConditionsForUser(socket.user._id),
    };
    const messages = await Message.find(visibleMessagesFilter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(maxLimit)
      .lean();

    const totalMessages = await Message.countDocuments(visibleMessagesFilter);
    logger.debug("Messages retrieved", {
      roomId: room,
      totalMessages: totalMessages,
      messagesCount: messages.length,
    });
    const hasMore = totalMessages > skip + messages.length;
    logger.debug("Has more messages", { hasMore, roomId: room });

    logger.debug("Sending messages to requester socket", {
      roomId: room,
      socketId: socket.id,
    });
    const reversedMessages = messages.reverse();
    socket.emit("getMessages", {
      messages: reversedMessages,
      currentPage: page,
      hasMore,
      room,
      override,
      // ✅ إرسال stateVersions للرسائل
      stateVersions: reversedMessages.reduce((acc, msg) => {
        acc[msg._id.toString()] = msg.stateVersion || 1;
        return acc;
      }, {}),
    });
  } catch (error) {
    logger.error("Error in getMessages:", error);
    socket.emit("messageError", {
      message: "Failed to get messages",
      error: error.message,
    });
  }
};

const typing = async function ({ args, socket, io, redisClient }) {
  const { roomId, isTyping } = args;
  try {
    if (!roomId) return;
    const allowed = await assertUserInRoom(socket.user._id, roomId);
    if (!allowed) return;
    // ✅ Check typing indicator privacy setting
    const typingUser = await User.findById(socket.user._id)
      .select("friends privacySettings.interactions.typingIndicator")
      .lean();
    
    const typingPrivacy = typingUser?.privacySettings?.interactions?.typingIndicator || "everyone";
    
    // If set to "noOne", don't broadcast typing at all
    if (typingPrivacy === "noOne") {
      return;
    }
    
    const room = await Room.findById(roomId).select("members user").lean();
    const ownerId = room?.user ? String(room.user) : "";
    const memberIds = (room?.members || []).map((member) => String(member));
    if (ownerId) memberIds.push(ownerId);
    const members = [...new Set(memberIds)].filter(
      (member) => String(member) !== String(socket.user._id)
    );
    
    const userFriends = typingUser?.friends || [];
    
    for (const member of members || []) {
      // Check if typing should be visible to this member
      if (typingPrivacy === "friends") {
        // Only show to friends
        const isFriend = userFriends.some(
          (friendId) => friendId?.toString() === member?.toString()
        );
        if (!isFriend) {
          continue; // Skip this member - not a friend
        }
      }

      const socketIds = await resolveSocketIdsForUser({
        io,
        redisClient,
        userId: member,
      });
      for (const sid of socketIds) {
        io.to(sid).emit("userTyping", {
          isTyping,
          userId: socket.user._id,
          roomId,
          memberId: member,
        });
      }
    }
  } catch (error) {
    logger.error("Error in typing:", error);
  }
};

const leaveRoom = async function ({ args, socket, io, redisClient }) {
  const { room } = args;
  logger.messageEvent("User leaving room", {
    roomId: room,
    userId: socket.user._id,
  });
  try {
    socket.leave(room);
    socket.removeAllListeners(room + "-newMessage");
    socket.leave(room + "-newMessage");

    socket.broadcast
      .to(room)
      .emit("userLeft", `${socket.user._id} left the chat`);

    // check if there's no message left in the room and delete the room
    const hasMessages = await Message.exists({ room });
    if (!hasMessages) {
      await Room.findByIdAndDelete(room);
    }

    // const chatRoom = await Room.findById(room);
    // const userExists = chatRoom.members.find((member) => member == user);

    // if (userExists) {
    //   chatRoom.members = chatRoom.members.filter((member) => member != user);
    // }

    // await chatRoom.save();
  } catch (error) {
    logger.error("Error in leaveRoom:", error);
    socket.emit("chatError", {
      message: "Failed to leave room",
      error: error.message,
    });
  }
};

const clearChat = async function ({ args, socket, io, redisClient }) {
  try {
    const { room } = args;
    if (!room) {
      return socket.emit("chatError", {
        message: "Room required",
        error: "Room required",
      });
    }
    const allowed = await assertUserInRoom(socket.user._id, room);
    if (!allowed) {
      return socket.emit("chatError", {
        message: "Forbidden",
        error: "Forbidden",
      });
    }
    logger.messageEvent("Clearing chat", {
      roomId: room,
      userId: socket.user._id,
    });

    await Message.updateMany(
      {
        room,
        deletedForUsers: { $nin: [socket.user._id] },
      },
      {
        $addToSet: { deletedForUsers: socket.user._id },
      }
    );

    socket.emit("clearChat", {
      success: true,
    });
    invalidateChatSummaryCacheForRoom(room);
  } catch (error) {
    logger.error("Error in clearChat:", error);
    socket.emit("chatError", {
      message: "Failed to clear chat",
      error: error.message,
    });
  }
};

const setPassword = async function (
  { args, socket, io, redisClient },
  callback
) {
  const { room, type, password } = args;
  const chatRoom = await Room.findById(room);
  if (type === "add") {
    if (chatRoom.passwords.find((p) => p.user == socket.user._id)) {
      chatRoom.passwords.find((p) => p.user == socket.user._id).password =
        password;
    } else {
      chatRoom.passwords.push({ user: socket.user._id, password });
    }
  } else if (type === "remove") {
    chatRoom.passwords = chatRoom.passwords.filter(
      (p) => p.user != socket.user._id
    );
  }

  await chatRoom.save();

  callback({ type: "success", data: chatRoom });
};

const deleteChat = async function ({ args, socket, io, redisClient }) {
  try {
    const { room } = args;
    if (!room) {
      return socket.emit("chatError", {
        message: "Room required",
        error: "Room required",
      });
    }
    const allowed = await assertUserInRoom(socket.user._id, room);
    if (!allowed) {
      return socket.emit("chatError", {
        message: "Forbidden",
        error: "Forbidden",
      });
    }

    // Mark all messages in the room as deleted for the user
    await Message.updateMany(
      {
        room,
        deletedForUsers: { $nin: [socket.user._id] },
      },
      {
        $addToSet: { deletedForUsers: socket.user._id },
      }
    );

    // Add the user to the deletedForUsers array of the room
    const chatRoom = await Room.findById(room);
    if (!chatRoom.deletedForUsers.includes(socket.user._id)) {
      chatRoom.deletedForUsers.push(socket.user._id);
      await chatRoom.save();
    }

    socket.emit("deleteChat", {
      success: true,
    });
    invalidateChatSummaryCacheForRoom(room);
  } catch (error) {
    logger.error("Error in deleteChat:", error);
    socket.emit("chatError", {
      message: "Failed to delete chat",
      error: error.message,
    });
  }
};

const handleCall = async function ({ args, socket, io, redisClient }) {
  const { offer, roomId } = args;
  if (!roomId || !offer) return;
  const allowed = await assertUserInRoom(socket.user._id, roomId);
  if (!allowed) {
    socket.emit("messageError", {
      message: "Forbidden",
      error: "Forbidden",
    });
    return;
  }
  socket.broadcast.to(roomId).emit("call", { offer });
};

const handleAnswer = async function ({ args, socket, io, redisClient }) {
  const { answer, roomId } = args;
  if (!roomId || !answer) return;
  const allowed = await assertUserInRoom(socket.user._id, roomId);
  if (!allowed) {
    socket.emit("messageError", {
      message: "Forbidden",
      error: "Forbidden",
    });
    return;
  }
  socket.broadcast.to(roomId).emit("answer", { answer });
};

const handleIceCandidate = async function ({ args, socket, io, redisClient }) {
  const { candidate, roomId } = args;
  if (!roomId || !candidate) return;
  const allowed = await assertUserInRoom(socket.user._id, roomId);
  if (!allowed) {
    socket.emit("messageError", {
      message: "Forbidden",
      error: "Forbidden",
    });
    return;
  }
  socket.broadcast.to(roomId).emit("ice-candidate", { candidate });
};

const processDueScheduledMessages = async ({ io, redisClient }) => {
  if (!io || scheduledDispatcherRunning) return;
  scheduledDispatcherRunning = true;
  try {
    // Process a bounded batch each tick to keep event loop healthy.
    const dueCandidates = await Message.find({
      scheduleStatus: "scheduled",
      scheduledAt: { $lte: new Date() },
      deletedForAll: { $ne: true },
    })
      .sort({ scheduledAt: 1 })
      .limit(20)
      .select("_id")
      .lean();
    if (!dueCandidates.length) return;

    for (const item of dueCandidates) {
      const now = new Date();
      const dispatched = await Message.findOneAndUpdate(
        {
          _id: item._id,
          scheduleStatus: "scheduled",
          scheduledAt: { $lte: now },
        },
        {
          $set: {
            scheduleStatus: "sent",
            createdAt: now,
            dispatchedAt: now,
          },
          $inc: { stateVersion: 1 },
        },
        { new: true }
      ).lean();
      if (!dispatched) continue;

      const dispatchedPayload = {
        message: dispatched,
        room: String(dispatched.room),
        user: dispatched.user,
        stateVersion: dispatched.stateVersion,
      };
      io.to(String(dispatched.room)).emit("receiveMessage", dispatchedPayload);
      const scheduledRecipients = (dispatched.sentTo || []).map((id) =>
        resolveRedisUserId(id)
      );
      const scheduledDirectEmitStats = await emitToOnlineRecipients({
        io,
        redisClient,
        recipientIds: scheduledRecipients,
        eventName: "receiveMessage",
        payload: dispatchedPayload,
      });
      invalidateChatSummaryCacheForRoom(dispatched.room);

      try {
        const roomDoc = await Room.findById(dispatched.room)
          .select("members name isGroup")
          .lean();
        const recipientMembers = (roomDoc?.members || []).filter(
          (memberId) => String(memberId) !== String(dispatched.user)
        );
        await addPushNotificationJob(
          {
            messageId: String(dispatched._id),
            senderId: String(dispatched.user),
            members: recipientMembers,
            ...(Array.isArray(dispatched.mentions) && dispatched.mentions.length > 0
              ? {
                  mentionUserIds: dispatched.mentions.map((id) => String(id)),
                  roomNameForPush:
                    roomDoc?.isGroup && roomDoc?.name
                      ? String(roomDoc.name)
                      : undefined,
                }
              : {}),
          },
          500
        );
      } catch (e) {
        logger.warn("Scheduled message push queue enqueue failed", {
          messageId: String(dispatched._id),
          error: e?.message,
        });
      }
    }
  } catch (error) {
    logger.error("Scheduled dispatcher tick failed", error);
  } finally {
    scheduledDispatcherRunning = false;
  }
};

const startScheduledMessageDispatcher = ({ io, redisClient }) => {
  if (scheduledDispatcherTimer) return;
  scheduledDispatcherTimer = setInterval(() => {
    void processDueScheduledMessages({ io, redisClient });
  }, SCHEDULED_DISPATCH_INTERVAL_MS);
};

const getScheduledMessages = async function ({ args, socket, callback }) {
  try {
    const { room } = args || {};
    if (!room) {
      if (typeof callback === "function") {
        callback({ type: "error", message: "Room required" });
      }
      return;
    }
    const allowed = await assertUserInRoom(socket.user._id, room);
    if (!allowed) {
      if (typeof callback === "function") {
        callback({ type: "error", message: "Forbidden" });
      }
      return;
    }
    const messages = await Message.find({
      room,
      user: socket.user._id,
      scheduleStatus: "scheduled",
      deletedForAll: { $ne: true },
    })
      .sort({ scheduledAt: 1 })
      .lean();
    if (typeof callback === "function") {
      callback({ type: "success", room, messages });
    }
  } catch (error) {
    logger.error("Error in getScheduledMessages:", error);
    if (typeof callback === "function") {
      callback({ type: "error", message: error?.message || "Operation failed" });
    }
  }
};

const cancelScheduledMessage = async function ({ args, socket, callback }) {
  try {
    const { room, messageId } = args || {};
    if (!room || !messageId) {
      if (typeof callback === "function") {
        callback({ type: "error", message: "Room and message id required" });
      }
      return;
    }
    const updated = await Message.findOneAndUpdate(
      {
        _id: messageId,
        room,
        user: socket.user._id,
        scheduleStatus: "scheduled",
      },
      {
        $set: {
          scheduleStatus: "cancelled",
          deletedForAll: true,
        },
        $inc: { stateVersion: 1 },
      },
      { new: true }
    ).lean();
    if (!updated) {
      if (typeof callback === "function") {
        callback({ type: "error", message: "Scheduled message not found" });
      }
      return;
    }
    if (typeof callback === "function") {
      callback({ type: "success", room, messageId: String(updated._id) });
    }
    invalidateChatSummaryCacheForRoom(room);
  } catch (error) {
    logger.error("Error in cancelScheduledMessage:", error);
    if (typeof callback === "function") {
      callback({ type: "error", message: error?.message || "Operation failed" });
    }
  }
};

const rescheduleScheduledMessage = async function ({ args, socket, callback }) {
  try {
    const { room, messageId, scheduledAt } = args || {};
    if (!room || !messageId || !scheduledAt) {
      if (typeof callback === "function") {
        callback({
          type: "error",
          message: "Room, message id and scheduledAt are required",
        });
      }
      return;
    }
    const targetDate = new Date(scheduledAt);
    if (Number.isNaN(targetDate.getTime())) {
      if (typeof callback === "function") {
        callback({ type: "error", message: "Invalid schedule time" });
      }
      return;
    }
    if (targetDate.getTime() - Date.now() < MIN_SCHEDULE_LEAD_MS) {
      if (typeof callback === "function") {
        callback({
          type: "error",
          message: "Scheduled time must be in the near future",
        });
      }
      return;
    }
    const updated = await Message.findOneAndUpdate(
      {
        _id: messageId,
        room,
        user: socket.user._id,
        scheduleStatus: "scheduled",
      },
      {
        $set: { scheduledAt: targetDate },
        $inc: { stateVersion: 1 },
      },
      { new: true }
    ).lean();
    if (!updated) {
      if (typeof callback === "function") {
        callback({ type: "error", message: "Scheduled message not found" });
      }
      return;
    }
    if (typeof callback === "function") {
      callback({
        type: "success",
        room,
        messageId: String(updated._id),
        scheduledAt: updated.scheduledAt,
      });
    }
    invalidateChatSummaryCacheForRoom(room);
  } catch (error) {
    logger.error("Error in rescheduleScheduledMessage:", error);
    if (typeof callback === "function") {
      callback({ type: "error", message: error?.message || "Operation failed" });
    }
  }
};

const getChatSummary = async function ({ args, socket, callback }) {
  try {
    const { room, windowSize = 220 } = args || {};
    if (!room) {
      if (typeof callback === "function") {
        callback({ type: "error", message: "Room required" });
      }
      return;
    }
    const allowed = await assertUserInRoom(socket.user._id, room);
    if (!allowed) {
      if (typeof callback === "function") {
        callback({ type: "error", message: "Forbidden" });
      }
      return;
    }
    const cacheKey = `${String(room)}:${String(socket.user._id)}`;
    const cached = chatSummaryCache.get(cacheKey);
    const now = Date.now();
    if (cached && now - cached.createdAt <= CHAT_SUMMARY_CACHE_TTL_MS) {
      if (typeof callback === "function") {
        callback({ type: "success", room, summary: cached.summary, cached: true });
      }
      return;
    }
    const summaryWindow = Math.min(Math.max(Number(windowSize) || 220, 60), 500);
    const messages = await Message.find({
      room,
      deletedForAll: { $ne: true },
      ...visibilityConditionsForUser(socket.user._id).reduce(
        (acc, item) => ({ ...acc, ...item }),
        {}
      ),
    })
      .select("text type createdAt metadata")
      .sort({ createdAt: -1 })
      .limit(summaryWindow)
      .lean();

    const ordered = [...messages].reverse();
    const recentText = ordered
      .filter((m) => m.type === "text" && typeof m.text === "string")
      .slice(-40);
    const recentCalls = ordered.filter((m) => m.type === "call_event").slice(-25);

    const combinedText = recentText.map((m) => String(m.text || "")).join(" ");
    const words = combinedText
      .toLowerCase()
      .replace(/[^a-z0-9\u0600-\u06ff\s]/gi, " ")
      .split(/\s+/)
      .filter((w) => w.length >= 4);
    const stopWords = new Set([
      "this",
      "that",
      "with",
      "from",
      "have",
      "will",
      "your",
      "about",
      "there",
      "would",
      "could",
      "please",
      "thanks",
    ]);
    const freq = new Map();
    words.forEach((w) => {
      if (stopWords.has(w)) return;
      freq.set(w, (freq.get(w) || 0) + 1);
    });
    const topTopics = [...freq.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([word]) => word);
    const actionItems = recentText
      .map((m) => String(m.text || "").trim())
      .filter((txt) =>
        /(\?|please|todo|follow up|check|fix|review|action)/i.test(txt)
      )
      .slice(-5);

    const callStatuses = recentCalls.reduce((acc, m) => {
      const status = String(m?.metadata?.eventKind || m?.metadata?.status || "unknown");
      acc[status] = (acc[status] || 0) + 1;
      return acc;
    }, {});
    const answeredCount = Number(callStatuses.answered || 0);
    const missedCount = Number(callStatuses.missed || 0);
    const rejectedCount = Number(callStatuses.rejected || 0);
    const healthScoreBase = answeredCount + missedCount + rejectedCount;
    const callHealthScore =
      healthScoreBase > 0
        ? Math.max(
            0,
            Math.min(100, Math.round((answeredCount / healthScoreBase) * 100))
          )
        : null;
    const callInsight =
      callHealthScore == null
        ? "No recent call trend."
        : callHealthScore >= 70
        ? "Call completion is healthy."
        : callHealthScore >= 40
        ? "Call completion is moderate; monitor rejected/missed calls."
        : "Call completion is low; check readiness and notification flow.";
    const callRecommendation =
      callHealthScore == null
        ? null
        : callHealthScore < 70
        ? "Consider running pre-call checks and review participant availability."
        : "Current call flow is stable.";

    const summary = {
      generatedAt: new Date().toISOString(),
      textCount: recentText.length,
      callCount: recentCalls.length,
      topTopics,
      actionItems,
      callStatuses,
      callHealthScore,
      callInsight,
      callRecommendation,
    };
    chatSummaryCache.set(cacheKey, { createdAt: now, summary });
    if (chatSummaryCache.size > 500) {
      const firstKey = chatSummaryCache.keys().next().value;
      chatSummaryCache.delete(firstKey);
    }
    if (typeof callback === "function") {
      callback({ type: "success", room, summary, cached: false });
    }
  } catch (error) {
    logger.error("Error in getChatSummary:", error);
    if (typeof callback === "function") {
      callback({ type: "error", message: error?.message || "Operation failed" });
    }
  }
};

const messageServices = {
  markRoomMessagesSeenByUser,
  createServerCallEventMessage,
  joinChat,
  sendMessage,
  messageSeen,
  deliveredTo,
  getMessages,
  getThreadMessages,
  searchRoomMessages,
  searchGlobalMessages,
  editMessage,
  typing,
  leaveRoom,
  reactToMessage,
  votePoll,
  deleteMessage,
  clearChat,
  deleteChat,
  handleCall,
  handleAnswer,
  handleIceCandidate,
  setPassword,
  startScheduledMessageDispatcher,
  getScheduledMessages,
  cancelScheduledMessage,
  rescheduleScheduledMessage,
  getChatSummary,
};

module.exports = messageServices;
