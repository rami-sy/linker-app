import { hexToBytes } from "@noble/hashes/utils";
import { unwrapRoomKey, wrapRoomKey, generateRoomKey } from "./e2eeCore";

/** @type {Map<string, { key: Uint8Array, keyVersion: number }>} */
const roomKeyCache = new Map();

export function getCachedRoomKey(roomId) {
  return roomKeyCache.get(String(roomId)) || null;
}

export function setCachedRoomKey(roomId, key32, keyVersion) {
  roomKeyCache.set(String(roomId), {
    key: key32,
    keyVersion: Number(keyVersion),
  });
}

export function clearCachedRoomKey(roomId) {
  roomKeyCache.delete(String(roomId));
}

/**
 * Fetch packages from server and unwrap the one for this user.
 * @param {import("socket.io-client").Socket} socket
 * @param {string} roomId
 * @param {Uint8Array} myX25519Priv
 * @param {string} myUserId
 */
export function ensureRoomKeyFromServer(socket, roomId, myX25519Priv, myUserId) {
  return new Promise((resolve, reject) => {
    socket.emit("getRoomKeyPackages", { room: roomId }, (res) => {
      if (!res?.ok) {
        reject(new Error(res?.error || "getRoomKeyPackages failed"));
        return;
      }
      if (!res.e2ee?.enabled) {
        resolve(null);
        return;
      }
      const kv = res.e2ee.keyVersion;
      const pkg = (res.e2eeKeyPackages || []).find(
        (p) => String(p.userId) === String(myUserId) && p.keyVersion === kv
      );
      if (!pkg) {
        reject(new Error("No E2EE key package for this device"));
        return;
      }
      try {
        const key = unwrapRoomKey(pkg, myX25519Priv);
        setCachedRoomKey(roomId, key, kv);
        resolve({ key, keyVersion: kv });
      } catch (e) {
        reject(e);
      }
    });
  });
}

/**
 * Build and submit packages for all members (enable E2EE).
 * Uses latest device key per user from getMembersE2eeKeys.
 */
export function submitInitialRoomKeys(socket, roomId, roomKey32, keyVersion, membersKeys) {
  const packages = [];
  for (const m of membersKeys) {
    const uid = m.userId;
    const devices = m.devices || [];
    if (!devices.length) {
      return Promise.reject(
        new Error(`Member ${uid} has no registered chat keys`)
      );
    }
    const pub = devices[devices.length - 1].x25519Public;
    const w = wrapRoomKey(roomKey32, pub);
    packages.push({
      userId: uid,
      ...w,
      aad: "",
    });
  }
  return new Promise((resolve, reject) => {
    socket.emit(
      "submitRoomKeyPackages",
      { room: roomId, keyVersion, packages },
      (res) => {
        if (res?.ok) {
          setCachedRoomKey(roomId, roomKey32, keyVersion);
          resolve(res);
        } else {
          reject(new Error(res?.error || "submitRoomKeyPackages failed"));
        }
      }
    );
  });
}

export function fetchMembersE2eeKeys(socket, roomId) {
  return new Promise((resolve, reject) => {
    socket.emit("getMembersE2eeKeys", { room: roomId }, (res) => {
      if (res?.ok) {
        resolve(res.members);
      } else {
        reject(new Error(res?.error || "getMembersE2eeKeys failed"));
      }
    });
  });
}

export async function enableE2eeForRoom(socket, roomId) {
  const members = await fetchMembersE2eeKeys(socket, roomId);
  const missing = members.filter((m) => !(m.devices && m.devices.length));
  if (missing.length) {
    throw new Error(
      "All members must open the app once to register encryption keys"
    );
  }
  const roomKey = generateRoomKey();
  await submitInitialRoomKeys(socket, roomId, roomKey, 1, members);
  return { roomKey, keyVersion: 1 };
}

export function submitWrapForMember(socket, roomId, targetUserId, keyVersion, roomKey32, targetX25519PubHex) {
  const w = wrapRoomKey(roomKey32, targetX25519PubHex);
  return new Promise((resolve, reject) => {
    socket.emit(
      "submitWrappedRoomKeyForMember",
      {
        room: roomId,
        targetUserId,
        keyVersion,
        ...w,
        aad: "",
      },
      (res) => {
        if (res?.ok) {
          resolve(res);
        } else {
          reject(new Error(res?.error || "submitWrappedRoomKeyForMember failed"));
        }
      }
    );
  });
}

export { generateRoomKey, hexToBytes };
