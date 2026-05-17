function normalizeId(value) {
  if (value === null || value === undefined) return null;
  return value?.toString?.() || String(value);
}

function resolveDisconnectRoomId(room, peer) {
  const fromRoom = normalizeId(room?.id || room?.roomId);
  if (fromRoom) return fromRoom;
  return normalizeId(peer?.roomId);
}

function buildCallTracePayload({
  event,
  socketId,
  actorUserId = null,
  roomId = null,
  callId = null,
  extra = {},
}) {
  return {
    traceType: "call-signaling",
    event,
    socketId,
    actorUserId: normalizeId(actorUserId),
    roomId: normalizeId(roomId),
    callId: normalizeId(callId),
    at: Date.now(),
    ...extra,
  };
}

module.exports = {
  normalizeId,
  resolveDisconnectRoomId,
  buildCallTracePayload,
};
