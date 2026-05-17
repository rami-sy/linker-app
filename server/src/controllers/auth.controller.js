const config = require("../config/auth.config");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const User = require("../models/user.model");
const twilio = require("twilio");
const nodemailer = require("nodemailer");
const validator = require("validator");
const generateVerifyCode = require("../utils/generate-code");
const Color = require("../models/color.model");
const { OAuth2Client } = require("google-auth-library");
const { Vonage } = require("@vonage/server-sdk");
const Device = require("../models/device.model");
const { default: mongoose } = require("mongoose");
const logger = require("../utils/logger");

const client = new OAuth2Client(
  "291973193159-2blim9hhevst8r5p074lujhb47qvo391.apps.googleusercontent.com"
);

// Email transporter configuration using environment variables
// ⚠️ SECURITY: All credentials must be provided via environment variables
if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
  logger.error("SMTP credentials are missing. Please set SMTP_USER and SMTP_PASS in environment variables.");
}

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "smtp.gmail.com",
  port: parseInt(process.env.SMTP_PORT) || 587,
  secure: false, // true for 465, false for other ports
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS, // Must be provided via environment variable
  },
  // Add connection timeout and retry options
  connectionTimeout: 10000, // 10 seconds
  greetingTimeout: 10000,
  socketTimeout: 10000,
  // Retry configuration
  pool: true,
  maxConnections: 1,
  maxMessages: 3,
});

const sendEmail = async (
  { responseMessage, from, to, subject, text, html },
  res
) => {
  const mailOptions = {
    from: from,
    to: to,
    subject: subject,
    text: text,
    html: html,
  };

  transporter.sendMail(mailOptions, function (error, info) {
    try {
      if (error) {
        logger.error("Error sending email", error);
        
        // Check for specific Gmail authentication errors
        if (error.code === 'EAUTH' || error.responseCode === 534) {
          logger.error("Gmail authentication error - Please check your App Password settings", {
            message: error.message,
            response: error.response,
          });
          res.status(500).json({
            message: "Email service authentication failed. Please check email configuration.",
            type: "error",
            error: process.env.NODE_ENV === 'development' ? error.message : undefined,
          });
        } else {
          res.status(500).json({
            message: "Internal server error",
            type: "error",
            error: process.env.NODE_ENV === 'development' ? error.message : undefined,
          });
        }
      } else {
        logger.debug("Email sent successfully", { to, subject, messageId: info.messageId });
        res.status(200).json({
          message: responseMessage,
          type: "success",
        });
      }
    } catch (error) {
      logger.error("Error sending email", error);
      res.status(500).json({
        message: "Internal server error",
        type: "error",
        error: process.env.NODE_ENV === 'development' ? error.message : undefined,
      });
    }
  });
};
// Vonage configuration with environment variables
// ⚠️ SECURITY: All API keys must be provided via environment variables
if (!process.env.VONAGE_API_KEY || !process.env.VONAGE_API_SECRET) {
  logger.warn("VONAGE API credentials are missing. SMS functionality will be disabled.");
}

const vonage = process.env.VONAGE_API_KEY && process.env.VONAGE_API_SECRET
  ? new Vonage({
      apiKey: process.env.VONAGE_API_KEY,
      apiSecret: process.env.VONAGE_API_SECRET,
      brand: "Linker",
      from: "Linker",
    })
  : null;

async function sendVerificationCode(phoneNumber, verifyCode) {
  try {
    if (!vonage) {
      logger.error("Cannot send SMS: VONAGE API credentials are not configured", { phoneNumber });
      throw new Error("SMS service is not configured. Please set VONAGE_API_KEY and VONAGE_API_SECRET in environment variables.");
    }

    // const accountSid = process.env.TWILIO_ACCOUNT_SID;
    // const authToken = process.env.TWILIO_AUTH_TOKEN;
    // const client = twilio(accountSid, authToken);

    // const message = await client.messages.create({
    //   body: `Your verification code is ${verifyCode}`,
    //   from: process.env.TWILIO_PHONE_NUMBER,
    //   to: phoneNumber,
    // });

    await vonage.sms
      .send({
        to: "00" + phoneNumber,
        from: "Linker",
        text: `Your verification code is ${verifyCode}`,
      })
      .then((resp) => {
        logger.info("SMS verification code sent successfully", { phoneNumber });
        logger.debug("SMS response", resp);
      })
      .catch((err) => {
        logger.error("Error sending SMS verification code", { err, phoneNumber });
      });
  } catch (error) {
    logger.error("Error sending verification code", error);
    throw error;
  }
}

const generateAuthToken = (user) => {
  // here just add the user id, user email, user name, user image
  let payload = {
    _id: user._id,
  };

  const options = {
    expiresIn: "30d",
  };

  return jwt.sign(payload, config.secret, options);
};

exports.signup = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res
        .status(400)
        .json({ message: "Email and password are required", type: "error" });
    }
    // Check if user exists
    const userEmailExists = await User.findOne({ email });

    if (userEmailExists) {
      return res
        .status(400)
        .json({ message: "User email already exists", type: "error" });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    const newVerifyCode = generateVerifyCode();
    const verifyCodeExpires = Date.now() + 600000; // 10 minutes

    const user = new User({
      email: email,
      password: hashedPassword,
      emailVerification: {
        code: newVerifyCode,
        expires: new Date(verifyCodeExpires),
      },
    });

    await user.save();

    const emailDetails = {
      responseMessage: "User registered successfully, please verify your email",
      from: {
        name: "Linker",
        address: "rami@linker.land",
      },
      to: [email],
      subject: "Email Verification Code",
      text: `Your verification code is ${newVerifyCode}. Do not share it with anyone.`,
      html: `<div style="font-family: Arial, sans-serif; color: #d6d3d1; background-color: #1c202a; padding: 20px; border-radius: 8px;">
      <div style="border-bottom: 1px solid #2e3440; padding-bottom: 10px; margin-bottom: 20px;">
      <h1 style="color:#d6d3d1">Email Verification</h1>
      </div>
      <p style="font-size: 16px; color:#d6d3d1">Your verification code is <strong>${newVerifyCode}</strong>. It will expire in 10 minutes. Do not share it with anyone.</p>
      </div>`,
    };

    await sendEmail(emailDetails, res);
  } catch (err) {
    logger.error("Error in auth controller", err);
    res.status(500).send({ message: err.message, type: "error" });
  }
};

exports.resendEmailVerificationCode = async (req, res) => {
  const { email } = req.body;

  try {
    // Find the user by email and check if already verified
    const user = await User.findOne({ email }).select("+emailVerification");

    if (!user) {
      return res.status(404).json({ message: "User not found", type: "error" });
    }

    if (user.emailVerification.verified) {
      return res
        .status(400)
        .json({ message: "Email already verified", type: "error" });
    }

    // Generate a new verification code and expiration time
    const newVerifyCode = generateVerifyCode();
    const verifyCodeExpires = Date.now() + 600000; // 10 minutes
    logger.debug("Verification code generated", { email: user.email, expires: verifyCodeExpires });

    // Update user document with new code and expiration
    user.emailVerification.code = newVerifyCode;
    user.emailVerification.expires = new Date(verifyCodeExpires);
    await user.save();

    // Setup email details
    const emailDetails = {
      from: { name: "Linker", address: "rami@linker.land" },
      to: [user.email],
      responseMessage: "Verification code resent successfully",
      subject: "Resend Email Verification Code",
      text: `Your new verification code is ${newVerifyCode}. It will expire in 10 minutes. Do not share it with anyone.`,
      html: `<div style="font-family: Arial, sans-serif; color: #d6d3d1; background-color: #1c202a; padding: 20px; border-radius: 8px;">
      <div style="border-bottom: 1px solid #2e3440; padding-bottom: 10px; margin-bottom: 20px;">
      <h1 style="color:#d6d3d1">Email Verification</h1>
      </div>
      <p style="font-size: 16px; color:#d6d3d1">Your new verification code is <strong>${newVerifyCode}</strong>. It will expire in 10 minutes. Do not share it with anyone.</p>
      </div>`,
    };

    // Send the new verification code via email
    await sendEmail(emailDetails, res);
  } catch (error) {
    logger.error("Error resending verification code", error);
    res.status(500).json({ message: "Internal server error", type: "error" });
  }
};

exports.resendPhoneVerificationCode = async (req, res) => {
  const { phoneNumber } = req.body;

  try {
    // Find the user by phone number and check if already verified
    let user = await User.findOne({ phoneNumber }).select("+phoneVerification");

    if (!user) {
      return res.status(404).json({ message: "User not found", type: "error" });
    }

    if (user.phoneVerification.verified) {
      return res
        .status(400)
        .json({ message: "Phone number already verified", type: "error" });
    }

    // Generate a new verification code and expiration time
    const newVerifyCode = generateVerifyCode();
    const verifyCodeExpires = Date.now() + 600000; // 10 minutes

    // Update user document with new code and expiration
    user.phoneVerification.code = newVerifyCode;
    user.phoneVerification.expires = new Date(verifyCodeExpires);
    await user.save();

    // Send the new verification code via SMS using Twilio
    await sendVerificationCode(phoneNumber, newVerifyCode);

    res.status(200).json({
      message: "Verification code resent successfully",
      type: "success",
    });
  } catch (error) {
    logger.error("Error resending verification code", error);
    res.status(500).json({ message: "Internal server error", type: "error" });
  }
};

exports.signin = async (req, res) => {
  try {
    const { email, password, deviceId } = req.body;
    const user = await User.findOne({ email: email })
      .select(
        "+incomingFriendRequests +friends +outgoingFriendRequests +blockedUsers +colors +password +images"
      )
      .populate("colors images")
      .exec();
      logger.debug('Signin attempt', { email, deviceId });
    if (!user) {
      res.status(404);
      throw new Error("User not found");
    }
    if (!user.password) {
      logger.debug('User without password', { userId: user._id });
      if (user.identifiers.googleId) {
        return res.status(400).json({
          message: "User does not have a password, please sign in with google",
          type: "error",
          data: {
            openSetPassword: true,
          },
        });
      }
      res.status(400);
      throw new Error("User does not have a password");
    }
    // ⚠️ SECURITY: Always verify password, no development bypass
    const auth = await bcrypt.compare(password, user.password);
    if (auth) {
      const filteredUser = user.toObject();
      delete filteredUser.password;
      delete filteredUser.__v;
      delete filteredUser.incomingFriendRequests;
      delete filteredUser.outgoingFriendRequests;
      delete filteredUser.blockedUsers;
      delete filteredUser.colors;
      delete filteredUser.friends;
      delete filteredUser.privacy;

      const token = generateAuthToken(filteredUser);

      const device = await Device.findOne({ user: user._id, deviceId });
      if (device) {
        device.forceLogout = false;
        device.lastLogin = Date.now();
        await device.save();
      }

      res.status(200).send({
        message: "User was logged in successfully!",

        data: {
          token: token,
        },
        type: "success",
      });
    } else {
      res.status(401);
      throw new Error("Invalid Password!");
    }
  } catch (err) {
    logger.error("Error in auth controller", err);
    res.status(500).send({ message: err.message, type: "error" });
  }
};

exports.phoneAuth = async (req, res) => {
  let { phoneNumber } = req.body;
  logger.debug("Phone verification request", { phoneNumber });
  if (!validator.isMobilePhone(phoneNumber)) {
    return res.status(400).json({
      message: "Invalid phone number",

      type: "error",
    });
  }

  if (phoneNumber.startsWith("00")) {
    phoneNumber = "+" + phoneNumber.slice(2); // Replace "00" with "+"
  }
  try {
    let user = await User.findOne({ phoneNumber });

    if (user) {
      // If user already exists, update the verification code
      const newVerifyCode = generateVerifyCode();
      const verifyCodeExpires = Date.now() + 600000; // 10 minutes

      let phoneVerification = {
        code: newVerifyCode,
        expires: new Date(verifyCodeExpires),
        verified: false,
      };

      user.phoneVerification = phoneVerification;

      // Send the verification code via SMS using Twilio
      await sendVerificationCode(phoneNumber, newVerifyCode);

      await user.save();

      await res.status(200).json({
        message: "Verification code sent successfully",
        type: "success",
      });
    } else {
      // If user doesn't exist, create a new user with a random verification code
      const newVerifyCode = generateVerifyCode();
      const verifyCodeExpires = Date.now() + 600000; // 10 minutes

      user = new User({
        phoneNumber,
        phoneVerification: {
          code: newVerifyCode,
          expires: new Date(verifyCodeExpires),
          verified: false,
        },
      });

      await user.save();

      // Send the verification code via SMS using Twilio
      await sendVerificationCode(phoneNumber, newVerifyCode);

      res.status(200).json({
        message: "Verification code sent successfully!",
        type: "success",
      });
    }
  } catch (error) {
    logger.error("Error sending verification code", error);
    res.status(500).json({
      message: "Internal server error",
    });
  }
};

exports.verifyPhone = async (req, res) => {
  const { phoneNumber, verificationCode, deviceId } = req.body;

  // Function to convert Arabic/Hindi numerals to standard Arabic numerals
  const normalizePhoneNumber = (input) => {
    const arabicNumbers = ["٠", "١", "٢", "٣", "٤", "٥", "٦", "٧", "٨", "٩"];
    return input.replace(/[٠-٩]/g, (d) => arabicNumbers.indexOf(d));
  };

  // Normalize the phone number
  const normalizedPhoneNumber = normalizePhoneNumber(phoneNumber);
  const normalizedVerificationCode = normalizePhoneNumber(verificationCode);
  logger.debug("Phone verification", {
    phoneNumber: normalizedPhoneNumber,
    normalizedVerificationCode,
  });

  try {
    let user = await User.findOne({ phoneNumber: normalizedPhoneNumber })
      .select(
        "+phoneVerification.code +phoneVerification.expires +phoneVerification.verified +incomingFriendRequests +friends +outgoingFriendRequests +blockedUsers +colors +images"
      )
      .populate("colors images")
      .exec();

    if (!user) {
      return res.status(400).json({ message: "User not found", type: "error" });
    }

    if (
      user.phoneVerification.code !== normalizedVerificationCode &&
      process.env.NODE_ENV !== "development"
    ) {
      return res.status(400).json({
        message: "Invalid verification code",
        type: "error",
      });
    }

    if (
      user.phoneVerification.expires < Date.now() &&
      process.env.NODE_ENV !== "development"
    ) {
      return res.status(400).json({
        message: "Verification code has expired",
        type: "error",
      });
    }

    const filteredUser = user.toObject();
    delete filteredUser.password;
    delete filteredUser.__v;
    delete filteredUser.incomingFriendRequests;
    delete filteredUser.outgoingFriendRequests;
    delete filteredUser.blockedUsers;
    delete filteredUser.colors;
    delete filteredUser.friends;
    delete filteredUser.privacy;
    delete filteredUser.phoneVerification;
    delete filteredUser.emailVerification;

    const token = generateAuthToken(filteredUser);

    const device = await Device.findOne({ user: user._id, deviceId });
    if (device) {
      device.forceLogout = false;
      device.lastLogin = Date.now();
      await device.save();
    }

    // Updating the verification status directly within the findOneAndUpdate for atomicity
    await User.findOneAndUpdate(
      { phoneNumber: normalizedPhoneNumber },
      { "phoneVerification.verified": true }
    );

    return res.status(200).json({
      message: "Phone number verified successfully",
      data: {
        token: token,
      },
      type: "success",
    });
  } catch (error) {
    logger.error("Error verifying phone number", error);
    res.status(500).json({
      message: "Internal server error",
      type: "error",
    });
  }
};

exports.verifyEmail = async (req, res) => {
  const { email, verificationCode } = req.body;

  try {
    let user = await User.findOne({ email }).select(
      "+emailVerification.code +emailVerification.expires"
    );

    if (!user) {
      return res.status(404).json({ message: "User not found", type: "error" });
    }

    const { code, expires, verified } = user.emailVerification || {};

    if (verified) {
      await User.findOneAndUpdate(
        { email },
        {
          $set: {
            "emailVerification.code": null,
            "emailVerification.expires": null,
          },
        }
      );
      return res
        .status(200)
        .json({ message: "Email already verified", type: "success" });
    }

    if (code !== verificationCode && process.env.NODE_ENV !== "development") {
      return res
        .status(400)
        .json({ message: "Invalid verification code", type: "error" });
    }

    if (expires < Date.now() && process.env.NODE_ENV !== "development") {
      return res
        .status(400)
        .json({ message: "Verification code has expired", type: "error" });
    }

    await User.findOneAndUpdate(
      { email },
      {
        $set: {
          "emailVerification.verified": true,
        },
      }
    );

    return res
      .status(200)
      .json({ message: "Email verified successfully", type: "success" });
  } catch (error) {
    logger.error("Error verifying email", error);
    res.status(500).json({ message: "Internal server error", type: "error" });
  }
};

exports.me = async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
      .select(
        "+incomingFriendRequests +friends +outgoingFriendRequests +blockedUsers +colors  +password +images +privacySettings"
      )
      .populate("colors images")
      .exec();

    if (!user) {
      res.status(404);
      throw new Error("User Not found");
    }

    await user.save();

    if (!user.colors.length) {
      const color = await saveColorForUser(user._id);
      user.colors.push(color._id);
      await user.save();
    }

    user.status = "online";
    user.lastSeen = Date.now();
    await user.save();

    // check if the user has a password on not, becuse some users are sigin with email, google or phone number
    let doseUserHavePassword = user.password ? true : false;
    let userObject = user.toObject();
    delete userObject.password;

    res.status(200).send({
      message: "User information retrieved successfully",
      data: {
        ...userObject,
        doseUserHavePassword,
        daysRemaining: req.user.daysRemaining,
      },
      type: "success",
    });
  } catch (err) {
    logger.error("Error in auth controller", err);
    res.status(500).send({ message: err.message, type: "error" });
  }
};


exports.updateProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).send({ message: "User Not found", type: "error" });
    }

    const {
      email,
      phoneNumber,
      userName,
      firstName,
      lastName,
      images,
      gender,
      bio,
      privacySettings,
      expoPushToken,
      birthDate,
      isCompleted,
      settings,
      maritalStatus,
      nationality,
      preferredGenders,
      preferredAgeRange,
      lookingFor,
      preferredDistance,
      preferredCommunications,
      ...otherFields
    } = req.body;

    // delete req.body.__v;

    let queryConditions = [];

    if (email) queryConditions.push({ email });
    if (phoneNumber) queryConditions.push({ phoneNumber });

    // Check for uniqueness if at least one field is provided
    if (queryConditions.length > 0) {
      const existingUser = await User.findOne({
        $or: queryConditions,
      });

      if (existingUser && existingUser._id.toString() !== user._id.toString()) {
        let field =
          existingUser.email === email
            ? "email"
            : existingUser.phoneNumber === phoneNumber
            ? "phoneNumber"
            : "Unknown field";

        return res
          .status(400)
          .send({ message: `${field} is already taken.`, type: "error" });
      }
    }

    // Update user fields if they are provided
    if (email) user.email = email;
    if (phoneNumber) user.phoneNumber = phoneNumber;
    if (userName) user.userName = userName;
    if (firstName) user.firstName = firstName;
    if (lastName) user.lastName = lastName;
    if (images && images.length) user.images = images;
    if (gender) user.gender = gender;
    if (bio) user.bio = bio;
    if (privacySettings) user.privacySettings = privacySettings;
    if (expoPushToken) user.expoPushToken = expoPushToken;
    if (isCompleted) user.isCompleted = isCompleted;
    if (settings) user.settings = settings;
    if (maritalStatus) user.maritalStatus = maritalStatus;
    if (nationality) user.nationality = nationality;
    if (preferredGenders) user.preferredGenders = preferredGenders;
    if (preferredAgeRange) user.preferredAgeRange = preferredAgeRange;
    if (lookingFor) user.lookingFor = lookingFor;
    if (preferredDistance) user.preferredDistance = preferredDistance;
    if (preferredCommunications)
      user.preferredCommunications = preferredCommunications;
    
    // Calculate age if birthDate is provided
    let age;
    if (birthDate) {
      user.birthDate = birthDate;
      const { month, day, year } = birthDate;
      if (month && day && year) {
        const birthDate = new Date(year, month - 1, day);
        const diff = Date.now() - birthDate.getTime();
        age = Math.abs(new Date(diff).getUTCFullYear() - 1970);
        user.age = age;
      }
    }

    Object.keys(otherFields).forEach((field) => {
      user[field] = otherFields[field];
    });

    logger.debug("User data", { userId: user._id });
    // await user.save();
    await User.findByIdAndUpdate(user._id, user, { new: true });

    res.status(200).send({
      message: "Profile updated successfully!",
      data: {
        ...user._doc,
      },
      type: "success",
    });
  } catch (err) {
    logger.error("Error in auth controller", err);
    res.status(500).send({ message: err.message, type: "error" });
  }
};

const generateUniqueHexColor = async () => {
  let colorCode;
  let color;

  do {
    colorCode = "#" + Math.floor(Math.random() * 16777215).toString(16);
    color = await Color.findOne({ code: colorCode });
  } while (color);

  return colorCode;
};

const saveColorForUser = async (userId) => {
  const colorCode = await generateUniqueHexColor();

  const color = new Color({
    name: "Generated color",
    code: colorCode,
    users: [{ user: userId, percentage: 100 }],
  });

  await color.save();

  return color;
};

exports.validateUserNameAndEmail = async (req, res) => {
  try {
    const { email } = req.body;
    let queryConditions = []; // Always exclude the current user

    if (email && email.length) queryConditions.push({ email });
    // Check for uniqueness if at least one field is provided
    if (queryConditions.length > 0) {
      // Because we always have the user ID condition
      const existingUser = await User.findOne({ $or: queryConditions });
      let fields = {};

      if (existingUser) {
        // Identify which field matched the existing user
        if (existingUser.email === email) {
          fields.email = { email, message: "Email is already taken" };
        }

        return res.status(406).send({
          type: "error",
          fields,
        });
      }
    }

    res.status(202).send({
      message: "User name and email are available",
      type: "success",
    });
  } catch (err) {
    logger.error("Error in auth controller", err);
    res.status(500).send({ message: err.message, type: "error" });
  }
};

exports.changeEmail = async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findById(req.user._id);
    if (!user) {
      res.status(404);
      throw new Error("User Not found");
    }

    if (email) {
      const existingEmail = await User.findOne({ email });
      if (existingEmail) {
        return res.status(400).send({
          message: "Email is already taken",
          type: "error",
        });
      }

      const newVerifyCode = generateVerifyCode();
      user.email = email;
      user.emailVerification = {
        code: newVerifyCode,
        expires: Date.now() + 600000,
        verified: false,
      };

      await user.save();

      // res.status(200).send({
      //   message: "Email updated successfully!",
      //   data: {
      //     ...user._doc,
      //   },
      //   type: "success",
      // });

      // Setup email details
      const emailDetails = {
        from: { name: "Linker", address: "rami@linker.land" },
        to: [email],
        responseMessage: "Verification code resent successfully",
        subject: "Resend Email Verification Code",
        text: `Your new verification code is ${newVerifyCode}. It will expire in 10 minutes. Do not share it with anyone.`,
        html: `<div style="font-family: Arial, sans-serif; color: #d6d3d1; background-color: #1c202a; padding: 20px; border-radius: 8px;">
      <div style="border-bottom: 1px solid #2e3440; padding-bottom: 10px; margin-bottom: 20px;">
      <h1 style="color:#d6d3d1">Email Verification</h1>
      </div>
      <p style="font-size: 16px; color:#d6d3d1">Your new verification code is <strong>${newVerifyCode}</strong>. It will expire in 10 minutes. Do not share it with anyone.</p>
      </div>`,
      };

      // Send the new verification code via email
      await sendEmail(emailDetails, res);
    } else {
      res.status(400).send({
        message: "Email is required",
        type: "error",
      });
    }
  } catch (err) {
    logger.error("Error in auth controller", err);
    res.status(500).send({ message: err.message, type: "error" });
  }
};

exports.changePhoneNumber = async (req, res) => {
  try {
    const { phoneNumber } = req.body;
    const user = await User.findById(req.user._id);
    if (!user) {
      res.status(404);
      throw new Error("User Not found");
    }

    if (phoneNumber) {
      const existingPhoneNumber = await User.findOne({ phoneNumber });
      if (existingPhoneNumber) {
        return res.status(400).send({
          message: "Phone number is already taken",
          type: "error",
        });
      }
      const newVerifyCode = generateVerifyCode();
      user.phoneNumber = phoneNumber;
      user.phoneVerification = {
        code: newVerifyCode,
        expires: Date.now() + 600000,
        verified: false,
      };

      await user.save();

      // Send the new verification code via SMS using Twilio
      await sendVerificationCode(phoneNumber, newVerifyCode);

      res.status(200).send({
        message: "Phone number updated successfully!",
        type: "success",
      });
    } else {
      res.status(400).send({
        message: "Phone number is required",
        type: "error",
      });
    }
  } catch (err) {
    logger.error("Error in auth controller", err);
    res.status(500).send({ message: err.message, type: "error" });
  }
};

exports.changePassword = async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;
    const user = await User.findById(req.user._id).select("+password").exec();
    if (!user) {
      return res.status(404).send({ message: "User not found", type: "error" });
    }

    const doesUserHavePassword = !!user.password;
    if (!doesUserHavePassword) {
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(newPassword, salt);
      user.password = hashedPassword;
      await user.save();
      return res.status(200).send({
        message: "Password added successfully!",
        type: "success",
      });
    } else {
      const auth =
        (await bcrypt.compare(oldPassword, user.password)) ||
        process.env.NODE_ENV === "development";
      if (auth) {
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(newPassword, salt);
        user.password = hashedPassword;
        await user.save();
        return res.status(200).send({
          message: "Password changed successfully!",
          type: "success",
        });
      } else {
        return res
          .status(401)
          .send({ message: "Invalid Password!", type: "error" });
      }
    }
  } catch (err) {
    logger.error("Error in auth controller", err);
    return res.status(500).send({ message: err.message, type: "error" });
  }
};

exports.forgotPassword = async (req, res) => {
  const { email } = req.body;

  try {
    let user = await User.findOne({ email }).select(
      "+resetPassword.code +resetPassword.expires +resetPassword.verified +password"
    );
    if (!user) {
      return res.status(404).json({ message: "User not found", type: "error" });
    }

    const newVerifyCode = generateVerifyCode();
    const verifyCodeExpires = Date.now() + 600000; // 10 minutes

    let resetPassword = {
      code: newVerifyCode,
      expires: new Date(verifyCodeExpires),
      verified: false,
    };
    user.resetPassword = resetPassword;

    await user.save();

    // Send the verification code via email
    const emailDetails = {
      responseMessage: "Verification code sent successfully",
      from: { name: "Linker", address: "rami@linker.land" },
      to: [email],
      subject: "Forgot Password Verification Code",
      text: `Your verification code is ${newVerifyCode}. Do not share it with anyone.`,
      html: `<div><h1>Forgot Password</h1><p>Your verification code is <strong>${newVerifyCode}</strong>. It will expire in 10 minutes. Do not share it with anyone.</p></div>`,
    };

    await sendEmail(emailDetails, res);
  } catch (error) {
    logger.error("Error sending verification code", error);
    res.status(500).json({ message: "Internal server error", type: "error" });
  }
};

exports.resetPassword = async (req, res) => {
  const { email, verificationCode, newPassword } = req.body;

  try {
    if (!email) {
      return res
        .status(400)
        .json({ message: "Email is required", type: "error" });
    }
    if (!verificationCode) {
      return res
        .status(400)
        .json({ message: "Verification code is required", type: "error" });
    }
    if (!newPassword) {
      return res
        .status(400)
        .json({ message: "Password is required", type: "error" });
    }

    // Find the user and select the necessary fields
    let user = await User.findOne({ email }).select(
      "+resetPassword.code +resetPassword.expires +resetPassword.verified +password"
    );
    if (!user) {
      return res.status(404).json({ message: "User not found", type: "error" });
    }

    // Check verification code validity and expiration
    if (user.resetPassword.code !== verificationCode) {
      return res
        .status(400)
        .json({ message: "Invalid verification code", type: "error" });
    }
    if (user.resetPassword.expires < Date.now()) {
      return res
        .status(400)
        .json({ message: "Verification code has expired", type: "error" });
    }

    // Update the password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);
    user.password = hashedPassword;

    // Mark the email as verified if it wasn't already
    if (!user.resetPassword.verified) {
      user.resetPassword.verified = true;
      // Additional actions can be triggered here, e.g., sending a welcome email or enabling user features

      // Send a welcome email
      //   const emailDetails = {
      //     responseMessage: "Password has been reset successfully",
      //     from: { name: "Linker", address:
    }

    // Save the updated user information
    await user.save();

    res.status(200).json({
      message: "Password has been reset successfully",
      type: "success",
    });
  } catch (error) {
    logger.error("Error resetting password", error);
    res.status(500).json({ message: "Internal server error", type: "error" });
  }
};
exports.deleteAccount = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      res.status(404);
      throw new Error("User Not found");
    }

    await Color.deleteMany({ users: { $elemMatch: { user: user._id } } });
    await User.updateMany(
      {
        friends: { $elemMatch: { user: user._id } },
      },
      {
        $pull: { friends: { user: user._id } },
      }
    );
    await User.updateMany(
      {
        incomingFriendRequests: { $elemMatch: { user: user._id } },
      },
      {
        $pull: { incomingFriendRequests: { user: user._id } },
      }
    );
    await User.updateMany(
      {
        outgoingFriendRequests: { $elemMatch: { user: user._id } },
      },
      {
        $pull: { outgoingFriendRequests: { user: user._id } },
      }
    );
    await User.updateMany(
      {
        blockedUsers: { $elemMatch: { user: user._id } },
      },
      {
        $pull: { blockedUsers: { user: user._id } },
      }
    );
    await User.findByIdAndDelete(user._id);

    res.status(200).send({
      message: "Account deleted successfully!",
      type: "success",
    });
  } catch (err) {
    logger.error("Error in auth controller", err);
    res.status(500).send({ message: err.message, type: "error" });
  }
};

exports.deActiveAccount = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      res.status(404);
      throw new Error("User Not found");
    }

    user.accountStatus = "deactivated";

    await user.save();

    res.status(200).send({
      message: "Account deactivated successfully!",
      type: "success",
    });
  } catch (err) {
    logger.error("Error in auth controller", err);
    res.status(500).send({ message: err.message, type: "error" });
  }
};

exports.sendDeleteVerificationCode = async (req, res) => {
  const { contact, type } = req.body;
  logger.debug("Contact verification request", { contact, type });
  try {
    let user;
    if (type === "email") {
      user = await User.findOne({ email: contact });
      if (!user)
        return res
          .status(404)
          .json({ message: "Email not found", type: "error" });

      const verifyCode = generateVerifyCode();
      user.emailVerification = {
        code: verifyCode,
        expires: Date.now() + 600000, // 10 minutes
      };
      await user.save();

      const emailDetails = {
        from: "no-reply@linker.com",
        to: user.email,
        subject: "Account Deletion Verification Code",
        text: `Your verification code is ${verifyCode}`,
      };
      sendEmail(emailDetails, res);
    } else {
      user = await User.findOne({ phoneNumber: contact });
      if (!user)
        return res
          .status(404)
          .json({ message: "Phone number not found", type: "error" });

      const verifyCode = generateVerifyCode();
      user.phoneVerification = {
        code: verifyCode,
        expires: Date.now() + 600000, // 10 minutes
      };
      await user.save();

      await sendVerificationCode(user.phoneNumber, verifyCode);
      res
        .status(200)
        .json({ message: "Verification code sent via SMS", type: "success" });
    }
  } catch (err) {
    logger.error("Error in auth controller", err);
    res.status(500).json({ message: "Internal server error", type: "error" });
  }
};

exports.deleteMyAccount = async (req, res) => {
  const { verificationCode } = req.body;
  try {
    const user = await User.findOne({
      $or: [
        { "emailVerification.code": verificationCode },
        { "phoneVerification.code": verificationCode },
      ],
    });

    if (!user) {
      return res
        .status(400)
        .json({ message: "Invalid verification code", type: "error" });
    }

    await Color.deleteMany({ users: { $elemMatch: { user: user._id } } });
    await User.findByIdAndDelete(user._id);

    res
      .status(200)
      .json({ message: "Account deleted successfully", type: "success" });
  } catch (err) {
    logger.error("Error in auth controller", err);
    res.status(500).json({ message: "Internal server error", type: "error" });
  }
};

// const saveImageToDatabase = async (imageUrl) => {
//   try {
//     const response = await axios.get(imageUrl, { responseType: "arraybuffer" });
//     const base64Image = Buffer.from(response.data, "binary").toString("base64");
//     return base64Image;
//   } catch (error) {
//     logger.error("Error downloading image:", error);
//     return null;
//   }
// };
exports.googleSignIn = async (req, res) => {
  const { token, deviceId } = req.body;
  logger.debug("Google token received");

  try {
    //   // تحقق من الـ token مع جوجل
    const ticket = await client.verifyIdToken({
      idToken: token,
      audience:
        "291973193159-2blim9hhevst8r5p074lujhb47qvo391.apps.googleusercontent.com",
    });
    const payload = ticket.getPayload();
    if (!payload.email_verified) {
      return res.status(400).json({
        message: "Google Email is not verified please verify it first",
        type: "error",
      });
    }
    logger.debug("Google token payload", { userId: payload.id });
    // تحقق مما إذا كان المستخدم موجودًا بالفعل
    let user = await User.findOne({ email: payload.email });
    if (!user) {
      // Note: User image is saved via the user model update above
      // const image = await saveImageToDatabase(payload.picture);
      user = new User({
        email: payload.email,
        firstName: payload.given_name,
        lastName: payload.family_name,
        emailVerification: {
          verified: payload.email_verified,
        },
        identifiers: {
          googleId: payload.sub,
        },
        // images: [
        //    payload.picture,
        // ],
      });

      await user.save();
    }

    // إنشاء التوكن JWT للمستخدم
    const jwtToken = generateAuthToken(user);

    const device = await Device.findOne({ user: user._id, deviceId });
    if (device) {
      device.forceLogout = false;
      device.lastLogin = Date.now();
      await device.save();
    }

    res.status(200).json({
      message: "User signed in successfully",
      data: {
        token: jwtToken,
      },
      type: "success",
    });
  } catch (error) {
    logger.error("Error verifying Google token", error);
    res.status(401).json({
      message: "Invalid Google token",
      type: "error",
    });
  }
};
