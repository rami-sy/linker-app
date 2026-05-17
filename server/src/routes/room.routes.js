const express = require("express");
const router = express.Router();
const controller = require("../controllers/room.controller");
const verifyToken = require("../middlewares/verify-token");

router.get("/", [verifyToken], controller.getAllRooms);


router.get("/_:id", [verifyToken], controller.getOneRoom);

router.post("/", [verifyToken], controller.createRoom);

router.put("/_:id", [verifyToken], controller.updateRoom);

router.delete("/_:id", [verifyToken], controller.deleteRoom);

module.exports = router;
