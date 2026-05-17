const Color = require("../models/color.model");
const Image = require("../models/image.model");
const Interest = require("../models/interest.model");
const Language = require("../models/language.model");
const User = require("../models/user.model");
const { faker } = require("@faker-js/faker");
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const createImageForUser = async (userId) => {
  const sourceImagesDir = path.join(__dirname, "..", "..", "fake-images"); // Source directory for sample images
  const destinationDir = path.join(__dirname, "..", "..", "uploads");
  if (!fs.existsSync(destinationDir)) {
    fs.mkdirSync(destinationDir, { recursive: true });
  }

  const imageFiles = fs
    .readdirSync(sourceImagesDir)
    .filter((file) => file.match(/\.(jpeg|jpg|png|ico|svg|gif|pdf|webp)$/i));

  const randomImageFile =
    imageFiles[Math.floor(Math.random() * imageFiles.length)];
  const filename = `${faker.string.uuid()}-${Date.now()}.jpeg`; // Always save as .jpeg

  const sourceFilePath = path.join(sourceImagesDir, randomImageFile);
  const destinationFilePath = path.join(destinationDir, filename);

  await sharp(sourceFilePath)
    .resize(1024)
    .jpeg({ quality: 80 })
    .toFile(destinationFilePath);

  const relativeDestinationPath = `/uploads/${filename}`;

  const image = new Image({
    filename,
    path: relativeDestinationPath,
    mimetype: `image/jpeg`,
    size: fs.statSync(destinationFilePath).size,
    userId: userId,
  });
  await image.save();

  return image._id;
};

const seedUsers = async (numUsers) => {
  const allUsers = await User.find().select("_id"); // جلب جميع المستخدمين الحاليين للحصول على معرفاتهم
  const allUserIds = allUsers.map((user) => user._id); // استخدم فقط معرفات المستخدمين
  const lookingForOptions = [
    "friendship",
    "relationship",
    "chatting",
    "networking",
    "other",
  ];
  const maritalStatusOptions = [
    "single",
    "married",
    "divorced",
    "widowed",
    "other",
  ];
  const preferredGenders = ["male", "female", "other"];
  const profilePrivacyOptions = ["everyone", "friends", "noOne"];
  const sampleLanguageIds = await Language.find().select("name");
  const sampleInterestIds = await Interest.find().select("name");

  console.log({ sampleInterestIds });

  for (let i = 0; i < numUsers; i++) {
    const firstName = faker.person.firstName();
    const lastName = faker.person.lastName();
    let baseEmail = faker.internet.email({ firstName, lastName }).toLowerCase();

    const uniqueSuffix =
      Date.now().toString(36) + Math.random().toString(36).substr(2);
    let parts = baseEmail.split("@");
    baseEmail = `${parts[0]}+${uniqueSuffix}@${parts[1]}`;

    const user = new User({
      userName: faker.internet.userName({ firstName, lastName }).toLowerCase(),
      email: baseEmail,
      phoneNumber: faker.phone.number(),
      password: "password",
      firstName: firstName.toLowerCase(),
      lastName: lastName.toLowerCase(),
      gender: faker.helpers.arrayElement(["male", "female", "other"]),
      maritalStatus: faker.helpers.arrayElement(maritalStatusOptions),
      age: faker.number.int({ min: 18, max: 100 }),
      bio: faker.lorem.sentences(),
      nationality: faker.location.country(),
      preferredGenders: faker.helpers.arrayElements(preferredGenders),
      preferredAgeRange: [
        faker.number.int({ min: 18, max: 50 }),
        faker.number.int({ min: 51, max: 100 }),
      ],
      lookingFor: faker.helpers.arrayElements(lookingForOptions),
      images: [],
      birthDate: {
        month: faker.number.int({ min: 1, max: 12 }),
        day: faker.number.int({ min: 1, max: 31 }),
        year: faker.number.int({ min: 1900, max: 2021 }),
      },
      preferredDistance: faker.number.int({ min: 5, max: 1500 }),
      preferredCommunications: faker.helpers.arrayElements([
        "text",
        "voice",
        "video",
        "in person",
      ]),
      smoking: faker.helpers.arrayElement([
        "yes",
        "no",
        "sometimes",
        "trying to quit",
        "in social events",
      ]),
      location: {
        type: "Point",
        coordinates: [faker.location.longitude(), faker.location.latitude()],
        city: faker.location.city(),
        state: faker.location.state(),
        country: faker.location.country(),
      },

      languages: faker.helpers.arrayElements(
        sampleLanguageIds.map((lang) => lang.name),
        faker.number.int({ min: 1, max: 5 })
      ),
      interests: faker.helpers.arrayElements(
        sampleInterestIds.map((interest) => interest.name),
        faker.number.int({ min: 1, max: 5 })
      ),

      drinking: faker.helpers.arrayElement([
        "yes",
        "no",
        "sometimes",
        "trying to quit",
        "in social events",
      ]),
      height: faker.number.int({ min: 140, max: 200 }),
      weight: faker.number.int({ min: 40, max: 150 }),
      bodyType: faker.helpers.arrayElement([
        "slim",
        "average",
        "athletic",
        "full-figured",
        "curvy",
        "muscular",
        "petite",
        "a little extra",
        "stocky",
      ]),
      education: faker.helpers.arrayElement([
        "no high school diploma",
        "high school diploma",
        "some college, no degree",
        "associate degree",
        "bachelor's degree",
        "master's degree",
        "doctorate or higher",
        "other",
      ]),
      occupation: faker.person.jobTitle(),
      religion: faker.helpers.arrayElement([
        "agnostic",
        "atheist",
        "buddhist",
        "christian",
        "catholic",
        "hindu",
        "jewish",
        "muslim",
        "sikh",
        "other",
      ]),
      personalityType: faker.helpers.arrayElement([
        "INTJ",
        "ENTP",
        "ISFJ",
        "ENFJ",
        "ISTP",
        "ESFP",
        "ESTJ",
        "INFJ",
        "ISFP",
        "ESTP",
        "ENFP",
        "INTP",
        "ENTJ",
        "ISTJ",
        "INFP",
        "ESFJ",
      ]),
      zodiacSign: faker.helpers.arrayElement([
        "Aries",
        "Taurus",
        "Gemini",
        "Cancer",
        "Leo",
        "Virgo",
        "Libra",
        "Scorpio",
        "Sagittarius",
        "Capricorn",
        "Aquarius",
        "Pisces",
      ]),
      wantsKids: faker.datatype.boolean(),
      hasKids: faker.datatype.boolean(),
      hasPets: faker.datatype.boolean(),
      exercise: faker.helpers.arrayElement([
        "never",
        "rarely",
        "sometimes",
        "daily",
        "weekly",
        "monthly",
      ]),
      politicalViews: faker.helpers.arrayElement([
        "anarchist",
        "centrist",
        "conservative",
        "liberal",
        "libertarian",
        "moderate",
        "progressive",
        "socialist",
        "other",
      ]),
      sleepSchedule: faker.helpers.arrayElement([
        "early bird",
        "night owl",
        "varies",
      ]),

      isCompleted: true,
      friends: faker.helpers.arrayElements(
        allUserIds,
        faker.number.int({ min: 0, max: 10 })
      ),
      incomingFriendRequests: faker.helpers.arrayElements(
        allUserIds,
        faker.number.int({ min: 0, max: 10 })
      ),
      outgoingFriendRequests: faker.helpers.arrayElements(
        allUserIds,
        faker.number.int({ min: 0, max: 10 })
      ),
      blockedUsers: faker.helpers.arrayElements(
        allUserIds,
        faker.number.int({ min: 0, max: 10 })
      ),
      privacySettings: {
        visibility: {
          fullName: faker.helpers.arrayElement(profilePrivacyOptions),
          email: faker.helpers.arrayElement(profilePrivacyOptions),
          phoneNumber: faker.helpers.arrayElement(profilePrivacyOptions),
          location: faker.helpers.arrayElement(profilePrivacyOptions),
          gender: faker.helpers.arrayElement(profilePrivacyOptions),
          age: faker.helpers.arrayElement(profilePrivacyOptions),
          nationality: faker.helpers.arrayElement(profilePrivacyOptions),
          bio: faker.helpers.arrayElement(profilePrivacyOptions),
          images: faker.helpers.arrayElement(profilePrivacyOptions),
          profileInfo: faker.helpers.arrayElement(profilePrivacyOptions),
        },
        interactions: {
          status: faker.helpers.arrayElement(profilePrivacyOptions),
          readReceipts: faker.helpers.arrayElement(profilePrivacyOptions),
          calls: faker.helpers.arrayElement(profilePrivacyOptions),
          videoCalls: faker.helpers.arrayElement(profilePrivacyOptions),
          messages: faker.helpers.arrayElement(profilePrivacyOptions),
          lastSeen: faker.helpers.arrayElement(profilePrivacyOptions),
          add: faker.helpers.arrayElement(profilePrivacyOptions),
        },
        content: {
          posts: faker.helpers.arrayElement(profilePrivacyOptions),
          images: faker.helpers.arrayElement(profilePrivacyOptions),
          videos: faker.helpers.arrayElement(profilePrivacyOptions),
          stories: faker.helpers.arrayElement(profilePrivacyOptions),
          likedPages: faker.helpers.arrayElement(profilePrivacyOptions),
        },
        networking: {
          friendsList: faker.helpers.arrayElement(profilePrivacyOptions),
          followers: faker.helpers.arrayElement(profilePrivacyOptions),
          following: faker.helpers.arrayElement(profilePrivacyOptions),
          searchVisibility: faker.helpers.arrayElement(profilePrivacyOptions),
        },
      },
    });

    const numImages = faker.number.int({ min: 1, max: 3 });
    const imageIds = [];

    for (let j = 0; j < numImages; j++) {
      const imageId = await createImageForUser(user._id);
      imageIds.push(imageId);
    }
    user.images = imageIds;

    const hexColor = faker.color.rgb({ format: "hex", casing: "lower" });
    const colorExists = await Color.findOne({ code: hexColor });
    if (!colorExists) {
      const color = new Color({
        name: "Generated color",
        code: hexColor,
        users: [{ user: user._id, percentage: 100 }],
      });
      await color.save();
      user.colors = [color];
    }
    await user.save();
    console.log(`User ${i + 1} created with email: ${user.email}`);
  }
};

module.exports = seedUsers;
