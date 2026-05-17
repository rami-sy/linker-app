const express = require("express");
const router = express.Router();

const controller = require("../controllers/role.controller");
const verifyToken = require("../middlewares/verify-token");
const requireAdmin = require("../middlewares/require-admin");

router.get("/", [verifyToken], controller.getAllRoles);

router.get("/_:id", [verifyToken], controller.getOneRole);

router.post("/", [verifyToken, requireAdmin], controller.createRole);

router.put("/_:id", [verifyToken, requireAdmin], controller.updateRole);

router.delete("/_:id", [verifyToken, requireAdmin], controller.deleteRole);

module.exports = router;
