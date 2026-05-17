/**
 * E2EE primitives: X25519 wrap, AES-256-GCM, Ed25519 signatures.
 * Must stay in sync with server field validation (hex lengths).
 */
import { gcm } from "@noble/ciphers/aes";
import { x25519, ed25519 } from "@noble/curves/ed25519";
import { hkdf } from "@noble/hashes/hkdf";
import { sha256 } from "@noble/hashes/sha2";
import {
  bytesToHex,
  hexToBytes,
  utf8ToBytes,
  bytesToUtf8,
  randomBytes,
} from "@noble/hashes/utils";

const WRAP_INFO = utf8ToBytes("linker-e2ee-wrap-v1");
const WRAP_SALT = new Uint8Array(32);

export function generateRoomKey() {
  return randomBytes(32);
}

export function generateX25519KeyPair() {
  const priv = x25519.utils.randomPrivateKey();
  const pub = x25519.getPublicKey(priv);
  return { priv, pub };
}

export function generateEd25519KeyPair() {
  const priv = ed25519.utils.randomPrivateKey();
  const pub = ed25519.getPublicKey(priv);
  return { priv, pub };
}

function deriveWrapAesKey(sharedSecret) {
  return hkdf(sha256, sharedSecret, WRAP_SALT, WRAP_INFO, 32);
}

function messageAad(roomId, keyVersion) {
  return utf8ToBytes(`${String(roomId)}|${Number(keyVersion)}`);
}

/** @returns {{ ephemeralPublic: string, ciphertext: string, iv: string }} hex */
export function wrapRoomKey(roomKey32, recipientX25519PubHex) {
  const ephemeralPriv = x25519.utils.randomPrivateKey();
  const ephemeralPub = x25519.getPublicKey(ephemeralPriv);
  const peerPub = hexToBytes(recipientX25519PubHex);
  const shared = x25519.getSharedSecret(ephemeralPriv, peerPub);
  const aesKey = deriveWrapAesKey(shared);
  const iv = randomBytes(12);
  const cipher = gcm(aesKey, iv, new Uint8Array(0));
  const encrypted = cipher.encrypt(roomKey32);
  return {
    ephemeralPublic: bytesToHex(ephemeralPub),
    ciphertext: bytesToHex(encrypted),
    iv: bytesToHex(iv),
  };
}

export function unwrapRoomKey(pkg, myX25519PrivBytes) {
  const ephemeralPub = hexToBytes(pkg.ephemeralPublic);
  const shared = x25519.getSharedSecret(myX25519PrivBytes, ephemeralPub);
  const aesKey = deriveWrapAesKey(shared);
  const iv = hexToBytes(pkg.iv);
  const ciphertext = hexToBytes(pkg.ciphertext);
  const cipher = gcm(aesKey, iv, new Uint8Array(0));
  return cipher.decrypt(ciphertext);
}

export function buildE2eeSignPayload(ciphertextHex, roomId, uuId, keyVersion) {
  return utf8ToBytes(
    `${ciphertextHex}|${String(roomId)}|${String(uuId)}|${Number(keyVersion)}`
  );
}

/** @returns {{ iv: string, ciphertext: string, signature: string, signerPublicHex: string }} */
export function encryptTextMessage({
  roomKey32,
  roomId,
  keyVersion,
  text,
  content,
  type,
  replyTo,
  uuId,
  ed25519Priv,
  ed25519Pub,
}) {
  const inner = JSON.stringify({
    text: text ?? "",
    content: content ?? null,
    type: type ?? "text",
    replyTo: replyTo ?? null,
    uuId: uuId ?? null,
  });
  const plain = utf8ToBytes(inner);
  const iv = randomBytes(12);
  const cipher = gcm(roomKey32, iv, messageAad(roomId, keyVersion));
  const encrypted = cipher.encrypt(plain);
  const ciphertextHex = bytesToHex(encrypted);
  const signerPublicHex = bytesToHex(ed25519Pub);
  const sig = ed25519.sign(
    buildE2eeSignPayload(ciphertextHex, roomId, uuId, keyVersion),
    ed25519Priv
  );
  return {
    iv: bytesToHex(iv),
    ciphertext: ciphertextHex,
    signature: bytesToHex(sig),
    signerPublicHex,
  };
}

export function decryptTextMessage({
  roomKey32,
  roomId,
  keyVersion,
  ivHex,
  ciphertextHex,
  signatureHex,
  signerPublicHex,
  uuId,
}) {
  const iv = hexToBytes(ivHex);
  const ciphertext = hexToBytes(ciphertextHex);
  const cipher = gcm(roomKey32, iv, messageAad(roomId, keyVersion));
  const plain = cipher.decrypt(ciphertext);
  const payload = buildE2eeSignPayload(ciphertextHex, roomId, uuId, keyVersion);
  const sigOk = ed25519.verify(
    hexToBytes(signatureHex),
    payload,
    hexToBytes(signerPublicHex)
  );
  if (!sigOk) {
    throw new Error("E2EE signature verification failed");
  }
  return JSON.parse(bytesToUtf8(plain));
}
