const userServices = require("../services/user.services");
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

  socket.on("userConnected", (args, callback) => {
    userServices.userConnected({ args, socket, redisClient }, callback);
  });

  socket.on("userDisconnected", (args, callback) => {
    userServices.userDisconnected({ args, socket, redisClient, io }, callback);
  });

  socket.on("getMyConnections", (args, callback) => {
    userServices.getMyConnections({ args, socket, redisClient }, callback);
  });

  socket.on("getFriendsNRecentChats", (args, callback) =>
    userServices.getFriendsNRecentChats({ args, socket, redisClient }, callback)
  );

  socket.on(
    "searchUsers",
    withRateLimit("searchUsers", (args, callback) => {
      userServices.searchUsers({ args, socket, redisClient }, callback);
    })
  );

  socket.on(
    "sendFriendRequest",
    withRateLimit("sendFriendRequest", (args) => {
      userServices.sendFriendRequest({ args, socket, redisClient });
    })
  );

  socket.on("cancelFriendRequest", (args) => {
    userServices.cancelFriendRequest({ args, socket, redisClient });
  });

  socket.on("acceptFriendRequest", (args) => {
    userServices.acceptFriendRequest({ args, socket, redisClient });
  });

  socket.on("removeFriend", (args) => {
    userServices.removeFriend({ args, socket, redisClient });
  });

  socket.on("getRecommendedFriends", (args) => {
    userServices.getRecommendedFriends({ args, socket, redisClient });
  });

  socket.on(
    "blockUser",
    withRateLimit("blockUser", (args) => {
      userServices.blockUser({ args, socket, redisClient });
    })
  );

  socket.on("disconnectDevice", (args, callback) => {
    userServices.disconnectDevice({ args, socket, io, redisClient }, callback);
  });

  socket.on(
    "searchUsersByMap",
    withRateLimit("searchUsersByMap", (args, callback) => {
      userServices.searchUsersByMap({ args, socket, redisClient }, callback);
    })
  );

  socket.on("getOneUser", (args, callback) => {
    userServices.getOneUser({ args, socket, redisClient }, callback);
  });

  socket.on(
    "reactToUser",
    withRateLimit("reactToUser", (args, callback) => {
      userServices.reactToUser({ args, socket, redisClient }, callback);
    })
  );

  socket.on(
    "likeUser",
    withRateLimit("likeUser", (args, callback) => {
      userServices.likeUser({ args, socket, redisClient }, callback);
    })
  );

  socket.on(
    "dislikeUser",
    withRateLimit("dislikeUser", (args, callback) => {
      userServices.dislikeUser({ args, socket }, callback);
    })
  );

  socket.on("undoLikeOrDislike", (args, callback) => {
    userServices.undoLikeOrDislike({ args, socket }, callback);
  });

  socket.on("getSenderReactions", (args, callback) => {
    userServices.getSenderReactions({ args, socket }, callback);
  });

  socket.on("getUserReactions", (args, callback) => {
    userServices.getUserReactions({ args, socket }, callback);
  });

  socket.on("userChangeStatus", (args, callback) => {
    userServices.userChangeStatus({ args, socket, redisClient, io }, callback);
  });
};
