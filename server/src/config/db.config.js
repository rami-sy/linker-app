const mongoose = require("mongoose");
const User = require("../models/user.model");
const UserProfile = require("../models/user-profile.model");
console.log("Node Environment:", process.env.NODE_ENV);

const connectDB = async () => {
  console.log("MONGO_URI", process.env.MONGO_URI);
  mongoose
    .connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      // serverSelectionTimeoutMS: 5000, // Timeout after 5s instead of 30s
      // socketTimeoutMS: 4500, // Close sockets after 45 seconds of inactivity
    })
    .then(async () => {
      console.log("Successfully connect to MongoDB.");
      // await User.updateMany({}, { $unset: { privacy: "" } });

      // Seeding is dev-only and opt-in to avoid pulling dev dependencies in production.
      // Usage:
      //   NODE_ENV=development SEED_DB=true node app.js
      if (process.env.NODE_ENV !== "production" && process.env.SEED_DB === "true") {
        try {
          const seedUsers = require("../seed/seedUsers");
          await seedUsers(1000);
        } catch (err) {
          console.error("Seed failed:", err);
        }
      }
      async function migrateProfilesToUsers() {
        try {
          console.log("🔄 بدء عملية النقل...");

          // جلب جميع بيانات البروفايل
          const profiles = await UserProfile.find();

          let updatedCount = 0;

          for (const profile of profiles) {
            const user = await User.findById(profile.user);

            if (!user) {
              console.warn(
                `⚠️ لم يتم العثور على مستخدم للـ _id: ${profile.user}`
              );
              continue;
            }

            // نقل جميع بيانات البروفايل إلى المستخدم
            Object.keys(profile._doc).forEach((key) => {
              if (key !== "_id" && key !== "user" && key !== "__v") {
                // استثناء هذه الحقول
                user[key] = profile[key];
              }
            });

            await user.save();
            updatedCount++;
          }

          console.log(`✅ تم تحديث ${updatedCount} مستخدم بنجاح!`);

          // حذف جميع بيانات `UserProfile` بعد النقل (اختياري)
          await UserProfile.deleteMany();
          console.log("🗑️ تم حذف جميع بيانات `UserProfile` بنجاح.");
        } catch (error) {
          console.error("❌ خطأ أثناء النقل:", error);
        } finally {
          mongoose.connection.close(); // إغلاق الاتصال بقاعدة البيانات
        }
      }

      // migrateProfilesToUsers();
    })
    .catch((err) => {
      console.error("Connection error", err);
      process.exit();
    });
};

module.exports = connectDB;
