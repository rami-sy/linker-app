const CallSchedule = require("../models/call-schedule.model");

exports.listSchedules = async (req, res) => {
  try {
    const schedules = await CallSchedule.find({
      organizer: req.user._id,
      status: "scheduled",
      scheduledAt: { $gte: new Date() },
    })
      .sort({ scheduledAt: 1 })
      .limit(50)
      .lean();

    res.send({ type: "success", data: schedules });
  } catch (error) {
    res.status(500).send({ type: "error", message: "Failed to list schedules" });
  }
};

exports.createSchedule = async (req, res) => {
  try {
    const { title, scheduledAt, durationMinutes, participants, room, notes } =
      req.body || {};

    if (!scheduledAt) {
      return res
        .status(400)
        .send({ type: "error", message: "scheduledAt is required" });
    }

    const when = new Date(scheduledAt);
    if (Number.isNaN(when.getTime()) || when <= new Date()) {
      return res
        .status(400)
        .send({ type: "error", message: "scheduledAt must be in the future" });
    }

    const schedule = await CallSchedule.create({
      organizer: req.user._id,
      title,
      scheduledAt: when,
      durationMinutes,
      participants,
      room,
      notes,
    });

    res.status(201).send({ type: "success", data: schedule });
  } catch (error) {
    res.status(500).send({ type: "error", message: "Failed to create schedule" });
  }
};

exports.cancelSchedule = async (req, res) => {
  try {
    const schedule = await CallSchedule.findOneAndUpdate(
      { _id: req.params.id, organizer: req.user._id, status: "scheduled" },
      { status: "cancelled" },
      { new: true }
    );

    if (!schedule) {
      return res.status(404).send({ type: "error", message: "Schedule not found" });
    }

    res.send({ type: "success", data: schedule });
  } catch (error) {
    res.status(500).send({ type: "error", message: "Failed to cancel schedule" });
  }
};
