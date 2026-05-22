/**
 * Shared CORS allowlist for Express and Socket.IO.
 * Set CORS_ORIGIN to a comma-separated list in production.
 */
const os = require("os");

const DEFAULT_DEV_ORIGINS = [
  "http://localhost:3000",
  "http://localhost:19006",
  "http://localhost:8080",
  "http://localhost:8081",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:19006",
  "http://127.0.0.1:8080",
  "http://127.0.0.1:8081",
];

function getAllowedOriginsList() {
  if (process.env.CORS_ORIGIN) {
    return process.env.CORS_ORIGIN.split(",").map((o) => o.trim()).filter(Boolean);
  }
  return DEFAULT_DEV_ORIGINS;
}

function getLocalInterfaceAddresses() {
  try {
    return new Set(
      Object.values(os.networkInterfaces())
        .flat()
        .filter(Boolean)
        .map((iface) => String(iface.address || "").trim())
        .filter(Boolean)
    );
  } catch (_) {
    return new Set();
  }
}

function isPrivateIpv4(hostname) {
  // Only handle IPv4 literals here.
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(hostname);
  if (!m) return false;
  const parts = m.slice(1).map((x) => Number(x));
  if (parts.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return false;

  const [a, b] = parts;
  if (a === 10) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  return false;
}

function isDevSafeOrigin(origin) {
  if (!origin) return true;
  try {
    const u = new URL(origin);
    const host = String(u.hostname || "").trim().toLowerCase();
    if (!host) return false;

    if (host === "localhost" || host === "127.0.0.1" || host === "::1") return true;
    if (isPrivateIpv4(host)) return true;

    // Allow the current machine's LAN IP(s) regardless of port.
    const localIfaces = getLocalInterfaceAddresses();
    if (localIfaces.has(host)) return true;

    return false;
  } catch (_) {
    return false;
  }
}

/**
 * Express cors `origin` callback style.
 */
function corsOriginCallback(origin, callback) {
  if (!origin) return callback(null, true);
  const allowed = getAllowedOriginsList();
  const isProd = process.env.NODE_ENV === "production";

  // In development, allow localhost + private LAN origins by default to keep web/PWA usable.
  if (!isProd && isDevSafeOrigin(origin)) {
    return callback(null, true);
  }

  if (allowed.includes(origin)) {
    return callback(null, true);
  }

  console.warn(`🚫 CORS blocked request from origin: ${origin}`);
  return callback(new Error("Not allowed by CORS"));
}

/**
 * Socket.IO v4 `cors.origin` — string, array, boolean, or function.
 */
function socketIoCorsOrigin(origin, callback) {
  if (!origin) {
    return callback(null, true);
  }
  const allowed = getAllowedOriginsList();
  const isProd = process.env.NODE_ENV === "production";

  if (!isProd && isDevSafeOrigin(origin)) {
    return callback(null, true);
  }

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
