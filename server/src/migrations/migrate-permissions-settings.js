/**
 * Migration Script: Permissions Settings Refactoring
 * 
 * This script migrates existing data from the old permissions structure to the new one:
 * 
 * Changes:
 * 1. User.privacySettings.callSettings → User.privacySettings.defaultCallSettings
 * 2. User.privacySettings.chatSettings → User.privacySettings.defaultChatSettings
 * 3. Room.callSettings → Removed (now in Call model)
 * 4. Existing Calls → Add callSettings with default values
 * 
 * Run with: node server/src/migrations/migrate-permissions-settings.js
 */

const mongoose = require("mongoose");
const dotenv = require("dotenv");
const path = require("path");

// Load environment variables
dotenv.config({ path: path.join(__dirname, "../../.env") });

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/linker";

// Schema definitions for migration
const userSchema = new mongoose.Schema({}, { strict: false });
const roomSchema = new mongoose.Schema({}, { strict: false });
const callSchema = new mongoose.Schema({}, { strict: false });

const User = mongoose.model("User_Migration", userSchema, "users");
const Room = mongoose.model("Room_Migration", roomSchema, "rooms");
const Call = mongoose.model("Call_Migration", callSchema, "calls");

async function migrateUsers() {
  console.log("📦 Migrating Users...");
  
  const users = await User.find({
    $or: [
      { "privacySettings.callSettings": { $exists: true } },
      { "privacySettings.chatSettings": { $exists: true } },
    ],
  });
  
  console.log(`Found ${users.length} users with existing settings to migrate`);
  
  let migratedCount = 0;
  let skippedCount = 0;
  
  for (const user of users) {
    try {
      const updateOps = {};
      
      // Migrate callSettings → defaultCallSettings
      if (user.privacySettings?.callSettings && !user.privacySettings?.defaultCallSettings) {
        updateOps["privacySettings.defaultCallSettings"] = user.privacySettings.callSettings;
        // Keep the old field for backwards compatibility during transition
      }
      
      // Migrate chatSettings → defaultChatSettings
      if (user.privacySettings?.chatSettings && !user.privacySettings?.defaultChatSettings) {
        updateOps["privacySettings.defaultChatSettings"] = user.privacySettings.chatSettings;
        // Keep the old field for backwards compatibility during transition
      }
      
      if (Object.keys(updateOps).length > 0) {
        await User.updateOne(
          { _id: user._id },
          { $set: updateOps }
        );
        migratedCount++;
      } else {
        skippedCount++;
      }
    } catch (error) {
      console.error(`Error migrating user ${user._id}:`, error.message);
    }
  }
  
  console.log(`✅ Users migrated: ${migratedCount}, skipped: ${skippedCount}`);
}

async function migrateRooms() {
  console.log("📦 Migrating Rooms...");
  
  // Remove callSettings from rooms (now in Call model)
  // But first, ensure we have the data copied somewhere
  const roomsWithCallSettings = await Room.find({
    "callSettings": { $exists: true },
    $expr: { $gt: [{ $size: { $objectToArray: "$callSettings" } }, 0] },
  });
  
  console.log(`Found ${roomsWithCallSettings.length} rooms with callSettings to clean up`);
  
  // For rooms that don't have chatSettings but are groups, set default chatSettings
  const groupRoomsWithoutChatSettings = await Room.find({
    isGroup: true,
    $or: [
      { chatSettings: { $exists: false } },
      { "chatSettings.sendMessages": { $exists: false } },
    ],
  });
  
  console.log(`Found ${groupRoomsWithoutChatSettings.length} group rooms needing default chatSettings`);
  
  let migratedCount = 0;
  
  for (const room of groupRoomsWithoutChatSettings) {
    try {
      // Set default chatSettings for groups
      await Room.updateOne(
        { _id: room._id },
        {
          $set: {
            "chatSettings.videoCall": ["everyone"],
            "chatSettings.audioCall": ["everyone"],
            "chatSettings.sendMedia": ["everyone"],
            "chatSettings.sendFiles": ["everyone"],
            "chatSettings.sendMessages": ["everyone"],
            "chatSettings.videoCallAllowedUsers": [],
            "chatSettings.audioCallAllowedUsers": [],
            "chatSettings.sendMediaAllowedUsers": [],
            "chatSettings.sendFilesAllowedUsers": [],
            "chatSettings.sendMessagesAllowedUsers": [],
          },
        }
      );
      migratedCount++;
    } catch (error) {
      console.error(`Error migrating room ${room._id}:`, error.message);
    }
  }
  
  console.log(`✅ Rooms migrated: ${migratedCount}`);
  
  // Clean up callSettings from rooms (they're now in Call model)
  if (roomsWithCallSettings.length > 0) {
    console.log("🧹 Cleaning up room callSettings (now in Call model)...");
    await Room.updateMany(
      { "callSettings": { $exists: true } },
      {
        $set: {
          "callSettings.screenShare": [],
          "callSettings.recording": [],
          "callSettings.callTransfer": [],
          "callSettings.liveStream": [],
          "callSettings.screenShareAllowedUsers": [],
          "callSettings.recordingAllowedUsers": [],
          "callSettings.callTransferAllowedUsers": [],
          "callSettings.liveStreamAllowedUsers": [],
        },
      }
    );
    console.log(`✅ Cleaned up callSettings from ${roomsWithCallSettings.length} rooms`);
  }
}

async function migrateCalls() {
  console.log("📦 Migrating Calls...");
  
  // Add callSettings to existing calls that don't have it
  const callsWithoutSettings = await Call.find({
    $or: [
      { callSettings: { $exists: false } },
      { "callSettings.screenShare": { $exists: false } },
    ],
  });
  
  console.log(`Found ${callsWithoutSettings.length} calls needing callSettings`);
  
  let migratedCount = 0;
  
  for (const call of callsWithoutSettings) {
    try {
      // Get caller's default settings if available
      let defaultSettings = {
        screenShare: ["everyone"],
        recording: ["noOne"],
        callTransfer: ["admin"],
        liveStream: ["admin"],
        screenShareAllowedUsers: [],
        recordingAllowedUsers: [],
        callTransferAllowedUsers: [],
        liveStreamAllowedUsers: [],
      };
      
      if (call.caller) {
        const caller = await User.findById(call.caller).select("privacySettings");
        if (caller?.privacySettings?.defaultCallSettings) {
          defaultSettings = {
            ...defaultSettings,
            ...caller.privacySettings.defaultCallSettings,
          };
        } else if (caller?.privacySettings?.callSettings) {
          // Fallback to old field name
          defaultSettings = {
            ...defaultSettings,
            ...caller.privacySettings.callSettings,
          };
        }
      }
      
      await Call.updateOne(
        { _id: call._id },
        {
          $set: {
            callSettings: defaultSettings,
            callAdmins: call.callAdmins || [],
          },
        }
      );
      migratedCount++;
    } catch (error) {
      console.error(`Error migrating call ${call._id}:`, error.message);
    }
  }
  
  console.log(`✅ Calls migrated: ${migratedCount}`);
}

async function runMigration() {
  try {
    console.log("🚀 Starting Permissions Settings Migration...");
    console.log(`📍 Connecting to: ${MONGODB_URI.replace(/\/\/.*:.*@/, "//***:***@")}`);
    
    await mongoose.connect(MONGODB_URI);
    console.log("✅ Connected to MongoDB");
    
    // Run migrations
    await migrateUsers();
    await migrateRooms();
    await migrateCalls();
    
    console.log("\n✅✅✅ Migration completed successfully! ✅✅✅");
    
  } catch (error) {
    console.error("❌ Migration failed:", error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log("📤 Disconnected from MongoDB");
    process.exit(0);
  }
}

// Run if called directly
if (require.main === module) {
  runMigration();
}

module.exports = { runMigration, migrateUsers, migrateRooms, migrateCalls };

