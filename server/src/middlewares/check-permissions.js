const User = require("../models/user.model");

const checkPermissions = (requiredPermissions) => async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id)
      .populate({
        path: "roles",
        populate: {
          path: "permissions",
          model: "Permission",
        },
      })
      .populate("permissions")
      .exec();

    if (!user) {
      res.status(401).send({ message: "Unauthorized" });
      return;
    }

    const rolePermissions = user.roles.flatMap((role) =>
      role.permissions.map((permission) => permission.name)
    );

    const permissions = user.permissions.map((permission) => permission.name);
    const userPermissions = [...permissions, ...rolePermissions];

    const hasPermissions = requiredPermissions.every((permission) =>
      userPermissions.includes(permission)
    );

    if (!hasPermissions) {
      res.status(403).send({ message: "Forbidden" });
      return;
    }

    next();
  } catch (err) {
    console.error(err);
    res.status(500).send({ message: "Internal Server Error" });
  }
};

module.exports = checkPermissions;
