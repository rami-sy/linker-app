const mongoose = require("mongoose");
const dotenv = require("dotenv");
const path = require("path");

// Load env vars
dotenv.config({ path: path.join(__dirname, "../../.env") });

// Force use of linker-dev since that's where the data is
const mongoUri =
  process.env.MONGODB_URI || "mongodb://localhost:27017/linker-dev";

async function fixIndexes() {
  try {
    console.log("Connecting to MongoDB...");
    // Mask password for logging
    const maskedUri = mongoUri.replace(/:([^:@]+)@/, ":****@");
    console.log(`Using URI: ${maskedUri}`);

    await mongoose.connect(mongoUri);
    console.log("Connected to MongoDB");

    const adminDb = mongoose.connection.db.admin();
    const dbs = await adminDb.listDatabases();
    console.log(
      "Available Databases:",
      dbs.databases.map((d) => d.name)
    );

    const db = mongoose.connection.db;
    console.log(`Current Database: ${db.databaseName}`);

    // List collections to debug
    const collections = await db.listCollections().toArray();
    console.log(
      "Available collections:",
      collections.map((c) => c.name)
    );

    const collection = db.collection("rooms");

    console.log('Dropping all indexes on "rooms" collection...');
    try {
      await collection.dropIndexes();
      console.log('✅ Successfully dropped all indexes on "rooms" collection.');
    } catch (error) {
      if (error.codeName === "NamespaceNotFound") {
        console.log('⚠️ Collection "rooms" does not exist, skipping.');
      } else {
        throw error;
      }
    }

    console.log("Please restart the server to recreate the correct indexes.");
  } catch (error) {
    console.error("❌ Error fixing indexes:", error);
  } finally {
    await mongoose.disconnect();
    console.log("Disconnected from MongoDB");
    process.exit(0);
  }
}

fixIndexes();
