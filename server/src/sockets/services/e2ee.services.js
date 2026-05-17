const mongoose = require("mongoose");
const Room = require("../../models/room.model");
const User = require("../../models/user.model");
const logger = require("../../utils/logger");

const HEX_32 = /^[0-9a-fA-F]{64}$/;
const HEX_IV12 = /^[0-9a-fA-F]{24}$/;
const HEX_SIG64 = /^[0-9a-fA-F]{128}$/;

function isHex(s, minLen) {
  return typeof s === "string" && /^[0-9a-fA-F]+$/.test(s) && s.length >= minLen;
}

async function isRoomMember(roomId, userId) {
  const rid = new mongoose.Types.ObjectId(roomId);
  const uid = new mongoose.Types.ObjectId(userId);
  const room = await Room.findOne({
    _id: rid,
    members: uid,
  })
    .select("_id")
    .lean();
  return !!room;
}

const registerChatKeys = async function (
  { args, socket, io, redisClient },
  callback
) {
  try {
    const { deviceId, x25519Public, ed25519Public } = args || {};
    if (!deviceId || typeof deviceId !== "string" || deviceId.length > 128) {
      return callback?.({ ok: false, error: "Invalid deviceId" });
    }
    if (!HEX_32.test(x25519Public || "") || !HEX_32.test(ed25519Public || "")) {
      return callback?.({
        ok: false,
        error: "Public keys must be 64 hex chars (32 bytes)",
      });
    }

    const user = await User.findById(socket.user._id);
    if (!user) {
      return callback?.({ ok: false, error: "User not found" });
    }

    const now = new Date();
    const devices = user.chatDevices || [];
    const idx = devices.findIndex((d) => d.deviceId === deviceId);
    const entry = {
      deviceId,
      x25519Public: x25519Public.toLowerCase(),
      ed25519Public: ed25519Public.toLowerCase(),
      createdAt: idx >= 0 ? devices[idx].createdAt : now,
      lastSeenAt: now,
    };
    if (idx >= 0) {
      devices[idx] = entry;
    } else {
      devices.push(entry);
    }
    user.chatDevices = devices;
    await user.save();

    /** Ask online members to wrap room key for this user in E2EE rooms missing a package */
    const rooms = await Room.find({
      members: socket.user._id,
      "e2ee.enabled": true,
    })
      .select("_id e2ee e2eeKeyPackages members")
      .lean();

    for (const r of rooms) {
      const kv = r.e2ee?.keyVersion || 1;
      const hasPkg = (r.e2eeKeyPackages || []).some(
        (p) =>
          String(p.userId) === String(socket.user._id) && p.keyVersion === kv
      );
      if (!hasPkg && io) {
        io.to(String(r._id)).emit("e2eeRequestWrapForMember", {
          roomId: String(r._id),
          targetUserId: String(socket.user._id),
          keyVersion: kv,
          x25519Public: entry.x25519Public,
          ed25519Public: entry.ed25519Public,
          deviceId: entry.deviceId,
        });
      }
    }

    callback?.({ ok: true });
  } catch (e) {
    logger.error("registerChatKeys", e);
    callback?.({ ok: false, error: e.message });
  }
};

const getMembersE2eeKeys = async function (
  { args, socket, io, redisClient },
  callback
) {
  try {
    const { room } = args || {};
    if (!room) {
      return callback?.({ ok: false, error: "room required" });
    }
    if (!(await isRoomMember(room, socket.user._id))) {
      return callback?.({ ok: false, error: "Not a room member" });
    }

    const r = await Room.findById(room).select("members").lean();
    if (!r) {
      return callback?.({ ok: false, error: "Room not found" });
    }

    const users = await User.find({ _id: { $in: r.members } })
      .select("chatDevices")
      .lean();

    const members = users.map((u) => ({
      userId: String(u._id),
      devices: (u.chatDevices || []).map((d) => ({
        deviceId: d.deviceId,
        x25519Public: d.x25519Public,
        ed25519Public: d.ed25519Public,
      })),
    }));

    callback?.({ ok: true, members });
  } catch (e) {
    logger.error("getMembersE2eeKeys", e);
    callback?.({ ok: false, error: e.message });
  }
};

const getRoomKeyPackages = async function (
  { args, socket, io, redisClient },
  callback
) {
  try {
    const { room } = args || {};
    if (!room) {
      return callback?.({ ok: false, error: "room required" });
    }
    if (!(await isRoomMember(room, socket.user._id))) {
      return callback?.({ ok: false, error: "Not a room member" });
    }

    const r = await Room.findById(room)
      .select("e2ee e2eeKeyPackages")
      .lean();
    if (!r) {
      return callback?.({ ok: false, error: "Room not found" });
    }

    callback?.({
      ok: true,
      e2ee: r.e2ee,
      e2eeKeyPackages: r.e2eeKeyPackages || [],
    });
  } catch (e) {
    logger.error("getRoomKeyPackages", e);
    callback?.({ ok: false, error: e.message });
  }
};

const submitRoomKeyPackages = async function (
  { args, socket, io, redisClient },
  callback
) {
  try {
    const { room, keyVersion, packages } = args || {};
    if (!room || keyVersion == null || !Array.isArray(packages)) {
      return callback?.({
        ok: false,
        error: "room, keyVersion and packages[] required",
      });
    }
    if (!(await isRoomMember(room, socket.user._id))) {
      return callback?.({ ok: false, error: "Not a room member" });
    }

    const kv = Number(keyVersion);
    if (!Number.isInteger(kv) || kv < 1) {
      return callback?.({ ok: false, error: "Invalid keyVersion" });
    }

    const r = await Room.findById(room).select("members e2eeKeyPackages").lean();
    if (!r) {
      return callback?.({ ok: false, error: "Room not found" });
    }

    const memberSet = new Set((r.members || []).map((m) => String(m)));
    const normalized = [];
    const seenUser = new Set();
    for (const p of packages) {
      const uid = p.userId;
      if (!uid || !memberSet.has(String(uid))) {
        return callback?.({
          ok: false,
          error: `Package userId not in room: ${uid}`,
        });
      }
      if (!HEX_32.test(p.ephemeralPublic || "")) {
        return callback?.({ ok: false, error: "Invalid ephemeralPublic" });
      }
      if (!isHex(p.ciphertext, 32) || !HEX_IV12.test(p.iv || "")) {
        return callback?.({
          ok: false,
          error: "Invalid ciphertext or iv",
        });
      }
      const us = String(uid);
      if (seenUser.has(us)) {
        return callback?.({
          ok: false,
          error: "Duplicate package for user " + us,
        });
      }
      seenUser.add(us);
      normalized.push({
        userId: uid,
        keyVersion: kv,
        ephemeralPublic: String(p.ephemeralPublic).toLowerCase(),
        ciphertext: String(p.ciphertext).toLowerCase(),
        iv: String(p.iv).toLowerCase(),
        aad: typeof p.aad === "string" ? p.aad : "",
      });
    }

    if (normalized.length < memberSet.size) {
      return callback?.({
        ok: false,
        error: "Must submit one key package per room member",
      });
    }

    const covered = new Set(normalized.map((p) => String(p.userId)));
    for (const m of memberSet) {
      if (!covered.has(m)) {
        return callback?.({
          ok: false,
          error: "Missing key package for member " + m,
        });
      }
    }

    const kept = (r.e2eeKeyPackages || []).filter((p) => p.keyVersion !== kv);
    const merged = [...kept, ...normalized];

    await Room.findByIdAndUpdate(room, {
      $set: {
        e2eeKeyPackages: merged,
        e2ee: {
          enabled: true,
          keyVersion: kv,
          algorithm: "linker-e2ee-v1",
        },
      },
    });

    callback?.({ ok: true, keyVersion: kv });
  } catch (e) {
    logger.error("submitRoomKeyPackages", e);
    callback?.({ ok: false, error: e.message });
  }
};

const submitWrappedRoomKeyForMember = async function (
  { args, socket, io, redisClient },
  callback
) {
  try {
    const { room, targetUserId, keyVersion, ephemeralPublic, ciphertext, iv, aad } =
      args || {};
    if (
      !room ||
      !targetUserId ||
      keyVersion == null ||
      !ephemeralPublic ||
      !ciphertext ||
      !iv
    ) {
      return callback?.({ ok: false, error: "Missing fields" });
    }
    if (!(await isRoomMember(room, socket.user._id))) {
      return callback?.({ ok: false, error: "Not a room member" });
    }
    if (!(await isRoomMember(room, targetUserId))) {
      return callback?.({ ok: false, error: "Target not in room" });
    }

    const kv = Number(keyVersion);
    if (!HEX_32.test(ephemeralPublic) || !HEX_IV12.test(iv) || !isHex(ciphertext, 32)) {
      return callback?.({ ok: false, error: "Invalid crypto payload" });
    }

    const r = await Room.findById(room).select("e2ee e2eeKeyPackages").lean();
    if (!r?.e2ee?.enabled || r.e2ee.keyVersion !== kv) {
      return callback?.({
        ok: false,
        error: "Room key version mismatch",
      });
    }

    const others = (r.e2eeKeyPackages || []).filter(
      (p) =>
        !(String(p.userId) === String(targetUserId) && p.keyVersion === kv)
    );
    others.push({
      userId: targetUserId,
      keyVersion: kv,
      ephemeralPublic: ephemeralPublic.toLowerCase(),
      ciphertext: ciphertext.toLowerCase(),
      iv: iv.toLowerCase(),
      aad: typeof aad === "string" ? aad : "",
    });

    await Room.findByIdAndUpdate(room, {
      $set: { e2eeKeyPackages: others },
    });

    callback?.({ ok: true });
  } catch (e) {
    logger.error("submitWrappedRoomKeyForMember", e);
    callback?.({ ok: false, error: e.message });
  }
};

/** Validate E2EE fields on incoming messages (server does not decrypt). */
function validateMessageE2eePayload(e2ee, e2eeSignature, e2eeSignerPublic) {
  if (!e2ee || typeof e2ee !== "object") {
    return { ok: false, error: "Missing e2ee" };
  }
  const { v, iv, ciphertext } = e2ee;
  if (!Number.isInteger(Number(v)) || Number(v) < 1) {
    return { ok: false, error: "Invalid e2ee.v" };
  }
  if (!HEX_IV12.test(iv || "")) {
    return { ok: false, error: "Invalid e2ee.iv" };
  }
  if (!isHex(ciphertext, 16)) {
    return { ok: false, error: "Invalid e2ee.ciphertext" };
  }
  if (!HEX_SIG64.test(e2eeSignature || "")) {
    return { ok: false, error: "Invalid e2eeSignature" };
  }
  if (!HEX_32.test(e2eeSignerPublic || "")) {
    return { ok: false, error: "Invalid e2eeSignerPublic" };
  }
  return { ok: true };
}

module.exports = {
  registerChatKeys,
  getMembersE2eeKeys,
  getRoomKeyPackages,
  submitRoomKeyPackages,
  submitWrappedRoomKeyForMember,
  validateMessageE2eePayload,
};
