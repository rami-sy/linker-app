const express = require("express");
const router = express.Router();

const controller = require("../controllers/report.controller");
const verifyToken = require("../middlewares/verify-token");

router.post("/", [verifyToken], controller.createReport);

module.exports = router;
