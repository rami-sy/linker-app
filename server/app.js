const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, ".env") });
if (process.env.NODE_ENV === "development") {
  require("dotenv").config({
    path: path.resolve(__dirname, ".env.dev"),
    override: true,
  });
}
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const { corsOriginCallback } = require("./src/utils/corsOrigins");
const { uploadsGuard, recordingsGuard } = require("./src/middlewares/protected-media.middleware");
const app = express();
const connectDB = require("./src/config/db.config");
const { errorHandler } = require("./src/middlewares/error.middleware");
const workerManager = require("./src/mediasoup/worker-manager");
const { generalLimiter } = require("./src/middlewares/rateLimiter");
const port = process.env.PORT || 4000;
const http = require("http");
const https = require("https");
const redis = require("redis");
const fs = require("fs");
const crypto = require("crypto");
const logger = require("./src/utils/logger");
const os = require("os");
const sharp = require("sharp");

// ✅ TLS/SSL Configuration
const { TLSConfig } = require('./src/utils/encryptionService');
const tlsOptions = TLSConfig.getTLSOptions();

// ✅ Create HTTP or HTTPS server based on TLS configuration
const Server = tlsOptions
  ? require('https').createServer(tlsOptions, app)
  : http.createServer(app);

if (tlsOptions) {
  logger.info("HTTPS server created with TLS");
} else {
  logger.warn("HTTP server created (TLS disabled)");
}

let redisClient;

// ✅ Redis connection with retry mechanism and connection pooling
async function initializeRedis(retries = 5, delay = 2000) {
  const redisUrl = process.env.REDIS_URL || "redis://127.0.0.1:6379";
  
  redisClient = redis.createClient({
    url: redisUrl,
    socket: {
      timeout: 10000, // 10 seconds
      reconnectStrategy: (retries) => {
        // Exponential backoff: 50ms, 100ms, 200ms, 400ms, 800ms, 1600ms, 3200ms, 6400ms, 12800ms, 10000ms (max)
        if (retries > 10) {
          logger.error("Redis: Max reconnection attempts reached");
          return new Error("Redis: Max reconnection attempts reached");
        }
        const delay = Math.min(50 * Math.pow(2, retries), 10000);
        logger.warn(`Redis: Reconnecting in ${delay}ms (attempt ${retries})`);
        return delay;
      },
    },
    // ✅ Connection pooling settings
    pingInterval: 30000, // Ping every 30 seconds to keep connection alive
  });

  // ✅ Event handlers with retry mechanism
  redisClient.on("error", (err) => {
    logger.error("Redis error", err);
    // لا نعيد الاتصال هنا - reconnectStrategy سيتولى ذلك
  });

  redisClient.on("connect", () => {
    logger.info("Redis: Connecting...");
  });

  redisClient.on("ready", () => {
    logger.info("Redis: Ready");
  });

  redisClient.on("reconnecting", () => {
    logger.warn("Redis: Reconnecting...");
  });

  redisClient.on("end", () => {
    logger.warn("Redis: Connection ended");
  });

  try {
    await redisClient.connect();
    logger.info("Connected to Redis");
    
    // Optional test
    const pingResponse = await redisClient.ping();
    logger.debug("Redis PING response", { pingResponse }); // Expect "PONG"
  } catch (err) {
    logger.error("Error connecting to Redis", err);
    
    // ✅ Retry mechanism
    if (retries > 0) {
      logger.warn(`Retrying Redis connection in ${delay}ms (${retries} retries left)...`);
      await new Promise(resolve => setTimeout(resolve, delay));
      return initializeRedis(retries - 1, delay * 2); // Exponential backoff
    } else {
      logger.error("Failed to connect to Redis after all retries");
      // لا نرمي الخطأ - نسمح للتطبيق بالعمل بدون Redis (graceful degradation)
    }
  }
}

const redisInitPromise = initializeRedis();

// ✅ Initialize Message Queue
const { closeQueue } = require('./src/queues/messageQueue');

// ✅ Initialize Memory Monitor
const { getMemoryMonitor } = require('./src/utils/memoryMonitor');
const memoryMonitor = getMemoryMonitor({
  enabled: process.env.MEMORY_MONITORING_ENABLED !== 'false', // Default: enabled
  interval: parseInt(process.env.MEMORY_MONITORING_INTERVAL) || 60000, // 1 minute
  warningThreshold: parseFloat(process.env.MEMORY_WARNING_THRESHOLD) || 0.8, // 80%
  criticalThreshold: parseFloat(process.env.MEMORY_CRITICAL_THRESHOLD) || 0.9, // 90%
});

// ✅ Initialize Scaling Service (Horizontal Scaling)
const ScalingService = require('./src/utils/scalingService');
let scalingService = null;

// CORS configuration (shared list with Socket.IO — see src/utils/corsOrigins.js)
const corsOptions = {
  origin: corsOriginCallback,
  credentials: true, // Allow cookies and authorization headers
  optionsSuccessStatus: 200,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-access-token', 'x-socket-id']
};

const trustProxyConfig = process.env.TRUST_PROXY;
if (trustProxyConfig != null) {
  const lowered = String(trustProxyConfig).toLowerCase();
  if (lowered === "true") {
    app.set("trust proxy", 1);
  } else if (lowered === "false") {
    app.set("trust proxy", false);
  } else if (!Number.isNaN(Number(trustProxyConfig))) {
    app.set("trust proxy", Number(trustProxyConfig));
  } else {
    app.set("trust proxy", trustProxyConfig);
  }
}

app.use(cors(corsOptions));

// Security headers with Helmet
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://accounts.google.com"],
      scriptSrc: [
        "'self'",
        "https://accounts.google.com",
        "https://apis.google.com",
        "https://connect.facebook.net",
      ],
      workerSrc: ["'self'", "blob:"],
      imgSrc: ["'self'", "data:", "https:", "blob:"],
      connectSrc: [
        "'self'",
        "ws:", "wss:",
        "blob:",
        "https://oauth2.googleapis.com",
        "https://accounts.google.com",
        "https://www.googleapis.com",
        "https://api.ipify.org",
        "https://xcarpentier.github.io",
        "https://www.facebook.com",
        "https://graph.facebook.com",
      ],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'", "blob:"],
      frameSrc: [
        "https://accounts.google.com",
      ],
    },
  },
  crossOriginEmbedderPolicy: false,
  crossOriginOpenerPolicy: { policy: "same-origin-allow-popups" },
}));

connectDB();

// Apply general rate limiting
app.use(generalLimiter);

const defaultBodyLimit = process.env.BODY_PARSER_LIMIT || "1mb";
app.use(express.json({ limit: defaultBodyLimit }));
app.use(express.urlencoded({ extended: true, limit: defaultBodyLimit }));
app.use((req, res, next) => {
  const requestId =
    req.headers["x-request-id"] ||
    req.headers["x-correlation-id"] ||
    crypto.randomUUID();
  req.requestId = String(requestId);
  res.setHeader("x-request-id", req.requestId);
  next();
});

const opsToken = process.env.OPS_ENDPOINTS_TOKEN;
const opsPublic = process.env.OPS_ENDPOINTS_PUBLIC === "true";
const localHosts = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);
const localInterfaces = new Set(
  Object.values(os.networkInterfaces())
    .flat()
    .filter(Boolean)
    .map((iface) => iface.address)
);

const requireOpsAccess = (req, res, next) => {
  if (opsPublic) return next();
  const forwardedFor = req.headers["x-forwarded-for"];
  const clientIp = String(
    req.ip ||
      req.socket?.remoteAddress ||
      (typeof forwardedFor === "string" ? forwardedFor.split(",")[0] : "")
  )
    .trim()
    .replace(/^::ffff:/, "");
  if (!opsToken && process.env.NODE_ENV !== "production") {
    if (localHosts.has(clientIp) || localInterfaces.has(clientIp)) {
      return next();
    }
  }
  const providedToken =
    req.headers["x-ops-token"] ||
    req.query?.opsToken ||
    req.headers.authorization?.replace(/^Bearer\s+/i, "");
  if (opsToken && String(providedToken || "") === String(opsToken)) {
    return next();
  }
  return res.status(403).json({ ok: false, message: "Forbidden" });
};

if (process.env.NODE_ENV !== "production") {
  app.get("/test", (req, res) => {
    res.json({ message: "test" });
  });
}

app.get("/health", (req, res) => {
  res.status(200).json({
    ok: true,
    uptimeSec: Math.floor(process.uptime()),
    timestamp: Date.now(),
  });
});

app.get("/ready", requireOpsAccess, (req, res) => {
  const mongoose = require("mongoose");
  const dbReady = mongoose.connection?.readyState === 1;
  const redisReady = !!redisClient?.isReady;
  const mediasoupReady = Array.isArray(workerManager.workers) && workerManager.workers.length > 0;
  const ready = dbReady && redisReady && mediasoupReady;
  res.status(ready ? 200 : 503).json({
    ok: ready,
    checks: {
      mongodb: dbReady,
      redis: redisReady,
      mediasoup: mediasoupReady,
    },
  });
});

app.get("/metrics", requireOpsAccess, (req, res) => {
  const mongoose = require("mongoose");
  const Call = require("./src/models/call.model");
  const memory = process.memoryUsage();
  Promise.all([
    Call.countDocuments({ endedAt: null }),
    Call.countDocuments({ endedAt: null, isLiveStream: true }),
    Call.countDocuments({
      endedAt: { $gte: new Date(Date.now() - 60 * 60 * 1000) },
    }),
  ])
    .then(([activeCalls, activeLiveStreams, callsLastHour]) => {
      const callTelemetry =
        global.__callTelemetryCounters || {
          joinAttempts: 0,
          joinSuccess: 0,
          joinFailure: 0,
          permissionDenied: 0,
          reconnectAttempt: 0,
          reconnectSuccess: 0,
          reconnectFailure: 0,
          moderationActions: 0,
        };
      const chatTelemetry =
        global.__chatTelemetryCounters || {
          sendAttempts: 0,
          sendSuccess: 0,
          sendFailure: 0,
          sendDeduped: 0,
          editSuccess: 0,
          editFailure: 0,
          reactionSuccess: 0,
          reactionFailure: 0,
          searchCount: 0,
          mentionLimitRejected: 0,
        };
      const rolloutFlags = {
        chatAiAssistEnabled: process.env.CHAT_AI_ASSIST_ENABLED === "true",
        suspiciousLinkWarningEnabled:
          process.env.SUSPICIOUS_LINK_WARNING_ENABLED === "true",
        advancedCallModerationEnabled:
          process.env.ADVANCED_CALL_MODERATION_ENABLED !== "false",
      };
      res.status(200).json({
        uptimeSec: Math.floor(process.uptime()),
        rssBytes: memory.rss,
        heapUsedBytes: memory.heapUsed,
        heapTotalBytes: memory.heapTotal,
        mongodbReady: mongoose.connection?.readyState === 1,
        redisReady: !!redisClient?.isReady,
        mediasoupWorkers: Array.isArray(workerManager.workers)
          ? workerManager.workers.length
          : 0,
        callMetrics: {
          activeCalls,
          activeLiveStreams,
          callsLastHour,
          telemetry: callTelemetry,
        },
        chatMetrics: {
          telemetry: chatTelemetry,
        },
        rolloutFlags,
      });
    })
    .catch(() => {
      res.status(200).json({
        uptimeSec: Math.floor(process.uptime()),
        rssBytes: memory.rss,
        heapUsedBytes: memory.heapUsed,
        heapTotalBytes: memory.heapTotal,
        mongodbReady: mongoose.connection?.readyState === 1,
        redisReady: !!redisClient?.isReady,
        mediasoupWorkers: Array.isArray(workerManager.workers)
          ? workerManager.workers.length
          : 0,
        callMetrics: {
          activeCalls: null,
          activeLiveStreams: null,
          callsLastHour: null,
        },
        chatMetrics: {
          telemetry: global.__chatTelemetryCounters || null,
        },
      });
    });
});

logger.info("Server mode", { nodeEnv: process.env.NODE_ENV });
app.use("/api/auth", require("./src/routes/auth.routes"));
app.use("/api/roles", require("./src/routes/role.routes"));
app.use("/api/permissions", require("./src/routes/permission.routes"));
app.use("/api/interests", require("./src/routes/interest.routes"));
app.use("/api/languages", require("./src/routes/language.routes"));
app.use("/api/room", require("./src/routes/room.routes"));
app.use("/api/files", require("./src/routes/image.routes"));
app.use("/api/users", require("./src/routes/user.routes"));
app.use("/api/reports", require("./src/routes/report.routes"));
app.use("/api/calls", require("./src/routes/call.routes"));
app.use("/api/call-schedules", require("./src/routes/call-schedule.routes"));
if (process.env.NODE_ENV !== "production") {
  app.post("/api/test", async (req, res) => {
    console.log({ body: JSON.stringify(req.body) });
    res.status(204).end();
  });
}

const { getIO, initIO } = require("./socket");
const User = require("./src/models/user.model");
const clientLogoPath = path.join(__dirname, "..", "client", "assets", "dark-logo.svg");
let linkerLogoPngCache = null;

app.get("/assets/linker-logo.png", async (req, res, next) => {
  try {
    if (!linkerLogoPngCache) {
      linkerLogoPngCache = await sharp(clientLogoPath)
        .resize({ width: 240 })
        .png()
        .toBuffer();
    }

    res.setHeader("Content-Type", "image/png");
    res.setHeader("Cache-Control", "public, max-age=86400, stale-while-revalidate=604800");
    res.send(linkerLogoPngCache);
  } catch (error) {
    next(error);
  }
});

app.use(
  "/recordings",
  recordingsGuard(),
  express.static(path.join(__dirname, "recordings"), {
    maxAge: "1y", // Cache recordings for 1 year
  })
);

app.use(
  "/uploads",
  uploadsGuard(),
  express.static("uploads", {
    setHeaders: (res) => {
      res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    },
  })
);
app.use(errorHandler);

const CLIENT_BUILD_DIR = path.join(__dirname, "dist");

logger.info("Client build dir configured", { path: CLIENT_BUILD_DIR });
app.use(
  express.static(CLIENT_BUILD_DIR, {
    maxAge: "1h",
    extensions: ["html"],
  })
);

// Catch-all route to serve index.html for other routes
app.get("*", (req, res) => {
  res.sendFile(path.join(CLIENT_BUILD_DIR, "index.html"));
});

(async () => {
  try {
    await redisInitPromise;
    logger.info("Initializing MediaSoup...");
    await workerManager.initialize();
    logger.info("MediaSoup initialized successfully");

    await initIO(Server, redisClient);

    // ✅ Initialize Socket Rate Limiter with Redis
    const { initializeRateLimiter } = require('./src/middlewares/socketRateLimiter');
    if (redisClient && redisClient.isReady) {
      initializeRateLimiter(redisClient);
      logger.info("Socket Rate Limiter initialized with Redis");
    } else {
      logger.warn("Socket Rate Limiter initialized without Redis (fallback mode)");
    }

    // ✅ Initialize Scaling Service (بعد Redis و Worker Manager)
    if (redisClient && redisClient.isReady) {
      scalingService = new ScalingService(redisClient);
      await scalingService.initialize();
      
      // ✅ ربط Scaling Service مع Room Manager
      const roomManager = require('./src/mediasoup/room-manager');
      roomManager.setScalingService(scalingService);
      
      logger.info("Scaling service initialized successfully");
    } else {
      logger.warn("Scaling service not initialized - Redis not available");
    }

    Server.listen(port, async () => {
      logger.info("Server started", {
        pid: process.pid,
        port,
        nodeEnv: process.env.NODE_ENV,
      });
      
      // ✅ تسجيل الموارد في Memory Monitor (بعد تهيئة getIO)
      const mongoose = require('mongoose');
      const workerManager = require('./src/mediasoup/worker-manager');
      const roomManager = require('./src/mediasoup/room-manager');
      const { messageQueue } = require('./src/queues/messageQueue');
      const { getIO } = require('./socket');
      const io = getIO();
      
      memoryMonitor.registerResources({
        redisClient,
        mongoose,
        io,
        workerManager,
        roomManager,
        messageQueue,
      });
      
      // ✅ بدء مراقبة الذاكرة
      memoryMonitor.start();
      logger.info("Memory monitoring started");
      
      // ✅ Start cron jobs for cleanup tasks
      const { startCronJobs } = require('./src/utils/cronJob');
      startCronJobs();
      logger.info("Cron jobs started for cleanup tasks");
    });

    getIO();
  } catch (error) {
    logger.error("Failed to initialize MediaSoup", error);
    process.exit(1);
  }
})();

// ✅ Graceful shutdown handlers
process.on('SIGTERM', async () => {
  logger.info("SIGTERM received, closing services gracefully...");
  memoryMonitor.stop(); // Stop memory monitoring
  if (scalingService) {
    await scalingService.stop(); // Stop scaling service
  }
  await closeQueue();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info("SIGINT received, closing services gracefully...");
  memoryMonitor.stop(); // Stop memory monitoring
  if (scalingService) {
    await scalingService.stop(); // Stop scaling service
  }
  await closeQueue();
  process.exit(0);
});
