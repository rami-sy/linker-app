const express = require("express");
const router = express.Router();
const verifyToken = require("../middlewares/verify-token");
const { callLimiter } = require("../middlewares/rateLimiter");
const controller = require("../controllers/call-schedule.controller");

router.use(callLimiter);
router.get("/", verifyToken, controller.listSchedules);
router.post("/", verifyToken, controller.createSchedule);
router.delete("/:id", verifyToken, controller.cancelSchedule);

module.exports = router;
