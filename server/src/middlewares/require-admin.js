const User = require("../models/user.model");

const ADMIN_PERMISSION_NAMES = new Set([
  "manageRoles",
  "managePermissions",
  "manageSettings",
  "manageCatalog",
  "superAdmin",
]);

const requireAdmin = async (req, res, next) => {
  try {
    const userId = req.user?._id;
    if (!userId) {
      return res.status(401).send({ message: "Unauthorized" });
    }

    const user = await User.findById(userId)
      .select("+roles +permissions")
      .populate("roles", "name")
      .populate("permissions", "name")
      .lean();

    if (!user) {
      return res.status(401).send({ message: "Unauthorized" });
    }

    const hasAdminRole = (user.roles || []).some(
      (role) => role?.name?.toLowerCase?.() === "admin"
    );
    const hasAdminPermission = (user.permissions || []).some((permission) =>
      ADMIN_PERMISSION_NAMES.has(permission?.name)
    );

    if (!hasAdminRole && !hasAdminPermission) {
      return res.status(403).send({ message: "Forbidden" });
    }

    next();
  } catch (error) {
    return res.status(500).send({ message: "Internal Server Error" });
  }
};

module.exports = requireAdmin;
