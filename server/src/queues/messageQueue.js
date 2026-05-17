/**
 * ✅ Message Queue using Bull
 * Job queue لإرسال push notifications بدلاً من setTimeout
 */

const Queue = require('bull');
const logger = require('../utils/logger');
const Message = require('../models/message.model');
const User = require('../models/user.model');
const { sendPushNotification } = require('../../notification');
const getFullName = require('../utils/get-full-user-name');
const roomServices = require('../sockets/services/room.services');
const {
  NotificationTypes,
  createNotificationEvent,
  toPushData,
} = require("../utils/notificationContract");

function buildPushContent({ type, text, e2ee }) {
  if (e2ee?.ciphertext) return 'Encrypted message';
  if (type === 'text') return text;
  if (type === 'image') return 'Image';
  if (type === 'video') return 'Video';
  if (type === 'audio') return 'Audio';
  if (type === 'document') return 'Document';
  if (type === 'location') return '📍 Location';
  return 'Message';
}

function buildPushTitle({ senderFullName, isMentioned, roomNameForPush }) {
  const safeName = String(senderFullName || '').trim();
  const prettySender = safeName
    ? safeName.charAt(0).toUpperCase() + safeName.slice(1)
    : 'User';
  if (!isMentioned) return prettySender;
  return roomNameForPush
    ? `${prettySender} mentioned you · ${roomNameForPush}`
    : `${prettySender} mentioned you`;
}

function buildChatPushData({
  recipientStatus,
  content,
  roomId,
  messageId,
  isMentioned,
  senderName,
}) {
  const event = createNotificationEvent({
    type: NotificationTypes.CHAT_MESSAGE,
    title: senderName || "New message",
    body: content,
    entityType: "room",
    entityId: roomId ? String(roomId) : "",
    route: roomId ? `/chats/${String(roomId)}` : null,
    priority: isMentioned ? "high" : "normal",
    dedupeKey: `chat_message:${String(messageId || "")}`,
    meta: {
      roomId: roomId ? String(roomId) : "",
      messageId: messageId ? String(messageId) : "",
      mention: isMentioned ? "1" : "0",
      status: recipientStatus || "",
    },
  });
  return toPushData(event);
}

// ✅ إنشاء Queue مع Redis connection
const redisUrl = process.env.REDIS_URL || 'redis://127.0.0.1:6379';

const messageQueue = new Queue('message-notifications', {
  redis: redisUrl,
  defaultJobOptions: {
    attempts: 3, // عدد المحاولات
    backoff: {
      type: 'exponential',
      delay: 2000, // 2 seconds initial delay
    },
    removeOnComplete: {
      age: 3600, // Keep completed jobs for 1 hour
      count: 1000, // Keep max 1000 completed jobs
    },
    removeOnFail: {
      age: 24 * 3600, // Keep failed jobs for 24 hours
    },
  },
});

// ✅ Event handlers للـ Queue
messageQueue.on('error', (error) => {
  logger.error('Message queue error:', error);
});

messageQueue.on('waiting', (jobId) => {
  logger.debug(`Job ${jobId} is waiting`);
});

messageQueue.on('active', (job) => {
  logger.debug(`Job ${job.id} is now active`);
});

messageQueue.on('completed', (job, result) => {
  logger.debug(`Job ${job.id} completed`, { messageId: job.data.messageId });
});

messageQueue.on('failed', (job, err) => {
  logger.error(`Job ${job.id} failed:`, err, { messageId: job.data.messageId });
});

messageQueue.on('stalled', (job) => {
  logger.warn(`Job ${job.id} stalled`);
});

/**
 * ✅ Process jobs - إرسال push notifications
 */
messageQueue.process('send-push-notification', async (job) => {
  const {
    messageId,
    senderId,
    members,
    mentionUserIds,
    roomNameForPush,
  } = job.data;

  const mentionSet =
    Array.isArray(mentionUserIds) && mentionUserIds.length > 0
      ? new Set(mentionUserIds.map((id) => String(id)))
      : null;

  try {
    // ✅ جلب الرسالة المحدثة
    const updatedMessage = await Message.findById(messageId);
    if (!updatedMessage) {
      logger.warn(`Message ${messageId} not found`);
      return { success: false, reason: 'Message not found' };
    }

    // ✅ جلب معلومات المرسل
    const senderUser = await User.findById(senderId);
    if (!senderUser) {
      logger.warn(`Sender ${senderId} not found`);
      return { success: false, reason: 'Sender not found' };
    }

    const results = [];

    // ✅ التحقق لكل مستلم على حدة (يدعم members كـ ObjectId أو { _id })
    for (const member of members || []) {
      const memberIdRaw =
        member && (member._id != null ? member._id : member);
      if (!memberIdRaw) continue;
      const memberIdStr = memberIdRaw.toString();
      if (memberIdStr === String(senderId)) continue;

      try {
          const hasSeen = updatedMessage.seenBy.some(
            (seenId) => seenId.toString() === memberIdStr
          );

          if (!hasSeen) {
            // ✅ Check if chat or sender is muted for this recipient
            const roomId = updatedMessage.room?.toString();
            const isChatMutedResult = await roomServices.isChatMuted(
              memberIdRaw,
              roomId
            );
            const isUserMutedResult = await roomServices.isUserMuted(
              memberIdRaw,
              senderId
            );
            
            if (isChatMutedResult) {
              logger.debug('Notification skipped - chat is muted', {
                userId: memberIdStr,
                roomId: roomId,
                mutedUntil: isChatMutedResult.until,
              });
              results.push({
                recipientId: memberIdRaw,
                success: false,
                reason: 'Chat is muted',
              });
              continue;
            }

            if (isUserMutedResult) {
              logger.debug('Notification skipped - user is muted', {
                userId: memberIdStr,
                senderId: senderId,
                mutedUntil: isUserMutedResult.until,
              });
              results.push({
                recipientId: memberIdRaw,
                success: false,
                reason: 'User is muted',
              });
              continue;
            }

            // ✅ جلب معلومات المستخدم المستلم
            const recipientUser = await User.findById(memberIdRaw);

            if (
              recipientUser &&
              recipientUser.expoPushToken &&
              recipientUser.settings?.notifications?.messages
            ) {
              // Smart suppression: do not send push while recipient is online.
              if (recipientUser.status === "online") {
                results.push({
                  recipientId: memberIdRaw,
                  success: false,
                  reason: "Suppressed (recipient online)",
                });
                continue;
              }
              // ✅ إعداد محتوى الإشعار
              const { type, text, e2ee } = updatedMessage;
              const content = buildPushContent({ type, text, e2ee });

              const userName = getFullName(senderUser, true);
              const isMentioned =
                mentionSet && mentionSet.has(memberIdStr);
              const title = buildPushTitle({
                senderFullName: userName,
                isMentioned: !!isMentioned,
                roomNameForPush,
              });

              const pushData = buildChatPushData({
                recipientStatus: recipientUser.status,
                content,
                roomId: updatedMessage.room,
                messageId: updatedMessage._id,
                isMentioned: !!isMentioned,
                senderName: userName,
              });
              await sendPushNotification(
                recipientUser.expoPushToken,
                content,
                title,
                pushData
              );

              logger.messageEvent('Push notification sent successfully', {
                recipientId: recipientUser._id,
                messageId: updatedMessage._id,
                mention: !!isMentioned,
              });

              results.push({
                recipientId: memberIdRaw,
                success: true,
              });
            } else {
              logger.debug('No valid expoPushToken for user', {
                userId: memberIdStr,
              });
              results.push({
                recipientId: memberIdRaw,
                success: false,
                reason: 'No valid token or notifications disabled',
              });
            }
          } else {
            logger.debug('Message already seen by user', {
              userId: memberIdStr,
              messageId: updatedMessage._id,
            });
            results.push({
              recipientId: memberIdRaw,
              success: false,
              reason: 'Already seen',
            });
          }
      } catch (error) {
        logger.error(
          `Error processing notification for user ${memberIdStr}:`,
          error
        );
        results.push({
          recipientId: memberIdRaw,
          success: false,
          error: error.message,
        });
      }
    }

    return {
      success: true,
      results,
      processed: results.length,
    };
  } catch (error) {
    logger.error('Error processing push notification job:', error);
    throw error; // Re-throw to trigger retry
  }
});

/**
 * ✅ إضافة job للـ queue
 * @param {Object} data - Job data
 * @param {string} data.messageId - Message ID
 * @param {string} data.senderId - Sender user ID
 * @param {Array} data.members - Array of recipient members
 * @param {number} delay - Delay in milliseconds (default: 1500ms)
 */
const addPushNotificationJob = async (data, delay = 1500) => {
  const stableMessageId = String(data?.messageId || "").trim();
  const jobId = `push-notification-${stableMessageId || "unknown"}`;
  const existing = await messageQueue.getJob(jobId);
  if (existing) {
    return existing;
  }
  return messageQueue.add('send-push-notification', data, {
    delay, // ✅ Delay job execution
    jobId,
  });
};

/**
 * ✅ إغلاق Queue بشكل نظيف
 */
const closeQueue = async () => {
  await messageQueue.close();
  logger.info('Message queue closed');
};

module.exports = {
  messageQueue,
  addPushNotificationJob,
  closeQueue,
  buildPushContent,
  buildPushTitle,
  buildChatPushData,
};

