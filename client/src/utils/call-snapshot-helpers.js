function normalizeSnapshotMeta(payload) {
  const roomId =
    payload?.roomId != null ? String(payload.roomId).trim() : "";
  const callId =
    payload?.callId != null && payload.callId !== ""
      ? String(payload.callId).trim()
      : null;
  const updatedAtRaw = Number(payload?.updatedAt);
  const updatedAt = Number.isFinite(updatedAtRaw) ? updatedAtRaw : Date.now();
  const isVideoCall = payload?.isVideoCall === true;
  const startedAtRaw = payload?.startedAt;
  const hasStartedAt = Object.prototype.hasOwnProperty.call(payload || {}, "startedAt");
  const parsedStartedAt =
    startedAtRaw == null || startedAtRaw === ""
      ? null
      : new Date(startedAtRaw);
  const startedAt =
    parsedStartedAt && !Number.isNaN(parsedStartedAt.getTime())
      ? parsedStartedAt.toISOString()
      : null;
  const activeCallParticipants = Array.isArray(payload?.activeCallParticipants)
    ? payload.activeCallParticipants
    : [];

  return {
    roomId,
    callId,
    updatedAt,
    isVideoCall,
    startedAt,
    hasStartedAt,
    activeCallParticipants,
  };
}

function shouldApplySnapshot(previousMeta, nextMeta) {
  if (!nextMeta?.roomId) return false;
  if (!previousMeta) return true;

  const previousUpdatedAt = Number(previousMeta.updatedAt) || 0;
  const nextUpdatedAt = Number(nextMeta.updatedAt) || 0;
  const previousCallId = previousMeta.callId ? String(previousMeta.callId) : null;
  const nextCallId = nextMeta.callId ? String(nextMeta.callId) : null;

  if (nextUpdatedAt < previousUpdatedAt) return false;
  if (nextUpdatedAt === previousUpdatedAt) {
    // Protect against out-of-order duplicate packets from older call ids.
    if (previousCallId && nextCallId && previousCallId !== nextCallId) {
      return false;
    }
  }

  return true;
}

module.exports = {
  normalizeSnapshotMeta,
  shouldApplySnapshot,
};
