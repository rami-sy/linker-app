/**
 * ✅ Cron Jobs for scheduled tasks
 * - Message cleanup (temporary/disappearing messages)
 * - Mute expiration cleanup
 */

const Message = require("../models/message.model");
const User = require("../models/user.model");
const logger = require("./logger");

/**
 * Delete expired messages (temporary/disappearing messages)
 * Runs every 5 minutes
 */
const cleanupExpiredMessages = async () => {
  try {
    const now = new Date();
    
    // Find and delete messages that have expired
    const result = await Message.deleteMany({
      expiresAt: { $ne: null, $lt: now },
    });
    
    if (result.deletedCount > 0) {
      logger.info("Expired messages cleaned up", {
        deletedCount: result.deletedCount,
        timestamp: now,
      });
    }
  } catch (error) {
    logger.error("Error cleaning up expired messages:", error);
  }
};

/**
 * Clean up expired mutes (both chat and user mutes)
 * Runs every 5 minutes
 */
const cleanupExpiredMutes = async () => {
  try {
    const now = new Date();
    
    // Remove expired chat mutes
    const chatMuteResult = await User.updateMany(
      { "mutedChats.until": { $ne: null, $lt: now } },
      { $pull: { mutedChats: { until: { $lt: now } } } }
    );
    
    // Remove expired user mutes
    const userMuteResult = await User.updateMany(
      { "mutedUsers.until": { $ne: null, $lt: now } },
      { $pull: { mutedUsers: { until: { $lt: now } } } }
    );
    
    if (chatMuteResult.modifiedCount > 0 || userMuteResult.modifiedCount > 0) {
      logger.info("Expired mutes cleaned up", {
        chatMutesCleanedUp: chatMuteResult.modifiedCount,
        userMutesCleanedUp: userMuteResult.modifiedCount,
        timestamp: now,
      });
    }
  } catch (error) {
    logger.error("Error cleaning up expired mutes:", error);
  }
};

// Interval in milliseconds (5 minutes)
const CLEANUP_INTERVAL = 5 * 60 * 1000;

let messageCleanupInterval = null;
let muteCleanupInterval = null;

/**
 * Start all cron jobs
 */
const startCronJobs = () => {
  logger.info("Starting cron jobs...");
  
  // Run immediately on startup
  cleanupExpiredMessages();
  cleanupExpiredMutes();
  
  // Set up intervals
  messageCleanupInterval = setInterval(cleanupExpiredMessages, CLEANUP_INTERVAL);
  muteCleanupInterval = setInterval(cleanupExpiredMutes, CLEANUP_INTERVAL);
  
  logger.info("Cron jobs started", {
    messageCleanupInterval: `${CLEANUP_INTERVAL / 60000} minutes`,
    muteCleanupInterval: `${CLEANUP_INTERVAL / 60000} minutes`,
  });
};

/**
 * Stop all cron jobs
 */
const stopCronJobs = () => {
  if (messageCleanupInterval) {
    clearInterval(messageCleanupInterval);
    messageCleanupInterval = null;
  }
  if (muteCleanupInterval) {
    clearInterval(muteCleanupInterval);
    muteCleanupInterval = null;
  }
  logger.info("Cron jobs stopped");
};

module.exports = {
  startCronJobs,
  stopCronJobs,
  cleanupExpiredMessages,
  cleanupExpiredMutes,
};
