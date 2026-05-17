const test = require("node:test");
const assert = require("node:assert/strict");

const {
  markCancelledRoom,
  wasRoomCancelledRecently,
  pruneCancelledRooms,
} = require("../src/utils/cancelled-room-race");

test("marks room and treats it as recent within race window", () => {
  const map = new Map();
  markCancelledRoom(map, "room-1", { now: 1000, maxAgeMs: 15000 });

  const state = wasRoomCancelledRecently(map, "room-1", {
    now: 1800,
    raceWindowMs: 1500,
    maxAgeMs: 15000,
  });

  assert.equal(state.isRecent, true);
  assert.equal(state.ageMs, 800);
});

test("auto-prunes room when entry exceeds race window", () => {
  const map = new Map();
  markCancelledRoom(map, "room-1", { now: 1000, maxAgeMs: 15000 });

  const state = wasRoomCancelledRecently(map, "room-1", {
    now: 3000,
    raceWindowMs: 1500,
    maxAgeMs: 15000,
  });

  assert.equal(state.isRecent, false);
  assert.equal(map.has("room-1"), false);
});

test("prunes old entries by max age", () => {
  const map = new Map();
  map.set("old-room", 1000);
  map.set("fresh-room", 9000);

  pruneCancelledRooms(map, { now: 20000, maxAgeMs: 15000 });

  assert.equal(map.has("old-room"), false);
  assert.equal(map.has("fresh-room"), true);
});

test("rapid redial stress simulation keeps only very recent cancellations blocked", () => {
  const map = new Map();
  const raceWindowMs = 1500;
  const maxAgeMs = 15000;

  let now = 1000;
  for (let i = 0; i < 200; i += 1) {
    markCancelledRoom(map, "room-fast", { now, maxAgeMs });
    const blockedImmediate = wasRoomCancelledRecently(map, "room-fast", {
      now: now + 100,
      raceWindowMs,
      maxAgeMs,
    });
    assert.equal(blockedImmediate.isRecent, true);

    const allowedAfterWindow = wasRoomCancelledRecently(map, "room-fast", {
      now: now + 1800,
      raceWindowMs,
      maxAgeMs,
    });
    assert.equal(allowedAfterWindow.isRecent, false);
    now += 50;
  }
});
