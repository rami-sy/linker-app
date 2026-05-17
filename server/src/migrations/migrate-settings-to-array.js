/**
 * Migration Script: Convert Call Settings from String to Array
 * 
 * This script migrates existing callSettings from String format to Array format
 * Example: "everyone" -> ["everyone"]
 * 
 * Run this script once after updating the schema:
 * node server/src/migrations/migrate-settings-to-array.js
 */

// Load environment variables first
require("dotenv").config();

const mongoose = require("mongoose");
const User = require("../models/user.model");
const Room = require("../models/room.model");

const migrateUserCallSettings = async () => {
  try {
    console.log("Starting User Call Settings migration...");
    
    const users = await User.find({
      "privacySettings.callSettings": { $exists: true }
    });

    let migratedCount = 0;

    for (const user of users) {
      const callSettings = user.privacySettings?.callSettings;
      if (!callSettings) continue;

      let needsUpdate = false;
      const updates = {};

      // Convert screenShare
      if (callSettings.screenShare && typeof callSettings.screenShare === "string") {
        updates["privacySettings.callSettings.screenShare"] = [callSettings.screenShare];
        needsUpdate = true;
      }

      // Convert recording
      if (callSettings.recording && typeof callSettings.recording === "string") {
        updates["privacySettings.callSettings.recording"] = [callSettings.recording];
        needsUpdate = true;
      }

      // Convert callTransfer
      if (callSettings.callTransfer && typeof callSettings.callTransfer === "string") {
        updates["privacySettings.callSettings.callTransfer"] = [callSettings.callTransfer];
        needsUpdate = true;
      }

      // Convert liveStream
      if (callSettings.liveStream && typeof callSettings.liveStream === "string") {
        updates["privacySettings.callSettings.liveStream"] = [callSettings.liveStream];
        needsUpdate = true;
      }

      if (needsUpdate) {
        await User.updateOne(
          { _id: user._id },
          { $set: updates }
        );
        migratedCount++;
      }
    }

    console.log(`✅ Migrated ${migratedCount} users`);
  } catch (error) {
    console.error("❌ Error migrating User Call Settings:", error);
    throw error;
  }
};

const migrateRoomCallSettings = async () => {
  try {
    console.log("Starting Room Call Settings migration...");
    
    const rooms = await Room.find({
      callSettings: { $exists: true }
    });

    let migratedCount = 0;

    for (const room of rooms) {
      const callSettings = room.callSettings;
      if (!callSettings) continue;

      let needsUpdate = false;
      const updates = {};

      // Convert screenShare
      if (callSettings.screenShare && typeof callSettings.screenShare === "string") {
        updates["callSettings.screenShare"] = [callSettings.screenShare];
        needsUpdate = true;
      }

      // Convert recording
      if (callSettings.recording && typeof callSettings.recording === "string") {
        updates["callSettings.recording"] = [callSettings.recording];
        needsUpdate = true;
      }

      // Convert callTransfer
      if (callSettings.callTransfer && typeof callSettings.callTransfer === "string") {
        updates["callSettings.callTransfer"] = [callSettings.callTransfer];
        needsUpdate = true;
      }

      // Convert liveStream
      if (callSettings.liveStream && typeof callSettings.liveStream === "string") {
        updates["callSettings.liveStream"] = [callSettings.liveStream];
        needsUpdate = true;
      }

      if (needsUpdate) {
        await Room.updateOne(
          { _id: room._id },
          { $set: updates }
        );
        migratedCount++;
      }
    }

    console.log(`✅ Migrated ${migratedCount} rooms`);
  } catch (error) {
    console.error("❌ Error migrating Room Call Settings:", error);
    throw error;
  }
};

const runMigration = async () => {
  try {
    // Connect to MongoDB
    const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
    if (!mongoUri) {
      console.error("Available env vars:", Object.keys(process.env).filter(k => k.includes("MONGO")));
      throw new Error("MONGO_URI or MONGODB_URI environment variable is required");
    }

    await mongoose.connect(mongoUri);
    console.log("✅ Connected to MongoDB");

    // Run migrations
    await migrateUserCallSettings();
    await migrateRoomCallSettings();

    console.log("✅ Migration completed successfully!");
    process.exit(0);
  } catch (error) {
    console.error("❌ Migration failed:", error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
};

// Run migration if called directly
if (require.main === module) {
  runMigration();
}

module.exports = { migrateUserCallSettings, migrateRoomCallSettings, runMigration };

