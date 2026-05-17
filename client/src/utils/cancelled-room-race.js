function normalizeRoomId(value) {
  if (value === null || value === undefined) return "";
  return String(value);
}

function pruneCancelledRooms(
  cancelledMap,
  {
    now = Date.now(),
    maxAgeMs,
  } = {}
) {
  if (!cancelledMap || typeof cancelledMap.forEach !== "function") return;
  cancelledMap.forEach((cancelledAt, roomId) => {
    const ageMs = now - Number(cancelledAt || 0);
    if (!Number.isFinite(ageMs) || ageMs > maxAgeMs) {
      cancelledMap.delete(roomId);
    }
  });
}

function markCancelledRoom(
  cancelledMap,
  roomId,
  {
    now = Date.now(),
    maxAgeMs,
  } = {}
) {
  const roomKey = normalizeRoomId(roomId);
  if (!roomKey) return null;
  pruneCancelledRooms(cancelledMap, { now, maxAgeMs });
  cancelledMap.set(roomKey, now);
  return now;
}

function wasRoomCancelledRecently(
  cancelledMap,
  roomId,
  {
    now = Date.now(),
    raceWindowMs,
    maxAgeMs,
  } = {}
) {
  const roomKey = normalizeRoomId(roomId);
  if (!roomKey) {
    return {
      roomId: roomKey,
      cancelledAt: 0,
      ageMs: Infinity,
      isRecent: false,
    };
  }
  pruneCancelledRooms(cancelledMap, { now, maxAgeMs });
  const cancelledAt = Number(cancelledMap.get(roomKey) || 0);
  if (!cancelledAt) {
    return {
      roomId: roomKey,
      cancelledAt: 0,
      ageMs: Infinity,
      isRecent: false,
    };
  }
  const ageMs = now - cancelledAt;
  const isRecent = ageMs >= 0 && ageMs <= raceWindowMs;
  if (!isRecent) {
    cancelledMap.delete(roomKey);
  }
  return {
    roomId: roomKey,
    cancelledAt,
    ageMs,
    isRecent,
  };
}

module.exports = {
  normalizeRoomId,
  pruneCancelledRooms,
  markCancelledRoom,
  wasRoomCancelledRecently,
};
