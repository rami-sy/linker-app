const path = require("path");
const jwt = require("jsonwebtoken");
const config = require("../config/auth.config.js");
const Image = require("../models/image.model");
const CallRecording = require("../models/call-recording.model");
const StreamRecording = require("../models/stream-recording.model");

/**
 * Production: protected by default. Override with MEDIA_REQUIRE_AUTH=true|false.
 * Unset + non-production: open (dev-friendly). Unset + production: protected.
 */
function isProtectedMediaEnabled() {
  if (process.env.MEDIA_REQUIRE_AUTH === "false") return false;
  if (process.env.MEDIA_REQUIRE_AUTH === "true") return true;
  return process.env.NODE_ENV === "production";
}

function extractToken(req) {
  const auth = req.headers.authorization;
  if (auth && typeof auth === "string" && auth.startsWith("Bearer ")) {
    return auth.slice(7).trim();
  }
  const header = req.headers["x-access-token"];
  if (header) return String(header).trim();
  // Prevent token leakage in URLs in production.
  if (process.env.NODE_ENV !== "production" && req.query && req.query.token) {
    return String(req.query.token).trim();
  }
  return null;
}

function safeBasenameFromUrlPath(urlPath) {
  if (!urlPath || typeof urlPath !== "string") return null;
  const noQuery = urlPath.split("?")[0];
  const decoded = decodeURIComponent(noQuery);
  const base = path.basename(decoded);
  if (!base || base === "." || base === ".." || decoded.includes("..")) {
    return null;
  }
  return base;
}

function verifyJwtToUser(token) {
  return new Promise((resolve, reject) => {
    jwt.verify(token, config.secret, (err, decoded) => {
      if (err) return reject(err);
      if (!decoded || !decoded._id) {
        return reject(new Error("Invalid token payload"));
      }
      resolve(String(decoded._id));
    });
  });
}

/**
 * Require JWT; allow upload file if owner (filename prefix) or Image row matches user.
 */
async function assertUploadAccess(req, res, next) {
  if (!isProtectedMediaEnabled()) return next();

  const basename = safeBasenameFromUrlPath(req.path);
  if (!basename) {
    return res.status(400).send("Invalid path");
  }

  const token = extractToken(req);
  if (!token) {
    return res.status(401).send("Authentication required");
  }

  let userId;
  try {
    userId = await verifyJwtToUser(token);
  } catch {
    return res.status(401).send("Unauthorized");
  }

  const prefix = `${userId}-`;
  if (basename.startsWith(prefix)) {
    return next();
  }

  const image = await Image.findOne({ filename: basename })
    .select("userId user")
    .lean();

  if (image) {
    const owner =
      image.userId != null
        ? String(image.userId)
        : image.user != null
          ? String(image.user)
          : null;
    if (owner && owner === userId) {
      return next();
    }
  }

  return res.status(403).send("Forbidden");
}

/**
 * Require JWT; allow recording if caller, participant, broadcaster, or isPublic.
 */
async function assertRecordingAccess(req, res, next) {
  if (!isProtectedMediaEnabled()) return next();

  const basename = safeBasenameFromUrlPath(req.path);
  if (!basename) {
    return res.status(400).send("Invalid path");
  }

  const token = extractToken(req);
  if (!token) {
    return res.status(401).send("Authentication required");
  }

  let userId;
  try {
    userId = await verifyJwtToUser(token);
  } catch {
    return res.status(401).send("Unauthorized");
  }

  const urlSuffix = basename.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const orFile = [
    { fileUrl: new RegExp(`${urlSuffix}$`) },
    { filePath: new RegExp(`${urlSuffix}$`) },
    { thumbnailUrl: new RegExp(`${urlSuffix}$`) },
  ];

  let callRec = await CallRecording.findOne({
    $or: orFile,
    deletedAt: null,
  })
    .select("caller participants isPublic")
    .lean();

  if (callRec) {
    if (callRec.isPublic) return next();
    if (callRec.caller && String(callRec.caller) === userId) return next();
    if (
      Array.isArray(callRec.participants) &&
      callRec.participants.some((p) => String(p) === userId)
    ) {
      return next();
    }
    return res.status(403).send("Forbidden");
  }

  let streamRec = await StreamRecording.findOne({
    $or: orFile,
    deletedAt: null,
  })
    .select("broadcaster isPublic")
    .lean();

  if (streamRec) {
    if (streamRec.isPublic) return next();
    if (streamRec.broadcaster && String(streamRec.broadcaster) === userId) {
      return next();
    }
    return res.status(403).send("Forbidden");
  }

  return res.status(404).send("Not found");
}

function uploadsGuard() {
  return (req, res, next) => {
    assertUploadAccess(req, res, next).catch((err) => {
      console.error("uploadsGuard:", err);
      res.status(500).send("Internal error");
    });
  };
}

function recordingsGuard() {
  return (req, res, next) => {
    assertRecordingAccess(req, res, next).catch((err) => {
      console.error("recordingsGuard:", err);
      res.status(500).send("Internal error");
    });
  };
}

module.exports = {
  uploadsGuard,
  recordingsGuard,
  isProtectedMediaEnabled,
  extractToken,
  safeBasenameFromUrlPath,
};
