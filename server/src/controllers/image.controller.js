const path = require("path");
const Image = require("../models/image.model");
const logger = require("../utils/logger");
const { formatSharedError, formatSharedSuccess } = require("../utils/errorCodes");

exports.postImage = async (req, res, next) => {
  if (req.fileValidationError) {
    return res.status(400).send({
      message: req.fileValidationError,

      type: "error",
    });
  }
  const file = req.file || req.body.file;

  if (!file) {
    return res.status(400).send({
      message: "Please upload a file",

      type: "error",
    });
  }
  try {
    const image = new Image({
      filename: file?.filename,
      originalname: file?.originalname,
      path: `/${file.destination}/${file?.filename}`,
      mimetype: file.mimetype,
      size: file.size,
      userId: req.user._id,
    });

    const savedImage = await image.save();
    res.status(201).send(formatSharedSuccess({
      message: "File created successfully!",
      data: savedImage,
    }));
  } catch (error) {
    logger.error("Failed to upload file", error);
    res.status(500).send(formatSharedError({ message: "Something went wrong" }));
  }
};

// delete one image
exports.deleteImage = async (req, res, next) => {
  const { _id } = req.params;

  try {
    const image = await Image.findByIdAndDelete(_id);

    if (!image) {
      return res.status(404).send({
        message: "Image not found",

        type: "error",
      });
    }
    // delete it from the images folder

    res.status(200).send({
      message: "Image deleted successfully!",

      data: image,
      type: "success",
    });
  } catch (error) {
    res.status(500).send({
      message: "Something went wrong",

      data: error,
      type: "error",
    });
  }
};

exports.getImage = async (req, res) => {
  const { filename } = req.params;
  const safeName = path.basename(filename);

  if (!safeName || safeName === "." || safeName === "..") {
    return res.status(400).send(formatSharedError({ message: "Invalid filename" }));
  }

  const userId = String(req.user._id);
  const ownerPrefix = `${userId}-`;

  if (!safeName.startsWith(ownerPrefix)) {
    const image = await Image.findOne({ filename: safeName })
      .select("userId")
      .lean();
    if (!image || String(image.userId) !== userId) {
      return res.status(403).send(formatSharedError({ message: "Forbidden" }));
    }
  }

  const filePath = path.join(__dirname, "../../uploads", safeName);
  return res.sendFile(filePath, (err) => {
    if (err && !res.headersSent) {
      res.status(404).send(formatSharedError({ message: "File not found" }));
    }
  });
};
