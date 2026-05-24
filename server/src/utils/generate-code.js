const crypto = require("crypto");

function generateVerifyCode() {
  return crypto.randomInt(100000, 1000000).toString();
}

module.exports = generateVerifyCode;
