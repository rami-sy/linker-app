const express = require("express");
const router = express.Router();

const controller = require("../controllers/permission.controller");
const checkPermissions = require("../middlewares/check-permissions");
const verifyToken = require("../middlewares/verify-token");
const requireAdmin = require("../middlewares/require-admin");

router.get(
  "/",
  [verifyToken, checkPermissions(["getAllPermissions"])],
  controller.getAllPermissions
);

router.get("/_:id", [verifyToken, requireAdmin], controller.getOnePermission);

router.post("/", [verifyToken, requireAdmin], controller.createPermission);

router.put("/_:id", [verifyToken, requireAdmin], controller.updatePermission);

router.delete("/_:id", [verifyToken, requireAdmin], controller.deletePermission);

module.exports = router;
