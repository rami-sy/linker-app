const toTimestampMs = (value) => {
  if (value == null || value === "") return null;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
};

export const getEffectiveMessageTimestampMs = (message) => {
  if (!message) return 0;

  const createdAtMs = toTimestampMs(message?.createdAt) ?? 0;
  const isDispatchedScheduledMessage =
    String(message?.scheduleStatus || "") === "sent" &&
    message?.scheduledAt != null;

  if (!isDispatchedScheduledMessage) {
    return createdAtMs;
  }

  const scheduledAtMs = toTimestampMs(message?.scheduledAt);
  if (scheduledAtMs == null) {
    return createdAtMs;
  }

  const dispatchSourceMs = toTimestampMs(
    message?.dispatchedAt ?? message?.updatedAt ?? message?.createdAt
  );
  if (dispatchSourceMs == null) {
    return Math.max(scheduledAtMs, createdAtMs);
  }

  return Math.max(scheduledAtMs, dispatchSourceMs);
};

export const normalizeDispatchedScheduledMessage = (message) => {
  if (!message) return message;

  const effectiveMs = getEffectiveMessageTimestampMs(message);
  if (!Number.isFinite(effectiveMs) || effectiveMs <= 0) {
    return message;
  }

  const createdAtMs = toTimestampMs(message?.createdAt);
  if (createdAtMs != null && Math.abs(createdAtMs - effectiveMs) < 1) {
    return message;
  }

  return {
    ...message,
    createdAt: new Date(effectiveMs).toISOString(),
  };
};
