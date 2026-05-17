const postServices = require("../services/post.services");
const { getRateLimiter } = require("../../middlewares/socketRateLimiter");

module.exports = ({ socket, io, redisClient }) => {
  const rateLimiter = getRateLimiter();

  socket.on("getPosts", async (args, callback) => {
    const userId = socket.user?._id?.toString();
    const ip = socket.handshake?.address || socket.conn?.remoteAddress;
    const result = await rateLimiter.checkRateLimit(
      socket.id,
      "getPosts",
      userId,
      ip
    );
    if (!result.allowed) {
      const payload = {
        type: "error",
        message: result.message || "Rate limit exceeded",
        rateLimitInfo: result,
      };
      if (typeof callback === "function") {
        callback(payload);
      } else {
        socket.emit("rateLimitError", { event: "getPosts", ...payload });
      }
      return;
    }
    postServices.getPosts({ args, socket, redisClient });
    if (typeof callback === "function") {
      callback({ type: "success" });
    }
  });
};
