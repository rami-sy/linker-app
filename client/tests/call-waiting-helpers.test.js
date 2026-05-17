const test = require("node:test");
const assert = require("node:assert/strict");

const {
  normalizeRoomId,
  shouldUseWaitingFlow,
} = require("../src/utils/call-waiting-helpers");

test("normalizeRoomId returns empty string for nullish values", () => {
  assert.equal(normalizeRoomId(null), "");
  assert.equal(normalizeRoomId(undefined), "");
  assert.equal(normalizeRoomId("room-1"), "room-1");
});

test("shouldUseWaitingFlow false when not joined", () => {
  const result = shouldUseWaitingFlow({
    isJoined: false,
    currentRoomId: "room-a",
    incomingRoomId: "room-b",
    currentRole: "member",
  });
  assert.equal(result, false);
});

test("shouldUseWaitingFlow false for viewers", () => {
  const result = shouldUseWaitingFlow({
    isJoined: true,
    currentRoomId: "room-a",
    incomingRoomId: "room-b",
    currentRole: "viewer",
  });
  assert.equal(result, false);
});

test("shouldUseWaitingFlow true only for different active room", () => {
  assert.equal(
    shouldUseWaitingFlow({
      isJoined: true,
      currentRoomId: "room-a",
      incomingRoomId: "room-b",
      currentRole: "member",
    }),
    true
  );

  assert.equal(
    shouldUseWaitingFlow({
      isJoined: true,
      currentRoomId: "room-a",
      incomingRoomId: "room-a",
      currentRole: "member",
    }),
    false
  );
});
