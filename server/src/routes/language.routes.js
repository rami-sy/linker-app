const express = require("express");
const router = express.Router();
const controller = require("../controllers/language.controller");
const verifyToken = require("../middlewares/verify-token");
const requireAdmin = require("../middlewares/require-admin");

router.get("/", [verifyToken], controller.getAllLanguages);

router.get("/_:id", [verifyToken], controller.getOneLanguage);

router.post("/", [verifyToken, requireAdmin], controller.createLanguage);

router.put("/_:id", [verifyToken, requireAdmin], controller.updateLanguage);

router.delete("/_:id", [verifyToken, requireAdmin], controller.deleteLanguage);

module.exports = router;
