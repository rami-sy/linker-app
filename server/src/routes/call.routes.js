const express = require("express");
const router = express.Router();
const controller = require("../controllers/call.controller");
const verifyToken = require("../middlewares/verify-token");
const { callLimiter } = require("../middlewares/rateLimiter");

router.use(callLimiter);

// جميع الـ routes محمية بـ verifyToken
router.get("/", verifyToken, controller.getUserCalls);
router.get("/room/:roomId", verifyToken, controller.getRoomCalls);
router.get("/:callId", verifyToken, controller.getCallDetails);

module.exports = router;

