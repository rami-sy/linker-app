const express = require("express");
const controller = require("../controllers/user.controller");
const verifyToken = require("../middlewares/verify-token");
const requireAdmin = require("../middlewares/require-admin");

const router = express.Router();

router.get("/", [verifyToken, requireAdmin], controller.getAllUsers);

router.post("/me", [verifyToken], controller.getMyUsers);

router.post("/", [verifyToken, requireAdmin], controller.createUser);

router.post("/reset/:_id", [verifyToken], controller.resetUser);

module.exports = router;
