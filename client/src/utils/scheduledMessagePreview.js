/**
 * Match a scheduled message from the API with the in-memory copy in the room (often has plaintext
 * when the server stores empty `text` for E2EE).
 */
export function findScheduledMessageInRoomMap(apiMsg, roomMessages) {
  if (!apiMsg || !roomMessages || typeof roomMessages !== "object") return null;
  const id =
    apiMsg._id != null && apiMsg._id !== ""
      ? String(apiMsg._id)
      : "";
  const uid =
    apiMsg.uuId != null && apiMsg.uuId !== ""
      ? String(apiMsg.uuId)
      : "";
  for (const m of Object.values(roomMessages)) {
    if (!m) continue;
    if (id && m._id != null && String(m._id) === id) return m;
    if (uid && m.uuId != null && String(m.uuId) === uid) return m;
  }
  return null;
}

/** Plaintext body for list/bubbles; strips leading 💬 from composer. */
export function scheduledMessagePlainBody(apiMsg, localMsg) {
  const raw = String(
    (apiMsg?.text != null && String(apiMsg.text).trim() !== ""
      ? apiMsg.text
      : localMsg?.text) || ""
  ).trim();
  if (!raw) return "";
  if (apiMsg?.type === "text" || localMsg?.type === "text" || !apiMsg?.type) {
    return raw.replace(/^💬\s*/, "");
  }
  return raw;
}
