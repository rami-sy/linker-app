const express = require("express");
const router = express.Router();
const controller = require("../controllers/interest.controller");
const verifyToken = require("../middlewares/verify-token");
const requireAdmin = require("../middlewares/require-admin");

router.get("/", [verifyToken], controller.getAllInterests);

router.get("/_:id", [verifyToken], controller.getOneInterest);

router.post("/", [verifyToken, requireAdmin], controller.createInterest);

router.put("/_:id", [verifyToken, requireAdmin], controller.updateInterest);

router.delete("/_:id", [verifyToken, requireAdmin], controller.deleteInterest);

module.exports = router;
