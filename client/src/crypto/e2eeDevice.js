import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils";
import {
  generateX25519KeyPair,
  generateEd25519KeyPair,
} from "./e2eeCore";

const STORAGE_KEY = "linker_e2ee_device_v1";

/** expo-secure-store native module is a no-op on web (no getValueWithKeyAsync). */
function useWebKeyStorage() {
  return Platform.OS === "web";
}

async function storageGetItem(key) {
  if (useWebKeyStorage()) {
    return AsyncStorage.getItem(key);
  }
  return SecureStore.getItemAsync(key);
}

async function storageSetItem(key, value) {
  if (useWebKeyStorage()) {
    return AsyncStorage.setItem(key, value);
  }
  return SecureStore.setItemAsync(key, value);
}

function parseStored(json) {
  const o = JSON.parse(json);
  return {
    deviceId: o.deviceId,
    x25519Priv: hexToBytes(o.x25519PrivHex),
    x25519PubHex: o.x25519PubHex.toLowerCase(),
    ed25519Priv: hexToBytes(o.ed25519PrivHex),
    ed25519PubHex: o.ed25519PubHex.toLowerCase(),
  };
}

export async function loadOrCreateDeviceKeys() {
  const existing = await storageGetItem(STORAGE_KEY);
  if (existing) {
    try {
      return parseStored(existing);
    } catch (e) {
      console.warn("E2EE: resetting device keys", e);
    }
  }
  const deviceId = `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
  const x = generateX25519KeyPair();
  const e = generateEd25519KeyPair();
  const record = {
    deviceId,
    x25519PrivHex: bytesToHex(x.priv),
    x25519PubHex: bytesToHex(x.pub),
    ed25519PrivHex: bytesToHex(e.priv),
    ed25519PubHex: bytesToHex(e.pub),
  };
  await storageSetItem(STORAGE_KEY, JSON.stringify(record));
  return {
    deviceId,
    x25519Priv: x.priv,
    x25519PubHex: record.x25519PubHex,
    ed25519Priv: e.priv,
    ed25519PubHex: record.ed25519PubHex,
  };
}

export async function registerDeviceKeysOnServer(socket) {
  if (!socket) return { ok: false, error: "no socket" };
  const keys = await loadOrCreateDeviceKeys();
  return new Promise((resolve) => {
    socket.emit(
      "registerChatKeys",
      {
        deviceId: keys.deviceId,
        x25519Public: keys.x25519PubHex,
        ed25519Public: keys.ed25519PubHex,
      },
      (res) => {
        if (res?.ok) {
          resolve({ ok: true, keys });
        } else {
          resolve({ ok: false, error: res?.error, keys });
        }
      }
    );
  });
}
