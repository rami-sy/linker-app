const test = require("node:test");
const assert = require("node:assert/strict");

const {
  normalizeSnapshotMeta,
  shouldApplySnapshot,
} = require("../src/utils/call-snapshot-helpers");

test("normalizeSnapshotMeta returns stable snapshot payload", () => {
  const snapshot = normalizeSnapshotMeta({
    roomId: 123,
    callId: "c-1",
    isVideoCall: true,
    updatedAt: 1000,
    activeCallParticipants: [{ userId: "u-1" }],
  });

  assert.equal(snapshot.roomId, "123");
  assert.equal(snapshot.callId, "c-1");
  assert.equal(snapshot.updatedAt, 1000);
  assert.equal(snapshot.isVideoCall, true);
  assert.deepEqual(snapshot.activeCallParticipants, [{ userId: "u-1" }]);
});

test("shouldApplySnapshot rejects older payloads", () => {
  const previous = { roomId: "r-1", callId: "c-1", updatedAt: 5000 };
  const older = { roomId: "r-1", callId: "c-1", updatedAt: 4999 };
  assert.equal(shouldApplySnapshot(previous, older), false);
});

test("shouldApplySnapshot rejects same-time mismatched callId", () => {
  const previous = { roomId: "r-1", callId: "c-1", updatedAt: 9000 };
  const staleDifferentCall = { roomId: "r-1", callId: "c-2", updatedAt: 9000 };
  assert.equal(shouldApplySnapshot(previous, staleDifferentCall), false);
});

test("shouldApplySnapshot accepts newer payloads", () => {
  const previous = { roomId: "r-1", callId: "c-1", updatedAt: 100 };
  const next = { roomId: "r-1", callId: "c-1", updatedAt: 200 };
  assert.equal(shouldApplySnapshot(previous, next), true);
});
