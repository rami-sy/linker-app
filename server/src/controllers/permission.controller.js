const Permission = require("../models/permission.model");

exports.getAllPermissions = async (req, res) => {
  try {
    const permissions = await Permission.find();
    res.status(200).send({
      message: "Permissions retrieved successfully",

      data: permissions,
      type: "success",
    });
  } catch (err) {
    res.status(500).send({ message: err.message, type: "error" });
  }
};

exports.getOnePermission = async (req, res) => {
  try {
    const permission = await Permission.findById(req.params._id);
    if (!permission) {
      res.status(404);
      throw new Error("Permission not found");
    }
    res.status(200).send({
      message: "Permission retrieved successfully",

      data: permission,
      type: "success",
    });
  } catch (err) {
    res.status(500).send({ message: err.message, type: "error" });
  }
};

exports.createPermission = async (req, res) => {
  try {
    const { name } = req.body;

    if (!name) {
      res.status(400);
      throw new Error("Please provide a permission name");
    }

    const permissionExists = await Permission.findOne({ name });

    if (permissionExists) {
      res.status(400);
      throw new Error("Permission name already exists");
    }

    const permission = new Permission({ name });

    const savedPermission = await permission.save();

    res.status(201).send({
      message: "Permission created successfully!",

      data: savedPermission,
      type: "success",
    });
  } catch (err) {
    res.status(500).send({ message: err.message, type: "error" });
  }
};

exports.updatePermission = async (req, res) => {
  try {
    const { name } = req.body;
    const permissionId = req.params._id;

    if (!name) {
      res.status(400);
      throw new Error("Please provide a permission name");
    }

    const permission = await Permission.findById(permissionId);

    if (!permission) {
      res.status(404);
      throw new Error("Permission not found");
    }

    permission.name = name;

    const updatedPermission = await permission.save();

    res.status(200).send({
      message: "Permission updated successfully!",

      data: updatedPermission,
      type: "success",
    });
  } catch (err) {
    res.status(500).send({ message: err.message, type: "error" });
  }
};

exports.deletePermission = async (req, res) => {
  try {
    const permissionId = req.params._id;

    const permission = await Permission.findByIdAndDelete(permissionId);

    if (!permission) {
      res.status(404);
      throw new Error("Permission not found");
    }

    res.status(200).send({
      message: "Permission deleted successfully!",

      data: permission,
      type: "success",
    });
  } catch (err) {
    res.status(500).send({ message: err.message, type: "error" });
  }
};
