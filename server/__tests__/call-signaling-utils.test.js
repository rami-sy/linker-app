const {
  resolveDisconnectRoomId,
  buildCallTracePayload,
} = require("../src/utils/call-signaling-utils");

describe("call-signaling-utils", () => {
  test("resolveDisconnectRoomId prefers room.id", () => {
    const roomId = resolveDisconnectRoomId(
      { id: "room-123", roomId: "legacy-room" },
      { roomId: "peer-room" }
    );
    expect(roomId).toBe("room-123");
  });

  test("resolveDisconnectRoomId falls back to peer.roomId", () => {
    const roomId = resolveDisconnectRoomId({}, { roomId: "peer-room" });
    expect(roomId).toBe("peer-room");
  });

  test("buildCallTracePayload keeps canonical fields", () => {
    const payload = buildCallTracePayload({
      event: "callRequest.received",
      socketId: "socket-1",
      actorUserId: "user-1",
      roomId: "room-1",
      callId: "call-1",
      extra: { stage: "invite" },
    });

    expect(payload.traceType).toBe("call-signaling");
    expect(payload.event).toBe("callRequest.received");
    expect(payload.socketId).toBe("socket-1");
    expect(payload.actorUserId).toBe("user-1");
    expect(payload.roomId).toBe("room-1");
    expect(payload.callId).toBe("call-1");
    expect(payload.stage).toBe("invite");
    expect(typeof payload.at).toBe("number");
  });
});
