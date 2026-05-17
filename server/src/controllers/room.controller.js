const { default: mongoose } = require("mongoose");
const Room = require("../models/room.model");

exports.getAllRooms = async (req, res) => {
  try {
    const rooms = await Room.find({ members: req.user._id });
    res.status(200).send({
      message: "Rooms retrieved successfully",

      data: rooms,
      type: "success",
    });
  } catch (err) {
    res.status(500).send({ message: err.message, type: "error" });
  }
};

exports.getOneRoom = async (req, res) => {
  try {
    const room = await Room.findById(req.params._id).populate(
      "members",
      "email phoneNumber"
    );
    if (!room) {
      res.status(404);
      throw new Error("Room not found");
    }
    const userIdStr = req.user._id.toString();
    const isOwner = room.user?.toString() === userIdStr;
    const isMember = (room.members || []).some(
      (member) => member?._id?.toString?.() === userIdStr || member?.toString?.() === userIdStr
    );
    if (!isOwner && !isMember) {
      return res.status(403).send({ message: "Forbidden", type: "error" });
    }
    res.status(200).send({
      message: "Room retrieved successfully",

      data: room,
      type: "success",
    });
  } catch (err) {
    res.status(500).send({ message: err.message, type: "error" });
  }
};

exports.createRoom = async (req, res) => {
  try {
    const { receiverId } = req.body;
    // إذا كان المستخدم يحاول إنشاء غرفة مع نفسه (محادثة ذاتية)
    if (receiverId === req.user._id.toString()) {
      // تحقق إذا كانت الغرفة موجودة مسبقاً
      const selfRoomExists = await Room.findOne({
        members: {
          $all: [req.user._id],
          $size: 1,
        },
      })
        .populate({
          path: "members",
          select:
            "email phoneNumber lastSeen status userName firstName lastName images privacySettings blockedUsers roles isGroup",
          populate: {
            path: "images",
            select: "path", // تحديد الصور لجلب الحقل 'path' فقط
          },
          model: "User",
        })
        .exec();

      if (selfRoomExists) {
        return res.status(202).send({
          message: "Self-chat room already exists",
          data: selfRoomExists,
          type: "success",
        });
      } else {
        // إنشاء غرفة جديدة للمحادثة الذاتية
        const newRoom = new Room({
          user: req.user._id,
          members: [req.user._id],
        });

        const savedRoom = await newRoom.save();

        const populatedRoom = await Room.findById(savedRoom._id)
          .populate({
            path: "members",
            select:
              "email phoneNumber lastSeen status userName firstName lastName images privacySettings blockedUsers roles isGroup",
            populate: {
              path: "images",
              select: "path", // تحديد الصور لجلب الحقل 'path' فقط
            },
            model: "User",
          })
          .exec();
        return res.status(202).send({
          message: "Self-chat room created successfully!",
          data: populatedRoom,
          type: "success",
        });
      }
    }
    // Check if a room already exists between the current user and the receiver
    const roomExists = await Room.findOne({
      members: {
        $all: [req.user._id, receiverId],
        $size: 2,
      },
    })
      .populate({
        path: "members",
        select:
          "email phoneNumber lastSeen status userName firstName lastName images privacySettings blockedUsers roles isGroup",
        populate: {
          path: "images",
          select: "path", // تحديد الصور لجلب الحقل 'path' فقط
        },
        model: "User",
      })

      .exec();

    if (roomExists) {
      const populatedRoom = await Room.findById(roomExists._id)
        .populate({
          path: "members",
          select:
            "email phoneNumber lastSeen status userName firstName lastName images privacySettings blockedUsers roles isGroup",
          populate: {
            path: "images",
            select: "path", // تحديد الصور لجلب الحقل 'path' فقط
          },
          model: "User",
        })
        .exec();
      // populatedRoom.isGroup = populatedRoom.members.length > 2;

      // Add fields for isGroup and filter members
      const roomData = {
        ...populatedRoom.toObject(),
        isGroup: populatedRoom.members.length > 2,
        members: populatedRoom.members.filter(
          (member) => !member._id.equals(req.user._id)
        ),
      };
      return res.status(202).send({
        message: "Room already exists",
        data: roomData,
        type: "success",
      });
    } else {
      const room = new Room({
        user: req.user._id,
        members: [req.user._id, receiverId],
      });

      const savedRoom = await room.save();

      const populatedRoom = await Room.findById(savedRoom._id)
        .populate({
          path: "members",
          select:
            "email phoneNumber lastSeen status userName firstName lastName images privacySettings blockedUsers roles isGroup",
          populate: {
            path: "images",
            select: "path", // تحديد الصور لجلب الحقل 'path' فقط
          },
          model: "User",
        })
        .exec();

      const roomData = {
        ...populatedRoom.toObject(),
        isGroup: populatedRoom.members.length > 2,
        members: populatedRoom.members.filter(
          (member) => !member._id.equals(req.user._id)
        ),
      };

      return res.status(202).send({
        message: "Room created successfully!",
        data: roomData,
        type: "success",
      });
    }
  } catch (err) {
    res.status(500).send({ message: err.message, type: "error" });
  }
};

exports.updateRoom = async (req, res) => {
  try {
    const { name } = req.body;
    const roomId = req.params._id;

    if (!name) {
      res.status(400);
      throw new Error("Please provide a room name");
    }

    const room = await Room.findById(roomId);

    if (!room) {
      res.status(404);
      throw new Error("Room not found");
    }
    if (room.user?.toString() !== req.user._id.toString()) {
      return res.status(403).send({ message: "Forbidden", type: "error" });
    }

    room.name = name;

    const updatedRoom = await room.save();

    res.status(200).send({
      message: "Room updated successfully!",

      data: updatedRoom,
      type: "success",
    });
  } catch (err) {
    res.status(500).send({ message: err.message, type: "error" });
  }
};

exports.deleteRoom = async (req, res) => {
  try {
    const roomId = req.params._id;
    const room = await Room.findById(roomId);
    if (!room) {
      res.status(404);
      throw new Error("Room not found");
    }
    if (room.user?.toString() !== req.user._id.toString()) {
      return res.status(403).send({ message: "Forbidden", type: "error" });
    }

    await Room.findByIdAndDelete(roomId);

    res.status(200).send({
      message: "Room deleted successfully!",

      data: room,
      type: "success",
    });
  } catch (err) {
    res.status(500).send({ message: err.message, type: "error" });
  }
};
