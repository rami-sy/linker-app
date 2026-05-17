const Interest = require("../models/interest.model");

exports.getAllInterests = async (req, res) => {
  try {
    const interests = await Interest.find();
    res.status(200).send({
      message: "Interests retrieved successfully",

      data: interests,
      type: "success",
    });
  } catch (err) {
    res.status(500).send({ message: err.message, type: "error" });
  }
};

exports.getOneInterest = async (req, res) => {
  try {
    const interest = await Interest.findById(req.params._id);
    if (!interest) {
      res.status(404);
      throw new Error("Interest not found");
    }
    res.status(200).send({
      message: "Interest retrieved successfully",

      data: interest,
      type: "success",
    });
  } catch (err) {
    res.status(500).send({ message: err.message, type: "error" });
  }
};

exports.createInterest = async (req, res) => {
  try {
    const { name } = req.body;

    if (!name) {
      res.status(400);
      throw new Error("Please provide a interest name");
    }

    const interestExists = await Interest.findOne({ name });

    if (interestExists) {
      res.status(400);
      throw new Error("Interest name already exists");
    }

    const interest = new Interest({ name });

    const savedInterest = await interest.save();

    res.status(201).send({
      message: "Interest created successfully!",

      data: savedInterest,
      type: "success",
    });
  } catch (err) {
    res.status(500).send({ message: err.message, type: "error" });
  }
};

exports.updateInterest = async (req, res) => {
  try {
    const { name } = req.body;
    const interestId = req.params._id;

    if (!name) {
      res.status(400);
      throw new Error("Please provide a interest name");
    }

    const interest = await Interest.findById(interestId);

    if (!interest) {
      res.status(404);
      throw new Error("Interest not found");
    }

    interest.name = name;

    const updatedInterest = await interest.save();

    res.status(200).send({
      message: "Interest updated successfully!",

      data: updatedInterest,
      type: "success",
    });
  } catch (err) {
    res.status(500).send({ message: err.message, type: "error" });
  }
};

exports.deleteInterest = async (req, res) => {
  try {
    const interestId = req.params._id;

    const interest = await Interest.findByIdAndDelete(interestId);

    if (!interest) {
      res.status(404);
      throw new Error("Interest not found");
    }

    res.status(200).send({
      message: "Interest deleted successfully!",

      data: interest,
      type: "success",
    });
  } catch (err) {
    res.status(500).send({ message: err.message, type: "error" });
  }
};
