/**
 * Shared CORS allowlist for Express and Socket.IO.
 * Set CORS_ORIGIN to a comma-separated list in production.
 */
const DEFAULT_DEV_ORIGINS = [
  "http://localhost:3000",
  "http://localhost:19006",
  "http://localhost:8080",
  "http://localhost:8081",
  "http://192.168.1.101:8080",
  "http://192.168.1.101:8081",
  "http://192.168.1.101:8081",
  "http://192.168.1.101:8080",
];

function getAllowedOriginsList() {
  if (process.env.CORS_ORIGIN) {
    return process.env.CORS_ORIGIN.split(",").map((o) => o.trim()).filter(Boolean);
  }
  return DEFAULT_DEV_ORIGINS;
}

/**
 * Express cors `origin` callback style.
 */
function corsOriginCallback(origin, callback) {
  if (!origin) return callback(null, true);
  const allowed = getAllowedOriginsList();
  if (allowed.includes(origin)) {
    callback(null, true);
  } else {
    console.warn(`🚫 CORS blocked request from origin: ${origin}`);
    callback(new Error("Not allowed by CORS"));
  }
}

/**
 * Socket.IO v4 `cors.origin` — string, array, boolean, or function.
 */
function socketIoCorsOrigin(origin, callback) {
  if (!origin) {
    return callback(null, true);
  }
  const allowed = getAllowedOriginsList();
  if (allowed.includes(origin)) {
    return callback(null, true);
  }
  console.warn(`🚫 Socket.IO CORS blocked origin: ${origin}`);
  return callback(new Error("Not allowed by CORS"));
}

module.exports = {
  getAllowedOriginsList,
  corsOriginCallback,
  socketIoCorsOrigin,
  DEFAULT_DEV_ORIGINS,
};
