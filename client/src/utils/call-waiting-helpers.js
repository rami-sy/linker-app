function normalizeRoomId(value) {
  return value != null ? String(value) : "";
}

function shouldUseWaitingFlow({
  isJoined,
  currentRoomId,
  incomingRoomId,
  currentRole,
}) {
  if (!isJoined) return false;
  if (currentRole === "viewer") return false;

  const currentId = normalizeRoomId(currentRoomId);
  const incomingId = normalizeRoomId(incomingRoomId);

  if (!currentId || !incomingId) return false;
  return currentId !== incomingId;
}

module.exports = {
  normalizeRoomId,
  shouldUseWaitingFlow,
};
