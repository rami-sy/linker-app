/**
 * MediaSoup Socket Handlers
 * معالجات WebRTC للمكالمات الصوتية والمرئية
 */

const mongoose = require("mongoose");
const roomManager = require("../../mediasoup/room-manager");
const config = require("../../config/media.config");
const { getRateLimiter } = require("../../middlewares/socketRateLimiter");
const socketRateLimiter = getRateLimiter();
const { validate } = require("../../middlewares/validation");
const Room = require("../../models/room.model");
const Call = require("../../models/call.model");
const Message = require("../../models/message.model");
const User = require("../../models/user.model");
const logger = require("../../utils/logger");
const { withDbRetry, isDbConnectionError } = require("../../utils/dbRetry");
const {
  withRedisRetry,
  isRedisConnectionError,
} = require("../../utils/redisRetry");
const {
  ERROR_CODES,
  createError,
  formatErrorForCallback,
} = require("../../utils/errorCodes");
const { AuthorizationService, ROLES } = require("../../utils/authorization");
const { RoomAccessControlService } = require("../../utils/roomAccessControl");
const { validateSocketEvent } = require("../../middlewares/validation");
const { streamSecurityService } = require("../../utils/streamSecurity");
const { simulcastOptimizer } = require("../../utils/simulcastOptimizer");
const recordingManager = require("../../services/puppeteer-recording.service");
const { v4: uuidv4 } = require("uuid");
const {
  resolveDisconnectRoomId,
  buildCallTracePayload,
} = require("../../utils/call-signaling-utils");
const { 
  checkChatPermission, 
  checkCallPermission, 
  copyDefaultCallSettingsToCall,
  isCallAdmin,
  canModifyCallSettings,
  isUserBlocked,
  VALID_PERMISSION_VALUES,
} = require("../../utils/permissions");
const { createServerCallEventMessage } = require("../services/message.services");

const INCOMING_QUEUE_BUSY_TIMEOUT_MS = 12000;
const CALL_CANCEL_DEDUP_WINDOW_MS = 15000;
const incomingQueueByRecipient = new Map(); // Map<recipientUserId, { activeIncoming, waitingIncoming[] }>
const incomingQueueTimeouts = new Map(); // Map<requestId, Timeout>
const joinRequestStateBySocket = new Map(); // Map<socketId, { inFlightId, lastCompletedId, lastResponse }>
const callTelemetryCounters =
  global.__callTelemetryCounters ||
  (global.__callTelemetryCounters = {
    joinAttempts: 0,
    joinSuccess: 0,
    joinFailure: 0,
    permissionDenied: 0,
    reconnectAttempt: 0,
    reconnectSuccess: 0,
    reconnectFailure: 0,
    moderationActions: 0,
  });

module.exports = ({ socket, io, redisClient }) => {
  logger.info(`🔌 MediaSoup handlers initialized for socket: ${socket.id}`);

  // ✅ Initialize Room Access Control Service
  const accessControl = new RoomAccessControlService(redisClient);

  /**
   * ✅ Rate Limiting Helper Function
   * للتحقق من rate limit مع دعم user tier
   */
  const checkRateLimit = async (eventType, socket) => {
    const userId = socket.user?._id?.toString();
    const ip = socket.handshake?.address || socket.conn?.remoteAddress;
    return await socketRateLimiter.checkRateLimit(
      socket.id,
      eventType,
      userId,
      ip
    );
  };

  /**
   * ✅ Input Validation Helper Function
   * للتحقق من صحة البيانات المدخلة
   */
  const validateInput = (eventType, data) => {
    const { error, value } = validateSocketEvent(eventType, data);
    if (error) {
      logger.warn(`❌ Validation failed for ${eventType}:`, {
        errors: error.details.map((d) => d.message),
        eventType,
      });
      return {
        valid: false,
        errors: error.details.map((detail) => ({
          field: detail.path.join("."),
          message: detail.message,
        })),
      };
    }
    return { valid: true, value };
  };

  /**
   * ✅ Authorization Helper Functions
   * استخدام AuthorizationService الجديد
   */

  /**
   * ✅ التحقق من الوصول (IP + Rate Limit)
   */
  const checkAccess = async (action = "default", rateLimitConfig = {}) => {
    const accessCheck = await accessControl.checkAccess(
      socket,
      action,
      rateLimitConfig
    );
    if (!accessCheck.allowed) {
      logger.warn(`❌ Access denied: ${accessCheck.reason}`, {
        socketId: socket.id,
        ip: accessCheck.ip,
        action,
      });
      return {
        authorized: false,
        error: accessCheck.reason,
        rateLimitInfo: accessCheck.resetIn
          ? {
              resetIn: accessCheck.resetIn,
              count: accessCheck.count,
              maxRequests: accessCheck.maxRequests,
            }
          : null,
      };
    }
    return { authorized: true, ip: accessCheck.ip };
  };

  const resolveUserSocketIds = async (userId) => {
    const userIdStr = userId?.toString?.() || String(userId || "");
    if (!userIdStr) return [];
    const uniqueSocketIds = new Set();

    try {
      const primarySocketId = await withRedisRetry(
        () => redisClient.get(`user:${userIdStr}`),
        {
          maxRetries: 2,
          initialDelay: 200,
          operationName: `Resolve primary socket for ${userIdStr}`,
        }
      );
      if (primarySocketId) {
        const activePrimarySocket = io.sockets.sockets.get(primarySocketId);
        if (activePrimarySocket?.connected) {
          uniqueSocketIds.add(primarySocketId);
        } else {
          await withRedisRetry(
            () =>
              redisClient
                .multi()
                .del(`user:${userIdStr}`)
                .del(`user_sockets:${userIdStr}`)
                .exec(),
            {
              maxRetries: 1,
              initialDelay: 100,
              operationName: `Delete stale primary socket for ${userIdStr}`,
            }
          ).catch(() => {});
        }
      }
      const socketListRaw = await withRedisRetry(
        () => redisClient.get(`user_sockets:${userIdStr}`),
        {
          maxRetries: 2,
          initialDelay: 200,
          operationName: `Resolve socket list for ${userIdStr}`,
        }
      );
      const socketList = Array.isArray(socketListRaw)
        ? socketListRaw
        : (() => {
            try {
              const parsed = JSON.parse(String(socketListRaw || "[]"));
              return Array.isArray(parsed) ? parsed : [];
            } catch (_) {
              const text = String(socketListRaw || "").trim();
              return text
                ? text
                    .split(",")
                    .map((x) => x.trim())
                    .filter(Boolean)
                : [];
            }
          })();
      const activeSocketList = [];
      socketList.forEach((sid) => {
        const socketId = String(sid || "");
        if (!socketId) return;
        const activeSocket = io.sockets.sockets.get(socketId);
        if (activeSocket?.connected) {
          uniqueSocketIds.add(socketId);
          activeSocketList.push(socketId);
        }
      });
      if (socketList.length > 0 && activeSocketList.length !== socketList.length) {
        await withRedisRetry(
          () =>
            redisClient.set(`user_sockets:${userIdStr}`, JSON.stringify(activeSocketList)),
          {
            maxRetries: 1,
            initialDelay: 100,
            operationName: `Prune stale sockets for ${userIdStr}`,
          }
        ).catch(() => {});
      }
    } catch (error) {
      logger.warn("Failed to resolve primary user socket from redis", {
        userId: userIdStr,
        error: error?.message || String(error),
      });
    }

    for (const [connectedSocketId, connectedSocket] of io.sockets.sockets) {
      const connectedUserId =
        connectedSocket?.user?._id?.toString?.() ||
        String(connectedSocket?.user?._id || "");
      if (
        connectedSocket?.connected === true &&
        connectedUserId &&
        connectedUserId === userIdStr
      ) {
        uniqueSocketIds.add(connectedSocketId);
      }
    }

    return Array.from(uniqueSocketIds);
  };

  const logCallTrace = (event, context = {}, level = "info") => {
    const payload = buildCallTracePayload({
      event,
      socketId: socket.id,
      actorUserId: socket.user?._id,
      roomId: context.roomId || null,
      callId: context.callId || null,
      extra: context,
    });
    const resolvedLevel =
      typeof logger[level] === "function" ? level : "info";
    logger[resolvedLevel](`[call-trace] ${event}`, payload);
  };

  const acquireLifecycleLock = (operationName) => {
    const lockKey = "__callLifecycleOp";
    if (socket.data?.[lockKey]) {
      logger.warn("Lifecycle operation already in progress", {
        socketId: socket.id,
        inProgress: socket.data[lockKey],
        requested: operationName,
      });
      return false;
    }
    if (!socket.data) socket.data = {};
    socket.data[lockKey] = operationName;
    return true;
  };

  const releaseLifecycleLock = (operationName) => {
    const lockKey = "__callLifecycleOp";
    if (socket.data?.[lockKey] === operationName) {
      socket.data[lockKey] = null;
    }
  };

  const getRecipientQueueState = (recipientUserId) => {
    const recipientId = recipientUserId?.toString?.() || String(recipientUserId || "");
    if (!recipientId) return null;
    if (!incomingQueueByRecipient.has(recipientId)) {
      incomingQueueByRecipient.set(recipientId, {
        activeIncoming: null,
        waitingIncoming: [],
      });
    }
    return incomingQueueByRecipient.get(recipientId);
  };

  const clearIncomingQueueTimeout = (requestId) => {
    const timeoutId = incomingQueueTimeouts.get(requestId);
    if (timeoutId) {
      clearTimeout(timeoutId);
      incomingQueueTimeouts.delete(requestId);
    }
  };

  const cleanupRecipientQueueState = (recipientUserId) => {
    const recipientId = recipientUserId?.toString?.() || String(recipientUserId || "");
    const state = incomingQueueByRecipient.get(recipientId);
    if (!state) return;
    if (!state.activeIncoming && (!state.waitingIncoming || state.waitingIncoming.length === 0)) {
      incomingQueueByRecipient.delete(recipientId);
    }
  };

  const emitToUserSockets = async (targetUserId, eventName, payload) => {
    const socketIds = await resolveUserSocketIds(targetUserId);
    socketIds.forEach((targetSocketId) => {
      io.to(targetSocketId).emit(eventName, payload);
    });
    return socketIds.length;
  };

  const createIncomingQueueRequest = ({
    roomId,
    callerId,
    callerData,
    isVideoCall,
    recipientId,
  }) => ({
    requestId: uuidv4(),
    roomId: roomId?.toString?.() || String(roomId || ""),
    callerId: callerId?.toString?.() || String(callerId || ""),
    callerData: callerData || null,
    isVideoCall: !!isVideoCall,
    recipientId: recipientId?.toString?.() || String(recipientId || ""),
    createdAt: Date.now(),
  });

  const emitQueueBusyToCaller = async (request, reason = "busy_timeout") => {
    await emitToUserSockets(request.callerId, "callQueueBusyTimeout", {
      roomId: request.roomId,
      recipientId: request.recipientId,
      requestId: request.requestId,
      reason,
      timeoutMs: INCOMING_QUEUE_BUSY_TIMEOUT_MS,
    });
  };

  const promoteNextQueuedIncoming = async (recipientUserId) => {
    const state = getRecipientQueueState(recipientUserId);
    if (!state || state.activeIncoming || state.waitingIncoming.length === 0) {
      cleanupRecipientQueueState(recipientUserId);
      return;
    }

    while (state.waitingIncoming.length > 0 && !state.activeIncoming) {
      const nextRequest = state.waitingIncoming.shift();
      clearIncomingQueueTimeout(nextRequest.requestId);

      const recipientSocketIds = await resolveUserSocketIds(recipientUserId);
      if (recipientSocketIds.length === 0) {
        await emitQueueBusyToCaller(nextRequest, "recipient_offline");
        logCallTrace("queue_removed", {
          roomId: nextRequest.roomId,
          recipientId: recipientUserId,
          callerId: nextRequest.callerId,
          requestId: nextRequest.requestId,
          reason: "recipient_offline",
        });
        continue;
      }

      const recipientActiveCall = getUserActiveCallContext(recipientUserId);
      if (recipientActiveCall.isBusy) {
        await emitQueueBusyToCaller(nextRequest, "recipient_on_call");
        logCallTrace("queue_timeout_busy", {
          roomId: nextRequest.roomId,
          recipientId: recipientUserId,
          callerId: nextRequest.callerId,
          requestId: nextRequest.requestId,
          reason: "recipient_on_call",
        });
        continue;
      }

      state.activeIncoming = nextRequest;
      await emitToUserSockets(nextRequest.callerId, "callQueuePromoted", {
        roomId: nextRequest.roomId,
        recipientId: recipientUserId,
        requestId: nextRequest.requestId,
      });

      recipientSocketIds.forEach((recipientSocketId) => {
        io.to(recipientSocketId).emit("incomingCall", {
          roomId: nextRequest.roomId,
          callerId: nextRequest.callerId,
          callerData: nextRequest.callerData,
          isVideoCall: nextRequest.isVideoCall,
        });
      });
      await emitToUserSockets(nextRequest.callerId, "remoteRinging", {
        roomId: nextRequest.roomId,
        recipientId: recipientUserId,
      });
      logCallTrace("queue_promoted", {
        roomId: nextRequest.roomId,
        recipientId: recipientUserId,
        callerId: nextRequest.callerId,
        requestId: nextRequest.requestId,
      });
    }

    cleanupRecipientQueueState(recipientUserId);
  };

  const enqueueIncomingForRecipient = async (recipientUserId, request) => {
    const state = getRecipientQueueState(recipientUserId);
    if (!state) return;
    state.waitingIncoming.push(request);
    const queuePosition = state.waitingIncoming.length;

    logCallTrace("queue_enqueued", {
      roomId: request.roomId,
      recipientId: recipientUserId,
      callerId: request.callerId,
      requestId: request.requestId,
      queuePosition,
    });

    const timeoutId = setTimeout(async () => {
      const currentState = getRecipientQueueState(recipientUserId);
      if (!currentState) return;
      const idx = currentState.waitingIncoming.findIndex(
        (item) => item.requestId === request.requestId
      );
      if (idx === -1) return;
      currentState.waitingIncoming.splice(idx, 1);
      incomingQueueTimeouts.delete(request.requestId);
      await emitQueueBusyToCaller(request, "queue_timeout");
      logCallTrace("queue_timeout_busy", {
        roomId: request.roomId,
        recipientId: recipientUserId,
        callerId: request.callerId,
        requestId: request.requestId,
        queuePosition,
      });
      cleanupRecipientQueueState(recipientUserId);
    }, INCOMING_QUEUE_BUSY_TIMEOUT_MS);
    incomingQueueTimeouts.set(request.requestId, timeoutId);

    await emitToUserSockets(request.callerId, "callQueueEnqueued", {
      roomId: request.roomId,
      recipientId: recipientUserId,
      requestId: request.requestId,
      queuePosition,
      timeoutMs: INCOMING_QUEUE_BUSY_TIMEOUT_MS,
    });
  };

  const resolveIncomingCompletion = async (
    recipientUserId,
    { roomId, callerId, promote = true }
  ) => {
    const state = getRecipientQueueState(recipientUserId);
    if (!state) return;
    const normalizedRoomId = roomId?.toString?.() || String(roomId || "");
    const normalizedCallerId = callerId?.toString?.() || String(callerId || "");

    let removedActive = false;
    if (
      state.activeIncoming &&
      state.activeIncoming.roomId === normalizedRoomId &&
      state.activeIncoming.callerId === normalizedCallerId
    ) {
      state.activeIncoming = null;
      removedActive = true;
    }

    const removedWaiting = [];
    state.waitingIncoming = state.waitingIncoming.filter((item) => {
      const shouldRemove =
        item.roomId === normalizedRoomId && item.callerId === normalizedCallerId;
      if (shouldRemove) {
        removedWaiting.push(item);
        clearIncomingQueueTimeout(item.requestId);
      }
      return !shouldRemove;
    });

    if (removedWaiting.length > 0) {
      for (const removed of removedWaiting) {
        logCallTrace("queue_removed", {
          roomId: removed.roomId,
          recipientId: recipientUserId,
          callerId: removed.callerId,
          requestId: removed.requestId,
          reason: "resolved_before_promotion",
        });
      }
    }


    if (removedActive && promote) {
      await promoteNextQueuedIncoming(recipientUserId);
      return;
    }

    cleanupRecipientQueueState(recipientUserId);
  };

  const clearRecipientIncomingQueueOnUnavailable = async (
    recipientUserId,
    reason = "recipient_unavailable"
  ) => {
    const state = getRecipientQueueState(recipientUserId);
    if (!state) return;
    const pending = [];
    if (state.activeIncoming) pending.push(state.activeIncoming);
    if (Array.isArray(state.waitingIncoming) && state.waitingIncoming.length > 0) {
      pending.push(...state.waitingIncoming);
    }
    state.activeIncoming = null;
    state.waitingIncoming = [];
    for (const request of pending) {
      clearIncomingQueueTimeout(request.requestId);
      await emitQueueBusyToCaller(request, reason);
      logCallTrace("queue_removed", {
        roomId: request.roomId,
        recipientId: recipientUserId,
        callerId: request.callerId,
        requestId: request.requestId,
        reason,
      });
    }
    cleanupRecipientQueueState(recipientUserId);
  };

  const removeCallerFromAllIncomingQueues = async (callerUserId) => {
    const callerId = callerUserId?.toString?.() || String(callerUserId || "");
    if (!callerId) return;
    for (const [recipientId, state] of incomingQueueByRecipient.entries()) {
      if (state.activeIncoming?.callerId === callerId) {
        state.activeIncoming = null;
        await promoteNextQueuedIncoming(recipientId);
      }
      const removed = [];
      state.waitingIncoming = state.waitingIncoming.filter((item) => {
        if (item.callerId === callerId) {
          removed.push(item);
          clearIncomingQueueTimeout(item.requestId);
          return false;
        }
        return true;
      });
      removed.forEach((item) => {
        logCallTrace("queue_removed", {
          roomId: item.roomId,
          recipientId,
          callerId,
          requestId: item.requestId,
          reason: "caller_disconnected",
        });
      });
      cleanupRecipientQueueState(recipientId);
    }
  };

  const emitCallParticipantsSnapshot = async ({ roomId, callDoc }) => {
    try {
      if (!roomId || !callDoc) return;

      const activeCallParticipants = (callDoc.participants || [])
        .filter((p) => !p?.leftAt)
        .map((p) => ({
          userId: p?.user?.toString?.() || String(p?.user || ""),
        }))
        .filter((p) => !!p.userId);

      const roomDoc = await Room.findById(roomId).select("members").lean();
      const memberIds = Array.isArray(roomDoc?.members) ? roomDoc.members : [];
      if (memberIds.length === 0) return;

      const resolveAnsweredStartedAtIso = (doc) => {
        if (!doc) return null;
        // Live stream uses call start as effective start.
        if (doc?.isLiveStream) {
          return doc?.startedAt ? new Date(doc.startedAt).toISOString() : null;
        }
        const callerId = doc?.caller?.toString?.() || String(doc?.caller || "");
        const participants = Array.isArray(doc?.participants) ? doc.participants : [];
        const answeredAtMs = participants
          .filter((p) => {
            const participantId = p?.user?.toString?.() || String(p?.user || "");
            return !!participantId && participantId !== callerId;
          })
          .map((p) => {
            if (!p?.joinedAt) return null;
            const ms = new Date(p.joinedAt).getTime();
            return Number.isFinite(ms) ? ms : null;
          })
          .filter((ms) => ms !== null)
          .sort((a, b) => a - b)[0];
        return Number.isFinite(answeredAtMs)
          ? new Date(answeredAtMs).toISOString()
          : null;
      };

      const payload = {
        roomId: roomId?.toString?.() || String(roomId),
        callId: callDoc?._id?.toString?.() || String(callDoc?._id || ""),
        isVideoCall: !!callDoc?.isVideoCall,
        startedAt: resolveAnsweredStartedAtIso(callDoc),
        updatedAt: Date.now(),
        activeCallParticipants,
      };

      for (const memberId of memberIds) {
        const memberIdStr = memberId?.toString?.() || String(memberId);
        if (!memberIdStr) continue;
        try {
          const recipientSocketIds = await resolveUserSocketIds(memberIdStr);
          recipientSocketIds.forEach((recipientSocketId) => {
            io.to(recipientSocketId).emit("callParticipantsSnapshot", payload);
          });
        } catch (error) {
          logger.warn("Failed emitting callParticipantsSnapshot to member", {
            roomId,
            memberId: memberIdStr,
            error: error?.message || String(error),
          });
        }
      }
    } catch (error) {
      logger.error("Error emitting callParticipantsSnapshot:", error);
    }
  };

  const emitRoomUpdateToMembers = async ({ roomId, updates }) => {
    try {
      if (!roomId || !updates) return;
      const roomDoc = await Room.findById(roomId).select("members").lean();
      const memberIds = Array.isArray(roomDoc?.members) ? roomDoc.members : [];
      if (memberIds.length === 0) return;

      for (const memberId of memberIds) {
        const memberIdStr = memberId?.toString?.() || String(memberId);
        if (!memberIdStr) continue;
        try {
          const recipientSocketIds = await resolveUserSocketIds(memberIdStr);
          recipientSocketIds.forEach((recipientSocketId) => {
            io.to(recipientSocketId).emit("roomUpdated", {
              roomId: roomId?.toString?.() || String(roomId),
              updates,
            });
          });
        } catch (error) {
          logger.warn("Failed emitting roomUpdated to member", {
            roomId,
            memberId: memberIdStr,
            error: error?.message || String(error),
          });
        }
      }
    } catch (error) {
      logger.error("Error emitting roomUpdated to room members:", error);
    }
  };

  const createClearActiveCallState = () => ({
    hasActiveCall: false,
    activeCallId: null,
    activeCallType: null,
    activeCallStartedAt: null,
    activeCallParticipants: [],
    activeCallParticipantsSyncedAt: Date.now(),
  });

  const hasAnsweredParticipantInCall = (callDoc = {}) => {
    const callerId = callDoc?.caller?.toString?.() || String(callDoc?.caller || "");
    const participants = Array.isArray(callDoc?.participants) ? callDoc.participants : [];
    return participants.some((participant) => {
      const participantId =
        participant?.user?.toString?.() || String(participant?.user || "");
      if (!participantId || participantId === callerId) return false;
      if (!participant?.leftAt) return true;
      if (Number(participant?.duration || 0) > 0) return true;
      const joinedAtMs = participant?.joinedAt
        ? new Date(participant.joinedAt).getTime()
        : null;
      const leftAtMs = participant?.leftAt
        ? new Date(participant.leftAt).getTime()
        : null;
      if (Number.isFinite(joinedAtMs) && Number.isFinite(leftAtMs)) {
        return leftAtMs - joinedAtMs >= 1500;
      }
      return false;
    });
  };

  const deriveCallOutcomeStatus = (callDoc = {}) => {
    const hasAnsweredParticipant = hasAnsweredParticipantInCall(callDoc);
    const existingStatus = String(callDoc?.status || "answered");
    if (!hasAnsweredParticipant) {
      if (["rejected", "missed", "cancelled"].includes(existingStatus)) {
        return existingStatus;
      }
      return "cancelled";
    }
    if (["answered", "rejected", "missed", "cancelled"].includes(existingStatus)) {
      return existingStatus;
    }
    return "answered";
  };

  const ensureParticipantRecord = (callDoc, userId, options = {}) => {
    if (!callDoc || !userId) return null;
    const normalizedUserId = userId?.toString?.() || String(userId || "");
    if (!normalizedUserId) return null;
    const participants = Array.isArray(callDoc.participants)
      ? callDoc.participants
      : [];
    let participant = participants.find(
      (entry) => entry?.user?.toString?.() === normalizedUserId
    );
    if (!participant) {
      participant = {
        user: userId,
        joinedAt: options.joinedAt || new Date(),
      };
      participants.push(participant);
      callDoc.participants = participants;
    }
    if (options.leftAt) {
      participant.leftAt = options.leftAt;
    }
    if (typeof options.duration === "number") {
      participant.duration = options.duration;
    }
    return participant;
  };

  const getUserActiveCallContext = (targetUserId) => {
    try {
      const targetId = targetUserId?.toString?.() || String(targetUserId || "");
      if (!targetId || !roomManager?.rooms) {
        return { isBusy: false };
      }

      for (const mediasoupRoom of roomManager.rooms.values()) {
        if (!mediasoupRoom) continue;
        const peer = mediasoupRoom.getPeerByUserId(targetId);
        if (!peer) continue;

        const peerRole = peer?.role || peer?.metadata?.role || "member";
        if (peerRole === "viewer") {
          continue;
        }

        return {
          isBusy: true,
          currentCallRoomId: mediasoupRoom.id,
          currentRole: peerRole,
          currentCallId:
            peer?.metadata?.activeCallId?.toString?.() ||
            String(peer?.metadata?.activeCallId || "") ||
            null,
        };
      }
    } catch (error) {
      logger.error("Error checking active call context:", error);
    }
    return { isBusy: false };
  };

  /**
   * ✅ التحقق من أن userId يطابق المستخدم المصادق عليه
   */
  const verifyUserId = (userId) => {
    const result = AuthorizationService.verifyUserId(socket, userId);
    if (!result.authorized) {
      return { authorized: false, error: result.error };
    }
    return { authorized: true, userId: result.data.userId };
  };

  /**
   * ✅ التحقق من أن المستخدم عضو في الغرفة
   * استخدام AuthorizationService الجديد
   */
  const verifyRoomMembership = async (roomId, userId, role = "member") => {
    const requiredRole = role === "viewer" ? ROLES.VIEWER : ROLES.MEMBER;
    const result = await AuthorizationService.verifyRoomMembership(
      roomId,
      userId,
      requiredRole
    );

    if (!result.authorized) {
      return { authorized: false, error: result.error };
    }

    return {
      authorized: true,
      room: result.data.room,
      call: result.data.call,
      role: result.data.role,
      isBroadcaster: result.data.isBroadcaster,
      isViewer: result.data.isViewer,
      isAnonymous: result.data.isAnonymous,
    };
  };

  /**
   * التحقق من أن المستخدم يملك الـ producer
   */
  const verifyProducerOwnership = (roomId, producerId) => {
    try {
      const room = roomManager.getRoom(roomId);
      if (!room) {
        return { authorized: false, error: "Room not found" };
      }

      const peer = room.getPeer(socket.id);
      if (!peer) {
        return { authorized: false, error: "Peer not found" };
      }

      const producer = peer.producers.get(producerId);
      if (!producer) {
        logger.warn(
          `❌ Producer ${producerId} not found for peer ${socket.id}`,
          {
          producerId,
          socketId: socket.id,
            roomId,
          }
        );
        return {
          authorized: false,
          error: "Producer not found or not owned by user",
        };
      }

      return { authorized: true, peer, producer };
    } catch (error) {
      logger.error("❌ Error verifying producer ownership:", error);
      return { authorized: false, error: "Error verifying producer ownership" };
    }
  };

  /**
   * طلب مكالمة (إرسال إشعار للطرف الآخر)
   */
  socket.on(
    "callRequest",
    async ({ roomId, callerId, callerData, isVideoCall }) => {
      try {
        // ✅ Rate limiting check (async with user tier support)
        const rateLimitResult = await checkRateLimit("callRequest", socket);
        if (!rateLimitResult.allowed) {
          return socket.emit("callError", {
            message:
              rateLimitResult.message ||
              "Too many call attempts, please try again later",
            type: "error",
            rateLimitInfo: rateLimitResult,
          });
        }

        // ✅ Input validation
        const validation = validateInput("callRequest", {
          roomId,
          callerId,
          callerData,
          isVideoCall,
        });
        if (!validation.valid) {
          return socket.emit("callError", {
            message: "Invalid call request data",
            type: "error",
            errors: validation.errors,
          });
        }
        // ✅ Use validated values
        ({ roomId, callerId, callerData, isVideoCall } = validation.value);

        const callerCheck = verifyUserId(callerId);
        if (!callerCheck.authorized) {
          logger.warn(`❌ callRequest authorization failed: ${callerCheck.error}`, {
            socketId: socket.id,
            callerId,
            roomId,
          });
          return socket.emit("callError", {
            message: callerCheck.error,
            type: "permission_denied",
          });
        }
        callerId = callerCheck.userId;
        logCallTrace("callRequest.received", {
          roomId: roomId?.toString?.() || String(roomId || ""),
          callerId,
          isVideoCall: !!isVideoCall,
        });

        // ✅ التحقق من صحة roomId قبل المتابعة
        if (!roomId || (typeof roomId === "string" && roomId.trim() === "")) {
          logger.error("❌ callRequest: Invalid roomId", {
            roomId,
            type: typeof roomId,
            callerId,
          });
          return;
        }

        logger.callEvent("Call request", { callerId, roomId });
      
      // الحصول على أعضاء الغرفة من MongoDB
      const chatRoom = await Room.findById(roomId);
      
      if (!chatRoom) {
          logger.error(`❌ Room not found in database: ${roomId}`, {
            roomId,
            callerId,
            roomIdType: typeof roomId,
          });
          // ✅ إرسال خطأ للـ caller
          io.to(socket.id).emit("callRequestError", {
            error: "Room not found",
            roomId,
          });
        return;
      }

        // ✅ Ensure caller is a room member (or room owner) before initiating calls
        const callerIdStr = callerId?.toString?.() || String(callerId || "");
        const callerIsMember = Array.isArray(chatRoom?.members)
          ? chatRoom.members.some(
              (memberId) =>
                (memberId?.toString?.() || String(memberId || "")) === callerIdStr
            )
          : false;
        const callerIsRoomOwner =
          (chatRoom?.user?.toString?.() || String(chatRoom?.user || "")) ===
          callerIdStr;
        if (!callerIsMember && !callerIsRoomOwner) {
          logger.warn("Caller is not a room member/owner", {
            roomId,
            callerId: callerIdStr,
          });
          return socket.emit("callError", {
            message: "You must be a room member to start a call",
            type: "permission_denied",
          });
        }

        // ✅ Check if this is a group call (more than 2 members)
        const isGroupCall = chatRoom.members.length > 2;
      
      // إرسال إشعار لكل عضو ماعدا المتصل
        const recipients = chatRoom.members.filter(
          (memberId) => memberId.toString() !== callerId.toString()
        );
        logger.callEvent(
          `Sending call notification to ${recipients.length} recipient(s)`,
          { roomId, recipientsCount: recipients.length, isGroupCall }
        );

        // ✅ Get caller's user data for permission checking
        const caller = await User.findById(callerId)
          .select("_id userName firstName lastName privacySettings friends")
          .lean();

        if (!caller) {
          logger.error("Caller not found", { callerId });
          return socket.emit("callError", {
            message: "Caller not found",
            type: "error",
          });
        }

        // ✅ Check if caller has permission to start this type of call
        // Uses Room.chatSettings.videoCall or audioCall based on call type
        const callPermissionSetting = isVideoCall ? "videoCall" : "audioCall";
        const hasCallPermission = await checkChatPermission(
          callerId.toString(),
          roomId.toString(),
          callPermissionSetting
        );
        
        if (!hasCallPermission) {
          logger.warn("Caller does not have permission to start call", {
            callerId,
            roomId,
            callType: callPermissionSetting,
          });
          return socket.emit("callError", {
            message: "You don't have permission to start calls in this room",
            type: "permission_denied",
          });
        }

        // ✅ حساب عدد المستلمين المتصلين فعلياً
        let connectedRecipientsCount = 0;
        let waitingRecipientsCount = 0;
      
      for (const memberId of recipients) {
          // ✅ Check if caller has permission to call this recipient
          try {
            const recipient = await User.findById(memberId)
              .select("_id privacySettings friends blockedUsers")
              .lean();

            if (!recipient) {
              logger.warn(`Recipient ${memberId} not found, skipping`);
              continue;
            }

            // ✅ Check if caller is blocked by recipient
            const isCallerBlocked = await isUserBlocked(memberId.toString(), callerId.toString());
            if (isCallerBlocked) {
              logger.warn(`Caller ${callerId} is blocked by recipient ${memberId}, skipping`);
              continue;
            }

            // Get caller's role in the room (for admin/moderator permission checks)
            const callerRole = chatRoom.roles?.find(
              (role) => role.user?.toString() === callerId.toString()
            )?.role || "member";

            // Check if caller is a friend of recipient
            const isFriend = recipient.friends?.some(
              (friendId) => friendId?.toString() === callerId.toString()
            ) || false;

            // Check permission using checkChatPermission
            // We check if the caller has permission to call the recipient
            // based on the recipient's privacy settings
            const setting = isVideoCall ? "videoCall" : "audioCall";
            const allowedUsers = recipient.privacySettings?.chatSettings?.[`${setting}AllowedUsers`] || [];
            
            const hasPermission = await checkChatPermission(
              callerId.toString(), // Caller trying to call (userId)
              roomId.toString(),
              setting,
              callerRole, // Caller's role in the room (for admin/moderator checks)
              isFriend,
              allowedUsers,
              recipient._id.toString() // settingOwnerId: recipient owns these settings
            );

            if (!hasPermission) {
              logger.warn(`Caller ${callerId} does not have permission to ${setting} recipient ${memberId}`, {
                callerId,
                recipientId: memberId,
                setting,
                recipientSettings: recipient.privacySettings?.chatSettings?.[setting],
              });
              // Skip this recipient - don't send call notification
              continue;
            }
          } catch (error) {
            logger.error(`Error checking permission for recipient ${memberId}:`, error);
            // Continue with other recipients even if permission check fails
            continue;
          }
          // ✅ الحصول على socket ID من Redis مع retry mechanism
          try {
            const recipientSocketIds = await resolveUserSocketIds(memberId);
            if (recipientSocketIds.length > 0) {
              const recipientUserId =
                memberId?.toString?.() || String(memberId || "");
              const incomingRequest = createIncomingQueueRequest({
                roomId,
                callerId,
                callerData,
                isVideoCall,
                recipientId: recipientUserId,
              });
              const recipientQueueState = getRecipientQueueState(recipientUserId);
              if (
                recipientQueueState?.activeIncoming &&
                recipientQueueState.activeIncoming.roomId === incomingRequest.roomId &&
                recipientQueueState.activeIncoming.callerId === incomingRequest.callerId
              ) {
                logCallTrace("queue_duplicate_active_ignored", {
                  roomId: incomingRequest.roomId,
                  recipientId: recipientUserId,
                  callerId: incomingRequest.callerId,
                  requestId: recipientQueueState.activeIncoming.requestId,
                }, "debug");
                continue;
              }
              if (
                recipientQueueState?.activeIncoming &&
                !(
                  recipientQueueState.activeIncoming.roomId ===
                    incomingRequest.roomId &&
                  recipientQueueState.activeIncoming.callerId ===
                    incomingRequest.callerId
                )
              ) {
                await enqueueIncomingForRecipient(recipientUserId, incomingRequest);
                waitingRecipientsCount++;
                continue;
              }

              const recipientSocketId = recipientSocketIds[0];
              const recipientSocket = io.sockets.sockets.get(recipientSocketId);
              if (!recipientSocket || recipientSocket.connected !== true) {
                logger.warn(
                  `⚠️ Stale socket mapping for user ${memberId}, skipping incomingCall`,
                  {
                    recipientId: memberId?.toString?.() || String(memberId),
                    recipientSocketId,
                    roomId,
                  }
                );
                try {
                  await withRedisRetry(
                    () =>
                      redisClient
                        .multi()
                        .del(`user:${memberId}`)
                        .del(`user_sockets:${memberId}`)
                        .exec(),
                    {
                      maxRetries: 2,
                      initialDelay: 300,
                      operationName: `Clear stale socket mapping for ${memberId}`,
                    }
                  );
                } catch (cleanupErr) {
                  logger.warn("Failed to clear stale recipient socket mapping", {
                    recipientId: memberId?.toString?.() || String(memberId),
                    error: cleanupErr?.message || cleanupErr,
                  });
                }
                continue;
              }
              const recipientActiveCall = getUserActiveCallContext(memberId);
              if (recipientActiveCall.isBusy) {
                const waitingPayload = {
                  roomId,
                  callerId,
                  callerData,
                  isVideoCall,
                  currentCallRoomId: recipientActiveCall.currentCallRoomId,
                  currentCallId: recipientActiveCall.currentCallId || null,
                };

                recipientSocketIds.forEach((socketIdForRecipient) => {
                  io.to(socketIdForRecipient).emit("callWaitingIncoming", waitingPayload);
                });
                io.to(socket.id).emit("calleeOnAnotherCall", {
                  roomId,
                  recipientId: memberId?.toString?.() || String(memberId),
                  currentCallRoomId: recipientActiveCall.currentCallRoomId,
                  currentCallId: recipientActiveCall.currentCallId || null,
                });
                waitingRecipientsCount++;
                continue;
              }

              // ✅ Check if recipient is a viewer in this live stream room
              const recipientRoom = roomManager.getRoom(roomId);
              const recipientPeer = recipientRoom
                ? recipientRoom.getPeer(recipientSocketId)
                : null;
              const isRecipientViewer =
                recipientPeer && recipientPeer.role === "viewer";

              if (isRecipientViewer) {
                logger.warn(
                  `⚠️ Skipping incoming call for viewer ${memberId}`,
                  {
                    recipientSocketId,
                    roomId,
                    role: recipientPeer.role,
                  }
                );
                continue; // Skip sending incomingCall to viewers
              }

              recipientSocketIds.forEach((socketIdForRecipient) => {
                io.to(socketIdForRecipient).emit("incomingCall", {
                  roomId,
                  callerId,
                  callerData,
                  isVideoCall,
                });
              });
              if (recipientQueueState) {
                recipientQueueState.activeIncoming = incomingRequest;
              }
              connectedRecipientsCount++; // ✅ زيادة العداد فقط إذا تم إرسال الإشعار فعلياً

              // ✅ Notify caller that the recipient is ringing
              io.to(socket.id).emit("remoteRinging", {
                roomId,
                recipientId: memberId,
              });
            } else {
              logger.warn(`⚠️ User ${memberId} is not connected`);
            }
          } catch (error) {
            logger.error(
              `Error getting socket ID for user ${memberId}:`,
              error
            );
            // نكمل مع باقي المستلمين حتى لو فشل أحدهم
          }
        }

        // ✅ إبلاغ المتصل بعدد المستقبلين المتصلين فعلياً وعدد المستقبلين الكلي
        try {
          socket.emit("callInviteSummary", {
          roomId,
            recipientsCount: recipients.length, // العدد الكلي (للمنطق القديم)
            connectedRecipientsCount, // ✅ عدد المتصلين فعلياً (للحالة الجديدة)
            waitingRecipientsCount,
          });
          logger.callEvent("Call invite summary sent", {
            roomId,
            totalRecipients: recipients.length,
            connectedRecipients: connectedRecipientsCount,
            waitingRecipients: waitingRecipientsCount,
        });
      } catch (e) {
          logger.error("❌ Error emitting callInviteSummary to caller:", e);
      }
    } catch (error) {
        logger.error("❌ Error sending call request:", error);
    }
    }
  );

  /**
   * رفض المكالمة (شخص واحد يرفض في مكالمة جماعية)
   */
  socket.on("callRejected", async ({ roomId, callerId, rejectedByUserId }) => {
    try {
      const rejectedByResolved = rejectedByUserId || socket.user?._id;
      const rejectedByCheck = verifyUserId(rejectedByResolved);
      if (!rejectedByCheck.authorized) {
        logger.warn(`❌ callRejected authorization failed: ${rejectedByCheck.error}`, {
          socketId: socket.id,
          roomId,
          rejectedByUserId: rejectedByResolved,
        });
        return;
      }
      rejectedByUserId = rejectedByCheck.userId;
      logCallTrace("callRejected.received", {
        roomId: roomId?.toString?.() || String(roomId || ""),
        callerId: callerId?.toString?.() || String(callerId || ""),
        rejectedByUserId: rejectedByUserId?.toString?.() || String(rejectedByUserId || ""),
      });
      await resolveIncomingCompletion(rejectedByUserId, {
        roomId,
        callerId,
        promote: true,
      });
      const roomDoc = await Room.findById(roomId).select("isGroup members").lean();
      const isGroupRoom = Boolean(
        roomDoc?.isGroup ||
          (Array.isArray(roomDoc?.members) && roomDoc.members.length > 2)
      );

      let shouldClearCallState = false;
      logger.callEvent("Call rejected", {
        socketId: socket.id,
        roomId,
        rejectedByUserId,
      });
      
      // تحديث حالة المكالمة إلى "rejected" إذا كانت موجودة
      if (rejectedByUserId) {
        let finalizedRejectedCall = null;
        try {
          const activeCall = await Call.findOne({
            room: roomId,
            endedAt: null,
          }).sort({ startedAt: -1 });

          if (activeCall) {
            // Ensure rejected user is included in call participants for history visibility.
            const now = new Date();
            ensureParticipantRecord(activeCall, rejectedByUserId, {
              leftAt: now,
              duration: 0,
            });

            // In 1:1 calls, reject should always finalize the call as rejected.
            // This prevents late leaveRoom/endCall flows from reclassifying it.
            const isOneToOneCall = !activeCall.isGroupCall && !isGroupRoom;
            const shouldEndAsRejected = isOneToOneCall;
            if (shouldEndAsRejected) {
              activeCall.status = "rejected";
              await activeCall.endCall(rejectedByUserId);
              finalizedRejectedCall = activeCall;
              shouldClearCallState = true;
              logger.callEvent(
                `Call status updated to rejected and ended: ${activeCall._id}`,
                { callId: activeCall._id }
              );
            } else {
              await activeCall.save();
              logger.callEvent(`Participant rejected call: ${activeCall._id}`, {
                callId: activeCall._id,
                rejectedByUserId,
              });
            }
          } else {
            // إذا لم تكن هناك مكالمة نشطة:
            // - في الغروبات: لا ننهي حالة المكالمة العامة بسبب رفض فرد واحد أو race.
            // - في 1:1: ننشئ سجل rejected كالسلوك السابق.
            if (isGroupRoom) {
              logger.callEvent(
                "No active call found on rejection in group room; skipping synthetic reject finalization",
                {
                  roomId,
                  rejectedByUserId,
                }
              );
            } else {
              try {
                const rejectedCall = new Call({
                  room: roomId,
                  caller: callerId,
                  isVideoCall: false, // افتراضي
                  participants: [
                    {
                      user: rejectedByUserId,
                      joinedAt: new Date(),
                      leftAt: new Date(),
                      duration: 0,
                    },
                  ],
                  status: "rejected",
                  endedAt: new Date(),
                  duration: 0,
                });
                await rejectedCall.save();
                finalizedRejectedCall = rejectedCall;
                shouldClearCallState = true;
                logger.callEvent(
                  `Rejected call record created: ${rejectedCall._id}`,
                  { callId: rejectedCall._id }
                );
              } catch (error) {
                logger.error("❌ Error creating rejected call record:", error);
              }
            }
          }
          if (finalizedRejectedCall && !finalizedRejectedCall.isLiveStream) {
            await createServerCallEventMessage({
              io,
              roomId,
              callId: finalizedRejectedCall._id,
              eventKind: "rejected",
              status: "rejected",
              isVideoCall: Boolean(finalizedRejectedCall.isVideoCall),
              duration: Number(finalizedRejectedCall.duration || 0),
              endedAt: finalizedRejectedCall.endedAt || new Date(),
              actorUserId: rejectedByUserId,
              callerUserId: finalizedRejectedCall.caller || callerId || null,
            });
          }
        } catch (error) {
          logger.error("❌ Error updating call record on rejection:", error);
        }
      }

      // ✅ إرسال إشعار الرفض للمتصل وباقي أعضاء الغرفة (للتحديث اللحظي للحالات)
      const notifiedSocketIds = new Set();
      try {
        const callerSocketIds = await resolveUserSocketIds(callerId);
      
      if (callerSocketIds.length > 0) {
          logger.callEvent(
            `Sending rejection notification to caller sockets`,
            { callerSocketIds }
          );
        // إرسال إشعار للمتصل فقط (ليس للجميع)
          callerSocketIds.forEach((callerSocketId) => {
            notifiedSocketIds.add(callerSocketId);
            io.to(callerSocketId).emit("callRejected", {
              roomId, 
              rejectedBy: rejectedByUserId,
            });
        });
      } else {
        logger.warn(`⚠️ Caller ${callerId} not connected`);
        }
      } catch (error) {
        logger.error(`Error getting socket ID for caller ${callerId}:`, error);
      }

      try {
        const rejectedByIdStr =
          rejectedByUserId?.toString?.() || String(rejectedByUserId || "");
        const callerIdStr = callerId?.toString?.() || String(callerId || "");
        const roomMemberIds = Array.isArray(roomDoc?.members) ? roomDoc.members : [];

        for (const memberId of roomMemberIds) {
          const memberIdStr = memberId?.toString?.() || String(memberId || "");
          if (
            !memberIdStr ||
            memberIdStr === rejectedByIdStr ||
            memberIdStr === callerIdStr
          ) {
            continue;
          }
          const memberSocketIds = await resolveUserSocketIds(memberIdStr);
          memberSocketIds.forEach((memberSocketId) => {
            if (notifiedSocketIds.has(memberSocketId)) return;
            notifiedSocketIds.add(memberSocketId);
            io.to(memberSocketId).emit("callRejected", {
              roomId,
              rejectedBy: rejectedByUserId,
            });
          });
        }
      } catch (error) {
        logger.error("Error notifying room members about call rejection:", error);
      }
      
      logger.callEvent("Call rejected notifications sent", {
        roomId,
        notifiedSockets: notifiedSocketIds.size,
      });
      if (shouldClearCallState) {
        io.to(roomId).emit("roomUpdated", {
          roomId: roomId?.toString?.() || String(roomId),
          updates: {
            ...createClearActiveCallState(),
            activeCallParticipantsSyncedAt: Date.now(),
          },
        });
        await emitRoomUpdateToMembers({
          roomId,
          updates: {
            ...createClearActiveCallState(),
            activeCallParticipantsSyncedAt: Date.now(),
          },
        });
      } else {
        const activeCallAfterReject = await Call.findOne({
          room: roomId,
          endedAt: null,
        }).sort({ startedAt: -1 });
        if (activeCallAfterReject) {
          await emitCallParticipantsSnapshot({
            roomId,
            callDoc: activeCallAfterReject,
          });
        }
      }
    } catch (error) {
      logger.error("❌ Error sending call rejection:", error);
    }
  });

  /**
   * ✅ Mark call as missed (timeout or not answered)
   */
  socket.on("markCallAsMissed", async ({ roomId, callerId, isVideoCall }) => {
    try {
      logger.callEvent("Marking call as missed", {
        roomId,
        callerId,
        isVideoCall,
        socketId: socket.id,
      });

      if (!socket.user || !socket.user._id) {
        logger.warn("User not authenticated for markCallAsMissed");
        return;
      }

      const recipientId = socket.user._id;
      const roomDoc = await Room.findById(roomId).select("members").lean();
      if (!roomDoc) {
        logger.warn("Room not found for markCallAsMissed", { roomId });
        return;
      }

      const callerIdStr = callerId?.toString?.() || String(callerId || "");
      const callerIsMember = (roomDoc.members || []).some(
        (memberId) => memberId?.toString?.() === callerIdStr
      );
      if (!callerIdStr || !callerIsMember) {
        logger.warn("Invalid callerId for markCallAsMissed", {
          roomId,
          callerId: callerIdStr || null,
          recipientId: recipientId?.toString?.() || String(recipientId),
        });
        return;
      }

      // البحث عن مكالمة نشطة
      const activeCall = await Call.findOne({
        room: roomId,
        endedAt: null,
      }).sort({ startedAt: -1 });

      let finalizedMissedCall = null;
      if (activeCall) {
        ensureParticipantRecord(activeCall, recipientId, {
          leftAt: new Date(),
          duration: 0,
        });
        // تحديث حالة المكالمة إلى "missed"
        activeCall.status = "missed";
        await activeCall.endCall(recipientId);
        finalizedMissedCall = activeCall;
        callerId = activeCall.caller;
        logger.callEvent(`Call status updated to missed: ${activeCall._id}`, {
          callId: activeCall._id,
          recipientId,
        });
      } else {
        // إذا لم تكن هناك مكالمة نشطة، أنشئ سجل للمكالمة الفائتة
        try {
          const chatRoom = roomDoc;
          if (!chatRoom) {
            logger.error(`Room not found: ${roomId}`);
            return;
          }

          const isGroupCall = chatRoom.members.length > 2;

          // ✅ استخدام isVideoCall المرسل من Frontend، أو البحث عنه من آخر Call record
          let callType = isVideoCall || false;
          if (callType === undefined || callType === null) {
            try {
              const lastCall = await Call.findOne({ room: roomId }).sort({
                startedAt: -1,
              });
              if (lastCall) {
                callType = lastCall.isVideoCall || false;
              }
            } catch (error) {
              logger.warn("Error getting call type for missed call:", error);
            }
          }

          const missedCall = new Call({
            room: roomId,
            caller: callerId,
            isVideoCall: callType,
            isGroupCall: isGroupCall || false,
            participants: [
              {
                user: recipientId,
                joinedAt: new Date(),
                leftAt: new Date(),
                duration: 0,
              },
            ],
            status: "missed",
            endedAt: new Date(),
            duration: 0,
          });
          await missedCall.save();
          finalizedMissedCall = missedCall;
          logger.callEvent(`Missed call record created: ${missedCall._id}`, {
            callId: missedCall._id,
            recipientId,
            callerId,
            isVideoCall: callType,
          });
        } catch (error) {
          logger.error("❌ Error creating missed call record:", error);
        }
      }
      if (finalizedMissedCall && !finalizedMissedCall.isLiveStream) {
        await createServerCallEventMessage({
          io,
          roomId,
          callId: finalizedMissedCall._id,
          eventKind: "missed",
          status: "missed",
          isVideoCall: Boolean(finalizedMissedCall.isVideoCall),
          duration: Number(finalizedMissedCall.duration || 0),
          endedAt: finalizedMissedCall.endedAt || new Date(),
          actorUserId: recipientId,
          callerUserId: finalizedMissedCall.caller || callerId || null,
        });
      }

      // ✅ إرسال Push notification للمستخدم (المستقبل)
      try {
        const { sendPushNotification } = require("../../../notification");
        const User = require("../../models/user.model");

        // الحصول على بيانات المستخدم المستقبل
        const recipient = await User.findById(recipientId).select(
          "expoPushToken firstName lastName"
        );
        const caller = await User.findById(callerId).select(
          "firstName lastName"
        );

        if (recipient && recipient.expoPushToken) {
          const callerName = caller
            ? `${caller.firstName || ""} ${caller.lastName || ""}`.trim() ||
              "Someone"
            : "Someone";
          const callTypeText = isVideoCall ? "video call" : "call";

          await sendPushNotification(
            recipient.expoPushToken,
            `You missed a ${callTypeText} from ${callerName}`,
            "Missed Call",
            {
              type: "missed_call",
              roomId: roomId.toString(),
              callerId: callerId.toString(),
              isVideoCall: isVideoCall || false,
            }
          );

          logger.callEvent("Missed call push notification sent", {
            recipientId,
            callerId,
            roomId,
          });
        } else {
          logger.warn("Recipient has no push token", { recipientId });
        }
      } catch (error) {
        logger.error("Error sending missed call notification:", error);
      }
    } catch (error) {
      logger.error("❌ Error marking call as missed:", error);
    }
  });

  /**
   * إلغاء المكالمة من المتصل
   */
  socket.on("callCancelled", async ({ roomId, callerId }) => {
    try {
      const callerResolved = callerId || socket.user?._id;
      const callerCheck = verifyUserId(callerResolved);
      if (!callerCheck.authorized) {
        logger.warn(`❌ callCancelled authorization failed: ${callerCheck.error}`, {
          socketId: socket.id,
          roomId,
          callerId: callerResolved,
        });
        return;
      }
      callerId = callerCheck.userId;
      logCallTrace("callCancelled.received", {
        roomId: roomId?.toString?.() || String(roomId || ""),
        callerId: callerId?.toString?.() || String(callerId || ""),
      });

      // ✅ التحقق من أن المستخدم ليس viewer قبل معالجة callCancelled
      const mediasoupRoom = roomManager.getRoom(roomId);
      const peer = mediasoupRoom ? mediasoupRoom.getPeer(socket.id) : null;
      const isViewer = peer && peer.role === "viewer";

      if (isViewer) {
        logger.warn("Viewer attempted to cancel call - ignoring", {
          roomId,
          socketId: socket.id,
          userId: socket.user?._id,
        });
        return; // Viewers لا يمكنهم إلغاء المكالمة
      }

      logger.callEvent("Call cancelled by caller", {
        roomId,
        socketId: socket.id,
      });
      
      // تحديث حالة المكالمة إلى "cancelled"
      if (callerId) {
        let finalizedCancelledCall = null;
        const cancellationWindowStart = new Date(
          Date.now() - CALL_CANCEL_DEDUP_WINDOW_MS
        );
        try {
          const activeCall = await Call.findOne({
            room: roomId,
            endedAt: null,
          }).sort({ startedAt: -1 });

          if (activeCall) {
            const requesterId =
              callerId?.toString?.() || String(callerId || "");
            const callCallerId =
              activeCall.caller?.toString?.() || String(activeCall.caller || "");
            const hasAnsweredParticipant = hasAnsweredParticipantInCall(activeCall);

            // Only the original caller can cancel the call, and only before anyone answers.
            if (requesterId !== callCallerId || hasAnsweredParticipant) {
              logger.warn("Ignoring callCancelled - invalid cancellation phase", {
                roomId,
                requesterId,
                callCallerId,
                hasAnsweredParticipant,
                callId: activeCall?._id?.toString?.() || String(activeCall?._id || ""),
              });
              return;
            }

            // Include all potential recipients in participants so outcome appears in their history too.
            const roomMembersDoc = await Room.findById(roomId).select("members").lean();
            const recipientIds = Array.isArray(roomMembersDoc?.members)
              ? roomMembersDoc.members.filter(
                  (memberId) =>
                    memberId?.toString?.() &&
                    memberId.toString() !== callCallerId
                )
              : [];
            recipientIds.forEach((recipientId) => {
              ensureParticipantRecord(activeCall, recipientId, {
                leftAt: new Date(),
                duration: 0,
              });
            });

            activeCall.status = "cancelled";
            await activeCall.endCall(callerId);
            finalizedCancelledCall = activeCall;
            logger.callEvent(
              `Call status updated to cancelled: ${activeCall._id}`,
              { callId: activeCall._id, status: "cancelled" }
            );
          } else {
            // إذا لم تكن هناك مكالمة نشطة، حاول إعادة استخدام آخر إلغاء قريب
            try {
              const recentCancelledCall = await Call.findOne({
                room: roomId,
                caller: callerId,
                status: "cancelled",
                endedAt: { $gte: cancellationWindowStart },
              }).sort({ endedAt: -1 });

              if (recentCancelledCall) {
                finalizedCancelledCall = recentCancelledCall;
                logger.callEvent(
                  "Recent cancelled call reused to avoid duplicate record",
                  {
                    roomId,
                    callId: recentCancelledCall._id,
                    endedAt: recentCancelledCall.endedAt,
                  }
                );
              } else {
                const roomMembersDoc = await Room.findById(roomId)
                  .select("members")
                  .lean();
                const callCallerId = callerId?.toString?.() || String(callerId || "");
                const participantRows = Array.isArray(roomMembersDoc?.members)
                  ? roomMembersDoc.members
                      .filter(
                        (memberId) =>
                          memberId?.toString?.() &&
                          memberId.toString() !== callCallerId
                      )
                      .map((memberId) => ({
                        user: memberId,
                        joinedAt: new Date(),
                        leftAt: new Date(),
                        duration: 0,
                      }))
                  : [];

                const callForTypeInference = await Call.findOne({
                  room: roomId,
                  caller: callerId,
                })
                  .sort({ startedAt: -1, createdAt: -1 })
                  .select("isVideoCall")
                  .lean();
                const inferredIsVideoCall = Boolean(
                  callForTypeInference?.isVideoCall
                );

                const cancelledCall = new Call({
                  room: roomId,
                  caller: callerId,
                  isVideoCall: inferredIsVideoCall,
                  participants: participantRows,
                  status: "cancelled",
                  endedAt: new Date(),
                  duration: 0,
                });
                await cancelledCall.save();
                finalizedCancelledCall = cancelledCall;
                logger.callEvent(
                  `Cancelled call record created: ${cancelledCall._id}`,
                  {
                    callId: cancelledCall._id,
                    status: "cancelled",
                    isVideoCall: inferredIsVideoCall,
                  }
                );
              }
            } catch (error) {
              logger.error("❌ Error creating cancelled call record:", error);
            }
          }
          if (finalizedCancelledCall && !finalizedCancelledCall.isLiveStream) {
            const duplicateCancellationEvent = await Message.findOne({
              room: roomId,
              type: "call_event",
              "callEvent.eventKind": "cancelled",
              "callEvent.actorUserId": callerId,
              createdAt: { $gte: cancellationWindowStart },
            })
              .select("_id callEvent.callId")
              .lean();
            const duplicateCallId =
              duplicateCancellationEvent?.callEvent?.callId?.toString?.() ||
              "";
            const finalizedCallId =
              finalizedCancelledCall?._id?.toString?.() || "";

            if (
              duplicateCancellationEvent &&
              duplicateCallId &&
              duplicateCallId !== finalizedCallId
            ) {
              logger.callEvent(
                "Skipped duplicate cancellation event within dedupe window",
                {
                  roomId,
                  duplicateEventId: duplicateCancellationEvent._id,
                  duplicateCallId,
                  finalizedCallId,
                }
              );
            } else {
              await createServerCallEventMessage({
                io,
                roomId,
                callId: finalizedCancelledCall._id,
                eventKind: "cancelled",
                status: "cancelled",
                isVideoCall: Boolean(finalizedCancelledCall.isVideoCall),
                duration: Number(finalizedCancelledCall.duration || 0),
                endedAt: finalizedCancelledCall.endedAt || new Date(),
                actorUserId: callerId,
                callerUserId: finalizedCancelledCall.caller || callerId || null,
              });
            }
          }
        } catch (error) {
          logger.error("❌ Error updating call record on cancellation:", error);
        }
      }
      
      // الحصول على معلومات الغرفة من MongoDB
      const room = await Room.findById(roomId);
      
      if (room) {
        for (const memberId of room.members) {
          const memberIdStr = memberId?.toString?.() || String(memberId || "");
          if (!memberIdStr || memberIdStr === callerId.toString()) continue;
          await resolveIncomingCompletion(memberIdStr, {
            roomId,
            callerId,
            promote: true,
          });
        }
        logger.roomEvent(`Room found with ${room.members.length} members`, {
          roomId,
          membersCount: room.members.length,
        });
        
        // إرسال إشعار الإلغاء لجميع أعضاء الغرفة ما عدا المتصل
        let sentCount = 0;
        for (const memberId of room.members) {
          // تخطي المتصل نفسه
          const memberIdStr = memberId.toString();
          
          // ✅ الحصول على socket ID من Redis مع retry mechanism
          try {
            const recipientSocketIds = await resolveUserSocketIds(memberIdStr);

            logger.debug(
              `Checking member: ${memberIdStr}, socketIds: ${recipientSocketIds.join(",")}, currentSocket: ${socket.id}`
            );

            const targetSocketIds = recipientSocketIds.filter(
              (recipientSocketId) => recipientSocketId !== socket.id
            );

          if (targetSocketIds.length > 0) {
              logger.callEvent(`Sending cancellation to sockets`, {
                targetSocketIds,
              });
              targetSocketIds.forEach((recipientSocketId) => {
                io.to(recipientSocketId).emit("callCancelled", { roomId });
              });
            sentCount += targetSocketIds.length;
          } else if (recipientSocketIds.length === 0) {
              logger.warn(
                `⚠️ Member ${memberIdStr} is not connected (no socketId in Redis)`
              );
          } else {
              logger.debug(
                `⚠️ Member ${memberIdStr} is the caller (same socket)`
              );
            }
          } catch (error) {
            logger.error(
              `Error getting socket ID for user ${memberIdStr}:`,
              error
            );
            // نكمل مع باقي الأعضاء حتى لو فشل أحدهم
          }
        }

        logger.callEvent(
          `Call cancellation notification sent to ${sentCount} members`,
          { sentCount }
        );
      } else {
        logger.warn(`⚠️ Room not found: ${roomId}`);
        // إرسال broadcast للجميع في الغرفة كخطة احتياطية
        socket.to(roomId).emit("callCancelled", { roomId });
      }
      io.to(roomId).emit("roomUpdated", {
        roomId: roomId?.toString?.() || String(roomId),
        updates: {
          ...createClearActiveCallState(),
          activeCallParticipantsSyncedAt: Date.now(),
        },
      });
      await emitRoomUpdateToMembers({
        roomId,
        updates: {
          ...createClearActiveCallState(),
          activeCallParticipantsSyncedAt: Date.now(),
        },
      });
    } catch (error) {
      logger.error("❌ Error sending call cancellation:", error);
      // إرسال broadcast للجميع في الغرفة كخطة احتياطية
      socket.to(roomId).emit("callCancelled", { roomId });
    }
  });

  /**
   * الحصول على Router RTP Capabilities
   * هذا أول طلب من الكلاينت قبل الانضمام للغرفة
   */
  socket.on("getRouterRtpCapabilities", async ({ roomId }, callback) => {
    try {
      // ✅ Input validation
      const validation = validateInput("getRouterRtpCapabilities", { roomId });
      if (!validation.valid) {
        return callback({ 
          success: false, 
          error: "Invalid request data",
          errors: validation.errors,
        });
      }
      ({ roomId } = validation.value);

      const authUserId = socket.user?._id?.toString?.() || null;
      if (!authUserId) {
        return callback({
          success: false,
          error: "Authentication required",
        });
      }

      const membershipCheck = await verifyRoomMembership(roomId, authUserId, "viewer");
      if (!membershipCheck.authorized) {
        return callback({
          success: false,
          error: membershipCheck.error,
        });
      }

      // ✅ Rate limiting check
      const rateLimitResult = await checkRateLimit(
        "getRouterRtpCapabilities",
        socket
      );
      if (!rateLimitResult.allowed) {
        return callback({
          success: false,
          error:
            rateLimitResult.message ||
            "Too many capability requests, please slow down",
          rateLimitInfo: rateLimitResult,
        });
      }
      
      logger.debug(`📡 getRouterRtpCapabilities for room: ${roomId}`);
      logCallTrace("getRouterRtpCapabilities.success", {
        roomId: roomId?.toString?.() || String(roomId || ""),
        userId: authUserId,
      }, "debug");
      
      const room = await roomManager.getOrCreateRoom(roomId);
      
      callback({
        success: true,
        rtpCapabilities: room.router.rtpCapabilities,
      });
    } catch (error) {
      logger.error("❌ Error getting router capabilities:", error);
      callback(formatErrorForCallback(error));
    }
  });

  /**
   * الانضمام للغرفة
   */
  socket.on(
    "joinRoom",
    async (
      {
        roomId,
        userId,
        userData,
        isCaller,
        isVideoCall,
        role = "member",
        joinRequestId = null,
      },
      callback
    ) => {
      try {
        // ✅ Input validation
        const validation = validateInput("joinRoom", {
          roomId,
          userId,
          userData,
          isCaller,
          isVideoCall,
          role,
          joinRequestId,
        });
        if (!validation.valid) {
        return callback({ 
          success: false, 
            error: "Invalid join room data",
            errors: validation.errors,
          });
        }
        ({ roomId, userId, userData, isCaller, isVideoCall, role } =
          validation.value);

        // ✅ التحقق من صحة roomId قبل المتابعة
        if (!roomId || (typeof roomId === "string" && roomId.trim() === "")) {
          logger.error("❌ joinRoom: Invalid roomId", {
            roomId,
            type: typeof roomId,
          });
          return callback({
            success: false,
            error: "Invalid room ID",
          });
        }

        logger.roomEvent("joinRoom: Processing request", {
          roomId,
          userId,
          isCaller,
          isVideoCall,
          role,
          joinRequestId,
        });
        logCallTrace("joinRoom.received", {
          roomId: roomId?.toString?.() || String(roomId || ""),
          userId: userId?.toString?.() || String(userId || ""),
          isCaller: !!isCaller,
          role: role || "member",
          joinRequestId: joinRequestId || null,
        }, "debug");
        callTelemetryCounters.joinAttempts += 1;

        if (joinRequestId) {
          const joinState = joinRequestStateBySocket.get(socket.id) || {};
          if (joinState.inFlightId && joinState.inFlightId === joinRequestId) {
            callTelemetryCounters.reconnectAttempt += 1;
            return callback({
              success: false,
              code: "JOIN_REQUEST_IN_PROGRESS",
              error: "Join request is already in progress",
            });
          }
          if (
            joinState.lastCompletedId &&
            joinState.lastCompletedId === joinRequestId &&
            joinState.lastResponse
          ) {
            callTelemetryCounters.reconnectSuccess += 1;
            return callback(joinState.lastResponse);
          }
          joinRequestStateBySocket.set(socket.id, {
            ...joinState,
            inFlightId: joinRequestId,
          });
        }

        if (!isCaller) {
          const roomIdStr = roomId?.toString?.() || String(roomId || "");
          const recipientQueueState = getRecipientQueueState(userId);
          if (
            recipientQueueState?.activeIncoming &&
            recipientQueueState.activeIncoming.roomId === roomIdStr
          ) {
            await resolveIncomingCompletion(userId, {
              roomId: roomIdStr,
              callerId: recipientQueueState.activeIncoming.callerId,
              promote: false,
            });
          }
        }

        // ✅ Rate limiting check
        const rateLimitResult = await checkRateLimit("joinRoom", socket);
        if (!rateLimitResult.allowed) {
          return callback({
            success: false,
            error:
              rateLimitResult.message ||
              "Too many join attempts, please try again later",
            rateLimitInfo: rateLimitResult,
        });
      }
      
      // Authorization: Verify userId matches authenticated user
      const userIdCheck = verifyUserId(userId);
      if (!userIdCheck.authorized) {
          logger.warn(
            `❌ joinRoom authorization failed: ${userIdCheck.error}`,
            {
          socketId: socket.id,
          userId,
              roomId,
            }
          );
        return callback({ 
          success: false, 
            error: userIdCheck.error,
          });
        }

        // Authorization: Verify user is a member of the room (with role support)
        const membershipCheck = await verifyRoomMembership(
          roomId,
          userId,
          role
        );
      if (!membershipCheck.authorized) {
          logger.warn(
            `❌ joinRoom membership check failed: ${membershipCheck.error}`,
            {
          socketId: socket.id,
          userId,
              roomId,
              role,
            }
          );
        return callback({ 
          success: false, 
            error: membershipCheck.error,
          });
        }

        // الحصول على role من membershipCheck أو استخدام role الممرر
        const userRole = membershipCheck.role || role;

        logger.roomEvent(
          `User ${userId} joining room: ${roomId} as ${userRole}`,
          { userId, roomId, isCaller, isVideoCall, role: userRole }
        );

        // Idempotency: if the same socket already joined this room, do not recreate peer/state.
        const existingRoom = roomManager.getRoom(roomId);
        const existingPeer = existingRoom?.getPeer?.(socket.id) || null;
        if (existingPeer) {
          existingPeer.userId = userId;
          existingPeer.userData = userData || existingPeer.userData || null;
          existingPeer.metadata = {
            ...(existingPeer.metadata || {}),
            role: userRole,
            userId: userId?.toString?.() || String(userId || ""),
            userData: userData || existingPeer.userData || null,
          };

          const activeCallForExistingPeer = await Call.findOne({
            room: roomId,
            endedAt: null,
          })
            .sort({ startedAt: -1 })
            .select("_id isLiveStream startedAt callSettings callAdmins participants caller")
            .lean();

          if (activeCallForExistingPeer?._id) {
            socket.callId = activeCallForExistingPeer._id;
            socket.join(`call:${activeCallForExistingPeer._id}`);
          }

          const isLiveStreamExisting = Boolean(activeCallForExistingPeer?.isLiveStream);
          const otherPeers = existingRoom
            .getOtherPeers(socket.id)
            .filter((p) => !(isLiveStreamExisting && p.metadata?.role === "viewer"))
            .map((p) => ({
              peerId: p.id,
              userId: p.userId,
              userData: p.userData || null,
              producerIds: Array.from(p.producers.keys()),
              metadata: p.metadata,
            }));

          const existingPeerResponse = {
            success: true,
            peers: otherPeers,
            rtpCapabilities: existingRoom.router.rtpCapabilities,
            callId: activeCallForExistingPeer?._id || socket.callId || null,
            startedAt: activeCallForExistingPeer?.startedAt
              ? new Date(activeCallForExistingPeer.startedAt).toISOString()
              : null,
            callSettings: activeCallForExistingPeer?.callSettings || null,
            callAdmins: activeCallForExistingPeer?.callAdmins || [],
          };
          if (joinRequestId) {
            joinRequestStateBySocket.set(socket.id, {
              inFlightId: null,
              lastCompletedId: joinRequestId,
              lastResponse: existingPeerResponse,
            });
          }
          callTelemetryCounters.joinSuccess += 1;
          return callback(existingPeerResponse);
        }

        // إنشاء peer جديد مع role
      const peer = roomManager.createPeer({
        socketId: socket.id,
        userId,
        roomId,
        socket,
        userData, // persist user data in peer
          role: userRole, // ✅ إضافة role
      });

      // إضافة peer للغرفة
      const room = await roomManager.addPeerToRoom(roomId, peer);

        // ✅ إذا كان viewer، تحديث viewersCount في Call
        let updatedViewersCount = 0;
        let activeStreamCallForViewer = null;
        if (userRole === "viewer") {
          try {
            // البحث عن مكالمة نشطة مع ستريم + increment viewers count atomically
            activeStreamCallForViewer = await Call.findOneAndUpdate(
              {
                room: roomId,
                isLiveStream: true,
                "liveStreamSettings.isLive": true,
                endedAt: null,
              },
              {
                $inc: { "liveStreamSettings.viewersCount": 1 },
              },
              { sort: { startedAt: -1 }, new: true }
            );

            if (activeStreamCallForViewer) {
              // ✅ Join call-specific socket room instead of regular room
              const callRoomName = `call:${activeStreamCallForViewer._id}`;
              socket.join(callRoomName);

              // ✅ Store activeCallId in peer metadata for message routing
              peer.metadata = {
                ...peer.metadata,
                activeCallId: activeStreamCallForViewer._id.toString(),
              };

              logger.roomEvent(
                `Viewer joined call-specific socket room: ${callRoomName}`,
                {
                  callId: activeStreamCallForViewer._id,
                  socketId: socket.id,
                  userId,
                }
              );

              updatedViewersCount =
                activeStreamCallForViewer.liveStreamSettings.viewersCount;

              logger.roomEvent(
                `Viewer joined, viewersCount incremented for call: ${activeStreamCallForViewer._id}`,
                {
                  callId: activeStreamCallForViewer._id,
                  roomId,
                  userId,
                  viewersCount: updatedViewersCount,
                }
              );
            }
        } catch (error) {
            logger.error("❌ Error updating viewersCount:", error);
            // لا نوقف العملية إذا فشل تحديث viewersCount
        }
        }

        // إدارة سجلات المكالمات
        try {
          // البحث عن آخر مكالمة نشطة في هذه الغرفة
          const activeCall = await Call.findOne({
            room: roomId,
            endedAt: null,
          }).sort({ startedAt: -1 });

          if (activeCall) {
            // إذا كانت هناك مكالمة نشطة، أضف participant إذا لم يكن موجوداً
            const existingParticipant = activeCall.participants.find(
              (p) => p.user.toString() === userId.toString()
            );

            if (!existingParticipant) {
              activeCall.participants.push({
                user: userId,
                joinedAt: new Date(),
              });
              await activeCall.save();
              logger.callEvent(
                `Participant added to existing call: ${activeCall._id}`,
                { callId: activeCall._id, userId }
              );
            } else if (existingParticipant?.leftAt) {
              existingParticipant.leftAt = null;
              existingParticipant.joinedAt = new Date();
              existingParticipant.duration = null;
              await activeCall.save();
              logger.callEvent(
                `Participant rejoined existing call: ${activeCall._id}`,
                { callId: activeCall._id, userId }
              );
            }
            await emitCallParticipantsSnapshot({
              roomId,
              callDoc: activeCall,
            });
            socket.callId = activeCall._id;

            // ✅ Join call-specific socket room for members/broadcasters too
            const callRoomName = `call:${activeCall._id}`;
            socket.join(callRoomName);

            // ✅ Update peer metadata
            if (peer) {
              peer.metadata = {
                ...peer.metadata,
                activeCallId: activeCall._id.toString(),
              };
            }
          } else if (isCaller) {
            // إذا كان المتصل ولا توجد مكالمة نشطة، أنشئ سجل المكالمة
            // ✅ Check if this is a group call
            const chatRoom = await Room.findById(roomId);
            const isGroupCall = chatRoom && chatRoom.members.length > 2;

            // ✅ Copy default call settings from caller
            const callData = await copyDefaultCallSettingsToCall(userId, {
              room: roomId,
              caller: userId,
              isVideoCall: isVideoCall || false,
              isGroupCall: isGroupCall || false,
              groupCallSettings: isGroupCall
                ? {
                    maxParticipants: 50, // Based on mediaConfig
                    requireApproval: false,
                    muteOnJoin: false,
                    allowScreenShare: true,
                    allowRecording: false,
                    host: userId,
                    moderators: [],
                  }
                : undefined,
              participants: [
                {
                  user: userId,
                  joinedAt: new Date(),
                },
              ],
              status: "answered",
              callAdmins: [], // ✅ Initialize empty callAdmins array
            });

            const call = new Call(callData);
            await call.save();

            await Room.findByIdAndUpdate(roomId, {
              $set: { callSettings: call.callSettings || {} },
            });

            // حفظ callId في socket data للوصول إليه لاحقاً
            socket.callId = call._id;

            // ✅ Join call-specific socket room
            const callRoomName = `call:${call._id}`;
            socket.join(callRoomName);

            // ✅ Update peer metadata
            if (peer) {
              peer.metadata = {
                ...peer.metadata,
                activeCallId: call._id.toString(),
              };
            }

            logger.callEvent(`Call record created: ${call._id}`, {
              callId: call._id,
              userId,
              isVideoCall,
            });
          } else {
            // Late responder join race: do not create synthetic answered call records.
            logger.warn("Skipping fallback call record for non-caller join", {
              roomId,
              userId,
              isCaller,
            });
          }
        } catch (error) {
          logger.error("❌ Error managing call record:", error);
          // لا نوقف العملية إذا فشل حفظ السجل
        }

        // ✅ في الستريم، لا نرسل newPeer event للviewers - فقط broadcasters
        // البحث عن مكالمة نشطة مع ستريم (أو استخدام المكالمة المحدثة إذا كان viewer)
        const activeStreamCallForBroadcast =
          activeStreamCallForViewer ||
          (await Call.findOne({
            room: roomId,
            isLiveStream: true,
            "liveStreamSettings.isLive": true,
            endedAt: null,
          }).sort({ startedAt: -1 }));

        const isLiveStreamForBroadcast = !!activeStreamCallForBroadcast;

      // إخبار باقي الأعضاء أن مستخدم جديد انضم مع metadata
        // ✅ إذا كان viewer في live stream، نرسل viewerJoined event لجميع الأطراف (broadcasters/members والمشاهدين) بما في ذلك المشاهد نفسه
        if (isLiveStreamForBroadcast && userRole === "viewer") {
          // ✅ استخدام viewersCount المحدث (تم تحديثه في السطر 901-902)
          const currentViewersCount =
            updatedViewersCount ||
            activeStreamCallForBroadcast?.liveStreamSettings?.viewersCount ||
            0;

          // ✅ إرسال viewerJoined event لجميع الأطراف في الستريم (broadcasters/members والمشاهدين) بما في ذلك المشاهد نفسه
          const allParticipants = room.getOtherPeers(socket.id);

          // ✅ إرسال للمشاهد نفسه أيضاً
          socket.emit("viewerJoined", {
            peerId: socket.id,
            userId,
            userData,
            metadata: peer.metadata,
            viewersCount: currentViewersCount,
          });

          // ✅ إرسال لبقية الأطراف
          allParticipants.forEach((participant) => {
            participant.socket.emit("viewerJoined", {
              peerId: socket.id,
              userId,
              userData,
              metadata: peer.metadata,
              viewersCount: currentViewersCount,
            });
          });
        } else {
          // للمكالمات العادية أو broadcasters، نرسل newPeer event
          room.broadcastToRoom(
            "newPeer",
            {
        peerId: socket.id,
        userId,
        userData,
        metadata: peer.metadata, // إرسال metadata مع newPeer event
            },
            socket.id
          );
        }

      // إرجاع قائمة الأعضاء الموجودين مع metadata
        // ✅ في الستريم، نفلتر viewers - فقط broadcasters يظهرون
        const isLiveStream = isLiveStreamForBroadcast;

        const otherPeers = room
          .getOtherPeers(socket.id)
          .filter((p) => {
            // إذا كانت live stream، نفلتر viewers
            if (isLiveStream && p.metadata?.role === "viewer") {
              return false; // تخطي viewers
            }
            return true;
          })
          .map((p) => ({
        peerId: p.id,
        userId: p.userId,
        userData: p.userData || null,
        producerIds: Array.from(p.producers.keys()),
        metadata: p.metadata, // إرسال metadata مع قائمة المشاركين
      }));

      // ✅ Fetch callSettings and callAdmins from active call to send to joining participant
      let callSettingsToSend = null;
      let callAdminsToSend = [];
      let callStartedAtToSend = null;
      if (socket.callId) {
        try {
          const callForSettings = await Call.findById(socket.callId).select(
            "callSettings caller callAdmins startedAt participants isLiveStream"
          );
          const resolveAnsweredStartedAtIso = (doc) => {
            if (!doc) return null;
            if (doc?.isLiveStream) {
              return doc?.startedAt ? new Date(doc.startedAt).toISOString() : null;
            }
            const callerId = doc?.caller?.toString?.() || String(doc?.caller || "");
            const participants = Array.isArray(doc?.participants) ? doc.participants : [];
            const answeredAtMs = participants
              .filter((p) => {
                const participantId = p?.user?.toString?.() || String(p?.user || "");
                return !!participantId && participantId !== callerId;
              })
              .map((p) => {
                if (!p?.joinedAt) return null;
                const ms = new Date(p.joinedAt).getTime();
                return Number.isFinite(ms) ? ms : null;
              })
              .filter((ms) => ms !== null)
              .sort((a, b) => a - b)[0];
            return Number.isFinite(answeredAtMs)
              ? new Date(answeredAtMs).toISOString()
              : null;
          };
          if (callForSettings?.callSettings) {
            callSettingsToSend = callForSettings.callSettings;
          }
          if (callForSettings?.callAdmins) {
            callAdminsToSend = callForSettings.callAdmins;
          }
          callStartedAtToSend = resolveAnsweredStartedAtIso(callForSettings);
        } catch (err) {
          logger.error("❌ Error fetching callSettings for joinRoom callback:", err);
        }
      }

      const joinSuccessResponse = {
        success: true,
        peers: otherPeers,
        rtpCapabilities: room.router.rtpCapabilities,
        callId: socket.callId || null, // ✅ إضافة callId في callback
        startedAt: callStartedAtToSend || null,
        callSettings: callSettingsToSend, // ✅ إضافة callSettings في callback
        callAdmins: callAdminsToSend, // ✅ إضافة callAdmins في callback
      };
      if (joinRequestId) {
        joinRequestStateBySocket.set(socket.id, {
          inFlightId: null,
          lastCompletedId: joinRequestId,
          lastResponse: joinSuccessResponse,
        });
      }
      callTelemetryCounters.joinSuccess += 1;
      callback(joinSuccessResponse);

        // ✅ إذا كان viewer في live stream، نرسل liveStreamStarted event للمشاهد مع viewersCount الحالي
        if (
          isLiveStreamForBroadcast &&
          userRole === "viewer" &&
          activeStreamCallForBroadcast
        ) {
          const currentViewersCount =
            updatedViewersCount ||
            activeStreamCallForBroadcast?.liveStreamSettings?.viewersCount ||
            0;

          // ✅ إرسال liveStreamStarted event للمشاهد
          socket.emit("liveStreamStarted", {
            roomId: roomId,
            callId: activeStreamCallForBroadcast._id.toString(),
            broadcaster: {
              _id:
                activeStreamCallForBroadcast.caller?.toString() ||
                activeStreamCallForBroadcast.broadcasters?.[0]?.toString(),
              userName: "Broadcaster",
            },
            settings: {
              ...activeStreamCallForBroadcast.liveStreamSettings,
              viewersCount: currentViewersCount, // ✅ إضافة viewersCount الحالي
            },
          });
        }

        logger.roomEvent(`User ${userId} joined room ${roomId} successfully`, {
          userId,
          roomId,
          peersCount: otherPeers.length,
        });
    } catch (error) {
        logger.error("❌ Error joining room:", error);
      if (joinRequestId) {
        const joinState = joinRequestStateBySocket.get(socket.id) || {};
        joinRequestStateBySocket.set(socket.id, {
          ...joinState,
          inFlightId: null,
        });
      }
      callTelemetryCounters.joinFailure += 1;
      callback(formatErrorForCallback(error));
    }
    }
  );

  /**
   * إنشاء WebRTC Transport (للإرسال أو الاستقبال)
   */
  socket.on(
    "createWebRtcTransport",
    async ({ roomId, direction }, callback) => {
    try {
      // Rate limiting check
        // ✅ Rate limiting check
        const rateLimitResult = await checkRateLimit(
          "createWebRtcTransport",
          socket
        );
        if (!rateLimitResult.allowed) {
        return callback({ 
          success: false, 
            error:
              rateLimitResult.message ||
              "Too many transport creation attempts, please slow down",
            rateLimitInfo: rateLimitResult,
          });
        }

        logger.transportEvent(
          `Creating ${direction} transport for socket: ${socket.id}`,
          { direction, socketId: socket.id }
        );

      const room = roomManager.getRoom(roomId);
      if (!room) {
        throw createError(ERROR_CODES.ROOM_NOT_FOUND);
      }

      const peer = room.getPeer(socket.id);
      if (!peer) {
        throw createError(ERROR_CODES.PEER_NOT_FOUND);
      }

      // إنشاء WebRTC Transport
      const transport = await room.router.createWebRtcTransport(
        config.webRtcTransport
      );

      // حفظ Transport في Peer
        if (direction === "send") {
        peer.addProducerTransport(transport);
      } else {
        peer.addConsumerTransport(transport);
      }

      // معالجة أحداث Transport
        transport.on("dtlsstatechange", (dtlsState) => {
          if (dtlsState === "closed") {
            logger.transportEvent(`Transport closed [id:${transport.id}]`, {
              transportId: transport.id,
            });
          transport.close();
        }
      });

        transport.on("close", () => {
          logger.transportEvent(`Transport closed [id:${transport.id}]`, {
            transportId: transport.id,
          });
      });

      const transportParams = {
        id: transport.id,
        iceParameters: transport.iceParameters,
        iceCandidates: transport.iceCandidates,
        dtlsParameters: transport.dtlsParameters,
      };
      
        logger.debug(
          `📋 Transport ${transport.id} ICE candidates:`,
          transport.iceCandidates
        );
      
      callback({
        success: true,
        params: transportParams,
      });

        logger.transportEvent(
          `${direction} transport created: ${transport.id}`,
          { transportId: transport.id, direction }
        );
    } catch (error) {
        logger.error("❌ Error creating transport:", error);
      callback(formatErrorForCallback(error));
    }
    }
  );

  /**
   * ربط WebRTC Transport
   */
  socket.on(
    "connectWebRtcTransport",
    async ({ roomId, transportId, dtlsParameters }, callback) => {
      try {
        // ✅ Input validation
        const validation = validateInput("connectWebRtcTransport", {
          roomId,
          transportId,
          dtlsParameters,
        });
        if (!validation.valid) {
        return callback({ 
          success: false, 
            error: "Invalid transport connection data",
            errors: validation.errors,
          });
        }
        ({ roomId, transportId, dtlsParameters } = validation.value);

        // ✅ Rate limiting check
        const rateLimitResult = await checkRateLimit(
          "connectWebRtcTransport",
          socket
        );
        if (!rateLimitResult.allowed) {
          return callback({
            success: false,
            error:
              rateLimitResult.message ||
              "Too many transport connection attempts, please slow down",
            rateLimitInfo: rateLimitResult,
          });
        }

        logger.transportEvent(`Connecting transport: ${transportId}`, {
          transportId,
        });

      const room = roomManager.getRoom(roomId);
      if (!room) {
        throw createError(ERROR_CODES.ROOM_NOT_FOUND);
      }

      const peer = room.getPeer(socket.id);
      if (!peer) {
        throw createError(ERROR_CODES.PEER_NOT_FOUND);
      }

      // البحث عن Transport
      let transport = peer.producerTransport;
      if (!transport || transport.id !== transportId) {
        transport = peer.consumerTransports.get(transportId);
      }

      if (!transport) {
        throw createError(ERROR_CODES.TRANSPORT_NOT_FOUND);
      }

      // ربط Transport
      await transport.connect({ dtlsParameters });

      callback({ success: true });
        logger.transportEvent(`Transport connected: ${transportId}`, {
          transportId,
        });
    } catch (error) {
        logger.error("❌ Error connecting transport:", error);
      callback(formatErrorForCallback(error));
    }
    }
  );

  /**
   * بدء الإنتاج (إرسال صوت/فيديو)
   */
  socket.on(
    "produce",
    async ({ roomId, transportId, kind, rtpParameters, appData }, callback) => {
      try {
        // ✅ Input validation
        const validation = validateInput("produce", {
          roomId,
          transportId,
          kind,
          rtpParameters,
          appData,
        });
        if (!validation.valid) {
        return callback({ 
          success: false, 
            error: "Invalid produce data",
            errors: validation.errors,
          });
        }
        ({ roomId, transportId, kind, rtpParameters, appData } =
          validation.value);

        // ✅ Rate limiting check
        const rateLimitResult = await checkRateLimit("produce", socket);
        if (!rateLimitResult.allowed) {
          return callback({
            success: false,
            error:
              rateLimitResult.message ||
              "Too many produce attempts, please slow down",
            rateLimitInfo: rateLimitResult,
          });
        }

        logger.producerEvent(`Producing ${kind} for socket: ${socket.id}`, {
          kind,
          socketId: socket.id,
        });

      const room = roomManager.getRoom(roomId);
      if (!room) {
        throw createError(ERROR_CODES.ROOM_NOT_FOUND);
      }

      const peer = room.getPeer(socket.id);
      if (!peer) {
        throw createError(ERROR_CODES.PEER_NOT_FOUND);
      }

        // ✅ منع Viewers من إنتاج media
        if (peer.role === "viewer") {
          logger.warn(`❌ Viewer ${peer.userId} attempted to produce media`, {
            userId: peer.userId,
            roomId,
            socketId: socket.id,
            kind,
          });
          return callback({
            success: false,
            error:
              "Viewers cannot produce media. Only broadcasters can stream.",
          });
      }

      // Authorization: Verify user is a member of the room
      const membershipCheck = await verifyRoomMembership(roomId, peer.userId);
      if (!membershipCheck.authorized) {
          logger.warn(
            `❌ produce authorization failed: ${membershipCheck.error}`,
            {
          socketId: socket.id,
          userId: peer.userId,
              roomId,
            }
          );
        return callback({ 
          success: false, 
            error: membershipCheck.error,
        });
      }

      const transport = peer.producerTransport;
      if (!transport || transport.id !== transportId) {
        throw createError(ERROR_CODES.TRANSPORT_NOT_FOUND);
      }

      const isScreenShare = appData?.screenShare === true;
      if (isScreenShare) {
        const activeCallForPermission = socket.callId
          ? await Call.findById(socket.callId).select("_id room endedAt").lean()
          : await Call.findOne({ room: roomId, endedAt: null })
              .sort({ startedAt: -1 })
              .select("_id room endedAt")
              .lean();
        if (!activeCallForPermission?._id) {
          return callback({
            success: false,
            error: "Cannot verify active call for screen share permission",
          });
        }
        const hasScreenSharePermission = await checkCallPermission(
          peer.userId?.toString?.() || String(peer.userId || ""),
          activeCallForPermission._id,
          "screenShare"
        );
        if (!hasScreenSharePermission) {
          return callback({
            success: false,
            error: "You are not allowed to share screen in this call",
          });
        }
      }

      // إنشاء Producer
      const producer = await transport.produce({
        kind,
        rtpParameters,
        appData: { ...appData, peerId: socket.id, transportId },
      });

      // حفظ Producer في Peer
      peer.addProducer(producer);

      // تحديث metadata
        if (kind === "audio") {
        peer.metadata.isAudioEnabled = true;
        // إضافة للـ Active Speaker Observer
        room.activeSpeakerObserver.addProducer({ producerId: producer.id });
        } else if (kind === "video") {
        peer.metadata.isVideoEnabled = true;
        // تحديث حالة مشاركة الشاشة
        if (isScreenShare) {
          peer.metadata.isScreenSharing = true;
        }
      }

        producer.on("transportclose", () => {
          logger.producerEvent(
            `Producer transport closed [id:${producer.id}]`,
            { producerId: producer.id }
          );
        const wasScreenShare = producer.appData?.screenShare === true;
        producer.close();
        peer.removeProducer(producer.id);
        
        // تحديث metadata عند إغلاق producer
          if (producer.kind === "audio") {
          peer.metadata.isAudioEnabled = false;
          } else if (producer.kind === "video") {
          peer.metadata.isVideoEnabled = false;
          if (wasScreenShare) {
            peer.metadata.isScreenSharing = false;
          }
        }
        
        // بث تحديث الحالة
          room.broadcastToRoom(
            "peerMetadataUpdated",
            {
          peerId: socket.id,
          metadata: peer.metadata,
            },
            socket.id
          );
      });

      // إخبار باقي الأعضاء بوجود producer جديد
        room.broadcastToRoom(
          "newProducer",
          {
        peerId: socket.id,
        producerId: producer.id,
        kind: producer.kind,
            isScreenShare: isScreenShare, // إضافة معلومات screen share
          },
          socket.id
        );
      
      // بث تحديث metadata عند إنشاء producer جديد
        room.broadcastToRoom(
          "peerMetadataUpdated",
          {
        peerId: socket.id,
        metadata: peer.metadata,
          },
          socket.id
        );

      callback({
        success: true,
        id: producer.id,
      });

        logger.producerEvent(`Producer created: ${producer.id} (${kind})`, {
          producerId: producer.id,
          kind,
        });
    } catch (error) {
        logger.error("❌ Error producing:", error);
      callback(formatErrorForCallback(error));
    }
    }
  );

  /**
   * بدء الاستهلاك (استقبال صوت/فيديو من peer آخر)
   */
  socket.on(
    "consume",
    async ({ roomId, transportId, producerId, rtpCapabilities }, callback) => {
      try {
        // ✅ Input validation
        const validation = validateInput("consume", {
          roomId,
          transportId,
          producerId,
          rtpCapabilities,
        });
        if (!validation.valid) {
        return callback({ 
          success: false, 
            error: "Invalid consume data",
            errors: validation.errors,
          });
        }
        ({ roomId, transportId, producerId, rtpCapabilities } =
          validation.value);

        // ✅ Rate limiting check
        const rateLimitResult = await checkRateLimit("consume", socket);
        if (!rateLimitResult.allowed) {
          return callback({
            success: false,
            error:
              rateLimitResult.message ||
              "Too many consume attempts, please slow down",
            rateLimitInfo: rateLimitResult,
          });
        }

        logger.consumerEvent(`Consuming producer: ${producerId}`, {
          producerId,
        });

      const room = roomManager.getRoom(roomId);
      if (!room) {
        throw createError(ERROR_CODES.ROOM_NOT_FOUND);
      }

      const peer = room.getPeer(socket.id);
      if (!peer) {
        throw createError(ERROR_CODES.PEER_NOT_FOUND);
      }

      // Authorization: Verify user is a member of the room
        // استخدام role من Peer إذا كان موجوداً
        const peerRole = peer.role || "member";
        const membershipCheck = await verifyRoomMembership(
          roomId,
          peer.userId,
          peerRole
        );
      if (!membershipCheck.authorized) {
          logger.warn(
            `❌ consume authorization failed: ${membershipCheck.error}`,
            {
          socketId: socket.id,
          userId: peer.userId,
              roomId,
              role: peerRole,
            }
          );
        return callback({ 
          success: false, 
            error: membershipCheck.error,
        });
      }

      // التحقق من إمكانية الاستهلاك
      if (!room.router.canConsume({ producerId, rtpCapabilities })) {
        throw createError(ERROR_CODES.CANNOT_CONSUME);
      }

      const transport = peer.consumerTransports.get(transportId);
      if (!transport) {
          throw createError(
            ERROR_CODES.TRANSPORT_NOT_FOUND,
            "Consumer transport not found"
          );
        }

        // ✅ Get producer to check for simulcast
        const producer = room.getProducer(producerId);
        if (!producer) {
          logger.warn(`Producer ${producerId} not found in room ${roomId}`);
        }
        const hasSimulcast =
          producer && producer.rtpParameters?.encodings?.length > 1;

        // ✅ Simulcast optimization: Select optimal layer for viewer
        let preferredLayers = null;
        if (hasSimulcast && peerRole === "viewer") {
          // ✅ For viewers, start with medium layer for better quality (will adjust dynamically)
          const tempConsumerId = `temp-${Date.now()}-${Math.random()}`;
          const optimalLayer = simulcastOptimizer.selectConsumerLayer(
            tempConsumerId,
            1000000, // Start with better bandwidth estimate for better quality
            null // Network quality will be updated later
          );
          preferredLayers = {
            spatialLayer: simulcastOptimizer.getLayerPriority(optimalLayer) - 1, // Convert to 0-based index
            temporalLayer: 1, // Start with temporal layer 1 for smoother playback
          };
          logger.debug(`Selected initial layer for viewer consumer`, {
            layer: optimalLayer,
            preferredLayers,
            producerId,
          });
      }

      // إنشاء Consumer
      const consumer = await transport.consume({
        producerId,
        rtpCapabilities,
        paused: true, // نبدأه موقف ثم نستأنفه بعد أن يكون الكلاينت جاهز
          ...(preferredLayers && { preferredLayers }), // ✅ Set preferred layers if simulcast
        });

        // ✅ Register consumer in simulcast optimizer
        if (hasSimulcast) {
          simulcastOptimizer.updateBandwidthHistory(
            consumer.id,
            preferredLayers ? 300000 : 1000000
          );
        }

      // حفظ Consumer في Peer
      peer.addConsumer(consumer);

        consumer.on("transportclose", () => {
          logger.consumerEvent(
            `Consumer transport closed [id:${consumer.id}]`,
            { consumerId: consumer.id }
          );
        consumer.close();
        peer.removeConsumer(consumer.id);
      });

        consumer.on("producerclose", () => {
          logger.consumerEvent(
            `Producer closed for consumer [id:${consumer.id}]`,
            { consumerId: consumer.id }
          );

          // ✅ Cleanup simulcast optimizer data
          if (hasSimulcast) {
            simulcastOptimizer.cleanupConsumer(consumer.id);
          }

        consumer.close();
        peer.removeConsumer(consumer.id);
        
        // إخبار الكلاينت أن Producer أغلق
          socket.emit("consumerClosed", {
          consumerId: consumer.id,
        });
      });

      callback({
        success: true,
        params: {
          id: consumer.id,
          producerId,
          kind: consumer.kind,
          rtpParameters: consumer.rtpParameters,
        },
      });

        logger.consumerEvent(`Consumer created: ${consumer.id}`, {
          consumerId: consumer.id,
          kind: consumer.kind,
        });
    } catch (error) {
        logger.error("❌ Error consuming:", error);
      callback(formatErrorForCallback(error));
    }
    }
  );

  /**
   * استئناف Consumer (بعد أن يكون الكلاينت جاهز)
   */
  socket.on("resumeConsumer", async ({ roomId, consumerId }, callback) => {
    try {
      // Rate limiting check
      // ✅ Rate limiting check
      const rateLimitResult = await checkRateLimit("resumeConsumer", socket);
      if (!rateLimitResult.allowed) {
        return callback({ 
          success: false, 
          error:
            rateLimitResult.message ||
            "Too many consumer resume attempts, please slow down",
          rateLimitInfo: rateLimitResult,
        });
      }

      logger.consumerEvent(
        `Resuming consumer: ${consumerId} in room: ${roomId}`,
        { consumerId, roomId }
      );

      const room = roomManager.getRoom(roomId);
      if (!room) {
        logger.error(`❌ Room not found: ${roomId}`);
        throw new Error("Room not found");
      }

      const peer = room.getPeer(socket.id);
      if (!peer) {
        logger.error(`❌ Peer not found: ${socket.id} in room: ${roomId}`);
        throw new Error("Peer not found");
      }

      const consumer = peer.consumers.get(consumerId);
      if (!consumer) {
        logger.error(`❌ Consumer not found: ${consumerId}`);
        logger.debug(
          `📋 Available consumers for peer ${socket.id}:`,
          Array.from(peer.consumers.keys())
        );
        throw new Error("Consumer not found");
      }

      logger.debug(
        `🔄 Consumer ${consumerId} current state - paused: ${consumer.paused}, kind: ${consumer.kind}`
      );
      await consumer.resume();
      logger.consumerEvent(
        `Consumer ${consumerId} resumed successfully - paused: ${consumer.paused}`,
        { consumerId, paused: consumer.paused }
      );

      callback({ success: true });
    } catch (error) {
      logger.error("❌ Error resuming consumer:", error);
      callback(formatErrorForCallback(error));
    }
  });

  /**
   * إيقاف/تشغيل Producer مؤقتاً (mute/unmute)
   */
  socket.on("pauseProducer", async ({ roomId, producerId }, callback) => {
    try {
      // Rate limiting check
      // ✅ Rate limiting check
      const rateLimitResult = await checkRateLimit("pauseProducer", socket);
      if (!rateLimitResult.allowed) {
        return callback({ 
          success: false, 
          error:
            rateLimitResult.message ||
            "Too many pause attempts, please slow down",
          rateLimitInfo: rateLimitResult,
        });
      }
      
      const room = roomManager.getRoom(roomId);
      if (!room) {
        throw createError(ERROR_CODES.ROOM_NOT_FOUND);
      }

      const peer = room.getPeer(socket.id);
      if (!peer) {
        throw createError(ERROR_CODES.PEER_NOT_FOUND);
      }

      // Authorization: Verify producer ownership
      const ownershipCheck = verifyProducerOwnership(roomId, producerId);
      if (!ownershipCheck.authorized) {
        logger.warn(
          `❌ pauseProducer authorization failed: ${ownershipCheck.error}`,
          {
          socketId: socket.id,
          producerId,
            roomId,
          }
        );
        return callback({ 
          success: false, 
          error: ownershipCheck.error,
        });
      }

      const producer = ownershipCheck.producer;

      // تحديث metadata قبل pause لضمان التزامن
      if (producer.kind === "audio") {
        peer.metadata.isAudioEnabled = false;
      } else if (producer.kind === "video") {
        peer.metadata.isVideoEnabled = false;
        // إذا كان هذا producer لمشاركة الشاشة، لا نغير isScreenSharing هنا
        // لأن مشاركة الشاشة قد تكون لا تزال نشطة
      }

      // بث تحديث metadata فوراً (قبل pause) لضمان استجابة فورية
      room.broadcastToRoom(
        "peerMetadataUpdated",
        {
        peerId: socket.id,
        metadata: peer.metadata,
        },
        socket.id
      );

      await producer.pause();

      // إخبار الآخرين
      room.broadcastToRoom(
        "producerPaused",
        {
        peerId: socket.id,
        producerId,
        kind: producer.kind,
        },
        socket.id
      );

      callback({ success: true });
    } catch (error) {
      logger.error("❌ Error pausing producer:", error);
      callback(formatErrorForCallback(error));
    }
  });

  socket.on("resumeProducer", async ({ roomId, producerId }, callback) => {
    try {
      // Rate limiting check
      // ✅ Rate limiting check
      const rateLimitResult = await checkRateLimit("resumeProducer", socket);
      if (!rateLimitResult.allowed) {
        return callback({ 
          success: false, 
          error:
            rateLimitResult.message ||
            "Too many resume attempts, please slow down",
          rateLimitInfo: rateLimitResult,
        });
      }
      
      const room = roomManager.getRoom(roomId);
      if (!room) {
        throw createError(ERROR_CODES.ROOM_NOT_FOUND);
      }

      const peer = room.getPeer(socket.id);
      if (!peer) {
        throw createError(ERROR_CODES.PEER_NOT_FOUND);
      }

      // Authorization: Verify producer ownership
      const ownershipCheck = verifyProducerOwnership(roomId, producerId);
      if (!ownershipCheck.authorized) {
        logger.warn(
          `❌ resumeProducer authorization failed: ${ownershipCheck.error}`,
          {
          socketId: socket.id,
          producerId,
            roomId,
          }
        );
        return callback({ 
          success: false, 
          error: ownershipCheck.error,
        });
      }

      const producer = ownershipCheck.producer;

      // تحديث metadata قبل resume لضمان التزامن
      if (producer.kind === "audio") {
        peer.metadata.isAudioEnabled = true;
      } else if (producer.kind === "video") {
        peer.metadata.isVideoEnabled = true;
        // التحقق من أن هذا producer لمشاركة الشاشة
        if (producer.appData?.screenShare === true) {
          peer.metadata.isScreenSharing = true;
        }
      }

      // بث تحديث metadata فوراً (قبل resume) لضمان استجابة فورية
      room.broadcastToRoom(
        "peerMetadataUpdated",
        {
        peerId: socket.id,
        metadata: peer.metadata,
        },
        socket.id
      );

      await producer.resume();

      // إخبار الآخرين
      room.broadcastToRoom(
        "producerResumed",
        {
        peerId: socket.id,
        producerId,
        kind: producer.kind,
        },
        socket.id
      );

      callback({ success: true });
    } catch (error) {
      logger.error("❌ Error resuming producer:", error);
      callback(formatErrorForCallback(error));
    }
  });

  /**
   * إغلاق Producer (مثل screen share)
   */
  socket.on("closeProducer", async ({ roomId, producerId }, callback) => {
    try {
      // Rate limiting check
      // ✅ Rate limiting check
      const rateLimitResult = await checkRateLimit("closeProducer", socket);
      if (!rateLimitResult.allowed) {
        return callback({ 
          success: false, 
          error:
            rateLimitResult.message ||
            "Too many producer close attempts, please slow down",
          rateLimitInfo: rateLimitResult,
        });
      }
      
      const room = roomManager.getRoom(roomId);
      if (!room) {
        throw createError(ERROR_CODES.ROOM_NOT_FOUND);
      }

      const peer = room.getPeer(socket.id);
      if (!peer) {
        throw createError(ERROR_CODES.PEER_NOT_FOUND);
      }

      // Authorization: Verify producer ownership
      const ownershipCheck = verifyProducerOwnership(roomId, producerId);
      if (!ownershipCheck.authorized) {
        logger.warn(
          `❌ closeProducer authorization failed: ${ownershipCheck.error}`,
          {
          socketId: socket.id,
          producerId,
            roomId,
          }
        );
        return callback({ 
          success: false, 
          error: ownershipCheck.error,
        });
      }

      const producer = ownershipCheck.producer;

      const wasScreenShare = producer.appData?.screenShare === true;
      
      // إغلاق producer
      producer.close();
      peer.removeProducer(producerId);

      // تحديث metadata
      if (producer.kind === "audio") {
        peer.metadata.isAudioEnabled = false;
      } else if (producer.kind === "video") {
        peer.metadata.isVideoEnabled = false;
        if (wasScreenShare) {
          peer.metadata.isScreenSharing = false;
        }
      }

      // بث تحديث metadata فوراً
      room.broadcastToRoom(
        "peerMetadataUpdated",
        {
        peerId: socket.id,
        metadata: peer.metadata,
        },
        socket.id
      );

      // إخبار الآخرين بإغلاق producer
      room.broadcastToRoom(
        "producerClosed",
        {
        peerId: socket.id,
        producerId,
        kind: producer.kind,
        },
        socket.id
      );

      callback({ success: true });
    } catch (error) {
      logger.error("❌ Error closing producer:", error);
      callback(formatErrorForCallback(error));
    }
  });

  /**
   * مغادرة الغرفة
   */
  socket.on("leaveRoom", async ({ roomId, userId }, callback) => {
    if (!acquireLifecycleLock("leaveRoom")) {
      if (callback) {
        return callback({
          success: false,
          code: "LIFECYCLE_OP_IN_PROGRESS",
          error: "Another lifecycle operation is in progress",
        });
      }
      return;
    }
    try {
      // Rate limiting check
      // ✅ Rate limiting check
      const rateLimitResult = await checkRateLimit("leaveRoom", socket);
      if (!rateLimitResult.allowed) {
        if (callback) {
          return callback({ 
          success: false, 
          error:
            rateLimitResult.message ||
            "Too many leave attempts, please slow down",
          rateLimitInfo: rateLimitResult,
          });
        }
        return;
      }
      
      // Authorization: Verify userId matches authenticated user
      if (userId) {
        const userIdCheck = verifyUserId(userId);
        if (!userIdCheck.authorized) {
          logger.warn(
            `❌ leaveRoom authorization failed: ${userIdCheck.error}`,
            {
            socketId: socket.id,
            userId,
              roomId,
            }
          );
          if (callback) {
            return callback({ 
              success: false, 
              error: userIdCheck.error,
            });
          }
          return;
        }
      }
      
      logger.roomEvent(`Socket ${socket.id} leaving room: ${roomId}`, {
        socketId: socket.id,
        roomId,
        userId,
      });
      logCallTrace("leaveRoom.received", {
        roomId: roomId?.toString?.() || String(roomId || ""),
        userId: userId?.toString?.() || String(userId || ""),
      }, "debug");

      const room = roomManager.getRoom(roomId);
      // ✅ الحصول على peer قبل إزالته للتحقق من role
      const peer = room ? room.getPeer(socket.id) : null;
      const isViewer = peer && peer.role === "viewer";

      // ✅ حساب remaining peers (بدون viewers للستريم)
      let remainingPeersCount = 0;
      if (room) {
        const otherPeers = room.getOtherPeers(socket.id);
        // إذا كانت live stream، نحسب فقط broadcasters/members (ليس viewers)
        const activeStreamCall = await Call.findOne({
          room: roomId,
          isLiveStream: true,
          "liveStreamSettings.isLive": true,
          endedAt: null,
        }).sort({ startedAt: -1 });

        if (activeStreamCall) {
          // ✅ في حالة الستريم، نحسب فقط broadcasters/members (ليس viewers)
          // سواء كان الشخص الذي يغادر هو viewer أو broadcaster
          remainingPeersCount = otherPeers.filter(
            (p) => p.role !== "viewer"
          ).length;
        } else {
          // في المكالمات العادية، نحسب الجميع
          remainingPeersCount = otherPeers.length;
        }
      }

      // ✅ إذا كان viewer، لا ننهي المكالمة حتى لو كان آخر شخص
      const isLastPerson = remainingPeersCount === 0 && !isViewer;

      // تحديث سجل المكالمة - تحديث participant.leftAt وإنهاء المكالمة إذا كان آخر شخص
      // ✅ إذا كان viewer، نتخطى تحديث participant (viewers ليسوا participants)
      if (userId && !isViewer) {
        try {
          // البحث عن Call record (من socket.callId أو من roomId)
          let call = null;
          if (socket.callId) {
            call = await Call.findById(socket.callId);
          }

          // إذا لم يكن callId متاحاً، ابحث عن آخر مكالمة نشطة
          if (!call) {
            call = await Call.findOne({
              room: roomId,
              endedAt: null,
            }).sort({ startedAt: -1 });
          }

          if (call && !call.endedAt) {
            // تحديث participant.leftAt
            const participant = call.participants.find(
              (p) => p.user.toString() === userId.toString()
            );

            if (participant && !participant.leftAt) {
              participant.leftAt = new Date();
              participant.duration = Math.floor(
                (participant.leftAt - participant.joinedAt) / 1000
              );
            }

            const callerId =
              call.caller?.toString?.() || String(call.caller || "");
            const hasAnsweredParticipant = (call.participants || []).some((p) => {
              const participantId =
                p?.user?.toString?.() || String(p?.user || "");
              return !!participantId && participantId !== callerId;
            });
            const remainingParticipantsCount = (call.participants || []).filter(
              (p) => !p?.leftAt
            ).length;
            const shouldEndDirectForOneToOne =
              !call.isLiveStream &&
              !call.isGroupCall &&
              hasAnsweredParticipant &&
              remainingParticipantsCount <= 1;

            // إذا كان آخر شخص يغادر، أنهِ المكالمة (viewers لا يحسبون)
            if (isLastPerson || shouldEndDirectForOneToOne) {
              // ✅ التحقق من أنه ستريم قبل إنهاء المكالمة
              const wasLiveStream =
                call.isLiveStream && call.liveStreamSettings?.isLive;
              const callIdForEvent = call._id.toString();
              const callCallerId =
                call.caller?.toString?.() || String(call.caller || "");
              
              const resolvedOutcomeStatus = deriveCallOutcomeStatus(call);
              call.status = resolvedOutcomeStatus;
              await call.endCall(userId);
              if (!call.isLiveStream) {
                await createServerCallEventMessage({
                  io,
                  roomId,
                  callId: call._id,
                  eventKind: resolvedOutcomeStatus,
                  status: resolvedOutcomeStatus,
                  isVideoCall: Boolean(call.isVideoCall),
                  duration: Number(call.duration || 0),
                  endedAt: call.endedAt || new Date(),
                  actorUserId: userId,
                  callerUserId: call.caller || null,
                });
              }
              logger.callEvent(
                `Call ended (last person left): ${call._id}, duration: ${call.duration}s`,
                {
                  callId: call._id,
                  userId,
                  duration: call.duration,
                }
              );
              
              // ✅ إذا كان ستريم، إرسال liveStreamEnded event للمشاهدين
              if (wasLiveStream && callIdForEvent) {
                const callRoomName = `call:${callIdForEvent}`;
                
                // إرسال للمشاهدين في call room
                io.to(callRoomName).emit("liveStreamEnded", {
                  roomId,
                  callId: callIdForEvent,
                });
                
                // إرسال للbroadcasters/members في roomId
                io.to(roomId).emit("liveStreamEnded", {
                  roomId,
                  callId: callIdForEvent,
                });
                
                logger.callEvent("Live stream ended (last broadcaster left) - event sent to all viewers", {
                  roomId,
                  callId: callIdForEvent,
                  callRoomName,
                });
              }

              // Clean incoming queue entries for this ended call so subsequent
              // attempts are not skipped by duplicate activeIncoming state.
              try {
                const roomMembersForResolve = await Room.findById(roomId)
                  .select("members")
                  .lean();
                const memberIdsForResolve = Array.isArray(roomMembersForResolve?.members)
                  ? roomMembersForResolve.members
                  : [];
                for (const memberId of memberIdsForResolve) {
                  const memberIdStr = memberId?.toString?.() || String(memberId || "");
                  if (!memberIdStr || memberIdStr === callCallerId) continue;
                  await resolveIncomingCompletion(memberIdStr, {
                    roomId,
                    callerId: callCallerId,
                    promote: true,
                  });
                }
              } catch (queueResolveError) {
                logger.warn("Failed to resolve incoming queue entries on leaveRoom end", {
                  roomId,
                  callerId: callCallerId,
                  error: queueResolveError?.message || String(queueResolveError),
                });
              }

              const endedUpdates = {
                ...createClearActiveCallState(),
                activeCallParticipantsSyncedAt: Date.now(),
              };
              io.to(roomId).emit("roomUpdated", {
                roomId: roomId?.toString?.() || String(roomId),
                updates: endedUpdates,
              });
              await emitRoomUpdateToMembers({
                roomId,
                updates: endedUpdates,
              });
            } else {
              await call.save();
              await emitCallParticipantsSnapshot({
                roomId,
                callDoc: call,
              });
              logger.callEvent(
                `Participant left time recorded for call: ${call._id}`,
                {
                  callId: call._id,
                  userId,
                  remainingPeers: remainingPeersCount,
                }
              );
            }
          }
        } catch (error) {
          logger.error("❌ Error updating call record on leave:", error);
        }
      }

      if (room) {
        // ✅ peer تم الحصول عليه مسبقاً

        // ✅ إذا كان viewer، تقليل viewersCount في Call
        if (peer && peer.role === "viewer") {
          try {
            // Decrement viewers count atomically
            const activeStreamCall = await Call.findOneAndUpdate(
              {
                room: roomId,
                isLiveStream: true,
                "liveStreamSettings.isLive": true,
                endedAt: null,
                "liveStreamSettings.viewersCount": { $gt: 0 },
              },
              {
                $inc: { "liveStreamSettings.viewersCount": -1 },
              },
              { sort: { startedAt: -1 }, new: true }
            );

            if (activeStreamCall) {
              const updatedViewersCount =
                activeStreamCall.liveStreamSettings?.viewersCount || 0;

              logger.roomEvent(
                `Viewer left, viewersCount decremented for call: ${activeStreamCall._id}`,
                {
                  callId: activeStreamCall._id,
                  roomId,
                  userId,
                  viewersCount: updatedViewersCount,
                }
              );

              // ✅ إرسال viewerLeft event لجميع الأطراف في الستريم (broadcasters/members والمشاهدين) مع viewersCount المحدث
              const allParticipants = room.getOtherPeers(socket.id);

              allParticipants.forEach((participant) => {
                participant.socket.emit("viewerLeft", {
          peerId: socket.id,
                  userId,
                  viewersCount: updatedViewersCount,
                });
              });
            }
          } catch (error) {
            logger.error("❌ Error updating viewersCount on leave:", error);
            // لا نوقف العملية إذا فشل تحديث viewersCount
          }
        }

        // ✅ إخبار الآخرين أن المستخدم غادر
        // إذا كان viewer، نرسل viewerLeft فقط للـ broadcasters
        // إذا كان broadcaster/member، نرسل peerLeft للجميع
        if (peer && peer.role === "viewer") {
          // Viewers لا يرسلون peerLeft - تم التعامل معهم في viewerLeft event أعلاه
          logger.roomEvent(
            "Viewer left - not broadcasting peerLeft to avoid confusion",
            {
              peerId: socket.id,
              userId,
              roomId,
            }
          );
        } else {
          // Broadcasters/members يرسلون peerLeft للجميع
          room.broadcastToRoom(
            "peerLeft",
            {
              peerId: socket.id,
              userId,
            },
            socket.id
          );
        }

        // إزالة peer من الغرفة
        await roomManager.removePeerFromRoom(roomId, socket.id);
      }

      if (callback) {
        callback({ success: true });
      }
    } catch (error) {
      logger.error("❌ Error leaving room:", error);
      if (callback) {
        callback(formatErrorForCallback(error));
      }
    } finally {
      releaseLifecycleLock("leaveRoom");
    }
  });

  /**
   * إنهاء المكالمة للجميع (صلاحية للمتصل فقط عادة)
   */
  socket.on("endCall", async ({ roomId, userId }, callback) => {
    if (!acquireLifecycleLock("endCall")) {
      if (callback) {
        return callback({
          success: false,
          code: "LIFECYCLE_OP_IN_PROGRESS",
          error: "Another lifecycle operation is in progress",
        });
      }
      return;
    }
    try {
      // Rate limiting check
      // ✅ Rate limiting check
      const rateLimitResult = await checkRateLimit("endCall", socket);
      if (!rateLimitResult.allowed) {
        if (callback) {
          return callback({ 
            success: false, 
            error:
              rateLimitResult.message ||
              "Too many end call attempts, please slow down",
            rateLimitInfo: rateLimitResult,
          });
        }
        return;
      }
      
      // Authorization: Verify userId matches authenticated user
      if (userId) {
        const userIdCheck = verifyUserId(userId);
        if (!userIdCheck.authorized) {
          logger.warn(`❌ endCall authorization failed: ${userIdCheck.error}`, {
            socketId: socket.id,
            userId,
            roomId,
          });
          if (callback) {
            return callback({ 
              success: false, 
              error: userIdCheck.error,
            });
          }
          return;
        }
      }
      const requesterUserId = userId || socket.user?._id || null;
      if (!requesterUserId) {
        if (callback) {
          return callback({
            success: false,
            code: "UNAUTHORIZED_END_CALL_FOR_ALL",
            error: "User not authenticated",
          });
        }
        return;
      }
      userId = requesterUserId;

      // ✅ Authoritative permission check for ending call for everyone
      // Enforced strictly via endCallForAll from Call.callSettings (room-owner policy).
      let permissionCall = null;
      if (socket.callId) {
        permissionCall = await Call.findById(socket.callId)
          .select("_id caller room endedAt")
          .lean();
      }
      if (!permissionCall) {
        permissionCall = await Call.findOne({
          room: roomId,
          endedAt: null,
        })
          .sort({ startedAt: -1 })
          .select("_id caller room endedAt")
          .lean();
      }
      if (!permissionCall) {
        if (callback) {
          return callback({
            success: false,
            code: "NO_ACTIVE_CALL",
            error: "No active call found",
          });
        }
        return;
      }

      const hasEndForAllPermission = await checkCallPermission(
        userId,
        permissionCall._id,
        "endCallForAll"
      );
      if (!hasEndForAllPermission) {
          callTelemetryCounters.permissionDenied += 1;
        logger.warn("Unauthorized endCall attempt", {
          roomId,
          userId,
          callId: permissionCall._id?.toString?.() || null,
        });
        if (callback) {
          return callback({
            success: false,
            code: "UNAUTHORIZED_END_CALL_FOR_ALL",
            error: "You are not allowed to end the call for everyone",
          });
        }
        return;
      }
      
      logger.callEvent(
        `Call END requested by ${socket.id} for room: ${roomId}`,
        { socketId: socket.id, roomId, userId }
      );
      try {
        const roomMembersForResolve = await Room.findById(roomId)
          .select("members")
          .lean();
        const memberIdsForResolve = Array.isArray(roomMembersForResolve?.members)
          ? roomMembersForResolve.members
          : [];
        for (const memberId of memberIdsForResolve) {
          const memberIdStr = memberId?.toString?.() || String(memberId || "");
          if (!memberIdStr || memberIdStr === userId?.toString?.()) continue;
          await resolveIncomingCompletion(memberIdStr, {
            roomId,
            callerId: userId,
            promote: true,
          });
        }
      } catch (queueResolveError) {
        logger.warn("Failed to resolve incoming queue entries on endCall", {
          roomId,
          callerId: userId,
          error: queueResolveError?.message || String(queueResolveError),
        });
      }

      // إنهاء سجل المكالمة
      let wasLiveStream = false;
      let callIdForEvent = null;

      if (socket.callId && userId) {
        try {
          const call = await Call.findById(socket.callId);
          if (call && !call.endedAt) {
            // ✅ التحقق من أنه ستريم قبل إنهاء المكالمة
            wasLiveStream =
              call.isLiveStream && call.liveStreamSettings?.isLive;
            callIdForEvent = call._id.toString();

            const resolvedOutcomeStatus = deriveCallOutcomeStatus(call);
            call.status = resolvedOutcomeStatus;
            await call.endCall(userId);
            if (!call.isLiveStream) {
              await createServerCallEventMessage({
                io,
                roomId,
                callId: call._id,
                eventKind: resolvedOutcomeStatus,
                status: resolvedOutcomeStatus,
                isVideoCall: Boolean(call.isVideoCall),
                duration: Number(call.duration || 0),
                endedAt: call.endedAt || new Date(),
                actorUserId: userId,
                callerUserId: call.caller || null,
              });
            }
            logger.callEvent(
              `Call ended and saved: ${call._id}, duration: ${call.duration}s`,
              { callId: call._id, duration: call.duration }
            );
          }
        } catch (error) {
          logger.error("❌ Error ending call record:", error);
        }
      } else {
        // إذا لم يكن callId متاحاً، حاول البحث عن آخر مكالمة نشطة
        try {
          const activeCall = await Call.findOne({
            room: roomId,
            endedAt: null,
          }).sort({ startedAt: -1 });

          if (activeCall && userId) {
            // ✅ التحقق من أنه ستريم قبل إنهاء المكالمة
            wasLiveStream =
              activeCall.isLiveStream && activeCall.liveStreamSettings?.isLive;
            callIdForEvent = activeCall._id.toString();

            const resolvedOutcomeStatus = deriveCallOutcomeStatus(activeCall);
            activeCall.status = resolvedOutcomeStatus;
            await activeCall.endCall(userId);
            if (!activeCall.isLiveStream) {
              await createServerCallEventMessage({
                io,
                roomId,
                callId: activeCall._id,
                eventKind: resolvedOutcomeStatus,
                status: resolvedOutcomeStatus,
                isVideoCall: Boolean(activeCall.isVideoCall),
                duration: Number(activeCall.duration || 0),
                endedAt: activeCall.endedAt || new Date(),
                actorUserId: userId,
                callerUserId: activeCall.caller || null,
              });
            }
            logger.callEvent(
              `Call ended (found by roomId): ${activeCall._id}, duration: ${activeCall.duration}s`,
              { callId: activeCall._id, duration: activeCall.duration }
            );
          }
        } catch (error) {
          logger.error("❌ Error ending call record (fallback):", error);
        }
      }

      // ✅ إذا كان ستريم، إرسال liveStreamEnded event قبل callEnded
      // ✅ إرسال إلى roomId (للbroadcasters/members) وإلى call:${callId} (للمشاهدين)
      if (wasLiveStream && callIdForEvent) {
        const callRoomName = `call:${callIdForEvent}`;
        
        // إرسال للمشاهدين في call room
        io.to(callRoomName).emit("liveStreamEnded", {
          roomId,
          callId: callIdForEvent,
        });
        
        // إرسال للbroadcasters/members في roomId
        io.to(roomId).emit("liveStreamEnded", {
          roomId,
          callId: callIdForEvent,
        });
        
        logger.callEvent("Live stream ended event sent to all participants (broadcasters and viewers)", {
          roomId,
          callId: callIdForEvent,
          callRoomName,
        });
      }

      const room = roomManager.getRoom(roomId);
      if (room) {
        // إبلاغ جميع الأعضاء بأن المكالمة انتهت
        room.broadcastToRoom("callEnded", { roomId });

        // Enforce teardown for all peers server-side to avoid stale SFU state.
        const peerIds = Array.from(room.peers.keys());
        for (const peerId of peerIds) {
          await roomManager.removePeerFromRoom(roomId, peerId);
        }
      }

      // ✅ Call-Chat Integration: تحديث Room في قاعدة البيانات وإرسال update للـ clients
      try {
        const chatRoom = await Room.findById(roomId);
        if (chatRoom) {
          // تحديث Room state (يمكن إضافة fields جديدة لـ hasActiveCall إذا لزم الأمر)
          // حالياً نرسل event فقط للـ clients
          io.to(roomId).emit("roomUpdated", {
            roomId,
            updates: {
              ...createClearActiveCallState(),
              activeCallParticipantsSyncedAt: Date.now(),
            },
          });
          await emitRoomUpdateToMembers({
            roomId,
            updates: {
              ...createClearActiveCallState(),
              activeCallParticipantsSyncedAt: Date.now(),
            },
          });
          logger.callEvent("Room update sent to clients: call ended", {
            roomId,
          });
        }
      } catch (error) {
        logger.error("Error updating room state on call end:", error);
      }

      if (callback) {
        callback({ success: true });
      }
    } catch (error) {
      logger.error("❌ Error ending call:", error);
      if (callback) {
        callback(formatErrorForCallback(error));
      }
    } finally {
      releaseLifecycleLock("endCall");
    }
  });

  /**
   * عند قطع الاتصال
   * مع معالجة أفضل لـ cleanup وإشعار الأطراف الأخرى
   */
  socket.on("disconnect", async () => {
    if (!acquireLifecycleLock("disconnect")) {
      return;
    }
    logger.info(`🔌 Socket disconnected: ${socket.id}`);
    logCallTrace("disconnect.received", {}, "debug");
    const disconnectedUserId = socket.user?._id?.toString?.() || null;
    if (disconnectedUserId) {
      await clearRecipientIncomingQueueOnUnavailable(
        disconnectedUserId,
        "recipient_disconnected"
      );
      await removeCallerFromAllIncomingQueues(disconnectedUserId);
    }

    // البحث عن peer في جميع الغرف
    const result = roomManager.getPeerBySocketId(socket.id);
    if (result) {
      const { peer, room } = result;
      
      try {
        // إشعار الأطراف الأخرى بإغلاق جميع producers قبل cleanup
        // هذا يضمن أن الأطراف الأخرى تعرف أن هذا peer لم يعد يرسل media
        const producerIds = Array.from(peer.producers.keys());
        producerIds.forEach((producerId) => {
          const producer = peer.producers.get(producerId);
          if (producer) {
            try {
              // إشعار الأطراف الأخرى بإغلاق producer
              room.broadcastToRoom(
                "producerClosed",
                {
                peerId: socket.id,
                producerId: producer.id,
                kind: producer.kind,
                },
                socket.id
              );
              
              logger.debug(
                `Notified others about producer ${producer.id} closure`,
                {
                producerId: producer.id, 
                  peerId: socket.id,
                }
              );
            } catch (error) {
              logger.error(
                `Error notifying about producer ${producer.id} closure:`,
                error
              );
            }
          }
        });

        // إخبار الآخرين أن peer غادر
        room.broadcastToRoom("peerLeft", {
          peerId: socket.id,
        });

        // ✅ تحديث Call model إذا كان المستخدم في مكالمة
        try {
          const roomId = resolveDisconnectRoomId(room, peer);
          if (peer.userId && roomId) {
            // ✅ البحث عن مكالمة نشطة مع retry mechanism
            const activeCall = await withDbRetry(
              () =>
                Call.findOne({
              room: roomId,
                  endedAt: null,
                }).sort({ startedAt: -1 }),
              {
                maxRetries: 3,
                initialDelay: 1000,
                operationName: "Find active call on disconnect",
              }
            );

            if (activeCall) {
              const peerRole = peer.role || "member";

              // ✅ إذا كان viewer، تقليل viewersCount
              if (
                peerRole === "viewer" &&
                activeCall.isLiveStream &&
                activeCall.liveStreamSettings?.isLive
              ) {
                if (activeCall.liveStreamSettings.viewersCount > 0) {
                  await Call.findOneAndUpdate(
                    {
                      _id: activeCall._id,
                      "liveStreamSettings.viewersCount": { $gt: 0 },
                    },
                    { $inc: { "liveStreamSettings.viewersCount": -1 } }
                  );
                  activeCall.liveStreamSettings.viewersCount -= 1;
                  logger.roomEvent(
                    `Viewer disconnected, viewersCount decremented`,
                    {
                      callId: activeCall._id,
                      userId: peer.userId,
                    }
                  );
                }
              }

              // تحديث leftAt للمشارك
              const participant = activeCall.participants.find(
                (p) => p.user.toString() === peer.userId.toString() && !p.leftAt
              );

              if (participant) {
                participant.leftAt = new Date();
                participant.duration = Math.floor(
                  (participant.leftAt - participant.joinedAt) / 1000
                );
                
                // ✅ التحقق من عدد المشاركين المتبقين
                const remainingParticipants = activeCall.participants.filter(
                  (p) => !p.leftAt
                );

                // ✅ إذا كان آخر شخص في المكالمة، إنهاء المكالمة
                if (remainingParticipants.length === 0) {
                  await activeCall.endCall(peer.userId);

                  // ✅ إذا كان ستريم، إنهاء الستريم أيضاً
                  if (
                    activeCall.isLiveStream &&
                    activeCall.liveStreamSettings?.isLive
                  ) {
                    activeCall.liveStreamSettings.isLive = false;
                    activeCall.liveStreamSettings.endedAt = new Date();
                    activeCall.liveStreamSettings.viewersCount = 0;
                await activeCall.save();
                
                    // إشعار جميع المشاهدين
                    io.to(roomId).emit("liveStreamEnded", {
                      roomId,
                      callId: activeCall._id.toString(),
                    });

                    logger.callEvent(
                      `Live stream ended due to last broadcaster disconnect`,
                      {
                        callId: activeCall._id,
                        roomId,
                      }
                    );
                  }

                  logger.callEvent(
                    `Call ended - last participant disconnected`,
                    {
                      callId: activeCall._id,
                  userId: peer.userId, 
                    }
                  );

                  const endedUpdates = {
                    ...createClearActiveCallState(),
                    activeCallParticipantsSyncedAt: Date.now(),
                  };
                  io.to(roomId).emit("roomUpdated", {
                    roomId,
                    updates: endedUpdates,
                  });
                  await emitRoomUpdateToMembers({
                    roomId,
                    updates: endedUpdates,
                  });
                } else {
                  // ✅ إذا كان broadcaster في ستريم، التحقق من وجود broadcasters آخرين
                  if (
                    activeCall.isLiveStream &&
                    activeCall.liveStreamSettings?.isLive &&
                    peerRole === "broadcaster"
                  ) {
                    // التحقق من broadcasters المتبقين في الغرفة
                    const remainingBroadcasters = [];
                    for (const broadcasterId of activeCall.broadcasters) {
                      const remainingPeer = room.getPeerByUserId(
                        broadcasterId.toString()
                      );
                      if (
                        remainingPeer &&
                        remainingPeer.role === "broadcaster"
                      ) {
                        remainingBroadcasters.push(broadcasterId);
                      }
                    }

                    // إذا لم يعد هناك broadcasters، إنهاء الستريم
                    if (remainingBroadcasters.length === 0) {
                      activeCall.liveStreamSettings.isLive = false;
                      activeCall.liveStreamSettings.endedAt = new Date();
                      activeCall.liveStreamSettings.viewersCount = 0;
                      await activeCall.save();

                      // إشعار جميع المشاهدين
                      io.to(roomId).emit("liveStreamEnded", {
                        roomId,
                        callId: activeCall._id.toString(),
                      });

                      logger.callEvent(
                        `Live stream ended - last broadcaster disconnected`,
                        {
                          callId: activeCall._id,
                          roomId,
                        }
                      );
                    }
                  }

                  // حفظ التحديثات
                  await activeCall.save();
                  await emitCallParticipantsSnapshot({
                    roomId,
                    callDoc: activeCall,
                  });

                  logger.callEvent(
                    `Updated call record for disconnected user: ${peer.userId}`,
                    {
                      userId: peer.userId,
                      callId: activeCall._id,
                      remainingParticipants: remainingParticipants.length,
                    }
                  );
                }
              }
            }
          }
        } catch (error) {
          logger.error("❌ Error updating call record on disconnect:", error);
        }

        // تنظيف الموارد (سيتم إغلاق جميع producers/consumers/transports)
        await roomManager.removePeerFromRoom(peer.roomId, socket.id);
        
        logger.info(
          `✅ Cleanup completed for disconnected peer: ${socket.id}`,
          {
          peerId: socket.id, 
          userId: peer.userId,
            producersCount: producerIds.length,
          }
        );
      } catch (error) {
        logger.error(
          `❌ Error during disconnect cleanup for peer ${socket.id}:`,
          error
        );
        // محاولة cleanup أساسي حتى في حالة الخطأ
        try {
          await roomManager.removePeerFromRoom(peer.roomId, socket.id);
        } catch (cleanupError) {
          logger.error(
            `❌ Critical: Failed to cleanup peer ${socket.id}:`,
            cleanupError
          );
        }
      }
    } else {
      logger.debug(`No peer found for disconnected socket: ${socket.id}`);
    }
    joinRequestStateBySocket.delete(socket.id);
    releaseLifecycleLock("disconnect");
  });

  /**
   * الحصول على معلومات الغرفة (للتطوير/Debug)
   */
  socket.on("getRoomInfo", async ({ roomId }, callback) => {
    try {
      // Rate limiting check
      // ✅ Rate limiting check
      const rateLimitResult = await checkRateLimit("getRoomInfo", socket);
      if (!rateLimitResult.allowed) {
        return callback({ 
          success: false, 
          error:
            rateLimitResult.message ||
            "Too many room info requests, please slow down",
          rateLimitInfo: rateLimitResult,
        });
      }
      
      const room = roomManager.getRoom(roomId);
      if (!room) {
        callback({ success: false, error: "Room not found" });
        return;
      }

      callback({
        success: true,
        info: room.getInfo(),
      });
    } catch (error) {
      callback(formatErrorForCallback(error));
    }
  });

  /**
   * ✅ جلب سجلات المكالمات للمستخدم (محسّن)
   * - استخدام lean() لتقليل overhead
   * - استخدام withDbRetry للـ resilience
   * - تحسين countDocuments (يتم فقط عند الحاجة)
   * - استخدام indexes محسّنة
   */
  socket.on(
    "getCallHistory",
    async (
      {
        page = 1,
        limit = 20,
        roomId,
        search = "",
        includeTotal = false,
        filters = { type: "all", status: "all", direction: "all" },
      },
      callback
    ) => {
      try {
        // ✅ Input validation
        const validation = validateInput("getCallHistory", {
          page,
          limit,
          roomId,
          search,
          includeTotal,
          filters,
        });
        if (!validation.valid) {
          return callback({
            type: "error",
            message: "Invalid request data",
            errors: validation.errors,
          });
        }
        ({ page, limit, roomId, search, includeTotal, filters } = validation.value);

        // ✅ Rate limiting check
        const rateLimitResult = await checkRateLimit("getCallHistory", socket);
        if (!rateLimitResult.allowed) {
          return callback({
            type: "error",
            message:
              rateLimitResult.message || "Too many requests, please slow down",
            rateLimitInfo: rateLimitResult,
          });
        }

        // التحقق من المصادقة
        if (!socket.user || !socket.user._id) {
          return callback({
            type: "error",
            message: "User not authenticated",
          });
        }

        const userId = socket.user._id;
        const userObjectId = mongoose.Types.ObjectId.isValid(String(userId))
          ? new mongoose.Types.ObjectId(String(userId))
          : null;
        const roomObjectId =
          roomId && mongoose.Types.ObjectId.isValid(String(roomId))
            ? new mongoose.Types.ObjectId(String(roomId))
            : null;
        if (!userObjectId) {
          return callback({
            type: "error",
            message: "Invalid user id for call history",
          });
        }
        const pageNum = Math.max(1, parseInt(page));
        const limitNum = Math.min(Math.max(1, parseInt(limit)), 100); // Max 100 per page
        const skip = (pageNum - 1) * limitNum;
        const normalizedSearch = String(search || "").trim();
        const escapedSearch = normalizedSearch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const searchRegex =
          escapedSearch.length > 0 ? new RegExp(escapedSearch, "i") : null;
        const normalizedFilters = {
          type: filters?.type || "all",
          status: filters?.status || "all",
          direction: filters?.direction || "all",
        };
        const typeMatchStage =
          normalizedFilters.type === "video"
            ? { isVideoCall: true }
            : normalizedFilters.type === "audio"
              ? {
                  $or: [
                    { isVideoCall: false },
                    { isVideoCall: { $exists: false } },
                    { isVideoCall: null },
                  ],
                }
              : null;
        const statusMatchStage =
          normalizedFilters.status !== "all"
            ? { status: normalizedFilters.status }
            : null;
        const directionMatchStage =
          normalizedFilters.direction === "outgoing"
            ? { caller: userObjectId }
            : normalizedFilters.direction === "incoming"
              ? { caller: { $ne: userObjectId } }
              : null;
        const baseMatch = {
          $or: [{ caller: userObjectId }, { "participants.user": userObjectId }],
          ...(roomObjectId ? { room: roomObjectId } : {}),
        };

        // ✅ بناء aggregation pipeline لتجنب parallel arrays issue
        // ⚠️ لا يمكن استخدام compound query مع deletedForUsers (array) و participants.user (array) في نفس الوقت
        // ✅ الحل: إزالة deletedForUsers من $match وفلترة النتائج بعد الجلب
        const pipeline = [
          // Match stage: فلترة المكالمات (بدون deletedForUsers لتجنب parallel arrays)
          {
            $match: {
              $or: [{ caller: userObjectId }, { "participants.user": userObjectId }],
              ...(roomObjectId ? { room: roomObjectId } : {}),
            },
          },
          // Filter stage: فلترة deletedForUsers بعد $match
          {
            $match: {
              $expr: {
                $not: {
                  $in: [userObjectId, { $ifNull: ["$deletedForUsers", []] }],
                },
              },
            },
          },
          ...(typeMatchStage ? [{ $match: typeMatchStage }] : []),
          ...(statusMatchStage ? [{ $match: statusMatchStage }] : []),
          ...(directionMatchStage ? [{ $match: directionMatchStage }] : []),
          // Lookup stages للـ populate
          {
            $lookup: {
              from: "rooms",
              localField: "room",
              foreignField: "_id",
              as: "room",
              pipeline: [{ $project: { name: 1, image: 1, isGroup: 1 } }],
            },
          },
          {
            $unwind: { path: "$room", preserveNullAndEmptyArrays: true },
          },
          {
            $lookup: {
              from: "users",
              localField: "caller",
              foreignField: "_id",
              as: "caller",
              pipeline: [
                {
                  $project: { firstName: 1, lastName: 1, email: 1, images: 1 },
                },
              ],
            },
          },
          {
            $unwind: { path: "$caller", preserveNullAndEmptyArrays: true },
          },
          {
            $lookup: {
              from: "users",
              localField: "participants.user",
              foreignField: "_id",
              as: "participantUsers",
              pipeline: [
                {
                  $project: { firstName: 1, lastName: 1, email: 1, images: 1 },
                },
              ],
            },
          },
          {
            $addFields: {
              participants: {
                $map: {
                  input: "$participants",
                  as: "participant",
                  in: {
                    $mergeObjects: [
                      "$$participant",
                      {
                        user: {
                          $arrayElemAt: [
                            {
                              $filter: {
                                input: "$participantUsers",
                                as: "user",
                                cond: {
                                  $eq: ["$$user._id", "$$participant.user"],
                                },
                              },
                            },
                            0,
                          ],
                        },
                      },
                    ],
                  },
                },
              },
            },
          },
          {
            $lookup: {
              from: "users",
              localField: "endedBy",
              foreignField: "_id",
              as: "endedBy",
              pipeline: [
                {
                  $project: { firstName: 1, lastName: 1, email: 1, images: 1 },
                },
              ],
            },
          },
          {
            $unwind: { path: "$endedBy", preserveNullAndEmptyArrays: true },
          },
          ...(searchRegex
            ? [
                {
                  $match: {
                    $or: [
                      { "room.name": { $regex: searchRegex } },
                      { "caller.firstName": { $regex: searchRegex } },
                      { "caller.lastName": { $regex: searchRegex } },
                      { "caller.email": { $regex: searchRegex } },
                      { "participants.user.firstName": { $regex: searchRegex } },
                      { "participants.user.lastName": { $regex: searchRegex } },
                      { "participants.user.email": { $regex: searchRegex } },
                    ],
                  },
                },
              ]
            : []),
          { $sort: { startedAt: -1 } },
          { $skip: skip },
          { $limit: limitNum },
          // ✅ Lookup Call Recording
          {
            $lookup: {
              from: "callrecordings",
              localField: "_id",
              foreignField: "call",
              as: "recording",
              pipeline: [
                {
                  $match: {
                    status: "completed",
                    deletedAt: null,
                  },
                },
                {
                  $project: {
                    _id: 1,
                    fileUrl: 1,
                    filePath: 1,
                    status: 1,
                    duration: 1,
                    startedAt: 1,
                    endedAt: 1,
                  },
                },
                {
                  $sort: { startedAt: -1 },
                },
                {
                  $limit: 1,
                },
              ],
            },
          },
          {
            $addFields: {
              recording: {
                $arrayElemAt: ["$recording", 0],
              },
            },
          },
          {
            $unset: "participantUsers",
          },
        ];

        // ✅ جلب المكالمات مع aggregation pipeline
        const calls = await withDbRetry(() => Call.aggregate(pipeline), {
          maxRetries: 2,
          initialDelay: 500,
          operationName: "Fetch call history",
        });

        // ✅ حساب العدد الإجمالي فقط عند الحاجة (أو في الصفحة الأولى)
        let total = null;
        let pages = null;

        if (includeTotal || pageNum === 1) {
          const countPipeline = [
            {
              $match: {
                $or: [{ caller: userObjectId }, { "participants.user": userObjectId }],
                ...(roomObjectId ? { room: roomObjectId } : {}),
              },
            },
            {
              $match: {
                $expr: {
                  $not: {
                    $in: [userObjectId, { $ifNull: ["$deletedForUsers", []] }],
                  },
                },
              },
            },
            ...(typeMatchStage ? [{ $match: typeMatchStage }] : []),
            ...(statusMatchStage ? [{ $match: statusMatchStage }] : []),
            ...(directionMatchStage ? [{ $match: directionMatchStage }] : []),
            {
              $lookup: {
                from: "rooms",
                localField: "room",
                foreignField: "_id",
                as: "room",
                pipeline: [{ $project: { name: 1 } }],
              },
            },
            { $unwind: { path: "$room", preserveNullAndEmptyArrays: true } },
            {
              $lookup: {
                from: "users",
                localField: "caller",
                foreignField: "_id",
                as: "caller",
                pipeline: [{ $project: { firstName: 1, lastName: 1, email: 1 } }],
              },
            },
            { $unwind: { path: "$caller", preserveNullAndEmptyArrays: true } },
            {
              $lookup: {
                from: "users",
                localField: "participants.user",
                foreignField: "_id",
                as: "participantUsers",
                pipeline: [{ $project: { firstName: 1, lastName: 1, email: 1 } }],
              },
            },
            {
              $addFields: {
                participants: {
                  $map: {
                    input: "$participants",
                    as: "participant",
                    in: {
                      $mergeObjects: [
                        "$$participant",
                        {
                          user: {
                            $arrayElemAt: [
                              {
                                $filter: {
                                  input: "$participantUsers",
                                  as: "user",
                                  cond: {
                                    $eq: ["$$user._id", "$$participant.user"],
                                  },
                                },
                              },
                              0,
                            ],
                          },
                        },
                      ],
                    },
                  },
                },
              },
            },
            ...(searchRegex
              ? [
                  {
                    $match: {
                      $or: [
                        { "room.name": { $regex: searchRegex } },
                        { "caller.firstName": { $regex: searchRegex } },
                        { "caller.lastName": { $regex: searchRegex } },
                        { "caller.email": { $regex: searchRegex } },
                        { "participants.user.firstName": { $regex: searchRegex } },
                        { "participants.user.lastName": { $regex: searchRegex } },
                        { "participants.user.email": { $regex: searchRegex } },
                      ],
                    },
                  },
                ]
              : []),
            {
              $count: "total",
            },
          ];

          const countResult = await withDbRetry(
            () => Call.aggregate(countPipeline),
            {
              maxRetries: 2,
              initialDelay: 500,
              operationName: "Count call history",
            }
          );

          total = countResult[0]?.total || 0;
          pages = Math.ceil(total / limitNum);
        }

        logger.callEvent(`Call history fetched for user ${userId}`, {
          userId,
          page: pageNum,
          limit: limitNum,
          filters: normalizedFilters,
          search: normalizedSearch || null,
          total: total !== null ? total : "not calculated",
          returned: calls.length,
          hasMore: calls.length === limitNum,
        });

        callback({
          type: "success",
          data: calls,
          pagination: {
            page: pageNum,
            limit: limitNum,
            total,
            pages,
            hasMore: calls.length === limitNum, // ✅ إضافة hasMore لتسهيل infinite scroll
          },
        });
      } catch (error) {
        logger.error("❌ Error fetching call history:", error);
        callback({
          type: "error",
          message: "Failed to fetch call history",
          error: error.message,
        });
      }
    }
  );

  /**
   * حذف سجل مكالمة
   */
  socket.on("deleteCall", async ({ callId }, callback) => {
    try {
      // ✅ Input validation
      const validation = validateInput("deleteCall", { callId });
      if (!validation.valid) {
        return callback({
          type: "error",
          message: "Invalid request data",
          errors: validation.errors,
        });
      }
      ({ callId } = validation.value);

      // ✅ Rate limiting check
      const rateLimitResult = await checkRateLimit("deleteCall", socket);
      if (!rateLimitResult.allowed) {
        return callback({
          type: "error",
          message:
            rateLimitResult.message ||
            "Too many delete attempts, please slow down",
          rateLimitInfo: rateLimitResult,
        });
      }

      // التحقق من المصادقة
      if (!socket.user || !socket.user._id) {
        return callback({
          type: "error",
          message: "User not authenticated",
        });
      }

      const userId = socket.user._id;

      // البحث عن المكالمة والتحقق من أن المستخدم مشارك فيها
      const call = await Call.findById(callId);

      if (!call) {
        return callback({
          type: "error",
          message: "Call not found",
        });
      }

      // التحقق من أن المستخدم هو المتصل أو أحد المشاركين
      const isCaller = call.caller.toString() === userId.toString();
      const isParticipant = call.participants.some(
        (p) => p.user.toString() === userId.toString()
      );

      if (!isCaller && !isParticipant) {
        return callback({
          type: "error",
          message: "Unauthorized: You are not a participant in this call",
        });
      }

      // إضافة المستخدم إلى deletedForUsers (soft delete) بدلاً من حذف المكالمة فعلياً
      const userIdStr = userId.toString();
      const isAlreadyDeleted =
        call.deletedForUsers &&
        call.deletedForUsers.some((id) => id.toString() === userIdStr);

      if (!isAlreadyDeleted) {
        if (!call.deletedForUsers) {
          call.deletedForUsers = [];
        }
        call.deletedForUsers.push(userId);
        await call.save();
      }

      logger.callEvent(`Call hidden for user: ${callId}`, {
        callId,
        userId,
        deletedBy: userId,
      });

      callback({
        type: "success",
        message: "Call deleted successfully",
      });
    } catch (error) {
      logger.error("❌ Error deleting call:", error);
      callback({
        type: "error",
        message: "Failed to delete call",
        error: error.message,
      });
    }
  });

  /**
   * بدء البث المباشر
   * ✅ تم التحديث: الستريم الآن مرتبط بـ Call وليس Room
   */
  socket.on("startLiveStream", async ({ roomId, settings = {} }, callback) => {
    try {
      // ✅ Input validation
      const validation = validateInput("startLiveStream", { roomId, settings });
      if (!validation.valid) {
        return callback({
          success: false,
          error: "Invalid stream start data",
          errors: validation.errors,
        });
      }
      ({ roomId, settings } = validation.value);

      // ✅ Rate limiting check
      const rateLimitResult = await checkRateLimit("startLiveStream", socket);
      if (!rateLimitResult.allowed) {
        return callback({
          success: false,
          error:
            rateLimitResult.message ||
            "Too many start stream attempts, please slow down",
          rateLimitInfo: rateLimitResult,
        });
      }

      // Authorization: Verify userId matches authenticated user
      if (!socket.user || !socket.user._id) {
        return callback({ success: false, error: "User not authenticated" });
      }

      const userId = socket.user._id;
      const room = await Room.findById(roomId);

      if (!room) {
        return callback({ success: false, error: "Room not found" });
      }

      // ✅ التحقق من أن البث غير نشط بالفعل (في Call)
      const activeStreamCall = await Call.findOne({
        room: roomId,
        isLiveStream: true,
        "liveStreamSettings.isLive": true,
        endedAt: null,
      });

      if (activeStreamCall) {
        return callback({ success: false, error: "Stream is already live" });
      }

      // التحقق من أن المستخدم عضو في الـ room
      const isMember =
        room.members &&
        room.members.some(
          (memberId) => memberId.toString() === userId.toString()
        );

      if (!isMember) {
        return callback({
          success: false,
          error: "You must be a member of this room to start a stream",
        });
      }

      // ✅ Check liveStream permission if there's an active call
      // For new calls, the caller automatically has permission
      const existingCall = await Call.findOne({
        room: roomId,
        endedAt: null,
      }).sort({ startedAt: -1 });

      if (existingCall) {
        const hasLiveStreamPermission = await checkCallPermission(
          userId.toString(),
          existingCall._id,
          "liveStream"
        );
        if (!hasLiveStreamPermission) {
          logger.warn("Live stream permission denied", {
            userId: userId.toString(),
            roomId,
            callId: existingCall._id,
          });
          return callback({
            success: false,
            error: "You don't have permission to start live stream in this call",
          });
        }
      }

      // ✅ البحث عن مكالمة نشطة أو إنشاء مكالمة جديدة
      let activeCall = await Call.findOne({
        room: roomId,
        endedAt: null,
      }).sort({ startedAt: -1 });

      if (!activeCall) {
        // ✅ إنشاء مكالمة جديدة للستريم باستخدام create() بدلاً من new + save()
        activeCall = await Call.create({
          room: roomId,
          caller: userId,
          isVideoCall: true,
          participants: [
            {
              user: userId,
              joinedAt: new Date(),
            },
          ],
          status: "answered",
          // ✅ عدم إضافة deletedForUsers هنا لتجنب parallel arrays issue
        });
      }

      // ✅ تحديث Call بالستريم باستخدام updateOne لتجنب parallel arrays issue
      const updateData = {
        isLiveStream: true,
        liveStreamSettings: {
          allowAnonymousViewers: settings.allowAnonymousViewers ?? true,
          maxViewers: settings.maxViewers ?? 1000,
          allowViewersToSpeak: settings.allowViewersToSpeak ?? false,
          isLive: true,
          startedAt: new Date(),
          viewersCount: 0,
        },
      };

      // إضافة broadcaster إذا لم يكن موجوداً
      const broadcasters = activeCall.broadcasters || [];
      if (!broadcasters.some((id) => id.toString() === userId.toString())) {
        broadcasters.push(userId);
      }
      updateData.broadcasters = broadcasters;

      // ✅ استخدام updateOne بدلاً من save() لتجنب parallel arrays index issue
      await Call.updateOne({ _id: activeCall._id }, { $set: updateData });

      // ✅ تحديث activeCall object محلياً للاستخدام اللاحق
      Object.assign(activeCall, updateData);

      // ✅ Stream Security: Generate DRM key and watermark
      const streamSecurityInfo = streamSecurityService.getStreamSecurityInfo(
        activeCall._id.toString(),
        userId
      );

      // ✅ إشعار أعضاء الغرفة فقط (وليس جميع المستخدمين)
      io.to(roomId).emit("liveStreamStarted", {
        roomId: room._id.toString(),
        callId: activeCall._id.toString(),
        broadcaster: {
          _id: userId,
          userName: socket.user.userName || socket.user.firstName || "Unknown",
        },
        settings: activeCall.liveStreamSettings,
        security: streamSecurityInfo, // ✅ Include security info
      });

      logger.callEvent(`Live stream started: ${roomId}`, {
        roomId,
        callId: activeCall._id,
        userId,
        security: {
          drmEnabled: streamSecurityInfo.drm.enabled,
          watermarkEnabled: streamSecurityInfo.watermark.enabled,
        },
      });

      // ✅ CDN Integration: إنشاء CDN stream إذا كان CDN مفعّل
      const cdnService = require("../../utils/cdnService");
      if (cdnService.isEnabled()) {
        try {
          const cdnStreamInfo = await cdnService.createStream(
            activeCall._id.toString(),
            {
              roomId,
              isVideoCall: activeCall.isVideoCall,
              broadcasters: activeCall.broadcasters,
            }
          );
          if (cdnStreamInfo) {
            logger.callEvent(`CDN stream created: ${roomId}`, {
              roomId,
              cdnStreamInfo,
            });
            // يمكن إضافة CDN URL للـ response إذا لزم الأمر
          }
        } catch (error) {
          logger.error("Error creating CDN stream:", error);
          // لا نوقف العملية إذا فشل CDN
        }
      }
      callback({ success: true, call: activeCall.toObject() });
    } catch (error) {
      logger.error("❌ Error starting live stream:", error);
      callback({ success: false, error: error.message });
    }
  });

  /**
   * طلب تحويل المكالمة إلى ستريم (يتطلب موافقة الطرف الآخر)
   */
  socket.on(
    "requestLiveStream",
    async ({ roomId, userData, settings = {} }, callback) => {
      try {
        // Rate limiting check
        // ✅ Rate limiting check
        const rateLimitResult = await checkRateLimit(
          "requestLiveStream",
          socket
        );
        if (!rateLimitResult.allowed) {
          return callback({
            success: false,
            error:
              rateLimitResult.message || "Too many requests, please slow down",
            rateLimitInfo: rateLimitResult,
          });
        }

        if (!socket.user || !socket.user._id) {
          return callback({ success: false, error: "User not authenticated" });
        }

        const userId = socket.user._id;
        const room = await Room.findById(roomId);

        if (!room) {
          return callback({ success: false, error: "Room not found" });
        }

        // ✅ التحقق من أن البث غير نشط بالفعل (في Call)
        const activeStreamCall = await Call.findOne({
          room: roomId,
          isLiveStream: true,
          "liveStreamSettings.isLive": true,
          endedAt: null,
        });

        if (activeStreamCall) {
          return callback({ success: false, error: "Stream is already live" });
        }

        // التحقق من أن المستخدم عضو في الـ room
        const isMember =
          room.members &&
          room.members.some(
            (memberId) => memberId.toString() === userId.toString()
          );

        if (!isMember) {
          return callback({
            success: false,
            error: "You must be a member of this room",
          });
        }

        // إرسال طلب للمشاركين الآخرين في المكالمة
        const otherMembers = room.members.filter(
          (memberId) => memberId.toString() !== userId.toString()
        );

        logger.callEvent(`Requesting live stream conversion: ${roomId}`, {
          roomId,
          userId,
          otherMembersCount: otherMembers.length,
        });

        // ✅ إرسال إشعار لكل عضو آخر مع retry mechanism
        for (const memberId of otherMembers) {
          try {
            const recipientSocketIds = await resolveUserSocketIds(memberId);

            if (recipientSocketIds.length) {
              // ✅ استخدام userData المرسلة من العميل (مثل joinRoom) أو socket.user كبديل
              const requesterData = userData || {
                _id: userId,
                userName: socket.user.userName,
                firstName: socket.user.firstName,
                lastName: socket.user.lastName,
                email: socket.user.email,
                phoneNumber: socket.user.phoneNumber,
                images: socket.user.images,
                colors: socket.user.colors,
              };

              recipientSocketIds.forEach((recipientSocketId) => {
                io.to(recipientSocketId).emit("liveStreamRequested", {
                  roomId: room._id.toString(),
                  requesterId: userId,
                  requesterData: requesterData,
                  settings: {
                    allowAnonymousViewers: settings.allowAnonymousViewers ?? true,
                    maxViewers: settings.maxViewers ?? 1000,
                    allowViewersToSpeak: settings.allowViewersToSpeak ?? false,
                  },
                });
              });

              logger.callEvent(`Live stream request sent to ${memberId}`, {
                recipientSocketIds,
                roomId: room._id.toString(),
              });
            } else {
              logger.warn(
                `⚠️ User ${memberId} is not connected for live stream request`
              );
            }
          } catch (error) {
            logger.error(
              `Error getting socket ID for user ${memberId}:`,
              error
            );
            // نكمل مع باقي الأعضاء حتى لو فشل أحدهم
          }
        }

        callback({
          success: true,
          message: "Live stream request sent to other participants",
        });
      } catch (error) {
        logger.error("❌ Error requesting live stream:", error);
        callback({ success: false, error: error.message });
      }
    }
  );

  /**
   * الرد على طلب تحويل المكالمة إلى ستريم
   */
  socket.on(
    "respondToLiveStreamRequest",
    async ({ roomId, accepted, settings = {} }, callback) => {
      try {
        if (!socket.user || !socket.user._id) {
          return callback({ success: false, error: "User not authenticated" });
        }

        const userId = socket.user._id;
        const room = await Room.findById(roomId);

        if (!room) {
          return callback({ success: false, error: "Room not found" });
        }

        // ✅ التحقق من أن البث غير نشط بالفعل (في Call)
        const activeStreamCall = await Call.findOne({
          room: roomId,
          isLiveStream: true,
          "liveStreamSettings.isLive": true,
          endedAt: null,
        });

        if (activeStreamCall) {
          return callback({ success: false, error: "Stream is already live" });
        }

        // إيجاد الطرف الذي طلب الستريم (أول عضو غير المستخدم الحالي)
        const requesterId = room.members.find(
          (memberId) => memberId.toString() !== userId.toString()
        );

        if (!requesterId) {
          return callback({ success: false, error: "Requester not found" });
        }

        // ✅ الحصول على socket ID للمطلب من Redis مع retry mechanism
        const requesterSocketIds = await resolveUserSocketIds(requesterId);
        if (!requesterSocketIds.length) {
          return callback({ success: false, error: "Requester is not online" });
        }

        // إرسال الرد للطرف الذي طلب الستريم
        requesterSocketIds.forEach((requesterSocketId) => {
          io.to(requesterSocketId).emit("liveStreamRequestResponse", {
            roomId: room._id.toString(),
            accepted,
            responderId: userId,
            responderData: {
              _id: userId,
              userName:
                socket.user.userName || socket.user.firstName || "Unknown",
              firstName: socket.user.firstName,
              lastName: socket.user.lastName,
              images: socket.user.images,
            },
          });
        });

        // إذا تمت الموافقة، بدء الستريم
        if (accepted) {
          // ✅ البحث عن مكالمة نشطة أو إنشاء مكالمة جديدة
          let activeCall = await Call.findOne({
            room: roomId,
            endedAt: null,
          }).sort({ startedAt: -1 });

          if (!activeCall) {
            // ✅ إنشاء مكالمة جديدة للستريم باستخدام create() بدلاً من new + save()
            activeCall = await Call.create({
              room: roomId,
              caller: requesterId, // الطرف الذي طلب الستريم
              isVideoCall: true,
              participants: [
                { user: requesterId, joinedAt: new Date() },
                { user: userId, joinedAt: new Date() },
              ],
              status: "answered",
              // ✅ عدم إضافة deletedForUsers هنا لتجنب parallel arrays issue
            });
          }

          // ✅ تحديث Call بالستريم باستخدام updateOne لتجنب parallel arrays issue
          const updateData = {
            isLiveStream: true,
            liveStreamSettings: {
              allowAnonymousViewers: settings.allowAnonymousViewers ?? true,
              maxViewers: settings.maxViewers ?? 1000,
              allowViewersToSpeak: settings.allowViewersToSpeak ?? false,
              isLive: true,
              startedAt: new Date(),
              viewersCount: 0,
            },
          };

          // إضافة كلا الطرفين كـ broadcasters
          const broadcasters = activeCall.broadcasters || [];
          if (
            !broadcasters.some((id) => id.toString() === requesterId.toString())
          ) {
            broadcasters.push(requesterId);
          }
          if (!broadcasters.some((id) => id.toString() === userId.toString())) {
            broadcasters.push(userId);
          }
          updateData.broadcasters = broadcasters;

          // ✅ استخدام updateOne بدلاً من save() لتجنب parallel arrays index issue
          await Call.updateOne({ _id: activeCall._id }, { $set: updateData });

          // ✅ تحديث activeCall object محلياً للاستخدام اللاحق
          Object.assign(activeCall, updateData);

          // ✅ إشعار أعضاء الغرفة فقط
          io.to(roomId).emit("liveStreamStarted", {
            roomId: room._id.toString(),
            callId: activeCall._id.toString(),
            broadcasters: activeCall.broadcasters.map((id) => ({
              _id: id,
              userName:
                socket.user.userName || socket.user.firstName || "Unknown",
            })),
            settings: activeCall.liveStreamSettings,
          });

          logger.callEvent(`Live stream started after approval: ${roomId}`, {
            roomId,
            callId: activeCall._id,
            requesterId,
            responderId: userId,
          });
        }

        callback({ success: true, accepted });
      } catch (error) {
        logger.error("❌ Error responding to live stream request:", error);
        callback({ success: false, error: error.message });
      }
    }
  );

  /**
   * إيقاف البث المباشر
   */
  socket.on("stopLiveStream", async ({ roomId }, callback) => {
    try {
      // ✅ Input validation
      const validation = validateInput("stopLiveStream", { roomId });
      if (!validation.valid) {
        return callback({
          success: false,
          error: "Invalid request data",
          errors: validation.errors,
        });
      }
      ({ roomId } = validation.value);

      // ✅ Rate limiting check
      const rateLimitResult = await checkRateLimit("stopLiveStream", socket);
      if (!rateLimitResult.allowed) {
        return callback({
          success: false,
          error:
            rateLimitResult.message ||
            "Too many stop stream attempts, please slow down",
          rateLimitInfo: rateLimitResult,
        });
      }

      if (!socket.user || !socket.user._id) {
        return callback({ success: false, error: "User not authenticated" });
      }

      const userId = socket.user._id;
      const room = await Room.findById(roomId);

      if (!room) {
        return callback({ success: false, error: "Room not found" });
      }

      // ✅ البحث عن مكالمة نشطة مع ستريم
      const activeStreamCall = await Call.findOne({
        room: roomId,
        isLiveStream: true,
        "liveStreamSettings.isLive": true,
        endedAt: null,
      }).sort({ startedAt: -1 });

      if (!activeStreamCall) {
        return callback({ success: false, error: "Stream is not live" });
      }

      // التحقق من الصلاحيات
      const isBroadcaster =
        activeStreamCall.broadcasters &&
        activeStreamCall.broadcasters.some(
          (id) => id.toString() === userId.toString()
        );
      const isOwner = room.user && room.user.toString() === userId.toString();

      if (!isBroadcaster && !isOwner) {
        return callback({
          success: false,
          error: "Only broadcasters or room owners can stop streams",
        });
      }

      // ✅ Stream Security: Cleanup security data
      streamSecurityService.cleanupStream(activeStreamCall._id.toString());

      // ✅ إيقاف الستريم في Call
      activeStreamCall.liveStreamSettings.isLive = false;
      activeStreamCall.liveStreamSettings.endedAt = new Date();
      activeStreamCall.liveStreamSettings.viewersCount = 0;
      await activeStreamCall.save();

      // إشعار جميع المشاهدين
      // ✅ Finalize analytics (optional - continue if service doesn't exist)
      try {
        const analyticsService = require("../../services/analytics.service");
        await analyticsService.finalizeAnalytics(activeStreamCall._id);
      } catch (error) {
        // Continue even if analytics service doesn't exist or fails
        if (error.code !== "MODULE_NOT_FOUND") {
          logger.error("Error finalizing stream analytics:", error);
        }
      }

      // ✅ Stop any active recording
      const recordingService = require("../../services/recording.service");
      try {
        const recording = await recordingService.getRecordingInfo(
          activeStreamCall._id
        );
        if (recording && recording.status === "recording") {
          await recordingService.stopRecording(activeStreamCall._id);
        }
      } catch (error) {
        logger.error("Error stopping stream recording:", error);
        // Continue even if recording stop fails
      }

      io.to(roomId).emit("liveStreamEnded", {
        roomId,
        callId: activeStreamCall._id.toString(),
      });

      logger.callEvent(`Live stream stopped: ${roomId}`, {
        roomId,
        callId: activeStreamCall._id,
        userId,
      });
      callback({ success: true, call: activeStreamCall.toObject() });
    } catch (error) {
      logger.error("❌ Error stopping live stream:", error);
      callback({ success: false, error: error.message });
    }
  });

  /**
   * الحصول على Live Streams النشطة
   */
  socket.on("getLiveStreams", async ({ limit = 20, offset = 0 }, callback) => {
    try {
      // Rate limiting check
      // ✅ Rate limiting check
      const rateLimitResult = await checkRateLimit("getLiveStreams", socket);
      if (!rateLimitResult.allowed) {
        return callback({
          success: false,
          error:
            rateLimitResult.message ||
            "Too many get live streams requests, please slow down",
          rateLimitInfo: rateLimitResult,
        });
      }

      // ✅ البحث عن مكالمات نشطة مع ستريم
      const streamCalls = await Call.find({
        isLiveStream: true,
        "liveStreamSettings.isLive": true,
        endedAt: null,
      })
        .populate("broadcasters", "userName firstName lastName images avatarColor color")
        .populate({
          path: "room",
          select: "name image members user",
          populate: {
            path: "members",
            select: "userName firstName lastName images avatarColor color"
          }
        })
        .populate("caller", "userName firstName lastName images avatarColor color")
        .sort({ "liveStreamSettings.startedAt": -1 })
        .limit(limit)
        .skip(offset)
        .lean();

      // تحويل Call إلى format متوافق مع client
      const streams = streamCalls.map((call) => ({
        _id: call.room?._id || call.room,
        room: call.room,
        callId: call._id,
        isLiveStream: true,
        liveStreamSettings: call.liveStreamSettings,
        broadcasters: call.broadcasters,
        caller: call.caller,
        startedAt: call.liveStreamSettings?.startedAt || call.startedAt,
      }));

      callback({ success: true, streams });
    } catch (error) {
      logger.error("❌ Error getting live streams:", error);
      callback({ success: false, error: error.message });
    }
  });

  /**
   * الحصول على معلومات stream محدد
   */
  socket.on("getStreamInfo", async ({ roomId }, callback) => {
    try {
      // Rate limiting check
      // ✅ Rate limiting check
      const rateLimitResult = await checkRateLimit("getStreamInfo", socket);
      if (!rateLimitResult.allowed) {
        return callback({
          success: false,
          error:
            rateLimitResult.message ||
            "Too many get stream info requests, please slow down",
          rateLimitInfo: rateLimitResult,
        });
      }

      // ✅ البحث عن مكالمة نشطة مع ستريم
      const activeStreamCall = await Call.findOne({
        room: roomId,
        isLiveStream: true,
        "liveStreamSettings.isLive": true,
        endedAt: null,
      })
        .populate("broadcasters", "userName firstName lastName images")
        .populate({
          path: "room",
          select: "name image members user",
          populate: {
            path: "members",
            select: "userName firstName lastName images avatarColor color"
          }
        })
        .populate("caller", "userName firstName lastName images avatarColor color")
        .lean();

      if (!activeStreamCall) {
        return callback({
          success: false,
          error: "Stream not found or not live",
        });
      }

      // تحويل Call إلى format متوافق مع client
      const stream = {
        _id: activeStreamCall.room?._id || activeStreamCall.room,
        room: activeStreamCall.room,
        callId: activeStreamCall._id,
        isLiveStream: true,
        liveStreamSettings: activeStreamCall.liveStreamSettings,
        broadcasters: activeStreamCall.broadcasters,
        caller: activeStreamCall.caller,
        startedAt:
          activeStreamCall.liveStreamSettings?.startedAt ||
          activeStreamCall.startedAt,
      };

      // ✅ CDN Integration: إضافة CDN URLs إذا كان CDN مفعّل
      const cdnService = require("../../utils/cdnService");
      if (cdnService.isEnabled()) {
        try {
          stream.cdnUrls = {
            high: cdnService.getStreamUrl(
              activeStreamCall._id.toString(),
              "high"
            ),
            medium: cdnService.getStreamUrl(
              activeStreamCall._id.toString(),
              "medium"
            ),
            low: cdnService.getStreamUrl(
              activeStreamCall._id.toString(),
              "low"
            ),
          };
        } catch (error) {
          logger.error("Error getting CDN URLs:", error);
        }
      }

      callback({ success: true, stream });
    } catch (error) {
      logger.error("❌ Error getting stream info:", error);
      callback({ success: false, error: error.message });
    }
  });

  /**
   * إرسال تعليق في البث المباشر
   */
  socket.on("sendStreamComment", async ({ streamId, comment }, callback) => {
    try {
      // ✅ Input validation
      const validation = validateInput("sendStreamComment", {
        streamId,
        comment,
      });
      if (!validation.valid) {
        return callback({
          success: false,
          error: "Invalid comment data",
          errors: validation.errors,
        });
      }
      ({ streamId, comment } = validation.value);

      // ✅ Rate limiting check
      const rateLimitResult = await checkRateLimit("sendStreamComment", socket);
      if (!rateLimitResult.allowed) {
        return callback({
          success: false,
          error:
            rateLimitResult.message || "Too many comments, please slow down",
          rateLimitInfo: rateLimitResult,
        });
      }

      if (!socket.user || !socket.user._id) {
        return callback({ success: false, error: "User not authenticated" });
      }

      const userId = socket.user._id;
      // ✅ البحث عن مكالمة نشطة مع ستريم
      // streamId يمكن أن يكون callId أو roomId
      let activeStreamCall = null;
      
      // ✅ أولاً: محاولة البحث باستخدام streamId كـ callId مباشرة
      try {
        const mongoose = require("mongoose");
        if (mongoose.Types.ObjectId.isValid(streamId)) {
          activeStreamCall = await Call.findOne({
            _id: streamId,
            isLiveStream: true,
            "liveStreamSettings.isLive": true,
            endedAt: null,
          });
        }
      } catch (error) {
        // streamId ليس ObjectId صالح، نتابع البحث كـ roomId
        logger.debug("streamId is not a valid ObjectId, searching by roomId", { streamId });
      }
      
      // ✅ إذا لم نجد باستخدام callId، نبحث باستخدام roomId
      if (!activeStreamCall) {
        activeStreamCall = await Call.findOne({
          room: streamId,
          isLiveStream: true,
          "liveStreamSettings.isLive": true,
          endedAt: null,
        });
      }

      if (!activeStreamCall) {
        return callback({
          success: false,
          error: "Stream not found or not live",
        });
      }

      // التحقق من أن المستخدم viewer أو broadcaster
      const isBroadcaster =
        activeStreamCall.broadcasters &&
        activeStreamCall.broadcasters.some(
          (id) => id.toString() === userId.toString()
        );
      const isViewer = !isBroadcaster; // يمكن للجميع التعليق

      if (!comment || comment.trim().length === 0) {
        return callback({ success: false, error: "Comment cannot be empty" });
      }

      if (comment.length > 500) {
        return callback({
          success: false,
          error: "Comment is too long (max 500 characters)",
        });
      }

      const viewerRole = isViewer ? "viewer" : "broadcaster";
      let resolvedUserProfile = socket.user || {};
      
      // ✅ Always fetch from DB to ensure we have colors
      // Colors are stored in colors array (ObjectId references), need to populate
      if (userId) {
        try {
          const dbUserProfile = await User.findById(userId)
            .select("userName firstName lastName email images colors")
            .populate("colors", "name code")
            .populate("images", "path")
            .lean();
          
          // ✅ Debug log to see what we got from DB
          logger.debug("Fetched user profile from DB for stream comment", {
            userId,
            hasDbProfile: !!dbUserProfile,
            hasColors: !!dbUserProfile?.colors,
            colorsLength: dbUserProfile?.colors?.length || 0,
            firstColorCode: dbUserProfile?.colors?.[0]?.code,
          });
          
          if (dbUserProfile) {
            // ✅ Merge with socket.user to preserve any additional data
            resolvedUserProfile = { ...resolvedUserProfile, ...dbUserProfile, _id: userId };
            
            // ✅ Debug log after merge
            logger.debug("Resolved user profile after merge", {
              userId,
              hasColors: !!resolvedUserProfile?.colors,
              colorsLength: resolvedUserProfile?.colors?.length || 0,
              firstColorCode: resolvedUserProfile?.colors?.[0]?.code,
            });
          }
        } catch (profileError) {
          logger.warn("Unable to load user profile for stream comment", {
            userId,
            error: profileError?.message,
          });
        }
      }

      // ✅ Extract color from colors array (first color's code)
      // colors array contains populated Color documents with {_id, name, code}
      const colorsArray = resolvedUserProfile?.colors || [];
      
      // ✅ Ensure images array is properly formatted (same logic as buildSenderSnapshot)
      // images can be populated Image documents (with path) or already formatted objects
      const imagesArray = Array.isArray(resolvedUserProfile?.images) 
        ? resolvedUserProfile.images
            .map((img, index) => {
              // ✅ Handle both populated Image documents and plain objects
              if (typeof img === 'object' && img !== null) {
                // ✅ Extract path from populated Image document or plain object
                // Try multiple possible paths: path, url, _id (if it's an ObjectId)
                const imagePath = img?.path || img?.url || (typeof img === 'string' ? img : null);
                if (imagePath && typeof imagePath === 'string' && imagePath.trim()) {
                  // ✅ Only include thumbnail if it exists and is not null
                  const imageObj = { path: imagePath.trim() };
                  if (img?.thumbnail && typeof img.thumbnail === 'string') {
                    imageObj.thumbnail = img.thumbnail.trim();
                  }
                  logger.debug(`Processing image ${index}`, {
                    originalImg: img,
                    extractedPath: imagePath,
                    finalImageObj: imageObj,
                  });
                  return imageObj;
                } else {
                  logger.debug(`Skipping invalid image ${index}`, {
                    originalImg: img,
                    imagePath,
                    imagePathType: typeof imagePath,
                  });
                }
              }
              // ✅ Also handle if img is a string (direct path)
              if (typeof img === 'string' && img.trim()) {
                return { path: img.trim() };
              }
              return null;
            })
            .filter(img => img && img.path && typeof img.path === 'string' && img.path.trim()) // ✅ Filter out invalid images
        : [];
      
      logger.debug("Final imagesArray", {
        imagesArrayLength: imagesArray.length,
        imagesArray,
        allPaths: imagesArray.map(img => img.path),
      });

      // ✅ Debug log before creating authorSnapshot
      logger.debug("Extracting data for authorSnapshot", {
        userId,
        hasColorsArray: !!colorsArray,
        colorsLength: colorsArray.length,
        firstColor: colorsArray[0] ? {
          _id: colorsArray[0]._id,
          name: colorsArray[0].name,
          code: colorsArray[0].code,
        } : null,
        hasImages: !!resolvedUserProfile?.images,
        rawImagesType: Array.isArray(resolvedUserProfile?.images) ? "array" : typeof resolvedUserProfile?.images,
        rawImagesLength: Array.isArray(resolvedUserProfile?.images) ? resolvedUserProfile.images.length : 0,
        rawImagesSample: Array.isArray(resolvedUserProfile?.images) && resolvedUserProfile.images.length > 0 
          ? {
              type: typeof resolvedUserProfile.images[0],
              isObject: typeof resolvedUserProfile.images[0] === 'object',
              keys: typeof resolvedUserProfile.images[0] === 'object' ? Object.keys(resolvedUserProfile.images[0]) : [],
              hasPath: !!resolvedUserProfile.images[0]?.path,
              path: resolvedUserProfile.images[0]?.path,
            }
          : null,
        imagesLength: imagesArray.length,
        firstImage: imagesArray[0] ? {
          path: imagesArray[0].path,
          thumbnail: imagesArray[0].thumbnail,
        } : null,
        allImages: imagesArray,
      });

      const authorSnapshot = {
        _id: userId,
        userId: userId?.toString(),
        role: viewerRole,
        userName:
          resolvedUserProfile?.userName ||
          resolvedUserProfile?.firstName ||
          "Unknown",
        firstName: resolvedUserProfile?.firstName || null,
        lastName: resolvedUserProfile?.lastName || null,
        email: resolvedUserProfile?.email || null,
        images: imagesArray, // ✅ Properly formatted images array
        colors: colorsArray, // ✅ Include full colors array (UserImage will extract colors[0].code)
      };
      
      // ✅ Debug log to verify data is included
      logger.debug("Author snapshot for stream comment", {
        userId,
        hasColorsArray: !!authorSnapshot.colors,
        colorsLength: authorSnapshot.colors?.length || 0,
        firstColorCode: authorSnapshot.colors?.[0]?.code,
        hasImages: !!authorSnapshot.images,
        imagesLength: authorSnapshot.images?.length || 0,
        firstImagePath: authorSnapshot.images?.[0]?.path,
      });
      const commentData = {
        ...authorSnapshot,
        userImage: authorSnapshot.images?.[0]?.path || null,
        comment: comment.trim(),
        timestamp: new Date(),
      };

      // ✅ Stream-Chat Integration: حفظ التعليق في قاعدة البيانات كـ message
      const Message = require("../../models/message.model");
      const roomId = activeStreamCall.room.toString();
      const callId = activeStreamCall._id.toString(); // ✅ تعريف callId قبل try block

      try {
        const streamCommentMessage = new Message({
          room: roomId,
          type: "text",
          text: comment.trim(),
          user: userId,
          uuId: uuidv4(),
          content: JSON.stringify({
            kind: "liveStreamComment",
            user: authorSnapshot,
            comment: comment.trim(),
          }),
          senderSnapshot: authorSnapshot, // ✅ حفظ senderSnapshot في قاعدة البيانات
          call: activeStreamCall._id, // ✅ حفظ call field للعزل التام
          stateVersion: 1,
        });
        await streamCommentMessage.save();

        // ✅ Re-fetch the message from database to verify senderSnapshot was saved correctly
        const savedMessage = await Message.findById(streamCommentMessage._id).lean();
        logger.debug("Message after save (from DB)", {
          messageId: streamCommentMessage._id,
          hasSenderSnapshot: !!savedMessage?.senderSnapshot,
          senderSnapshotKeys: savedMessage?.senderSnapshot ? Object.keys(savedMessage.senderSnapshot) : [],
          senderSnapshotImages: savedMessage?.senderSnapshot?.images,
          senderSnapshotImagesType: Array.isArray(savedMessage?.senderSnapshot?.images) ? "array" : typeof savedMessage?.senderSnapshot?.images,
          senderSnapshotImagesLength: Array.isArray(savedMessage?.senderSnapshot?.images) ? savedMessage.senderSnapshot.images.length : 0,
          senderSnapshotFirstImage: savedMessage?.senderSnapshot?.images?.[0],
          senderSnapshotFirstImagePath: savedMessage?.senderSnapshot?.images?.[0]?.path,
          senderSnapshotColors: savedMessage?.senderSnapshot?.colors,
          senderSnapshotColorsLength: savedMessage?.senderSnapshot?.colors?.length || 0,
          senderSnapshotFirstColorCode: savedMessage?.senderSnapshot?.colors?.[0]?.code,
        });

        const messagePayload = savedMessage || streamCommentMessage.toObject();
        messagePayload.isLiveComment = true;

        // ✅ Debug log to verify senderSnapshot in messagePayload
        logger.debug("Message payload before sending", {
          messageId: streamCommentMessage._id,
          hasSenderSnapshot: !!messagePayload.senderSnapshot,
          senderSnapshotKeys: messagePayload.senderSnapshot ? Object.keys(messagePayload.senderSnapshot) : [],
          senderSnapshotColors: messagePayload.senderSnapshot?.colors,
          senderSnapshotColorsLength: messagePayload.senderSnapshot?.colors?.length || 0,
          senderSnapshotFirstColorCode: messagePayload.senderSnapshot?.colors?.[0]?.code,
          senderSnapshotImages: messagePayload.senderSnapshot?.images,
          senderSnapshotImagesType: Array.isArray(messagePayload.senderSnapshot?.images) ? "array" : typeof messagePayload.senderSnapshot?.images,
          senderSnapshotImagesLength: Array.isArray(messagePayload.senderSnapshot?.images) ? messagePayload.senderSnapshot.images.length : 0,
          senderSnapshotFirstImage: messagePayload.senderSnapshot?.images?.[0],
          senderSnapshotFirstImagePath: messagePayload.senderSnapshot?.images?.[0]?.path,
        });

        // ✅ إرسال الرسالة إلى call-specific socket room فقط (وليس roomId)
        // هذا يضمن أن المشاهدين لن يتلقوا رسائل من مكالمات أخرى في نفس الغرفة
        const callRoomName = `call:${callId}`;
        logger.debug("Sending stream comment to call room", {
          callRoomName,
          callId,
          roomId,
          messageId: streamCommentMessage._id,
        });
        io.to(callRoomName).emit("receiveMessage", {
          message: messagePayload,
          room: roomId,
          user: userId,
          callId: callId, // ✅ إضافة callId في payload
          stateVersion: streamCommentMessage.stateVersion,
        });

        logger.callEvent(`Stream comment saved as message: ${streamId}`, {
          streamId,
          userId,
          messageId: streamCommentMessage._id,
          commentLength: comment.length,
        });
      } catch (error) {
        logger.error("Error saving stream comment as message:", error);
        // نكمل مع إرسال التعليق حتى لو فشل الحفظ
      }

      // ✅ إرسال التعليق لجميع المشاهدين في call-specific room (للـ stream UI)
      const callRoomName = `call:${callId}`;
      io.to(callRoomName).emit("streamComment", {
        streamId: callId, // ✅ استخدام callId بدلاً من streamId (roomId)
        callId: callId, // ✅ إضافة callId للتوافق
        comment: commentData,
      });

      // ✅ Update analytics
      const analyticsService = require("../../services/analytics.service");
      try {
        await analyticsService.addComment(activeStreamCall._id);
      } catch (error) {
        logger.error("Error updating analytics for comment:", error);
        // Continue even if analytics fails
      }

      logger.callEvent(`Stream comment sent: ${streamId}`, {
        streamId,
        userId,
        commentLength: comment.length,
      });
      callback({ success: true, comment: commentData });
    } catch (error) {
      logger.error("❌ Error sending stream comment:", error);
      callback({ success: false, error: error.message });
    }
  });

  /**
   * إرسال reaction في البث المباشر
   */
  socket.on("sendStreamReaction", async ({ streamId, reaction }, callback) => {
    try {
      // ✅ Input validation
      const validation = validateInput("sendStreamReaction", {
        streamId,
        reaction,
      });
      if (!validation.valid) {
        return callback({
          success: false,
          error: "Invalid reaction data",
          errors: validation.errors,
        });
      }
      ({ streamId, reaction } = validation.value);

      // ✅ Rate limiting check
      const rateLimitResult = await checkRateLimit(
        "sendStreamReaction",
        socket
      );
      if (!rateLimitResult.allowed) {
        return callback({
          success: false,
          error:
            rateLimitResult.message || "Too many reactions, please slow down",
          rateLimitInfo: rateLimitResult,
        });
      }

      if (!socket.user || !socket.user._id) {
        return callback({ success: false, error: "User not authenticated" });
      }

      const userId = socket.user._id;
      // ✅ البحث عن مكالمة نشطة مع ستريم
      const activeStreamCall = await Call.findOne({
        room: streamId,
        isLiveStream: true,
        "liveStreamSettings.isLive": true,
        endedAt: null,
      });

      if (!activeStreamCall) {
        return callback({
          success: false,
          error: "Stream not found or not live",
        });
      }

      // التحقق من صحة reaction
      const validReactions = [
        "like",
        "love",
        "laugh",
        "wow",
        "sad",
        "angry",
        "fire",
        "clap",
      ];
      if (!validReactions.includes(reaction)) {
        return callback({ success: false, error: "Invalid reaction type" });
      }

      const reactionData = {
        userId,
        userName: socket.user.userName || socket.user.firstName || "Unknown",
        userImage: socket.user.images?.[0]?.path || null,
        reaction,
        timestamp: new Date(),
      };

      // إرسال reaction لجميع المشاهدين
      io.to(streamId).emit("streamReaction", {
        streamId,
        reaction: reactionData,
      });

      // ✅ Update analytics
      const analyticsService = require("../../services/analytics.service");
      try {
        await analyticsService.addReaction(activeStreamCall._id, reaction);
      } catch (error) {
        logger.error("Error updating analytics for reaction:", error);
        // Continue even if analytics fails
      }

      logger.callEvent(`Stream reaction sent: ${streamId}`, {
        streamId,
        userId,
        reaction,
      });
      callback({ success: true, reaction: reactionData });
    } catch (error) {
      logger.error("❌ Error sending stream reaction:", error);
      callback({ success: false, error: error.message });
    }
  });

  /**
   * ✅ Start recording a stream
   */
  socket.on(
    "startStreamRecording",
    async ({ callId, options = {} }, callback) => {
      try {
        if (!socket.user || !socket.user._id) {
          return callback({ success: false, error: "User not authenticated" });
        }

        const userId = socket.user._id;
        const recordingService = require("../../services/recording.service");

        // Find the call
        const call = await Call.findById(callId);
        if (!call) {
          return callback({ success: false, error: "Call not found" });
        }

        // Check if user is broadcaster
        if (
          !call.broadcasters ||
          !call.broadcasters.some((id) => id.toString() === userId.toString())
        ) {
          return callback({
            success: false,
            error: "Only broadcasters can start recording",
          });
        }

        // ✅ Check recording permission using Call.callSettings
        const hasRecordingPermission = await checkCallPermission(
          userId.toString(),
          callId,
          "recording"
        );
        if (!hasRecordingPermission) {
          logger.warn("Recording permission denied", {
            userId: userId.toString(),
            callId,
          });
          return callback({
            success: false,
            error: "You don't have permission to record this call",
          });
        }

        // Check if already recording (check both database and active recordings)
        const existingRecording = await recordingService.getRecordingInfo(
          callId
        );
        const isActiveRecording = recordingManager.isRecording(callId);

        if (
          (existingRecording && existingRecording.status === "recording") ||
          isActiveRecording
        ) {
          return callback({
            success: false,
            error: "Recording already in progress",
          });
        }

        const recording = await recordingService.startStreamRecording(
          callId,
          call.room,
          userId,
          options
        );

        // ✅ Start actual recording with MediaSoup
        try {
          // Use call.room (Room ID) instead of callId
          const roomId = call.room?.toString() || callId.toString();
          const room = roomManager.getRoom(roomId);
          if (room) {
            await recordingManager.startRecording(callId, room, {
              recordingId: recording._id,
              type: "stream",
              format: options.format || "mp4",
              resolution: options.resolution || { width: 1920, height: 1080 },
              bitrate: options.bitrate || 5000,
              fps: options.fps || 30,
            });
          } else {
            logger.warn(
              `Room not found for recording: ${roomId} (callId: ${callId})`
            );
          }
        } catch (recordingError) {
          logger.error("Error starting MediaSoup recording:", recordingError);
          // Continue even if recording fails - metadata is already saved
        }

        // Notify all viewers
        io.to(callId.toString()).emit("streamRecordingStarted", {
          callId,
          recordingId: recording._id,
          broadcaster: userId,
        });

        callback({ success: true, recording });
      } catch (error) {
        logger.error("Error starting stream recording:", error);
        callback({ success: false, error: error.message });
      }
    }
  );

  /**
   * ✅ Stop recording a stream
   */
  socket.on("stopStreamRecording", async ({ callId }, callback) => {
    try {
      if (!socket.user || !socket.user._id) {
        return callback({ success: false, error: "User not authenticated" });
      }

      const userId = socket.user._id;
      const recordingService = require("../../services/recording.service");

      // Find the call
      const call = await Call.findById(callId);
      if (!call) {
        return callback({ success: false, error: "Call not found" });
      }

      const hasTransferPermission = await checkCallPermission(
        userId,
        call._id,
        "callTransfer"
      );
      if (!hasTransferPermission) {
        callTelemetryCounters.permissionDenied += 1;
        return callback({
          success: false,
          code: "CALL_TRANSFER_PERMISSION_DENIED",
          error: "You are not allowed to transfer this call",
        });
      }

      // Check if user is broadcaster
      if (
        !call.broadcasters ||
        !call.broadcasters.some((id) => id.toString() === userId.toString())
      ) {
        return callback({
          success: false,
          error: "Only broadcasters can stop recording",
        });
      }

      // ✅ Stop actual MediaSoup recording first
      let recordingResult = null;
      try {
        if (recordingManager.isRecording(callId)) {
          recordingResult = await recordingManager.stopRecording(callId);
          logger.callEvent("MediaSoup stream recording stopped", {
            callId,
            filePath: recordingResult?.filePath,
            fileSize: recordingResult?.fileSize,
          });
        }
      } catch (recordingError) {
        logger.error(
          "Error stopping MediaSoup stream recording:",
          recordingError
        );
        // Continue to stop metadata recording
      }

      const recording = await recordingService.stopRecording(callId);

      // Notify all viewers
      io.to(callId.toString()).emit("streamRecordingStopped", {
        callId,
        recordingId: recording._id,
      });

      callback({ success: true, recording });
    } catch (error) {
      logger.error("Error stopping stream recording:", error);
      callback({ success: false, error: error.message });
    }
  });

  /**
   * ✅ Start recording a call
   */
  socket.on(
    "startCallRecording",
    async ({ callId, options = {} }, callback) => {
      try {
        if (!socket.user || !socket.user._id) {
          return callback({ success: false, error: "User not authenticated" });
        }

        const userId = socket.user._id;
        const recordingService = require("../../services/recording.service");

        // Find the call
        const call = await Call.findById(callId);
        if (!call) {
          return callback({ success: false, error: "Call not found" });
        }

        // Check if user is participant
        const isParticipant =
          call.participants.some(
            (p) => p.user.toString() === userId.toString()
          ) || call.caller.toString() === userId.toString();

        if (!isParticipant) {
          return callback({
            success: false,
            error: "Only call participants can start recording",
          });
        }

        // Check if already recording (check both database and active recordings)
        const existingRecording = await recordingService.getRecordingInfo(
          callId
        );
        const isActiveRecording = recordingManager.isRecording(callId);

        if (
          (existingRecording && existingRecording.status === "recording") ||
          isActiveRecording
        ) {
          return callback({
            success: false,
            error: "Recording already in progress",
          });
        }

        const participants = call.participants.map((p) => p.user);
        const recording = await recordingService.startCallRecording(
          callId,
          call.room,
          call.caller,
          participants,
          call.isVideoCall,
          options
        );

        // ✅ Start actual recording with MediaSoup
        try {
          // Use call.room (Room ID) instead of callId
          const roomId = call.room?.toString() || callId.toString();
          const room = roomManager.getRoom(roomId);
          if (room) {
            // ✅ Use Puppeteer service signature: startRecording(roomId, callId, options)
            await recordingManager.startRecording(roomId, callId, {
              recordingId: recording._id,
              type: "call",
              format: options.format || (call.isVideoCall ? "mp4" : "mp3"),
              resolution: call.isVideoCall
                ? options.resolution || { width: 1280, height: 720 }
                : undefined,
              bitrate: options.bitrate || (call.isVideoCall ? 3000 : 128),
              fps: call.isVideoCall ? options.fps || 30 : undefined,
            });
          } else {
            logger.warn(
              `Room not found for recording: ${roomId} (callId: ${callId})`
            );
          }
        } catch (recordingError) {
          logger.error("Error starting MediaSoup recording:", recordingError);
          // Continue even if recording fails - metadata is already saved
        }

        // Notify all participants
        io.to(callId.toString()).emit("callRecordingStarted", {
          callId,
          recordingId: recording._id,
          startedBy: userId,
        });

        callback({ success: true, recording });
      } catch (error) {
        logger.error("Error starting call recording:", error);
        callback({ success: false, error: error.message });
      }
    }
  );

  /**
   * ✅ Call Waiting: Hold call
   */
  socket.on("holdCall", async ({ roomId }, callback) => {
    try {
      if (!socket.user || !socket.user._id) {
        return callback({ success: false, error: "User not authenticated" });
      }

      const userId = socket.user._id;
      const room = roomManager.getRoom(roomId);

      if (!room) {
        return callback({ success: false, error: "Room not found" });
      }

      const peer = room.getPeer(socket.id);
      if (!peer) {
        return callback({ success: false, error: "Peer not found in room" });
      }

      // Pause all producers for this peer
      const pausedProducers = [];
      for (const [producerId, producer] of peer.producers) {
        if (!producer.paused) {
          producer.pause();
          pausedProducers.push(producerId);
          logger.callEvent(`Producer paused for hold: ${producerId}`, {
            roomId,
            userId,
          });
        }
      }

      // Notify other participants
      socket.to(roomId).emit("callOnHold", {
        roomId,
        heldBy: userId,
        peerId: socket.id,
      });

      logger.callEvent("Call held", {
        roomId,
        userId,
        pausedProducers: pausedProducers.length,
      });

      callback({ success: true, pausedProducers: pausedProducers.length });
    } catch (error) {
      logger.error("Error holding call:", error);
      callback({ success: false, error: error.message });
    }
  });

  /**
   * ✅ Call Waiting: Resume call
   */
  socket.on("resumeCall", async ({ roomId }, callback) => {
    try {
      if (!socket.user || !socket.user._id) {
        return callback({ success: false, error: "User not authenticated" });
      }

      const userId = socket.user._id;
      const room = roomManager.getRoom(roomId);

      if (!room) {
        return callback({ success: false, error: "Room not found" });
      }

      const peer = room.getPeer(socket.id);
      if (!peer) {
        return callback({ success: false, error: "Peer not found in room" });
      }

      // Resume all producers for this peer
      const resumedProducers = [];
      for (const [producerId, producer] of peer.producers) {
        if (producer.paused) {
          producer.resume();
          resumedProducers.push(producerId);
          logger.callEvent(`Producer resumed from hold: ${producerId}`, {
            roomId,
            userId,
          });
        }
      }

      // Notify other participants
      socket.to(roomId).emit("callResumed", {
        roomId,
        resumedBy: userId,
        peerId: socket.id,
      });

      logger.callEvent("Call resumed", {
        roomId,
        userId,
        resumedProducers: resumedProducers.length,
      });

      callback({ success: true, resumedProducers: resumedProducers.length });
    } catch (error) {
      logger.error("Error resuming call:", error);
      callback({ success: false, error: error.message });
    }
  });

  /**
   * ✅ Call Waiting: Notification (when user receives call while in another call)
   */
  socket.on(
    "callWaitingNotification",
    async ({ roomId, currentCallRoomId }) => {
      try {
        if (!socket.user || !socket.user._id) {
          return;
        }

        const userId = socket.user._id;
        logger.callEvent("Call waiting notification", {
          roomId,
          currentCallRoomId,
          userId,
        });

        // إشعار المتصل أن المستخدم في مكالمة أخرى
        // يمكن إضافة logic هنا لإشعار المتصل
      } catch (error) {
        logger.error("Error in callWaitingNotification:", error);
      }
    }
  );

  /**
   * ✅ Stop recording a call
   */
  socket.on("stopCallRecording", async ({ callId }, callback) => {
    try {
      if (!socket.user || !socket.user._id) {
        return callback({ success: false, error: "User not authenticated" });
      }

      const userId = socket.user._id;
      const recordingService = require("../../services/recording.service");

      // Find the call
      const call = await Call.findById(callId);
      if (!call) {
        return callback({ success: false, error: "Call not found" });
      }

      // Check if user is participant
      const isParticipant =
        call.participants.some(
          (p) => p.user.toString() === userId.toString()
        ) || call.caller.toString() === userId.toString();

      if (!isParticipant) {
        return callback({
          success: false,
          error: "Only call participants can stop recording",
        });
      }

      // ✅ Stop metadata recording first (before MediaSoup stops and deletes from Map)
      const recording = await recordingService.stopRecording(callId);

      // ✅ Then stop actual MediaSoup recording
      let recordingResult = null;
      try {
        if (recordingManager.isRecording(callId)) {
          recordingResult = await recordingManager.stopRecording(callId);
          logger.callEvent("MediaSoup recording stopped", {
            callId,
            filePath: recordingResult?.filePath,
            fileSize: recordingResult?.fileSize,
          });
        }
      } catch (recordingError) {
        logger.error("Error stopping MediaSoup recording:", recordingError);
        // Continue - metadata recording already stopped
      }

      // Notify all participants that recording stopped (processing)
      io.to(callId.toString()).emit("callRecordingStopped", {
        callId,
        recordingId: recording._id,
        status: recording.status,
      });

      // ✅ إشعار المشاركين أن التسجيل في حالة معالجة
      const participants = [
        call.caller.toString(),
        ...call.participants.map((p) => p.user.toString()),
      ];

      for (const participantId of participants) {
        const participantSocketIds = await resolveUserSocketIds(participantId);
        participantSocketIds.forEach((participantSocketId) => {
          io.to(participantSocketId).emit("callRecordingProcessing", {
            callId,
            recordingId: recording._id,
            status: "processing",
            message: "Recording is being processed...",
          });
        });
      }

      callback({ success: true, recording });
    } catch (error) {
      logger.error("Error stopping call recording:", error);
      callback({ success: false, error: error.message });
    }
  });

  /**
   * ✅ Get recording info and notify when completed
   */
  socket.on("getRecordingInfo", async ({ recordingId, callId }, callback) => {
    try {
      if (!socket.user || !socket.user._id) {
        return callback({ success: false, error: "User not authenticated" });
      }

      const recordingService = require("../../services/recording.service");
      let recording;

      if (recordingId) {
        const CallRecording = require("../../models/call-recording.model");
        const StreamRecording = require("../../models/stream-recording.model");
        recording =
          (await CallRecording.findById(recordingId)) ||
          (await StreamRecording.findById(recordingId));
      } else if (callId) {
        recording = await recordingService.getRecordingInfo(callId);
      }

      if (!recording) {
        return callback({ success: false, error: "Recording not found" });
      }

      // Check if user is participant
      const userId = socket.user._id;
      const isParticipant =
        recording.caller?.toString() === userId.toString() ||
        recording.broadcaster?.toString() === userId.toString() ||
        (recording.participants || []).some(
          (p) => p.toString() === userId.toString()
        );

      if (!isParticipant) {
        return callback({ success: false, error: "Unauthorized" });
      }

      callback({ success: true, recording });
    } catch (error) {
      logger.error("Error getting recording info:", error);
      callback({ success: false, error: error.message });
    }
  });

  /**
   * ✅ Request Screen Share from another participant
   */
  socket.on(
    "requestScreenShare",
    async ({ callId, targetUserId, allowAll = false }, callback) => {
      try {
        if (!socket.user || !socket.user._id) {
          return callback({ success: false, error: "User not authenticated" });
        }

        const userId = socket.user._id;
        const Call = require("../../models/call.model");
        const call = await Call.findById(callId);

        if (!call) {
          return callback({ success: false, error: "Call not found" });
        }

        // Check if requester is participant
        const isParticipant =
          call.participants.some(
            (p) => p.user.toString() === userId.toString()
          ) || call.caller.toString() === userId.toString();

        if (!isParticipant) {
          return callback({
            success: false,
            error: "Only participants can request screen share",
          });
        }

        // ✅ Check screenShare permission using Call.callSettings
        const hasScreenSharePermission = await checkCallPermission(
          userId.toString(),
          callId,
          "screenShare"
        );
        if (!hasScreenSharePermission) {
          logger.warn("Screen share permission denied", {
            userId: userId.toString(),
            callId,
          });
          return callback({
            success: false,
            error: "You don't have permission to share screen in this call",
          });
        }

        // If allowAll is true, start screen share immediately for the requester
        if (allowAll) {
          // ✅ Fetch full user profile from database if socket.user is incomplete
          let requesterData = {
            _id: userId,
            userName: socket.user.userName,
            firstName: socket.user.firstName,
            lastName: socket.user.lastName,
          };

          // ✅ If firstName or userName is missing, fetch from database
          if (!requesterData.firstName && !requesterData.userName) {
            try {
              const User = require("../../models/user.model");
              const dbUserProfile = await User.findById(userId)
                .select("userName firstName lastName")
                .lean();
              if (dbUserProfile) {
                requesterData = {
                  _id: userId,
                  userName: dbUserProfile.userName || requesterData.userName,
                  firstName: dbUserProfile.firstName || requesterData.firstName,
                  lastName: dbUserProfile.lastName || requesterData.lastName,
                };
                logger.debug("Fetched full user profile for screen share requester", {
                  userId,
                });
              }
            } catch (profileError) {
              logger.warn("Unable to load user profile for screen share requester", {
                userId,
                error: profileError?.message,
              });
            }
          }

          // Emit to all participants that screen share is starting
          io.to(callId.toString()).emit("screenShareRequested", {
            callId,
            requesterId: userId,
            requesterData,
            allowAll: true,
            action: "start",
          });

          return callback({
            success: true,
            message: "Screen share request sent",
          });
        }

        // Send request to specific participant
        const targetSocketIds = await resolveUserSocketIds(targetUserId);
        if (!targetSocketIds.length) {
          return callback({ success: false, error: "Target user not online" });
        }

        // ✅ Fetch full user profile from database if socket.user is incomplete
        let requesterData = {
          _id: userId,
          userName: socket.user.userName,
          firstName: socket.user.firstName,
          lastName: socket.user.lastName,
        };

        // ✅ If firstName or userName is missing, fetch from database
        if (!requesterData.firstName && !requesterData.userName) {
          try {
            const User = require("../../models/user.model");
            const dbUserProfile = await User.findById(userId)
              .select("userName firstName lastName")
              .lean();
            if (dbUserProfile) {
              requesterData = {
                _id: userId,
                userName: dbUserProfile.userName || requesterData.userName,
                firstName: dbUserProfile.firstName || requesterData.firstName,
                lastName: dbUserProfile.lastName || requesterData.lastName,
              };
              logger.debug("Fetched full user profile for screen share requester", {
                userId,
              });
            }
          } catch (profileError) {
            logger.warn("Unable to load user profile for screen share requester", {
              userId,
              error: profileError?.message,
            });
          }
        }

        targetSocketIds.forEach((targetSocketId) => {
          io.to(targetSocketId).emit("screenShareRequested", {
            callId,
            requesterId: userId,
            requesterData,
            allowAll: false,
            action: "request",
          });
        });

        logger.callEvent("Screen share requested", {
          callId,
          requesterId: userId,
          targetUserId,
        });
        callback({ success: true, message: "Screen share request sent" });
      } catch (error) {
        logger.error("Error requesting screen share:", error);
        callback({ success: false, error: error.message });
      }
    }
  );

  /**
   * ✅ Respond to Screen Share Request
   */
  socket.on(
    "respondToScreenShareRequest",
    async ({ callId, requesterId, accepted }, callback) => {
      try {
        if (!socket.user || !socket.user._id) {
          return callback({ success: false, error: "User not authenticated" });
        }

        const userId = socket.user._id;
        const requesterSocketIds = await resolveUserSocketIds(requesterId);
        if (!requesterSocketIds.length) {
          return callback({ success: false, error: "Requester not online" });
        }

        if (accepted) {
          // Notify requester to start screen share
          requesterSocketIds.forEach((requesterSocketId) => {
            io.to(requesterSocketId).emit("screenShareRequestAccepted", {
              callId,
              acceptedBy: userId,
              message: "Screen share request accepted",
            });
          });
        } else {
          // Notify requester that request was rejected
          requesterSocketIds.forEach((requesterSocketId) => {
            io.to(requesterSocketId).emit("screenShareRequestRejected", {
              callId,
              rejectedBy: userId,
              message: "Screen share request rejected",
            });
          });
        }

        logger.callEvent("Screen share request responded", {
          callId,
          requesterId,
          accepted,
          userId,
        });
        callback({ success: true });
      } catch (error) {
        logger.error("Error responding to screen share request:", error);
        callback({ success: false, error: error.message });
      }
    }
  );

  /**
   * ✅ Call Transfer: نقل المكالمة لمستخدم آخر
   */
  socket.on("transferCall", async ({ callId, targetUserId }, callback) => {
    try {
      if (!socket.user || !socket.user._id) {
        return callback({ success: false, error: "User not authenticated" });
      }

      const userId = socket.user._id;

      // Find the call
      const call = await Call.findById(callId);
      if (!call) {
        return callback({ success: false, error: "Call not found" });
      }

      // Check if user is participant
      const isParticipant =
        call.participants.some(
          (p) => p.user.toString() === userId.toString()
        ) || call.caller.toString() === userId.toString();

      if (!isParticipant) {
        return callback({
          success: false,
          error: "Only call participants can transfer the call",
        });
      }

      // Check if target user exists
      const User = require("../../models/user.model");
      const targetUser = await User.findById(targetUserId);
      if (!targetUser) {
        return callback({ success: false, error: "Target user not found" });
      }

      // Check if target user is already in the call
      const isTargetInCall =
        call.participants.some(
          (p) => p.user.toString() === targetUserId.toString()
        ) || call.caller.toString() === targetUserId.toString();

      if (isTargetInCall) {
        return callback({
          success: false,
          error: "Target user is already in the call",
        });
      }

      // Get the room
      const chatRoom = await Room.findById(call.room);
      if (!chatRoom) {
        return callback({ success: false, error: "Room not found" });
      }

      // Check if target user is a member of the room
      const isTargetMember = chatRoom.members.some(
        (m) => m.toString() === targetUserId.toString()
      );

      if (!isTargetMember) {
        return callback({
          success: false,
          error: "Target user is not a member of this room",
        });
      }

      logger.callEvent("Transferring call", {
        callId,
        fromUserId: userId,
        toUserId: targetUserId,
        roomId: call.room,
      });

      // Remove current user from call participants
      call.participants = call.participants.filter(
        (p) => p.user.toString() !== userId.toString()
      );

      // Add target user to call participants
      call.participants.push({
        user: targetUserId,
        joinedAt: new Date(),
      });

      // If current user is the caller, transfer caller to target user
      if (call.caller.toString() === userId.toString()) {
        call.caller = targetUserId;
      }

      await call.save();

      // Get target user's socket ID
      const targetSocketIds = await resolveUserSocketIds(targetUserId);

      // Notify target user about the transfer
      if (targetSocketIds.length) {
        const callerData = {
          _id: userId,
          firstName: socket.user.firstName,
          lastName: socket.user.lastName,
          images: socket.user.images,
          colors: socket.user.colors,
          email: socket.user.email,
          phoneNumber: socket.user.phoneNumber,
        };

        targetSocketIds.forEach((targetSocketId) => {
          io.to(targetSocketId).emit("callTransferred", {
            callId: call._id,
            roomId: call.room,
            callerId: userId,
            callerData,
            isVideoCall: call.isVideoCall,
            transferredBy: userId,
          });
        });

        logger.callEvent("Call transfer notification sent to target user", {
          targetUserId,
          targetSocketIds,
          callId: call._id,
        });
      }

      // Notify other participants about the transfer
      const otherParticipants = call.participants.filter(
        (p) => p.user.toString() !== targetUserId.toString()
      );

      for (const participant of otherParticipants) {
        const participantSocketIds = await resolveUserSocketIds(participant.user);
        participantSocketIds.forEach((participantSocketId) => {
          io.to(participantSocketId).emit("callParticipantTransferred", {
            callId: call._id,
            transferredFrom: userId,
            transferredTo: targetUserId,
          });
        });
      }

      // Remove current user from MediaSoup room
      const room = roomManager.getRoom(call.room.toString());
      if (room) {
        const peer = room.getPeer(socket.id);
        if (peer) {
          await roomManager.removePeerFromRoom(call.room.toString(), socket.id);
          logger.roomEvent(
            `Peer removed from room after transfer: ${socket.id}`,
            {
              roomId: call.room,
              userId,
            }
          );
        }
      }

      logger.callEvent("Call transferred successfully", {
        callId: call._id,
        fromUserId: userId,
        toUserId: targetUserId,
      });

      callback({ success: true, call: call.toObject() });
    } catch (error) {
      logger.error("Error transferring call:", error);
      callback({ success: false, error: error.message });
    }
  });

  /**
   * ✅ Leave Voicemail: ترك رسالة صوتية عند رفض/عدم الرد على المكالمة
   */
  socket.on(
    "leaveVoicemail",
    async (
      { callId, roomId, callerId, filePath, fileUrl, duration },
      callback
    ) => {
      try {
        if (!socket.user || !socket.user._id) {
          return callback({ success: false, error: "User not authenticated" });
        }

        const userId = socket.user._id;

        logger.callEvent("Leaving voicemail", {
          callId,
          roomId,
          callerId,
          leftBy: userId,
          duration,
        });

        // Find or create call record
        let call;
        if (callId) {
          call = await Call.findById(callId);
        } else {
          // If no callId, find active call for this room
          call = await Call.findOne({
            room: roomId,
            endedAt: null,
          }).sort({ startedAt: -1 });
        }

        if (!call) {
          // Create a new call record for the voicemail
          const chatRoom = await Room.findById(roomId);
          if (!chatRoom) {
            return callback({ success: false, error: "Room not found" });
          }

          const isGroupCall = chatRoom.members.length > 2;
          call = new Call({
            room: roomId,
            caller: callerId,
            isVideoCall: false,
            isGroupCall: isGroupCall || false,
            participants: [
              {
                user: userId,
                joinedAt: new Date(),
                leftAt: new Date(),
                duration: 0,
              },
            ],
            status: "missed",
            endedAt: new Date(),
            duration: 0,
          });
        }

        // Add voicemail to call
        call.voicemail = {
          filePath,
          fileUrl,
          duration,
          recordedAt: new Date(),
          leftBy: userId,
        };

        // Update call status if it's still active
        if (!call.endedAt) {
          call.status = "missed";
          call.endedAt = new Date();
        }

        await call.save();

        // Get caller's socket ID to notify them
        const callerSocketIds = await resolveUserSocketIds(callerId);

        // Notify caller about the voicemail
        if (callerSocketIds.length) {
          const leftByUser = await User.findById(userId);
          const leftByName = leftByUser
            ? `${leftByUser.firstName || ""} ${
                leftByUser.lastName || ""
              }`.trim() ||
              leftByUser.userName ||
              "Someone"
            : "Someone";

          callerSocketIds.forEach((callerSocketId) => {
            io.to(callerSocketId).emit("voicemailReceived", {
              callId: call._id,
              roomId,
              leftBy: userId,
              leftByName,
              fileUrl,
              duration,
              recordedAt: call.voicemail.recordedAt,
            });
          });

          // Send push notification
          try {
            const callerUser = await User.findById(callerId);
            if (callerUser?.expoPushToken) {
              const message = `${leftByName} left you a voicemail.`;
              const title = "New Voicemail";
              const data = {
                type: "VOICEMAIL",
                callId: call._id,
                roomId,
                leftBy: userId,
              };
              await sendPushNotification(
                callerUser.expoPushToken,
                message,
                title,
                data
              );
              logger.callEvent("Voicemail push notification sent", {
                callerId,
                leftBy: userId,
                callId: call._id,
              });
            }
          } catch (error) {
            logger.error("Error sending voicemail push notification:", error);
          }

          logger.callEvent("Voicemail notification sent to caller", {
            callerId,
            callerSocketId,
            callId: call._id,
          });
        }

        logger.callEvent("Voicemail saved successfully", {
          callId: call._id,
          roomId,
          leftBy: userId,
          duration,
        });

        callback({ success: true, call: call.toObject() });
      } catch (error) {
        logger.error("Error leaving voicemail:", error);
        callback({ success: false, error: error.message });
      }
    }
  );

  /**
   * ✅ Get stream analytics
   */
  socket.on("getStreamAnalytics", async ({ callId }, callback) => {
    try {
      if (!socket.user || !socket.user._id) {
        return callback({ success: false, error: "User not authenticated" });
      }

      const userId = socket.user._id;
      const analyticsService = require("../../services/analytics.service");

      // Find the call
      const call = await Call.findById(callId);
      if (!call) {
        return callback({ success: false, error: "Call not found" });
      }

      // Check if user is broadcaster
      if (
        !call.broadcasters ||
        !call.broadcasters.some((id) => id.toString() === userId.toString())
      ) {
        return callback({
          success: false,
          error: "Only broadcasters can view analytics",
        });
      }

      const analytics = await analyticsService.getStreamAnalytics(callId);
      callback({ success: true, analytics });
    } catch (error) {
      logger.error("Error getting stream analytics:", error);
      callback({ success: false, error: error.message });
    }
  });

  /**
   * ✅ Get broadcaster analytics summary
   */
  socket.on("getBroadcasterAnalytics", async ({ limit = 10 }, callback) => {
    try {
      if (!socket.user || !socket.user._id) {
        return callback({ success: false, error: "User not authenticated" });
      }

      const userId = socket.user._id;
      const analyticsService = require("../../services/analytics.service");

      const result = await analyticsService.getBroadcasterAnalytics(
        userId,
        limit
      );
      callback({ success: true, ...result });
    } catch (error) {
      logger.error("Error getting broadcaster analytics:", error);
      callback({ success: false, error: error.message });
    }
  });

  /**
   * ✅ Schedule a stream
   */
  socket.on(
    "scheduleStream",
    async (
      { roomId, scheduledAt, title, description, settings = {} },
      callback
    ) => {
      try {
        if (!socket.user || !socket.user._id) {
          return callback({ success: false, error: "User not authenticated" });
        }

        const userId = socket.user._id;
        const StreamSchedule = require("../models/stream-schedule.model");

        // Validate room
        const room = await Room.findById(roomId);
        if (!room) {
          return callback({ success: false, error: "Room not found" });
        }

        // Check if user is member
        const isMember =
          room.members &&
          room.members.some(
            (memberId) => memberId.toString() === userId.toString()
          );
        if (!isMember) {
          return callback({
            success: false,
            error: "You must be a member of this room to schedule a stream",
          });
        }

        // Validate scheduled time (must be in future)
        const scheduledDate = new Date(scheduledAt);
        if (scheduledDate <= new Date()) {
          return callback({
            success: false,
            error: "Scheduled time must be in the future",
          });
        }

        const schedule = new StreamSchedule({
          room: roomId,
          broadcaster: userId,
          title: title || "Scheduled Stream",
          description: description || "",
          scheduledAt: scheduledDate,
          settings: {
            allowAnonymousViewers: settings.allowAnonymousViewers ?? false,
            maxViewers: settings.maxViewers ?? 1000,
            allowViewersToSpeak: settings.allowViewersToSpeak ?? false,
            autoRecord: settings.autoRecord ?? false,
            quality: settings.quality || "high",
          },
        });

        await schedule.save();

        // Notify room members
        io.to(roomId.toString()).emit("streamScheduled", {
          scheduleId: schedule._id,
          roomId,
          broadcaster: userId,
          scheduledAt: scheduledDate,
          title: schedule.title,
        });

        callback({ success: true, schedule });
      } catch (error) {
        logger.error("Error scheduling stream:", error);
        callback({ success: false, error: error.message });
      }
    }
  );

  /**
   * ✅ Get scheduled streams
   */
  socket.on("getScheduledStreams", async ({ roomId, limit = 20 }, callback) => {
    try {
      const StreamSchedule = require("../models/stream-schedule.model");

      const query = roomId
        ? { room: roomId, status: "scheduled" }
        : { status: "scheduled" };
      const schedules = await StreamSchedule.find(query)
        .sort({ scheduledAt: 1 })
        .limit(limit)
        .populate("broadcaster", "userName firstName lastName images")
        .populate("room", "name image");

      callback({ success: true, schedules });
    } catch (error) {
      logger.error("Error getting scheduled streams:", error);
      callback({ success: false, error: error.message });
    }
  });

  /**
   * ✅ Cancel scheduled stream
   */
  socket.on("cancelScheduledStream", async ({ scheduleId }, callback) => {
    try {
      if (!socket.user || !socket.user._id) {
        return callback({ success: false, error: "User not authenticated" });
      }

      const userId = socket.user._id;
      const StreamSchedule = require("../models/stream-schedule.model");

      const schedule = await StreamSchedule.findById(scheduleId);
      if (!schedule) {
        return callback({ success: false, error: "Schedule not found" });
      }

      // Check if user is broadcaster
      if (schedule.broadcaster.toString() !== userId.toString()) {
        return callback({
          success: false,
          error: "Only the broadcaster can cancel the schedule",
        });
      }

      // Check if already started
      if (schedule.status === "live" || schedule.status === "completed") {
        return callback({
          success: false,
          error: "Cannot cancel a stream that has already started or completed",
        });
      }

      await schedule.cancel(userId);

      // Notify room members
      io.to(schedule.room.toString()).emit("streamScheduleCancelled", {
        scheduleId: schedule._id,
        roomId: schedule.room,
        cancelledBy: userId,
      });

      callback({ success: true, schedule });
    } catch (error) {
      logger.error("Error cancelling scheduled stream:", error);
      callback({ success: false, error: error.message });
    }
  });

  /**
   * ✅ Get user's recordings
   */
  socket.on(
    "getUserRecordings",
    async ({ type = "all", limit = 20, offset = 0 }, callback) => {
      try {
        if (!socket.user || !socket.user._id) {
          return callback({ success: false, error: "User not authenticated" });
        }

        const userId = socket.user._id;
        const recordingService = require("../../services/recording.service");

        const recordings = await recordingService.getUserRecordings(
          userId,
          type,
          limit,
          offset
        );
        callback({ success: true, ...recordings });
      } catch (error) {
        logger.error("Error getting user recordings:", error);
        callback({ success: false, error: error.message });
      }
    }
  );

  /**
   * ✅ Group Call: Add participant
   */
  socket.on(
    "addGroupCallParticipant",
    async ({ callId, participantId }, callback) => {
      try {
        if (!socket.user || !socket.user._id) {
          return callback({ success: false, error: "User not authenticated" });
        }

        const userId = socket.user._id;
        const call = await Call.findById(callId);

        if (!call) {
          return callback({ success: false, error: "Call not found" });
        }

        if (!call.isGroupCall) {
          return callback({
            success: false,
            error: "This is not a group call",
          });
        }

        // Check permissions (host or moderator)
        if (!call.isHost(userId) && !call.isModerator(userId)) {
          return callback({
            success: false,
            error: "Only host or moderators can add participants",
          });
        }

        // Check max participants
        const currentParticipants = call.participants.filter(
          (p) => !p.leftAt
        ).length;
        if (currentParticipants >= call.groupCallSettings.maxParticipants) {
          return callback({
            success: false,
            error: "Maximum participants reached",
          });
        }

        await call.addParticipant(participantId);

        // Notify the added participant
        const participantSocketId = await redisClient.get(
          `user:${participantId}`
        );
        if (participantSocketId) {
          io.to(participantSocketId).emit("groupCallInvitation", {
            callId,
            roomId: call.room,
            inviter: userId,
          });
        }

        callback({ success: true, call });
      } catch (error) {
        logger.error("Error adding group call participant:", error);
        callback({ success: false, error: error.message });
      }
    }
  );

  /**
   * ✅ Group Call: Remove participant
   */
  socket.on(
    "removeGroupCallParticipant",
    async ({ callId, participantId }, callback) => {
      try {
        if (!socket.user || !socket.user._id) {
          return callback({ success: false, error: "User not authenticated" });
        }

        const userId = socket.user._id;
        const call = await Call.findById(callId);

        if (!call) {
          return callback({ success: false, error: "Call not found" });
        }

        if (!call.isGroupCall) {
          return callback({
            success: false,
            error: "This is not a group call",
          });
        }

        const isSelfRemoval =
          participantId?.toString?.() === userId?.toString?.();
        const hasKickPermission = await checkCallPermission(
          userId,
          call._id,
          "kickFromCall"
        );
        if (!isSelfRemoval && !hasKickPermission) {
          callTelemetryCounters.permissionDenied += 1;
          return callback({
            success: false,
            code: "CALL_KICK_PERMISSION_DENIED",
            error: "You are not allowed to remove participants",
          });
        }

        await call.removeParticipant(participantId);
        logger.info("AUDIT:removeGroupCallParticipant", {
          callId: String(callId),
          participantId: String(participantId),
          actorUserId: String(userId),
          selfRemoval: Boolean(isSelfRemoval),
        });

        // Notify the removed participant
        const participantSocketId = await redisClient.get(
          `user:${participantId}`
        );
        if (participantSocketId) {
          io.to(participantSocketId).emit("groupCallParticipantRemoved", {
            callId,
            removedBy: userId,
          });
        }

        callback({ success: true, call });
      } catch (error) {
        logger.error("Error removing group call participant:", error);
        callback({ success: false, error: error.message });
      }
    }
  );

  /**
   * ✅ Group Call: Mute all participants (host/moderator only)
   */
  socket.on("muteAllGroupCallParticipants", async ({ callId }, callback) => {
    try {
      if (!socket.user || !socket.user._id) {
        return callback({ success: false, error: "User not authenticated" });
      }

      const userId = socket.user._id;
      const call = await Call.findById(callId);

      if (!call || !call.isGroupCall) {
        return callback({
          success: false,
          error: "Call not found or not a group call",
        });
      }

      const hasMutePermission = await checkCallPermission(
        userId,
        call._id,
        "muteOthers"
      );
      if (!hasMutePermission) {
        callTelemetryCounters.permissionDenied += 1;
        return callback({
          success: false,
          code: "CALL_MUTE_OTHERS_PERMISSION_DENIED",
          error: "You are not allowed to mute all participants",
        });
      }

      const room = roomManager.getRoom(call.room.toString());
      if (room) {
        const peers = room.getOtherPeers();
        peers.forEach((peer) => {
          // Mute audio producer if exists
          const audioProducer = Array.from(peer.producers.values()).find(
            (p) => p.kind === "audio"
          );
          if (audioProducer) {
            audioProducer.pause();
            io.to(peer.id).emit("participantMuted", {
              callId,
              mutedBy: userId,
            });
          }
        });
      }

      callback({ success: true });
      logger.info("AUDIT:muteAllGroupCallParticipants", {
        callId: String(callId),
        actorUserId: String(userId),
      });
    } catch (error) {
      logger.error("Error muting all group call participants:", error);
      callback({ success: false, error: error.message });
    }
  });

  /**
   * ✅ Group Call: Set moderator
   */
  socket.on(
    "setGroupCallModerator",
    async ({ callId, participantId, isModerator }, callback) => {
      try {
        if (!socket.user || !socket.user._id) {
          return callback({ success: false, error: "User not authenticated" });
        }

        const userId = socket.user._id;
        const call = await Call.findById(callId);

        if (!call || !call.isGroupCall) {
          return callback({
            success: false,
            error: "Call not found or not a group call",
          });
        }

        // Only host can set moderators
        if (!call.isHost(userId)) {
          callTelemetryCounters.permissionDenied += 1;
          return callback({
            success: false,
            code: "CALL_MODERATOR_PERMISSION_DENIED",
            error: "Only host can set moderators",
          });
        }

        if (isModerator) {
          if (
            !call.groupCallSettings.moderators.some(
              (id) => id.toString() === participantId.toString()
            )
          ) {
            call.groupCallSettings.moderators.push(participantId);
          }
        } else {
          call.groupCallSettings.moderators =
            call.groupCallSettings.moderators.filter(
              (id) => id.toString() !== participantId.toString()
            );
        }

        await call.save();
        logger.info("AUDIT:setGroupCallModerator", {
          callId: String(callId),
          participantId: String(participantId),
          actorUserId: String(userId),
          isModerator: Boolean(isModerator),
        });

        // Notify the participant
        const participantSocketId = await redisClient.get(
          `user:${participantId}`
        );
        if (participantSocketId) {
          io.to(participantSocketId).emit("groupCallModeratorStatusChanged", {
            callId,
            isModerator,
          });
        }

        callback({ success: true, call });
      } catch (error) {
        logger.error("Error setting group call moderator:", error);
        callback({ success: false, error: error.message });
      }
    }
  );

  // ✅ Raise Hand (Group Calls)
  socket.on("raiseHand", async ({ callId, roomId }, callback) => {
    try {
      const userId = socket.user._id;

      if (!callId || !roomId) {
        return callback({
          success: false,
          error: "Call ID and Room ID are required",
        });
      }

      const call = await Call.findById(callId).populate("room");
      if (!call) {
        return callback({
          success: false,
          error: "Call not found",
        });
      }

      // Check if user is a participant
      const isParticipant = call.participants.some(
        (p) => p.user.toString() === userId.toString() && !p.leftAt
      );

      if (!isParticipant) {
        return callback({
          success: false,
          error: "You are not a participant in this call",
        });
      }

      // Add user to raisedHands if not already there
      if (!call.raisedHands.some((id) => id.toString() === userId.toString())) {
        call.raisedHands.push(userId);
        await call.save();
      }

      // Get user data
      const user = await User.findById(userId).select(
        "firstName lastName images email phoneNumber colors"
      );
      const userData = {
        _id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        images: user.images,
        email: user.email,
        phoneNumber: user.phoneNumber,
        colors: user.colors,
      };

      // Notify all participants in the room
      io.to(roomId).emit("handRaised", {
        callId,
        roomId,
        userId,
        userData,
      });

      // Notify moderators and host specifically
      const moderators = [
        ...(call.groupCallSettings?.moderators || []),
        ...(call.groupCallSettings?.host ? [call.groupCallSettings.host] : []),
      ];

      moderators.forEach(async (moderatorId) => {
        if (moderatorId.toString() !== userId.toString()) {
          const moderatorSocketId = await redisClient.get(
            `user:${moderatorId}`
          );
          if (moderatorSocketId) {
            io.to(moderatorSocketId).emit("participantRaisedHand", {
              callId,
              roomId,
              userId,
              userData,
            });
          }
        }
      });

      callback({ success: true, call });
    } catch (error) {
      logger.error("Error raising hand:", error);
      callback({ success: false, error: error.message });
    }
  });

  // ✅ Lower Hand (Group Calls)
  socket.on("lowerHand", async ({ callId, roomId }, callback) => {
    try {
      const userId = socket.user._id;

      if (!callId || !roomId) {
        return callback({
          success: false,
          error: "Call ID and Room ID are required",
        });
      }

      const call = await Call.findById(callId).populate("room");
      if (!call) {
        return callback({
          success: false,
          error: "Call not found",
        });
      }

      // Remove user from raisedHands
      call.raisedHands = call.raisedHands.filter(
        (id) => id.toString() !== userId.toString()
      );
      await call.save();

      // Notify all participants in the room
      io.to(roomId).emit("handLowered", {
        callId,
        roomId,
        userId,
      });

      callback({ success: true, call });
    } catch (error) {
      logger.error("Error lowering hand:", error);
      callback({ success: false, error: error.message });
    }
  });

  // Advanced moderation: lock/unlock participant speaking
  socket.on(
    "setParticipantSpeakingLock",
    async ({ callId, participantId, locked }, callback) => {
      try {
        const userId = socket.user?._id;
        if (!callId || !participantId) {
          return callback({
            success: false,
            error: "Call ID and participant ID are required",
          });
        }

        const call = await Call.findById(callId);
        if (!call) {
          return callback({ success: false, error: "Call not found" });
        }

        const hasPermission = await checkCallPermission(
          userId,
          call._id,
          "muteOthers"
        );
        if (!hasPermission) {
          callTelemetryCounters.permissionDenied += 1;
          return callback({
            success: false,
            code: "CALL_MUTE_OTHERS_PERMISSION_DENIED",
            error: "You are not allowed to lock participant speaking",
          });
        }

        const participantIdStr = participantId?.toString?.() || String(participantId || "");
        const lockExists = (call.speakingLocks || []).some(
          (id) => id?.toString?.() === participantIdStr
        );
        if (locked && !lockExists) {
          call.speakingLocks.push(participantId);
        }
        if (!locked && lockExists) {
          call.speakingLocks = (call.speakingLocks || []).filter(
            (id) => id?.toString?.() !== participantIdStr
          );
        }

        await call.save();
        const roomIdToEmit = call.room?.toString?.() || null;
        if (roomIdToEmit) {
          io.to(roomIdToEmit).emit("participantSpeakingLockUpdated", {
            callId: call._id,
            participantId: participantIdStr,
            locked: Boolean(locked),
            updatedBy: userId?.toString?.() || String(userId || ""),
          });
        }
        callTelemetryCounters.moderationActions += 1;
        logger.info("AUDIT:setParticipantSpeakingLock", {
          callId: String(callId),
          participantId: participantIdStr,
          actorUserId: userId?.toString?.() || String(userId || ""),
          locked: Boolean(locked),
        });

        callback({
          success: true,
          callId: call._id,
          participantId: participantIdStr,
          locked: Boolean(locked),
        });
      } catch (error) {
        logger.error("Error setting participant speaking lock:", error);
        callback({ success: false, error: error.message });
      }
    }
  );

  // Advanced moderation: update hand-raise priority
  socket.on(
    "setParticipantHandRaisePriority",
    async ({ callId, participantId, priority }, callback) => {
      try {
        const userId = socket.user?._id;
        if (!callId || !participantId) {
          return callback({
            success: false,
            error: "Call ID and participant ID are required",
          });
        }

        const call = await Call.findById(callId);
        if (!call) {
          return callback({ success: false, error: "Call not found" });
        }

        const hasPermission = await checkCallPermission(
          userId,
          call._id,
          "muteOthers"
        );
        if (!hasPermission) {
          callTelemetryCounters.permissionDenied += 1;
          return callback({
            success: false,
            code: "CALL_MUTE_OTHERS_PERMISSION_DENIED",
            error: "You are not allowed to prioritize raised hands",
          });
        }

        const participantIdStr = participantId?.toString?.() || String(participantId || "");
        const normalizedPriority = Number.isFinite(Number(priority))
          ? Number(priority)
          : 0;
        const existingIndex = (call.handRaisePriorities || []).findIndex(
          (entry) => entry?.user?.toString?.() === participantIdStr
        );
        if (existingIndex >= 0) {
          call.handRaisePriorities[existingIndex].priority = normalizedPriority;
        } else {
          call.handRaisePriorities.push({
            user: participantId,
            priority: normalizedPriority,
          });
        }
        await call.save();

        const roomIdToEmit = call.room?.toString?.() || null;
        if (roomIdToEmit) {
          io.to(roomIdToEmit).emit("participantHandRaisePriorityUpdated", {
            callId: call._id,
            participantId: participantIdStr,
            priority: normalizedPriority,
            updatedBy: userId?.toString?.() || String(userId || ""),
          });
        }
        callTelemetryCounters.moderationActions += 1;
        logger.info("AUDIT:setParticipantHandRaisePriority", {
          callId: String(callId),
          participantId: participantIdStr,
          actorUserId: userId?.toString?.() || String(userId || ""),
          priority: normalizedPriority,
        });

        callback({
          success: true,
          callId: call._id,
          participantId: participantIdStr,
          priority: normalizedPriority,
        });
      } catch (error) {
        logger.error("Error setting hand-raise priority:", error);
        callback({ success: false, error: error.message });
      }
    }
  );

  // ✅ Update In-Call Settings Handler - Updates Call.callSettings
  // Only call initiator (caller) or users with canModifyCallSettings permission can modify
  socket.on("getCallSettings", async ({ callId, roomId }, callback) => {
    try {
      let call = null;
      if (callId) {
        call = await Call.findById(callId).select("_id room callSettings endedAt");
      } else if (roomId) {
        call = await Call.findOne({
          room: roomId,
          endedAt: null,
        })
          .sort({ startedAt: -1 })
          .select("_id room callSettings endedAt");
      }

      if (!call || call?.endedAt) {
        return callback?.({ success: false, error: "Active call not found" });
      }

      callback?.({
        success: true,
        callId: call._id,
        roomId: call.room,
        callSettings: call.callSettings || {},
      });
    } catch (error) {
      logger.error("Error in getCallSettings:", error);
      callback?.({ success: false, error: error.message });
    }
  });

  socket.on("getRoomCallSettings", async ({ roomId }, callback) => {
    try {
      if (!roomId) {
        return callback?.({ success: false, error: "roomId is required" });
      }

      const room = await Room.findById(roomId)
        .select("_id members callSettings hasActiveCall")
        .lean();

      if (!room) {
        return callback?.({ success: false, error: "Room not found" });
      }

      const isMember = (room.members || []).some(
        (memberId) => String(memberId) === String(socket.user?._id)
      );
      if (!isMember) {
        return callback?.({ success: false, error: "Not a room member" });
      }

      callback?.({
        success: true,
        roomId: room._id,
        hasActiveCall: !!room.hasActiveCall,
        callSettings: room.callSettings || {},
      });
    } catch (error) {
      logger.error("Error in getRoomCallSettings:", error);
      callback?.({ success: false, error: error.message });
    }
  });

  socket.on("updateCallSettings", async ({ callId, roomId, callSettings, userId }) => {
    try {
      // Validate input
      if (!callSettings || !userId || (!callId && !roomId)) {
        logger.error("Invalid call settings update data", { callId, roomId, callSettings, userId });
        return;
      }

      // Find the active call
      let call;
      if (callId) {
        call = await Call.findById(callId);
      } else {
        // Find active call in the room
        call = await Call.findOne({
          room: roomId,
          endedAt: null,
        }).sort({ startedAt: -1 });
      }

      if (!call) {
        logger.error("Call not found for settings update", { callId, roomId, userId });
        return;
      }

      // ✅ Check if user is the call initiator (caller)
      const userIdStr = userId?.toString();
      const isCaller = call.caller?.toString() === userIdStr;
      
      // Get room for permission check
      const room = await Room.findById(call.room)
        .select("roles user adminPermissions isGroup callSettings")
        .lean();
      
      // ✅ Check if user is room owner
      const isRoomOwner = room?.user?.toString() === userIdStr;
      
      // Group policy: room owner settings are authoritative.
      // - Group rooms: only room owner or delegated canModifyCallSettings admins.
      // - Non-group: caller/room-owner can modify.
      let hasPermission = room?.isGroup ? isRoomOwner : (isCaller || isRoomOwner);

      if (!hasPermission && room?.isGroup) {
        const { checkAdminPermission } = require("../../utils/permissions");
        hasPermission = await checkAdminPermission(userId, call.room, "canModifyCallSettings");
      }
      
      if (!hasPermission) {
        logger.warn("User is not authorized to modify call settings", { 
          callId: call._id, 
          userId,
          caller: call.caller?.toString(),
        });
        socket.emit("callSettingsError", {
          error: room?.isGroup
            ? "Only room owner or authorized admins can modify call settings"
            : "Only the call initiator or authorized users can modify settings",
          code: "PERMISSION_DENIED",
        });
        return;
      }

      const mergedCallSettingsInput = {
        ...(call.callSettings || {}),
        ...(callSettings || {}),
      };
      const mergedRoomSettingsInput = {
        ...(room?.callSettings || {}),
        ...(callSettings || {}),
      };

      // Validate that all settings are arrays
      const validatedSettings = {};
      
      for (const [key, value] of Object.entries(mergedCallSettingsInput)) {
        if (key.endsWith("AllowedUsers") || key.endsWith("ExceptUsers")) {
          validatedSettings[key] = Array.isArray(value)
            ? value
            : value
              ? [value]
              : [];
        } else {
          // Ensure value is an array
          const arrayValue = Array.isArray(value) ? value : [value];
          // Validate each item in array
          const validArray = arrayValue.filter(item => VALID_PERMISSION_VALUES.includes(item));
          if (validArray.length > 0) {
            validatedSettings[key] = validArray;
          }
        }
      }

      // Update Call.callSettings in database
      await Call.findByIdAndUpdate(call._id, {
        $set: { callSettings: validatedSettings },
      });
      const validatedRoomSettings = {};
      for (const [key, value] of Object.entries(mergedRoomSettingsInput)) {
        if (key.endsWith("AllowedUsers") || key.endsWith("ExceptUsers")) {
          validatedRoomSettings[key] = Array.isArray(value)
            ? value
            : value
              ? [value]
              : [];
        } else {
          const arrayValue = Array.isArray(value) ? value : [value];
          const validArray = arrayValue.filter((item) =>
            VALID_PERMISSION_VALUES.includes(item)
          );
          if (validArray.length > 0) {
            validatedRoomSettings[key] = validArray;
          }
        }
      }
      await Room.findByIdAndUpdate(call.room, {
        $set: { callSettings: validatedRoomSettings },
      });

      // Get updated call
      const updatedCall = await Call.findById(call._id).lean();

      // Broadcast to all participants in the call (using call-specific room)
      const callRoomName = `call:${call._id}`;
      const callRoomSize = io?.sockets?.adapter?.rooms?.get?.(callRoomName)?.size || 0;
      const chatRoomName = call.room?.toString?.() || String(call.room || "");
      const chatRoomSize = io?.sockets?.adapter?.rooms?.get?.(chatRoomName)?.size || 0;
      io.to(callRoomName).emit("callSettingsUpdated", {
        callId: call._id,
        callSettings: validatedSettings,
        updatedBy: userId,
      });

      // Also broadcast to room for those not in call-specific room
      io.to(chatRoomName).emit("callSettingsUpdated", {
        callId: call._id,
        callSettings: validatedSettings,
        updatedBy: userId,
      });

      logger.callEvent("Call settings updated", {
        callId: call._id,
        roomId: call.room,
        userId,
        callSettings: validatedSettings,
      });
    } catch (error) {
      logger.error("Error updating call settings:", error);
    }
  });

  // ✅ Assign Call Admin Handler
  socket.on("assignCallAdmin", async ({ callId, targetUserId, userId }) => {
    try {
      if (!callId || !targetUserId || !userId) {
        logger.error("Invalid assign call admin data", { callId, targetUserId, userId });
        return;
      }

      const call = await Call.findById(callId);
      if (!call) {
        socket.emit("callAdminError", { error: "Call not found" });
        return;
      }

      // Only caller can assign admins
      if (call.caller?.toString() !== userId) {
        socket.emit("callAdminError", { error: "Only the call initiator can assign admins" });
        return;
      }

      // Add to callAdmins
      await call.addCallAdmin(targetUserId);

      // Broadcast update
      const callRoomName = `call:${call._id}`;
      io.to(callRoomName).emit("callAdminAssigned", {
        callId: call._id,
        targetUserId,
        assignedBy: userId,
      });

      logger.callEvent("Call admin assigned", { callId, targetUserId, assignedBy: userId });
    } catch (error) {
      logger.error("Error assigning call admin:", error);
    }
  });

  // ✅ Remove Call Admin Handler
  socket.on("removeCallAdmin", async ({ callId, targetUserId, userId }) => {
    try {
      if (!callId || !targetUserId || !userId) {
        logger.error("Invalid remove call admin data", { callId, targetUserId, userId });
        return;
      }

      const call = await Call.findById(callId);
      if (!call) {
        socket.emit("callAdminError", { error: "Call not found" });
        return;
      }

      // Only caller can remove admins
      if (call.caller?.toString() !== userId) {
        socket.emit("callAdminError", { error: "Only the call initiator can remove admins" });
        return;
      }

      // Remove from callAdmins
      await call.removeCallAdmin(targetUserId);

      // Broadcast update
      const callRoomName = `call:${call._id}`;
      io.to(callRoomName).emit("callAdminRemoved", {
        callId: call._id,
        targetUserId,
        removedBy: userId,
      });

      logger.callEvent("Call admin removed", { callId, targetUserId, removedBy: userId });
    } catch (error) {
      logger.error("Error removing call admin:", error);
    }
  });

  // ✅ Update Room Chat Settings Handler - Updates Room.chatSettings
  // Only owner or users with canModifyChatSettings permission can modify
  socket.on("updateChatSettings", async ({ roomId, chatSettings, userId }) => {
    try {
      // Validate input
      if (!roomId || !chatSettings || !userId) {
        logger.error("Invalid chat settings update data", { roomId, chatSettings, userId });
        return;
      }

      // Verify user is in the room
      const room = await Room.findById(roomId);
      if (!room) {
        logger.error("Room not found for chat settings update", { roomId, userId });
        return;
      }

      const isMember = room.members.some(
        (member) => member._id?.toString() === userId?.toString() || member?.toString() === userId?.toString()
      );
      if (!isMember) {
        logger.error("User is not a member of the room", { roomId, userId });
        return;
      }

      // ✅ Check if user is owner
      const userIdStr = userId?.toString();
      const isOwner = room.user?.toString() === userIdStr;
      
      // For group chats, check canModifyChatSettings permission
      if (room.isGroup && !isOwner) {
        const { checkAdminPermission } = require("../../utils/permissions");
        const hasPermission = await checkAdminPermission(userId, roomId, "canModifyChatSettings");
        
        if (!hasPermission) {
          logger.warn("User is not authorized to modify room chat settings", { roomId, userId });
          socket.emit("chatSettingsError", {
            error: "Only the owner or authorized admins can modify chat settings",
            code: "PERMISSION_DENIED",
          });
          return;
        }
      }

      // Validate that all settings are arrays
      const validatedSettings = {};
      
      for (const [key, value] of Object.entries(chatSettings)) {
        if (key.endsWith("AllowedUsers") || key.endsWith("ExceptUsers")) {
          // Keep allowedUsers and exceptUsers arrays as is
          validatedSettings[key] = value;
        } else {
          // Ensure value is an array
          const arrayValue = Array.isArray(value) ? value : [value];
          // Validate each item in array
          const validArray = arrayValue.filter(item => VALID_PERMISSION_VALUES.includes(item));
          if (validArray.length > 0) {
            validatedSettings[key] = validArray;
          }
        }
      }

      // ✅ Update Room.chatSettings in database (not User.privacySettings)
      await Room.findByIdAndUpdate(roomId, {
        $set: { chatSettings: validatedSettings },
      });

      // Get updated room
      const updatedRoom = await Room.findById(roomId)
        .select("_id chatSettings")
        .lean();

      logger.info("Room chat settings updated in database:", {
        roomId,
          chatSettings: validatedSettings,
      });

      // Broadcast to all participants in the room (real-time update)
      const roomIdString = roomId?.toString ? roomId.toString() : String(roomId);
      
      io.to(roomIdString).emit("chatSettingsUpdated", {
        roomId,
        chatSettings: validatedSettings,
        updatedBy: userId,
      });
      
      logger.callEvent("Room chat settings updated", {
        roomId,
        userId,
        chatSettings: validatedSettings,
      });
    } catch (error) {
      logger.error("Error updating chat settings:", error);
    }
  });

  // ✅ Update User's Default Call Settings Handler
  // Updates User.privacySettings.defaultCallSettings
  socket.on("updateDefaultCallSettings", async ({ callSettings, userId, roomId }) => {
    try {
      if (!callSettings || !userId) {
        logger.error("Invalid default call settings update data", { callSettings, userId });
        return;
      }

      const user = await User.findById(userId)
        .select("privacySettings.defaultCallSettings")
        .lean();
      const existingDefaultSettings =
        user?.privacySettings?.defaultCallSettings || {};
      const mergedDefaultSettingsInput = {
        ...existingDefaultSettings,
        ...(callSettings || {}),
      };

      // Validate that all settings are arrays
      const validatedSettings = {};
      
      for (const [key, value] of Object.entries(mergedDefaultSettingsInput)) {
        if (key.endsWith("AllowedUsers") || key.endsWith("ExceptUsers")) {
          validatedSettings[key] = Array.isArray(value)
            ? value
            : value
              ? [value]
              : [];
        } else {
          const arrayValue = Array.isArray(value) ? value : [value];
          const validArray = arrayValue.filter(item => VALID_PERMISSION_VALUES.includes(item));
          if (validArray.length > 0) {
            validatedSettings[key] = validArray;
          }
        }
      }

      // Update user's default call settings
      await User.findByIdAndUpdate(userId, {
        $set: {
          "privacySettings.defaultCallSettings": validatedSettings,
        },
      });

      logger.info("Default call settings updated", { userId, callSettings: validatedSettings });

      // Notify the user's other connected clients
      socket.emit("defaultCallSettingsUpdated", {
        callSettings: validatedSettings,
      });

      // Also support room-level pre-call settings sync (outside active call)
      if (roomId) {
        const room = await Room.findById(roomId)
          .select("user isGroup callSettings")
          .lean();
        if (room?.isGroup) {
          const isRoomOwner = room.user?.toString() === userId?.toString();
          let hasPermission = isRoomOwner;
          if (!hasPermission) {
            const { checkAdminPermission } = require("../../utils/permissions");
            hasPermission = await checkAdminPermission(
              userId,
              roomId,
              "canModifyCallSettings"
            );
          }

          if (hasPermission) {
            const existingRoomSettings = room?.callSettings || {};
            const mergedRoomSettingsInput = {
              ...existingRoomSettings,
              ...validatedSettings,
            };
            const validatedRoomSettings = {};
            for (const [key, value] of Object.entries(mergedRoomSettingsInput)) {
              if (key.endsWith("AllowedUsers") || key.endsWith("ExceptUsers")) {
                validatedRoomSettings[key] = Array.isArray(value)
                  ? value
                  : value
                    ? [value]
                    : [];
              } else {
                const arrayValue = Array.isArray(value) ? value : [value];
                const validArray = arrayValue.filter((item) =>
                  VALID_PERMISSION_VALUES.includes(item)
                );
                if (validArray.length > 0) {
                  validatedRoomSettings[key] = validArray;
                }
              }
            }
            await Room.findByIdAndUpdate(roomId, {
              $set: { callSettings: validatedRoomSettings },
            });

            io.to(String(roomId)).emit("roomCallSettingsUpdated", {
              roomId,
              callSettings: validatedRoomSettings,
              updatedBy: userId,
            });
          }
        }
      }
    } catch (error) {
      logger.error("Error updating default call settings:", error);
    }
  });

  // ✅ Update User's Default Chat Settings Handler
  // Updates User.privacySettings.defaultChatSettings
  socket.on("updateDefaultChatSettings", async ({ chatSettings, userId }) => {
    try {
      if (!chatSettings || !userId) {
        logger.error("Invalid default chat settings update data", { chatSettings, userId });
        return;
      }

      // Validate that all settings are arrays
      const validatedSettings = {};
      
      for (const [key, value] of Object.entries(chatSettings)) {
        if (key.endsWith("AllowedUsers") || key.endsWith("ExceptUsers")) {
          // Keep allowedUsers and exceptUsers arrays as is
          validatedSettings[key] = value;
        } else {
          const arrayValue = Array.isArray(value) ? value : [value];
          const validArray = arrayValue.filter(item => VALID_PERMISSION_VALUES.includes(item));
          if (validArray.length > 0) {
            validatedSettings[key] = validArray;
          }
        }
      }

      // Update user's default chat settings
      await User.findByIdAndUpdate(userId, {
        $set: {
          "privacySettings.defaultChatSettings": validatedSettings,
        },
      });

      logger.info("Default chat settings updated", { userId, chatSettings: validatedSettings });

      // Notify the user's other connected clients
      socket.emit("defaultChatSettingsUpdated", {
        chatSettings: validatedSettings,
      });
    } catch (error) {
      logger.error("Error updating default chat settings:", error);
    }
  });

  // ✅ Update Room Call Settings Handler (Room-level settings) - DEPRECATED
  // Room-level call settings moved to Call model
  socket.on("updateRoomCallSettings", async ({ roomId, callSettings }) => {
    try {
      // Validate input
      if (!roomId || !callSettings) {
        logger.error("Invalid room call settings update data", { roomId, callSettings });
        return;
      }

      const userObjectId = new mongoose.Types.ObjectId(socket.user._id);
      const roomObjectId = new mongoose.Types.ObjectId(roomId);

      // Verify user is admin of the room
      const room = await Room.findById(roomObjectId);
      if (!room) {
        logger.error("Room not found for room call settings update", { roomId });
        socket.emit("updateRoomCallSettingsError", {
          message: "Room not found",
        });
        return;
      }

      const userRole = room.roles?.find(
        (role) => role.user.toString() === userObjectId.toString()
      );

      if (!userRole || userRole.role !== "admin") {
        logger.error("User is not admin of the room", { roomId, userId: socket.user._id });
        socket.emit("updateRoomCallSettingsError", {
          message: "Only admins can update room call settings",
        });
        return;
      }

      const existingRoomSettings = room.callSettings || {};
      const mergedRoomSettingsInput = {
        ...existingRoomSettings,
        ...(callSettings || {}),
      };

      // Validate that all settings are arrays
      const validatedSettings = {};
      const validEnums = ["everyone", "admin", "moderator", "friends", "specific", "noOne"];
      
      for (const [key, value] of Object.entries(mergedRoomSettingsInput)) {
        if (key.endsWith("AllowedUsers") || key.endsWith("ExceptUsers")) {
          validatedSettings[key] = Array.isArray(value)
            ? value
            : value
              ? [value]
              : [];
        } else {
          // Ensure value is an array
          const arrayValue = Array.isArray(value) ? value : [value];
          // Validate each item in array
          const validArray = arrayValue.filter(item => validEnums.includes(item));
          if (validArray.length > 0) {
            validatedSettings[key] = validArray;
          }
        }
      }

      // Update room's callSettings in database
      await Room.findByIdAndUpdate(roomObjectId, {
        $set: {
          callSettings: validatedSettings,
        },
      });

      // Broadcast to all members of the room
      for (const member of room.members) {
        const socketIds = await resolveUserSocketIds(member.toString());
        socketIds.forEach((socketId) => {
          io.to(socketId).emit("roomCallSettingsUpdated", {
            roomId,
            callSettings: validatedSettings,
          });
        });
      }

      logger.callEvent("Room call settings updated", {
        roomId,
        userId: socket.user._id,
        callSettings: validatedSettings,
      });
    } catch (error) {
      logger.error("Error updating room call settings:", error);
      socket.emit("updateRoomCallSettingsError", {
        message: "An error occurred while updating room call settings",
      });
    }
  });

  // ✅ Update Room Chat Settings Handler (Room-level settings)
  socket.on("updateRoomChatSettings", async ({ roomId, chatSettings }) => {
    try {
      // Validate input
      if (!roomId || !chatSettings) {
        logger.error("Invalid room chat settings update data", { roomId, chatSettings });
        return;
      }

      const userObjectId = new mongoose.Types.ObjectId(socket.user._id);
      const roomObjectId = new mongoose.Types.ObjectId(roomId);

      // Verify user is admin of the room
      const room = await Room.findById(roomObjectId);
      if (!room) {
        logger.error("Room not found for room chat settings update", { roomId });
        socket.emit("updateRoomChatSettingsError", {
          message: "Room not found",
        });
        return;
      }

      const userRole = room.roles?.find(
        (role) => role.user.toString() === userObjectId.toString()
      );

      if (!userRole || userRole.role !== "admin") {
        logger.error("User is not admin of the room", { roomId, userId: socket.user._id });
        socket.emit("updateRoomChatSettingsError", {
          message: "Only admins can update room chat settings",
        });
        return;
      }

      // Validate that all settings are arrays
      const validatedSettings = {};
      const validEnums = ["everyone", "admin", "moderator", "friends", "specific", "noOne"];
      
      for (const [key, value] of Object.entries(chatSettings)) {
        if (key.endsWith("AllowedUsers")) {
          validatedSettings[key] = value; // Keep allowedUsers as is
        } else {
          // Ensure value is an array
          const arrayValue = Array.isArray(value) ? value : [value];
          // Validate each item in array
          const validArray = arrayValue.filter(item => validEnums.includes(item));
          if (validArray.length > 0) {
            validatedSettings[key] = validArray;
          }
        }
      }

      // Update room's chatSettings in database
      await Room.findByIdAndUpdate(roomObjectId, {
        $set: {
          chatSettings: validatedSettings,
        },
      });

      // Broadcast to all members of the room
      for (const member of room.members) {
        const socketIds = await resolveUserSocketIds(member.toString());
        socketIds.forEach((socketId) => {
          io.to(socketId).emit("roomChatSettingsUpdated", {
            roomId,
            chatSettings: validatedSettings,
          });
        });
      }

      logger.callEvent("Room chat settings updated", {
        roomId,
        userId: socket.user._id,
        chatSettings: validatedSettings,
      });
    } catch (error) {
      logger.error("Error updating room chat settings:", error);
      socket.emit("updateRoomChatSettingsError", {
        message: "An error occurred while updating room chat settings",
      });
    }
  });

  // ✅ Handle call permission request (from non-caller to admin)
  socket.on("requestCallPermission", async ({ roomId, setting, requesterId, requesterName, adminId }) => {
    try {
      if (!roomId || !setting || !requesterId || !adminId) {
        logger.error("Invalid call permission request data", { roomId, setting, requesterId, adminId });
        return;
      }

      // Verify requester is in the room
      const room = await Room.findById(roomId);
      if (!room) {
        logger.error("Room not found for permission request", { roomId, requesterId });
        return;
      }

      const isRequesterMember = room.members.some(
        (member) => member._id?.toString() === requesterId?.toString() || member?.toString() === requesterId?.toString()
      );
      if (!isRequesterMember) {
        logger.error("Requester is not a member of the room", { roomId, requesterId });
        return;
      }

      // Verify admin is in the room and is actually an admin
      const adminRole = room.roles?.find(
        (r) => (r.user?.toString() === adminId?.toString() || r.user?._id?.toString() === adminId?.toString()) && r.role === "admin"
      );
      if (!adminRole) {
        logger.error("Admin not found or not an admin in the room", { roomId, adminId });
        return;
      }

      // Get admin socket
      const adminSocket = Array.from(io.sockets.sockets.values()).find(
        (s) => s.user?._id?.toString() === adminId?.toString()
      );

      if (adminSocket) {
        // Send request to admin
        adminSocket.emit("callPermissionRequest", {
          roomId,
          setting,
          requesterId,
          requesterName,
        });
        logger.callEvent("Call permission request sent to admin", {
          roomId,
          setting,
          requesterId,
          adminId,
        });
      } else {
        logger.error("Admin socket not found", { adminId, roomId });
      }
    } catch (error) {
      logger.error("Error handling call permission request:", error);
    }
  });

  // ✅ Handle call permission grant/deny (from admin)
  socket.on("respondToCallPermissionRequest", async ({ roomId, setting, requesterId, granted }) => {
    try {
      if (!roomId || !setting || !requesterId || granted === undefined) {
        logger.error("Invalid call permission response data", { roomId, setting, requesterId, granted });
        return;
      }

      // Verify admin is in the room and is actually an admin
      const room = await Room.findById(roomId);
      if (!room) {
        logger.error("Room not found for permission response", { roomId });
        return;
      }

      const adminRole = room.roles?.find(
        (r) => (r.user?.toString() === socket.user?._id?.toString() || r.user?._id?.toString() === socket.user?._id?.toString()) && r.role === "admin"
      );
      if (!adminRole) {
        logger.error("User is not an admin", { userId: socket.user?._id, roomId });
        return;
      }

      // Get requester socket
      const requesterSocket = Array.from(io.sockets.sockets.values()).find(
        (s) => s.user?._id?.toString() === requesterId?.toString()
      );

      if (granted) {
        // Grant permission - emit to requester
        if (requesterSocket) {
          requesterSocket.emit("callPermissionGranted", {
            roomId,
            setting,
            requesterId,
          });
          logger.callEvent("Call permission granted", {
            roomId,
            setting,
            requesterId,
            adminId: socket.user?._id,
          });
        }
      } else {
        // Deny permission - emit to requester
        if (requesterSocket) {
          requesterSocket.emit("callPermissionDenied", {
            roomId,
            setting,
            requesterId,
          });
          logger.callEvent("Call permission denied", {
            roomId,
            setting,
            requesterId,
            adminId: socket.user?._id,
          });
        }
      }
    } catch (error) {
      logger.error("Error handling call permission response:", error);
    }
  });
  require("./mediasoup")({ socket, io, redisClient });
};
