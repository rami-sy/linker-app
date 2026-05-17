const Report = require("../models/report.model");

exports.createReport = async (req, res) => {
  try {
    const { type, description, email, targetUser, room, message, meta } = req.body;
    const reporter = req.user?._id || req.user?.id;
    const allowedTypes = new Set([
      "spam",
      "abuse",
      "harassment",
      "impersonation",
      "child_safety",
      "privacy",
      "technical",
      "other",
    ]);
    const normalizedType = String(type || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "_");

    if (!reporter) {
      res.status(401);
      throw new Error("Unauthorized");
    }

    if (!normalizedType) {
      res.status(400);
      throw new Error("Please provide a report type");
    }

    if (!description || !String(description).trim()) {
      res.status(400);
      throw new Error("Please provide a report description");
    }

    const report = new Report({
      type: allowedTypes.has(normalizedType) ? normalizedType : "other",
      description: String(description).trim(),
      email: email ? String(email).trim() : "",
      reporter,
      targetUser: targetUser || null,
      room: room || null,
      message: message || null,
      meta: meta && typeof meta === "object" ? meta : {},
    });

    const savedReport = await report.save();

    res.status(201).send({
      message: "Report created successfully!",

      data: savedReport,
      type: "success",
    });
  } catch (err) {
    const statusCode = res.statusCode && res.statusCode !== 200 ? res.statusCode : 500;
    res.status(statusCode).send({ message: err.message, type: "error" });
  }
};
