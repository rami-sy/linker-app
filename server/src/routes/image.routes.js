const express = require("express");
const { postImage, getImage } = require("../controllers/image.controller");
const multer = require("multer");
const router = express.Router();
const verifyToken = require("../middlewares/verify-token");
const path = require("path");

const sanitizeFileName = (name) => {
  return name.toLowerCase().replace(/[^a-z0-9-_]/g, ""); // Remove dots
};

function checkFileType(req, file, cb) {
  const filetypes =
    /jpeg|jpg|png|ico|svg|gif|pdf|webp|webm|m4a|mp4|xlsx|xls|doc|docx|ppt|pptx|txt|JPEG|JPG|PNG|ICO|SVG|GIF|PDF|WEBP|M4A|WEBM|MP4|XLSX|XLS|DOC|DOCX|PPT|PPTX|TXT/;
  const mimetype = filetypes.test(file.mimetype.toLowerCase());
  if (mimetype) {
    return cb(null, true);
  } else {
    req.fileValidationError = "Invalid file type!";
    return cb(null, false, new Error("Invalid file type!"));
  }
}
var storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "uploads");
  },
  filename: function (req, file, cb) {
    // get the file extension form mimetype image/png
    const ext = path.extname(file.originalname);

    // Sanitize the filename without the extension
    let originalname =
      file.originalname && file.originalname !== "blob"
        ? sanitizeFileName(path.basename(file.originalname, ext))
        : Math.random().toString(36).substring(2, 15);
    // Truncate original name if too long
    if (originalname.length > 20) {
      originalname = originalname.substring(0, 20);
    }

    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);

    // Combine everything to form the new filename
    cb(null, `${req.user._id}-${uniqueSuffix}-${originalname}${ext}`);
  },
});

const upload = multer({
  storage: storage,
  limits: {
    fieldNameSize: 1000, // زيادة حجم الاسم إلى 500 بايت
    fieldSize: 50 * 1024 * 1024, // زيادة حجم القيمة إلى 50MB
    fileSize: 500 * 1024 * 1024, // زيادة حجم الملف إلى 500MB
  },
  fileFilter: function (_req, file, cb) {
    checkFileType(_req, file, cb);
  },
});

router.get("/:filename", getImage);
router.post("/", [verifyToken, upload.single("file")], postImage);

module.exports = router;
