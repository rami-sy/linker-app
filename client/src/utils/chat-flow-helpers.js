function parseChatPushData(raw) {
  if (!raw || typeof raw !== "object") return null;
  if (raw.type != null && raw.type !== "chat_message") return null;

  const roomId = raw.roomId != null ? String(raw.roomId).trim() : "";
  if (!roomId) return null;

  const mentionValue = raw.mention;
  const isMention =
    mentionValue === true ||
    mentionValue === 1 ||
    mentionValue === "1" ||
    String(mentionValue).toLowerCase() === "true";

  return {
    roomId,
    messageId: raw.messageId != null ? String(raw.messageId) : null,
    isMention,
  };
}

function buildChatPushRoute(parsed) {
  if (!parsed?.roomId) return null;
  const params = {};
  if (parsed.isMention) params.pushMention = "1";
  if (parsed.messageId) params.highlightMessageId = parsed.messageId;

  return Object.keys(params).length > 0
    ? { pathname: `/chats/${parsed.roomId}`, params }
    : `/chats/${parsed.roomId}`;
}

function findMessageIndexByKey(messages, key) {
  if (key == null || key === "") return -1;
  const id = String(key);
  return (messages || []).findIndex(
    (m) =>
      (m?.uuId != null && String(m.uuId) === id) ||
      (m?._id != null && String(m._id) === id)
  );
}

module.exports = {
  parseChatPushData,
  buildChatPushRoute,
  findMessageIndexByKey,
};
