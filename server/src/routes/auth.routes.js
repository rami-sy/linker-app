const express = require("express");
const router = express.Router();

const controller = require("../controllers/auth.controller");
const verifyToken = require("../middlewares/verify-token");
const { authLimiter, passwordResetLimiter } = require("../middlewares/rateLimiter");

router.post("/signup", authLimiter, controller.signup);

router.post("/signin", authLimiter, controller.signin);

router.post("/phone-auth", authLimiter, controller.phoneAuth);

router.post("/phone-verify", authLimiter, controller.verifyPhone);

router.post("/email-verify", controller.verifyEmail);
router.post(
  "/resend-email-verification-code",
  controller.resendEmailVerificationCode
);
router.post(
  "/resend-phone-verification-code",
  controller.resendPhoneVerificationCode
);

router.get("/me", [verifyToken], controller.me);

router.put("/me", [verifyToken], controller.updateProfile);

router.post(
  "/validate-user-name-and-Email",
  controller.validateUserNameAndEmail
);

router.post("/change-email", [verifyToken], controller.changeEmail);

router.post(
  "/change-phone-number",
  [verifyToken],
  controller.changePhoneNumber
);

router.post("/change-password", [verifyToken], controller.changePassword);

router.post("/forgot-password", passwordResetLimiter, controller.forgotPassword);
router.post("/reset-password", passwordResetLimiter, controller.resetPassword);
//

router.post("/delete-account", [verifyToken], controller.deleteAccount);

router.post("/deactive-account", [verifyToken], controller.deActiveAccount);

router.post("/send-verification-code", controller.sendDeleteVerificationCode);
router.post("/delete-my-account", controller.deleteMyAccount);
router.post("/google-signin", controller.googleSignIn);

router.post("/refresh", controller.refreshToken);

module.exports = router;
