const jwt = require("jsonwebtoken");
const config = require("../config/auth.config.js");

verifySocketToken = (socket, next) => {
  // Token might be sent in connection query or in the headers
  const token = socket.handshake.query.token || socket.handshake.headers.token;

  if (!token) {
    return next(new Error("Authentication error"));
  }

  // Assuming JWT verification here:
  jwt.verify(token, config.secret, (err, decoded) => {
    if (err) return next(new Error("Authentication error"));

    // Attach user to handshake data for use in connection event
    socket.handshake.userData = decoded;
    next();
  });
};

module.exports = verifySocketToken;
