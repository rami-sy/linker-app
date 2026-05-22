const passport = require("passport");
const User = require("../models/user.model");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const jwt = require("jsonwebtoken");
const config = require("./auth.config");

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: "/auth/google/callback",
    },
    async function (accessToken, refreshToken, profile, done) {
      try {
        let user = await User.findOne({ email: profile.emails[0].value });

        if (!user) {
          // If the user doesn't exist, create a new one
          user = new User({
            userName: profile.displayName,
            email: profile.emails[0].value,
            googleId: profile.id, // Save Google ID for future logins
            // Set default roles or permissions as needed
          });
          await user.save();
        } else if (!user.googleId) {
          // If existing user doesn't have a Google ID, save it for future logins
          user.googleId = profile.id;
          await user.save();
        }

        // Generate token
        const payload = { id: user.id, email: user.email };
        const token = jwt.sign(payload, config.secret, { expiresIn: config.expiresIn });

        done(null, user, token); // Pass the user and token to the done callback
      } catch (error) {
        done(error, false);
      }
    }
  )
);

// Serialize and deserialize user instances to and from the session.
passport.serializeUser(function (user, done) {
  done(null, user);
});

passport.deserializeUser(function (obj, done) {
  done(null, obj);
});
