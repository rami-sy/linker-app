const mongoose = require("mongoose");
const Call = require("../../../models/call.model");
const logger = require("../../../utils/logger");

function errorCallback(callback, message) {
  callback?.({ success: false, type: "error", error: message, message });
}

function isBroadcaster(call, userId) {
  const uid = String(userId);
  return (call.broadcasters || []).some((id) => String(id) === uid);
}

function findViewerSocket(io, viewerUserId) {
  const uid = String(viewerUserId);
  return Array.from(io.sockets.sockets.values()).find(
    (s) => String(s.user?._id) === uid
  );
}

/**
 * Live stream moderation: kick / ban viewers (broadcaster-only).
 */
module.exports = function registerLiveStreamModerationHandlers({ socket, io }) {
  socket.on("kickLiveStreamViewer", async (args, callback) => {
    try {
      const { callId, viewerUserId } = args || {};
      if (!callId || !viewerUserId) {
        return errorCallback(callback, "callId and viewerUserId are required");
      }

      const call = await Call.findById(callId).lean();
      if (!call?.isLiveStream || !call.liveStreamSettings?.isLive) {
        return errorCallback(callback, "Live stream is not active");
      }

      if (!isBroadcaster(call, socket.user._id)) {
        return errorCallback(callback, "Only broadcasters can kick viewers");
      }

      const viewerSocket = findViewerSocket(io, viewerUserId);
      if (viewerSocket) {
        viewerSocket.emit("liveStreamViewerKicked", {
          callId,
          roomId: call.room,
          reason: "kicked",
        });
        viewerSocket.leave(`call:${callId}`);
      }

      await Call.updateOne(
        { _id: callId, "liveStreamSettings.viewersCount": { $gt: 0 } },
        { $inc: { "liveStreamSettings.viewersCount": -1 } }
      );

      io.to(`call:${callId}`).emit("liveStreamViewerRemoved", {
        callId,
        viewerUserId,
        action: "kick",
      });

      callback?.({ type: "success", success: true, message: "Viewer kicked" });
    } catch (error) {
      logger.error("kickLiveStreamViewer error:", error);
      errorCallback(callback, error.message);
    }
  });

  socket.on("banLiveStreamViewer", async (args, callback) => {
    try {
      const { callId, viewerUserId } = args || {};
      if (!callId || !viewerUserId) {
        return errorCallback(callback, "callId and viewerUserId are required");
      }

      const call = await Call.findById(callId);
      if (!call?.isLiveStream || !call.liveStreamSettings?.isLive) {
        return errorCallback(callback, "Live stream is not active");
      }

      if (!isBroadcaster(call, socket.user._id)) {
        return errorCallback(callback, "Only broadcasters can ban viewers");
      }

      if (!call.liveStreamSettings.bannedViewers) {
        call.liveStreamSettings.bannedViewers = [];
      }

      const viewerOid = new mongoose.Types.ObjectId(viewerUserId);
      if (
        !call.liveStreamSettings.bannedViewers.some(
          (id) => String(id) === String(viewerUserId)
        )
      ) {
        call.liveStreamSettings.bannedViewers.push(viewerOid);
      }

      await call.save();

      const viewerSocket = findViewerSocket(io, viewerUserId);
      if (viewerSocket) {
        viewerSocket.emit("liveStreamViewerKicked", {
          callId,
          roomId: call.room,
          reason: "banned",
        });
        viewerSocket.leave(`call:${callId}`);
      }

      callback?.({ type: "success", success: true, message: "Viewer banned" });
    } catch (error) {
      logger.error("banLiveStreamViewer error:", error);
      errorCallback(callback, error.message);
    }
  });
};
