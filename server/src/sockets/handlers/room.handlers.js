const roomServices = require("../services/room.services");
const { getRateLimiter } = require("../../middlewares/socketRateLimiter");

module.exports = ({ socket, io, redisClient }) => {
  const rateLimiter = getRateLimiter();
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
      handler(args, callback);
    };
  };

  socket.on("getMyRooms", (args, callback) => {
    roomServices.getMyRooms({ args, socket, io, redisClient }, callback);
  });

  socket.on("getOneRoom", (args) => {
    roomServices.getOneRoom({ args, socket, io, redisClient });
  });

  socket.on(
    "updateRoom",
    withRateLimit("updateRoom", (args) => {
      roomServices.updateRoom({ args, socket, io, redisClient });
    })
  );

  socket.on(
    "addMemberToRoom",
    withRateLimit("addMemberToRoom", (args) => {
      roomServices.addMemberToRoom({ args, socket, io, redisClient });
    })
  );

  socket.on(
    "removeMemberFromRoom",
    withRateLimit("removeMemberFromRoom", (args) => {
      roomServices.removeMemberFromRoom({ args, socket, io, redisClient });
    })
  );

  socket.on("exitRoom", (args) => {
    roomServices.exitRoom({ args, socket, io, redisClient });
  });

  socket.on(
    "changeUserRole",
    withRateLimit("changeUserRole", (args) => {
      roomServices.changeUserRole({ args, socket, io, redisClient });
    })
  );

  socket.on(
    "createRoom",
    withRateLimit("createRoom", (args, callback) => {
      roomServices.createRoom({ args, socket, io, redisClient }, callback);
    })
  );

  // ✅ Mute/Unmute handlers
  socket.on("muteChat", (args) => {
    roomServices.muteChat({ args, socket, io, redisClient });
  });

  socket.on("unmuteChat", (args) => {
    roomServices.unmuteChat({ args, socket, io, redisClient });
  });

  socket.on("muteUser", (args) => {
    roomServices.muteUser({ args, socket, io, redisClient });
  });

  socket.on("unmuteUser", (args) => {
    roomServices.unmuteUser({ args, socket, io, redisClient });
  });

  // ✅ Message Request handlers
  socket.on("acceptMessageRequest", (args) => {
    roomServices.acceptMessageRequest({ args, socket, io, redisClient });
  });

  socket.on("declineMessageRequest", (args) => {
    roomServices.declineMessageRequest({ args, socket, io, redisClient });
  });

  socket.on(
    "pinMessage",
    withRateLimit("pinMessage", (args, callback) => {
      roomServices.pinMessage({ args, socket, io, redisClient, callback });
    })
  );

  socket.on(
    "unpinMessage",
    withRateLimit("unpinMessage", (args, callback) => {
      roomServices.unpinMessage({ args, socket, io, redisClient, callback });
    })
  );
};
