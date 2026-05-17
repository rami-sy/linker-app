const e2eeServices = require("../services/e2ee.services");

module.exports = ({ socket, io, redisClient }) => {
  socket.on("registerChatKeys", (args, callback) => {
    e2eeServices.registerChatKeys(
      { args, socket, io, redisClient },
      callback
    );
  });

  socket.on("getMembersE2eeKeys", (args, callback) => {
    e2eeServices.getMembersE2eeKeys(
      { args, socket, io, redisClient },
      callback
    );
  });

  socket.on("getRoomKeyPackages", (args, callback) => {
    e2eeServices.getRoomKeyPackages(
      { args, socket, io, redisClient },
      callback
    );
  });

  socket.on("submitRoomKeyPackages", (args, callback) => {
    e2eeServices.submitRoomKeyPackages(
      { args, socket, io, redisClient },
      callback
    );
  });

  socket.on("submitWrappedRoomKeyForMember", (args, callback) => {
    e2eeServices.submitWrappedRoomKeyForMember(
      { args, socket, io, redisClient },
      callback
    );
  });
};
