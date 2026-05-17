const Language = require("../models/language.model");

exports.getAllLanguages = async (req, res) => {
  try {
    const languages = await Language.find();
    res.status(200).send({
      message: "Languages retrieved successfully",

      data: languages,
      type: "success",
    });
  } catch (err) {
    res.status(500).send({ message: err.message, type: "error" });
  }
};

exports.getOneLanguage = async (req, res) => {
  try {
    const language = await Language.findById(req.params._id);
    if (!language) {
      res.status(404);
      throw new Error("Language not found");
    }
    res.status(200).send({
      message: "Language retrieved successfully",

      data: language,
      type: "success",
    });
  } catch (err) {
    res.status(500).send({ message: err.message, type: "error" });
  }
};

exports.createLanguage = async (req, res) => {
  try {
    const { name } = req.body;

    if (!name) {
      res.status(400);
      throw new Error("Please provide a language name");
    }

    const languageExists = await Language.findOne({ name });

    if (languageExists) {
      res.status(400);
      throw new Error("Language name already exists");
    }

    const language = new Language({ name });

    const savedLanguage = await language.save();

    res.status(201).send({
      message: "Language created successfully!",

      data: savedLanguage,
      type: "success",
    });
  } catch (err) {
    res.status(500).send({ message: err.message, type: "error" });
  }
};

exports.updateLanguage = async (req, res) => {
  try {
    const { name } = req.body;
    const languageId = req.params._id;

    if (!name) {
      res.status(400);
      throw new Error("Please provide a language name");
    }

    const language = await Language.findById(languageId);

    if (!language) {
      res.status(404);
      throw new Error("Language not found");
    }

    language.name = name;

    const updatedLanguage = await language.save();

    res.status(200).send({
      message: "Language updated successfully!",

      data: updatedLanguage,
      type: "success",
    });
  } catch (err) {
    res.status(500).send({ message: err.message, type: "error" });
  }
};

exports.deleteLanguage = async (req, res) => {
  try {
    const languageId = req.params._id;

    const language = await Language.findByIdAndDelete(languageId);

    if (!language) {
      res.status(404);
      throw new Error("Language not found");
    }

    res.status(200).send({
      message: "Language deleted successfully!",

      data: language,
      type: "success",
    });
  } catch (err) {
    res.status(500).send({ message: err.message, type: "error" });
  }
};
