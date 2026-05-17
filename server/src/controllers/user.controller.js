// const Post = require("../models/post.model");
const User = require("../models/user.model");

exports.getAllUsers = async (req, res) => {
  try {
    const users = await User.find();
    res.status(202).send({
      message: "Users retrieved successfully",

      data: users,
      type: "success",
    });
  } catch (err) {
    res.status(500).send({ message: err.message, type: "error" });
  }
};

exports.createUser = async (req, res) => {
  try {
    const { phoneNumber, email, password, role } = req.body;

    if (!email || !password || !role) {
      res.status(400);
      throw new Error("Please provide all required fields");
    }

    const userExists = await User.findOne({ email: email });

    if (userExists) {
      res.status(202).send({
        message: "User already exists",

        type: "success",
      });
    } else {
      const user = new User({
        phoneNumber,
        email,
        password,
        role,
        user: req.user._id,
      });

      const savedUser = await user.save();

      res.status(202).send({
        message: "User created successfully!",

        data: savedUser,
        type: "success",
      });
    }
  } catch (err) {
    res.status(500).send({ message: err.message, type: "error" });
  }
};

exports.getMyUsers = (req, res) => {
  try {
    const { _id } = req.user;
    const users = User.find();
    res.status(202).send({
      message: "Users retrieved successfully",

      data: users,
      type: "success",
    });
  } catch (err) {
    res.status(500).send({ message: err.message, type: "error" });
  }
};

exports.resetUser = async (req, res) => {
  try {
    const requester = await User.findById(req.user._id)
      .select("+roles")
      .populate("roles", "name")
      .lean();
    const requesterId = req.user._id?.toString();
    const targetUserId = req.params._id?.toString();
    const isSelfReset = requesterId === targetUserId;
    const isAdmin = (requester?.roles || []).some(
      (role) => role?.name?.toLowerCase?.() === "admin"
    );
    if (!isSelfReset && !isAdmin) {
      return res.status(403).send({ message: "Forbidden", type: "error" });
    }

    const currentUser = await User.findById(req.params._id);
    if (!currentUser) {
      res.status(404);
      throw new Error("User not found");
    }
    currentUser.friends = [];
    currentUser.incomingFriendRequests = [];
    currentUser.outgoingFriendRequests = [];
    currentUser.blockedUsers = [];
    currentUser.colors = [];

    await currentUser.save();

    // delete all User id form all frinds user they have it
    const users = await User.find();
    users.forEach(async (user) => {
      if (user?.friends?.includes?.(req.params._id)) {
        user.friends = user.friends.filter(
          (friend) => friend !== req.params._id
        );
        await user.save();
      }
      if (user?.incomingFriendRequests?.includes?.(req.params._id)) {
        user.incomingFriendRequests = user.incomingFriendRequests.filter(
          (friend) => friend !== req.params._id
        );
        await user.save();
      }
      if (user?.outgoingFriendRequests?.includes?.(req.params._id)) {
        user.outgoingFriendRequests = user.outgoingFriendRequests.filter(
          (friend) => friend !== req.params._id
        );
        await user.save();
      }
      if (user?.blockedUsers?.includes?.(req.params._id)) {
        user.blockedUsers = user.blockedUsers.filter(
          (friend) => friend !== req.params._id
        );
        await user.save();
      }
    });

    res.status(202).send({
      message: "User retrieved successfully",

      data: currentUser,
      type: "success",
    });
  } catch (err) {
    res.status(500).send({ message: err.message, type: "error" });
  }
};
