import { loadOrCreateDeviceKeys } from "./e2eeDevice";
import { getCachedRoomKey, ensureRoomKeyFromServer } from "./e2eeRoom";
import { decryptTextMessage } from "./e2eeCore";
import { hexToBytes } from "@noble/hashes/utils";

const DECRYPT_CACHE_MAX = 500;
const decryptCache = new Map(); // key -> { text, content, type, replyTo }

/** Shown in UI when ciphertext could not be decrypted (with e2eeDecryptFailed). */
export const E2EE_ENCRYPTED_PLACEHOLDER = "🔒 Encrypted message";

function markDecryptFailed(message) {
  return {
    ...message,
    text: message.text || E2EE_ENCRYPTED_PLACEHOLDER,
    content: null,
    e2eeDecryptFailed: true,
  };
}

function buildDecryptCacheKey(message, roomId) {
  const id = String(message?.uuId || message?._id || "");
  const kv = String(message?.e2ee?.v ?? "");
  const iv = String(message?.e2ee?.iv ?? "");
  const ct = String(message?.e2ee?.ciphertext ?? "");
  // Avoid huge keys: include length + head/tail slices.
  const head = ct.slice(0, 16);
  const tail = ct.slice(-16);
  const sig = String(message?.e2eeSignature ?? "").slice(0, 16);
  return `${String(roomId)}:${id}:${kv}:${iv}:${ct.length}:${head}:${tail}:${sig}`;
}

function cacheSet(key, value) {
  if (!key) return;
  if (decryptCache.has(key)) decryptCache.delete(key);
  decryptCache.set(key, value);
  if (decryptCache.size > DECRYPT_CACHE_MAX) {
    const first = decryptCache.keys().next().value;
    if (first) decryptCache.delete(first);
  }
}

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

  const cacheKey = buildDecryptCacheKey(message, roomId);
  const cachedPlaintext = decryptCache.get(cacheKey);
  if (cachedPlaintext && cachedPlaintext.text) {
    return {
      ...message,
      text: cachedPlaintext.text,
      content: cachedPlaintext.content,
      type: cachedPlaintext.type || message.type,
      replyTo: cachedPlaintext.replyTo ?? message.replyTo,
    };
  }

  const kv = Number(message.e2ee.v);
  if (roomE2ee?.enabled === false) {
    return markDecryptFailed({
      ...message,
      text: message.text || "🔒 Encrypted",
      content: null,
    });
  }

  let keys = deviceKeys;
  if (!keys) {
    keys = await loadOrCreateDeviceKeys();
  }

  let roomKeyCache = getCachedRoomKey(roomId);
  if (!roomKeyCache?.key && socket && userId) {
    try {
      await ensureRoomKeyFromServer(socket, roomId, keys.x25519Priv, userId);
      roomKeyCache = getCachedRoomKey(roomId);
    } catch {
      return markDecryptFailed(message);
    }
  }

  if (!roomKeyCache?.key) {
    return markDecryptFailed(message);
  }

  if (roomE2ee?.keyVersion != null && roomKeyCache.keyVersion !== roomE2ee.keyVersion) {
    try {
      await ensureRoomKeyFromServer(socket, roomId, keys.x25519Priv, userId);
      roomKeyCache = getCachedRoomKey(roomId);
    } catch {
      return markDecryptFailed(message);
    }
  }

  if (!roomKeyCache?.key || kv !== roomKeyCache.keyVersion) {
    return markDecryptFailed(message);
  }

  try {
    const inner = decryptTextMessage({
      roomKey32: roomKeyCache.key,
      roomId: String(roomId),
      keyVersion: kv,
      ivHex: message.e2ee.iv,
      ciphertextHex: message.e2ee.ciphertext,
      signatureHex: message.e2eeSignature,
      signerPublicHex: message.e2eeSignerPublic,
      uuId: message.uuId,
    });
    cacheSet(cacheKey, {
      text: inner.text,
      content: inner.content,
      type: inner.type,
      replyTo: inner.replyTo,
    });
    return {
      ...message,
      text: inner.text,
      content: inner.content,
      type: inner.type || message.type,
      replyTo: inner.replyTo ?? message.replyTo,
      e2eeDecryptFailed: false,
    };
  } catch {
    return markDecryptFailed(message);
  }
}
