const messageServices = require("../services/message.services");
const { getRateLimiter } = require("../../middlewares/socketRateLimiter");

module.exports = ({ socket, io, redisClient }) => {
  const rateLimiter = getRateLimiter();
  messageServices.startScheduledMessageDispatcher({ io, redisClient });
  const completedRequests = new Map();
  const inFlightRequests = new Set();

  const resolveRequestId = (args = {}) =>
    args?.requestId || args?.message?.requestId || null;

  const withIdempotency = (handler) => {
    return async (args, callback) => {
      const requestId = resolveRequestId(args);
      if (!requestId) {
        return handler(args, callback);
      }
      const key = String(requestId);
      if (completedRequests.has(key)) {
        if (typeof callback === "function") {
          callback(completedRequests.get(key));
        }
        return;
      }
      if (inFlightRequests.has(key)) {
        if (typeof callback === "function") {
          callback({ type: "queued", requestId: key, message: "Request in progress" });
        }
        return;
      }
      inFlightRequests.add(key);
      const wrappedCallback = (response) => {
        const safeResponse = response || { type: "success", requestId: key };
        completedRequests.set(key, safeResponse);
        if (completedRequests.size > 200) {
          const firstKey = completedRequests.keys().next().value;
          completedRequests.delete(firstKey);
        }
        if (typeof callback === "function") callback(safeResponse);
      };
      try {
        await handler(args, wrappedCallback);
      } finally {
        inFlightRequests.delete(key);
      }
    };
  };

  const withRateLimit = (eventType, handler) => {
    return async (args, callback) => {
      const userId = socket.user?._id?.toString();
      const ip = socket.handshake?.address || socket.conn?.remoteAddress;
      const result = await rateLimiter.checkRateLimit(
        socket.id,
        eventType,
        userId,
        ip
      );

      if (!result.allowed) {
        if (typeof callback === "function") {
          callback({
            type: "error",
            message: result.message || "Rate limit exceeded",
            rateLimitInfo: result,
          });
        } else {
          socket.emit("rateLimitError", {
            event: eventType,
            message: result.message || "Rate limit exceeded",
            rateLimitInfo: result,
          });
        }
        return;
      }

      await handler(args, callback);
    };
  };

  socket.on("joinChat", (args, callback) => {
    messageServices.joinChat({ args, socket, redisClient, callback });
  });

  socket.on(
    "sendMessage",
    withRateLimit("sendMessage", withIdempotency(async (args, callback) => {
      const result = await messageServices.sendMessage({
        args,
        socket,
        io,
        redisClient,
      });
      if (typeof callback === "function") {
        callback(result || { type: "error", message: "Unknown send result" });
      }
    }))
  );

  socket.on("deleteMessage", (args) => {
    messageServices.deleteMessage({ args, socket, io, redisClient });
  });

  socket.on("messageSeen", (args) => {
    messageServices.messageSeen({ args, socket, io, redisClient });
  });

  socket.on(
    "reactToMessage",
    withRateLimit(
      "message",
      withIdempotency(async (args, callback) => {
        const result = await messageServices.reactToMessage({
          args,
          socket,
          io,
          redisClient,
        });
        if (typeof callback === "function") {
          callback(result || { type: "success" });
        }
      })
    )
  );

  socket.on(
    "votePoll",
    withRateLimit("message", async (args, callback) => {
      const result = await messageServices.votePoll({
        args,
        socket,
        io,
        redisClient,
        callback,
      });
      if (typeof callback === "function" && result) {
        callback(result);
      }
    })
  );

  socket.on("deliveredTo", (args) => {
    messageServices.deliveredTo({ args, socket, io, redisClient });
  });

  socket.on("getMessages", (args) => {
    messageServices.getMessages({ args, socket, io, redisClient });
  });

  socket.on("getThreadMessages", (args) => {
    messageServices.getThreadMessages({ args, socket, io, redisClient });
  });

  socket.on(
    "searchRoomMessages",
    withRateLimit("searchRoomMessages", (args, callback) => {
      messageServices.searchRoomMessages({ args, socket, callback });
    })
  );

  socket.on(
    "searchGlobalMessages",
    withRateLimit("searchRoomMessages", (args, callback) => {
      messageServices.searchGlobalMessages({ args, socket, callback });
    })
  );

  socket.on(
    "editMessage",
    withRateLimit("editMessage", withIdempotency((args, callback) => {
      messageServices.editMessage({ args, socket, io, redisClient, callback });
    }))
  );

  socket.on(
    "typing",
    withRateLimit("message", (args, callback) => {
      messageServices.typing({ args, socket, io, redisClient });
      if (typeof callback === "function") {
        callback({ type: "success" });
      }
    })
  );

  socket.on("leaveRoom", (args) => {
    messageServices.leaveRoom({ args, socket, io, redisClient });
  });

  socket.on("clearChat", (args) => {
    messageServices.clearChat({ args, socket, io, redisClient });
  });

  socket.on("deleteChat", (args) => {
    messageServices.deleteChat({ args, socket, io, redisClient });
  });

  socket.on("setPassword", (args, callback) => {
    messageServices.setPassword({ args, socket, io, redisClient }, callback);
  });

  socket.on(
    "getScheduledMessages",
    withRateLimit("getMessages", (args, callback) => {
      messageServices.getScheduledMessages({ args, socket, callback });
    })
  );

  socket.on(
    "cancelScheduledMessage",
    withRateLimit("editMessage", (args, callback) => {
      messageServices.cancelScheduledMessage({ args, socket, callback });
    })
  );

  socket.on(
    "rescheduleScheduledMessage",
    withRateLimit("editMessage", (args, callback) => {
      messageServices.rescheduleScheduledMessage({ args, socket, callback });
    })
  );

  socket.on(
    "getChatSummary",
    withRateLimit("getMessages", (args, callback) => {
      messageServices.getChatSummary({ args, socket, callback });
    })
  );
};
