export const NotificationTypes = {
  CHAT_MESSAGE: "chat_message",
  FRIEND_REQUEST: "friend_request",
  FRIEND_ACCEPTED: "friend_accepted",
  LIKE_RECEIVED: "like_received",
  PROFILE_VISITED: "profile_visited",
  SYSTEM_SUCCESS: "system_success",
  SYSTEM_ERROR: "system_error",
};

export function normalizeNotificationEvent(raw) {
  if (!raw || typeof raw !== "object") return null;
  if (!raw.type) return null;
  return {
    type: String(raw.type),
    title: raw.title ? String(raw.title) : "",
    body: raw.body ? String(raw.body) : "",
    entityType: raw.entityType ? String(raw.entityType) : null,
    entityId: raw.entityId ? String(raw.entityId) : null,
    route: raw.route || null,
    priority: raw.priority ? String(raw.priority) : "normal",
    dedupeKey: raw.dedupeKey ? String(raw.dedupeKey) : null,
    createdAt: raw.createdAt || new Date().toISOString(),
    meta: raw.meta && typeof raw.meta === "object" ? raw.meta : {},
  };
}

export function getAlertTypeFromEventType(eventType) {
  switch (eventType) {
    case NotificationTypes.SYSTEM_ERROR:
      return "error";
    case NotificationTypes.SYSTEM_SUCCESS:
      return "success";
    case NotificationTypes.FRIEND_REQUEST:
    case NotificationTypes.FRIEND_ACCEPTED:
    case NotificationTypes.LIKE_RECEIVED:
    case NotificationTypes.PROFILE_VISITED:
    case NotificationTypes.CHAT_MESSAGE:
      return "info";
    default:
      return "info";
  }
}

export function buildAlertPayloadFromEvent(event) {
  const e = normalizeNotificationEvent(event);
  if (!e) return null;
  return {
    type: getAlertTypeFromEventType(e.type),
    title: e.title,
    message: e.body || e.title,
    dedupeKey: e.dedupeKey || `${e.type}:${e.entityId || "none"}`,
    route: e.route || null,
    eventType: e.type,
    priority: e.priority,
    meta: e.meta,
  };
}

