const NotificationTypes = {
  CHAT_MESSAGE: "chat_message",
  FRIEND_REQUEST: "friend_request",
  FRIEND_ACCEPTED: "friend_accepted",
  LIKE_RECEIVED: "like_received",
  PROFILE_VISITED: "profile_visited",
  SYSTEM_SUCCESS: "system_success",
  SYSTEM_ERROR: "system_error",
  CALL_INCOMING: "call_incoming",
  CALL_MISSED: "call_missed",
  CALL_ENDED: "call_ended",
  CALL_REMOVED_FROM_GROUP: "call_removed_from_group",
  CALL_MODERATOR_UPDATED: "call_moderator_updated",
  CHAT_SUSPICIOUS_LINK_WARNING: "chat_suspicious_link_warning",
  CHAT_AI_DRAFT_USED: "chat_ai_draft_used",
};

function createNotificationEvent({
  type,
  title,
  body,
  entityType = null,
  entityId = null,
  route = null,
  priority = "normal",
  dedupeKey = null,
  meta = {},
}) {
  return {
    type,
    title: title || "",
    body: body || "",
    entityType,
    entityId: entityId ? String(entityId) : null,
    route,
    priority,
    dedupeKey:
      dedupeKey ||
      `${type}:${entityType || "none"}:${entityId ? String(entityId) : "none"}`,
    createdAt: new Date().toISOString(),
    meta,
  };
}

function toPushData(event, extra = {}) {
  return {
    type: event?.type || "",
    title: event?.title || "",
    body: event?.body || "",
    entityType: event?.entityType || "",
    entityId: event?.entityId || "",
    route: event?.route || "",
    priority: event?.priority || "normal",
    dedupeKey: event?.dedupeKey || "",
    createdAt: event?.createdAt || new Date().toISOString(),
    ...extra,
  };
}

module.exports = {
  NotificationTypes,
  createNotificationEvent,
  toPushData,
};
