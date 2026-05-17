import { loadOrCreateDeviceKeys } from "./e2eeDevice";
import { getCachedRoomKey, ensureRoomKeyFromServer } from "./e2eeRoom";
import { decryptTextMessage } from "./e2eeCore";
import { hexToBytes } from "@noble/hashes/utils";

/**
 * Decrypt a stored/transport message for Redux/UI.
 * @param {object} message — server message shape
 * @param {string} roomId
 * @param {{ enabled?: boolean, keyVersion?: number }|null|undefined} roomE2ee
 * @param {import("socket.io-client").Socket|null} socket
 * @param {string} userId
 * @param {Awaited<ReturnType<typeof loadOrCreateDeviceKeys>>|null} deviceKeys
 */
export async function tryDecryptChatMessage(
  message,
  roomId,
  roomE2ee,
  socket,
  userId,
  deviceKeys
) {
  if (!message?.e2ee?.ciphertext) {
    return message;
  }

  const kv = Number(message.e2ee.v);
  if (roomE2ee?.enabled === false) {
    return { ...message, text: message.text || "🔒 Encrypted", content: null };
  }

  let keys = deviceKeys;
  if (!keys) {
    keys = await loadOrCreateDeviceKeys();
  }

  let cached = getCachedRoomKey(roomId);
  if (!cached?.key && socket && userId) {
    try {
      await ensureRoomKeyFromServer(socket, roomId, keys.x25519Priv, userId);
      cached = getCachedRoomKey(roomId);
    } catch {
      return { ...message, text: "🔒 Encrypted message", content: null };
    }
  }

  if (!cached?.key) {
    return { ...message, text: "🔒 Encrypted message", content: null };
  }

  if (roomE2ee?.keyVersion != null && cached.keyVersion !== roomE2ee.keyVersion) {
    try {
      await ensureRoomKeyFromServer(socket, roomId, keys.x25519Priv, userId);
      cached = getCachedRoomKey(roomId);
    } catch {
      return { ...message, text: "🔒 Encrypted message", content: null };
    }
  }

  if (!cached?.key || kv !== cached.keyVersion) {
    return { ...message, text: "🔒 Encrypted message", content: null };
  }

  try {
    const inner = decryptTextMessage({
      roomKey32: cached.key,
      roomId: String(roomId),
      keyVersion: kv,
      ivHex: message.e2ee.iv,
      ciphertextHex: message.e2ee.ciphertext,
      signatureHex: message.e2eeSignature,
      signerPublicHex: message.e2eeSignerPublic,
      uuId: message.uuId,
    });
    return {
      ...message,
      text: inner.text,
      content: inner.content,
      type: inner.type || message.type,
      replyTo: inner.replyTo ?? message.replyTo,
    };
  } catch {
    return { ...message, text: "🔒 Encrypted message", content: null };
  }
}
