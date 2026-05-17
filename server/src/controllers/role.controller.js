const Role = require("../models/role.model");

exports.getAllRoles = async (req, res) => {
  try {
    const roles = await Role.find();
    res.status(200).send({
      message: "Roles retrieved successfully",

      data: roles,
      type: "success",
    });
  } catch (err) {
    res.status(500).send({ message: err.message, type: "error" });
  }
};

exports.getOneRole = async (req, res) => {
  try {
    const role = await Role.findById(req.params._id);
    if (!role) {
      res.status(404);
      throw new Error("Role not found");
    }
    res.status(200).send({
      message: "Role retrieved successfully",

      data: role,
      type: "success",
    });
  } catch (err) {
    res.status(500).send({ message: err.message, type: "error" });
  }
};

exports.createRole = async (req, res) => {
  try {
    const { name, permissions } = req.body;

    if (!name) {
      res.status(400);
      throw new Error("Please provide a role name");
    }

    const roleExists = await Role.findOne({ name });

    if (roleExists) {
      res.status(400);
      throw new Error("Role name already exists");
    }

    const role = new Role({ name, permissions });

    const savedRole = await role.save();

    // Populate the `permissions` field with the corresponding Permission documents
    await savedRole.populate("permissions");

    res.status(201).send({
      message: "Role created successfully!",

      data: savedRole,
      type: "success",
    });
  } catch (err) {
    res.status(500).send({ message: err.message, type: "error" });
  }
};

exports.updateRole = async (req, res) => {
  try {
    const { name } = req.body;
    const roleId = req.params._id;

    if (!name) {
      res.status(400);
      throw new Error("Please provide a role name");
    }

    const role = await Role.findById(roleId);

    if (!role) {
      res.status(404);
      throw new Error("Role not found");
    }

    role.name = name;

    const updatedRole = await role.save();

    res.status(200).send({
      message: "Role updated successfully!",

      data: updatedRole,
      type: "success",
    });
  } catch (err) {
    res.status(500).send({ message: err.message, type: "error" });
  }
};

exports.deleteRole = async (req, res) => {
  try {
    const roleId = req.params._id;

    const role = await Role.findByIdAndDelete(roleId);

    if (!role) {
      res.status(404);
      throw new Error("Role not found");
    }

    res.status(200).send({
      message: "Role deleted successfully!",

      data: role,
      type: "success",
    });
  } catch (err) {
    res.status(500).send({ message: err.message, type: "error" });
  }
};
