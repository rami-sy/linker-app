require('dotenv').config();

const isTestEnv = process.env.NODE_ENV === "test";
const jwtSecret = process.env.JWT_SECRET;
const requireJwtSecret = process.env.JWT_SECRET_REQUIRED !== "false";

if (!jwtSecret && !isTestEnv && requireJwtSecret) {
  throw new Error("JWT_SECRET is required. Refusing to start without JWT secret.");
}

module.exports = {
  secret: jwtSecret || "test-only-secret",
  expiresIn: process.env.JWT_EXPIRES_IN || "7d",
};
