const path = require("path");
const Image = require("../models/image.model");

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
    console.log({ file2: JSON.stringify( req.file ), 
    });
    const image = new Image({
      filename: file?.filename,
      originalname: file?.originalname,
      path: `/${file.destination}/${file?.filename}`,
      mimetype: file.mimetype,
      size: file.size,
      userId: req.user._id,
    });

    const savedImage = await image.save();
    console.log({savedImage});
    res.status(201).send({
      message: "File created successfully!",

      data: savedImage,
      type: "success",
    });
  } catch (error) {
    console.log({error});
    res.status(500).send({
      message: "Something went wrong",

      data: error,
      type: "error",
    });
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

exports.getImage = (req, res) => {
  const { filename } = req.params;

  res.sendFile(path.join(__dirname, "../../images", filename));
};
