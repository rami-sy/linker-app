/**
 * Shared rules for “there is a real ongoing call” vs stale Redux flags.
 */

export function normalizeRoomEntityId(value) {
  return value != null ? String(value) : "";
}

export function isRoomCallActiveForIndicator(room) {
  if (!room || room.hasActiveCall !== true) return false;
  const participantsCount = Array.isArray(room.activeCallParticipants)
    ? room.activeCallParticipants.filter(Boolean).length
    : 0;
  const hasCallId = normalizeRoomEntityId(room.activeCallId).length > 0;
  const syncedAt = Number(room.activeCallParticipantsSyncedAt || 0);
  const hasSnapshot = Number.isFinite(syncedAt) && syncedAt > 0;
  return participantsCount > 0 && (hasCallId || hasSnapshot);
}

/** Pulse + “open rejoin” when this room has an active call but the user is not in it. */
export function shouldShowHeaderCallPulse(room, isJoined, joinedRoomId) {
  if (!isRoomCallActiveForIndicator(room)) return false;
  const rid = normalizeRoomEntityId(room?._id);
  const jid = normalizeRoomEntityId(joinedRoomId);
  if (isJoined && rid && jid && rid === jid) return false;
  return true;
}
