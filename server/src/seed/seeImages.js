// const mongoose = require("mongoose");
// const Image = require("../models/image.model");
// const { faker } = require("@faker-js/faker");

// const seedImages = async (numImages) => {
//   const sampleLanguageIds = await Image.find();
//   console.log(sampleLanguageIds);

//   for (let i = 0; i < numImages; i++) {
//     // Simulate image file data
//     const originalname = faker.system.fileName();
//     const mimetype = faker.system.mimeType();
//     const size = faker.number.int({ min: 5000, max: 5000000 }); // size in bytes, 5KB to 5MB
//     const path = `uploads/${faker.system.commonFileName(mimetype)}`;
//     const filename = path.split("/").pop();

//     // Assuming 'user' references an existing user's ID. You might need a real user ID here.
//     // For simplicity, this example uses a hardcoded ObjectId. In practice, you'd fetch or randomly select
//     // an existing user's ID from your database.
//     // const user = mongoose.Types.ObjectId("507f191e810c19729de860ea"); // Example ObjectId

//     const image = new Image({
//       filename,
//       path,
//       originalname,
//       mimetype,
//       size,
//       // user, // Adjust this as necessary based on your actual user data
//     });

//     await image.save();
//   }
//   console.log(`${numImages} images seeded successfully.`);
// };

// module.exports = seedImages;

const fs = require("fs");
const path = require("path");
const Image = require("../models/image.model");
const { faker } = require("@faker-js/faker");
const sourceImagesDir = path.join(__dirname, "..", "..", "fake-images"); // The source directory where your sample images are stored

// Ensure you have a 'sample-images' directory with some images in the root of your project
const seedImages = async (numImages) => {
  const destinationDir = path.join(__dirname, "..", "..", "images");

  // Read all the files from the source directory
  const imageFiles = fs
    .readdirSync(sourceImagesDir)
    .filter((file) => file.match(/\.(jpeg|jpg|png|ico|svg|gif|pdf|webp)$/i));
  await Image.deleteMany({});

  for (let i = 0; i < numImages; i++) {
    // Use a random image file from the source directory
    const randomImageFile =
      imageFiles[Math.floor(Math.random() * imageFiles.length)];
    const fileExtension = path.extname(randomImageFile);
    const filename = `file-${faker.string.uuid()}-${Date.now()}${fileExtension}`;
    const destinationFilePath = path.join(destinationDir, filename);

    // Copy the file to the destination directory
    fs.copyFileSync(
      path.join(sourceImagesDir, randomImageFile),
      destinationFilePath
    );

    // delete all images from db

    // Create a new Image document
    const image = new Image({
      filename,
      path: destinationFilePath,
      mimetype: `image/${fileExtension.slice(1)}`, // Remove the dot from the extension
      size: fs.statSync(destinationFilePath).size,
      // user: faker.datatype.uuid(), // Use a real user ID or adjust as necessary
    });

    console.log(`image: ${image.filename} created successfully.`);

    await image.save();
  }

  console.log(`${numImages} images seeded successfully.`);
};

module.exports = seedImages;
