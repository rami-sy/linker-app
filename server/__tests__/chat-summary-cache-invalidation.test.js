jest.mock("../notification", () => ({ sendPushNotification: jest.fn() }));
jest.mock("../src/utils/logger", () => ({
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  messageEvent: jest.fn(),
}));
jest.mock("../src/queues/messageQueue", () => ({
  addPushNotificationJob: jest.fn(),
}));
jest.mock("../src/utils/permissions", () => ({
  checkChatPermission: jest.fn(),
  checkBlockedInRoom: jest.fn(),
}));
jest.mock("../src/sockets/services/e2ee.services", () => ({
  validateMessageE2eePayload: jest.fn(() => ({ ok: true })),
}));
jest.mock("../src/models/message.model", () => ({
  find: jest.fn(),
  findOneAndUpdate: jest.fn(),
}));
jest.mock("../src/models/room.model", () => ({
  findById: jest.fn(),
}));
jest.mock("../src/models/user.model", () => ({
  findById: jest.fn(),
}));
jest.mock("../src/models/call.model", () => ({
  findById: jest.fn(),
}));

const Message = require("../src/models/message.model");
const Room = require("../src/models/room.model");
const messageServices = require("../src/sockets/services/message.services");

const chainSelectLean = (result) => ({
  select: jest.fn().mockReturnValue({
    lean: jest.fn().mockResolvedValue(result),
  }),
});

const chainFindSummary = (rows) => ({
  select: jest.fn().mockReturnValue({
    sort: jest.fn().mockReturnValue({
      limit: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue(rows),
      }),
    }),
  }),
});

const chainFindOneAndUpdateLean = (result) => ({
  lean: jest.fn().mockResolvedValue(result),
});

const invokeWithCallback = (fn) =>
  new Promise((resolve) => {
    fn((payload) => resolve(payload));
  });

describe("chat summary cache invalidation", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Room.findById.mockReturnValue(
      chainSelectLean({ members: ["u1", "u2"], user: "u2" })
    );
  });

  test("getChatSummary caches and invalidates after scheduled mutation", async () => {
    const roomId = "room-cache-1";
    const socket = { user: { _id: "u1" } };

    Message.find
      .mockReturnValueOnce(
        chainFindSummary([
          { type: "text", text: "please review release checklist", createdAt: new Date().toISOString() },
          { type: "call_event", metadata: { eventKind: "answered" }, createdAt: new Date().toISOString() },
        ])
      )
      .mockReturnValueOnce(
        chainFindSummary([
          { type: "text", text: "please review release checklist", createdAt: new Date().toISOString() },
          { type: "text", text: "todo follow up with qa", createdAt: new Date().toISOString() },
          { type: "call_event", metadata: { eventKind: "missed" }, createdAt: new Date().toISOString() },
        ])
      );

    const first = await invokeWithCallback((cb) =>
      messageServices.getChatSummary({
        args: { room: roomId, windowSize: 120 },
        socket,
        callback: cb,
      })
    );
    expect(first?.type).toBe("success");
    expect(first?.cached).toBe(false);
    expect(first?.summary?.textCount).toBe(1);
    expect(Message.find).toHaveBeenCalledTimes(1);

    const second = await invokeWithCallback((cb) =>
      messageServices.getChatSummary({
        args: { room: roomId, windowSize: 120 },
        socket,
        callback: cb,
      })
    );
    expect(second?.type).toBe("success");
    expect(second?.cached).toBe(true);
    expect(second?.summary?.textCount).toBe(1);
    expect(Message.find).toHaveBeenCalledTimes(1);

    Message.findOneAndUpdate.mockReturnValue(
      chainFindOneAndUpdateLean({
        _id: "msg-1",
        room: roomId,
        user: "u1",
        scheduleStatus: "cancelled",
      })
    );
    const cancelRes = await invokeWithCallback((cb) =>
      messageServices.cancelScheduledMessage({
        args: { room: roomId, messageId: "msg-1" },
        socket,
        callback: cb,
      })
    );
    expect(cancelRes?.type).toBe("success");

    const third = await invokeWithCallback((cb) =>
      messageServices.getChatSummary({
        args: { room: roomId, windowSize: 120 },
        socket,
        callback: cb,
      })
    );
    expect(third?.type).toBe("success");
    expect(third?.cached).toBe(false);
    expect(third?.summary?.textCount).toBe(2);
    expect(Message.find).toHaveBeenCalledTimes(2);
  });
});
