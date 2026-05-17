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
jest.mock("../src/mediasoup/room-manager", () => ({
  getRoom: jest.fn(() => null),
}));

jest.mock("../src/models/message.model", () => ({
  find: jest.fn(),
  findOne: jest.fn(),
  findById: jest.fn(),
  updateOne: jest.fn(),
  countDocuments: jest.fn(),
}));
jest.mock("../src/models/room.model", () => ({
  findById: jest.fn(),
}));
jest.mock("../src/models/user.model", () => ({
  findById: jest.fn(),
}));

const Message = require("../src/models/message.model");
const Room = require("../src/models/room.model");
const User = require("../src/models/user.model");
const {
  checkChatPermission,
  checkBlockedInRoom,
} = require("../src/utils/permissions");
const messageServices = require("../src/sockets/services/message.services");

const chainSelectLean = (result) => ({
  select: jest.fn().mockReturnValue({
    lean: jest.fn().mockResolvedValue(result),
  }),
});

const chainFindMessages = (rows) => ({
  sort: jest.fn().mockReturnValue({
    skip: jest.fn().mockReturnValue({
      limit: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue(rows),
      }),
    }),
  }),
});

describe("message services chat flow guards", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("getMessages emits paginated payload with stateVersions", async () => {
    const messages = [
      { _id: { toString: () => "m2" }, text: "new", stateVersion: 2 },
      { _id: { toString: () => "m1" }, text: "old", stateVersion: 1 },
    ];
    Message.find.mockReturnValue(chainFindMessages(messages));
    Message.countDocuments.mockResolvedValue(2);
    Room.findById.mockReturnValue(
      chainSelectLean({ members: ["u1", "u2"], user: "u2" })
    );

    const socket = { user: { _id: "u1" }, emit: jest.fn() };
    const ioEmit = jest.fn();
    const io = { to: jest.fn(() => ({ emit: ioEmit })) };
    const redisClient = { get: jest.fn().mockResolvedValue("socket-u1") };

    await messageServices.getMessages({
      args: { room: "r1", page: 1, limit: 25, override: false },
      socket,
      io,
      redisClient,
    });

    expect(socket.emit).toHaveBeenCalledWith(
      "getMessages",
      expect.objectContaining({
        room: "r1",
        currentPage: 1,
        hasMore: false,
        stateVersions: { m1: 1, m2: 2 },
      })
    );
    expect(io.to).not.toHaveBeenCalled();
  });

  test("getThreadMessages rejects user outside room", async () => {
    Room.findById.mockReturnValue(chainSelectLean({ members: ["u2"], user: "u3" }));

    const socket = { user: { _id: "u1" }, emit: jest.fn() };
    const io = { to: jest.fn(() => ({ emit: jest.fn() })) };
    const redisClient = { get: jest.fn() };

    await messageServices.getThreadMessages({
      args: { room: "r1", threadRoot: "root-1", page: 1, limit: 10 },
      socket,
      io,
      redisClient,
    });

    expect(socket.emit).toHaveBeenCalledWith(
      "getThreadMessagesError",
      expect.objectContaining({
        room: "r1",
        threadRoot: "root-1",
        message: "Forbidden",
      })
    );
  });

  test("sendMessage rejects invalid reply target in room", async () => {
    checkBlockedInRoom.mockResolvedValue({ isBlocked: false });
    checkChatPermission.mockResolvedValue(true);
    Room.findById.mockReturnValue(
      chainSelectLean({
        members: ["u2"],
        isGroup: false,
        e2ee: { enabled: false, keyVersion: 1 },
      })
    );
    Message.findOne.mockReturnValue(chainSelectLean(null));

    const socket = {
      id: "sock-1",
      user: { _id: "u1", firstName: "A" },
      emit: jest.fn(),
    };
    const io = { to: jest.fn(() => ({ emit: jest.fn() })) };
    const redisClient = { get: jest.fn() };

    const res = await messageServices.sendMessage({
      args: {
        members: ["u2"],
        message: {
          room: "r1",
          text: "hello",
          createdAt: new Date().toISOString(),
          type: "text",
          content: null,
          uuId: "u-msg-1",
          replyTo: "missing-reply-id",
        },
      },
      socket,
      io,
      redisClient,
    });

    expect(res).toEqual({
      type: "error",
      message: "Reply target not found in this room",
    });
    expect(socket.emit).toHaveBeenCalledWith(
      "messageError",
      expect.objectContaining({ type: "reply_not_found" })
    );
  });

  test("typing fanout reaches all active sockets for target member", async () => {
    Room.findById.mockReturnValue(
      chainSelectLean({ members: ["u1", "u2"], user: null })
    );
    const typingUser = {
      friends: [],
      privacySettings: { interactions: { typingIndicator: "everyone" } },
    };
    User.findById.mockReturnValue(chainSelectLean(typingUser));
    const ioEmit = jest.fn();
    const io = {
      to: jest.fn(() => ({ emit: ioEmit })),
      sockets: {
        sockets: new Map([
          ["sock-a", { id: "sock-a", user: { _id: "u2" } }],
          ["sock-b", { id: "sock-b", user: { _id: "u2" } }],
          ["sock-c", { id: "sock-c", user: { _id: "u9" } }],
        ]),
      },
    };
    const socket = { user: { _id: "u1" }, emit: jest.fn() };
    const redisClient = { isReady: true, get: jest.fn().mockResolvedValue(null) };

    await messageServices.typing({
      args: { roomId: "r1", isTyping: true },
      socket,
      io,
      redisClient,
    });

    expect(io.to).toHaveBeenCalledWith("sock-a");
    expect(io.to).toHaveBeenCalledWith("sock-b");
    expect(ioEmit).toHaveBeenCalledWith(
      "userTyping",
      expect.objectContaining({
        roomId: "r1",
        userId: "u1",
      })
    );
  });

  test("handleCall rejects signaling from non-member", async () => {
    Room.findById.mockReturnValue(chainSelectLean({ members: ["u2"], user: "u2" }));
    const socket = { user: { _id: "u1" }, emit: jest.fn(), broadcast: { to: jest.fn() } };
    const io = {};

    await messageServices.handleCall({
      args: { roomId: "r1", offer: { sdp: "x" } },
      socket,
      io,
      redisClient: {},
    });

    expect(socket.emit).toHaveBeenCalledWith(
      "messageError",
      expect.objectContaining({ message: "Forbidden" })
    );
    expect(socket.broadcast.to).not.toHaveBeenCalled();
  });

  test("handleAnswer and handleIceCandidate allow room member signaling", async () => {
    Room.findById.mockReturnValue(chainSelectLean({ members: ["u1", "u2"], user: "u2" }));
    const callEmit = jest.fn();
    const answerEmit = jest.fn();
    const socket = {
      user: { _id: "u1" },
      emit: jest.fn(),
      broadcast: {
        to: jest
          .fn()
          .mockReturnValueOnce({ emit: callEmit })
          .mockReturnValueOnce({ emit: answerEmit }),
      },
    };

    await messageServices.handleAnswer({
      args: { roomId: "r1", answer: { sdp: "answer-sdp" } },
      socket,
      io: {},
      redisClient: {},
    });
    await messageServices.handleIceCandidate({
      args: { roomId: "r1", candidate: { candidate: "cand-1" } },
      socket,
      io: {},
      redisClient: {},
    });

    expect(socket.emit).not.toHaveBeenCalledWith(
      "messageError",
      expect.objectContaining({ message: "Forbidden" })
    );
    expect(socket.broadcast.to).toHaveBeenCalledWith("r1");
    expect(callEmit).toHaveBeenCalledWith("answer", { answer: { sdp: "answer-sdp" } });
    expect(answerEmit).toHaveBeenCalledWith("ice-candidate", {
      candidate: { candidate: "cand-1" },
    });
  });

  test("deliveredTo ignores sender self-ack", async () => {
    Message.findById.mockResolvedValue({
      _id: "m1",
      room: "r1",
      user: "u1",
      toObject: () => ({ _id: "m1" }),
    });
    Room.findById.mockReturnValue(chainSelectLean({ members: ["u1", "u2"], user: "u2" }));
    const socket = { user: { _id: "u1" }, emit: jest.fn() };
    const io = { to: jest.fn(() => ({ emit: jest.fn() })) };

    await messageServices.deliveredTo({
      args: { message: "m1", room: "r1" },
      socket,
      io,
      redisClient: {},
    });

    expect(Message.updateOne).not.toHaveBeenCalled();
    expect(io.to).not.toHaveBeenCalled();
  });

  test("deliveredTo rejects non-member", async () => {
    Message.findById.mockResolvedValue({
      _id: "m1",
      room: "r1",
      user: "u2",
      toObject: () => ({ _id: "m1" }),
    });
    Room.findById.mockReturnValue(chainSelectLean({ members: ["u2"], user: "u2" }));
    const socket = { user: { _id: "u1" }, emit: jest.fn() };
    const io = { to: jest.fn(() => ({ emit: jest.fn() })) };

    await messageServices.deliveredTo({
      args: { message: "m1", room: "r1" },
      socket,
      io,
      redisClient: {},
    });

    expect(socket.emit).toHaveBeenCalledWith(
      "messageError",
      expect.objectContaining({ message: "Forbidden" })
    );
    expect(Message.updateOne).not.toHaveBeenCalled();
  });

  test("messageSeen ignores sender self-marking", async () => {
    Message.findById
      .mockResolvedValueOnce({
        _id: "m1",
        room: "r1",
        user: "u1",
        checkVersionConflict: () => ({ hasConflict: false }),
        toObject: () => ({ _id: "m1" }),
      });
    Room.findById.mockReturnValue(chainSelectLean({ members: ["u1", "u2"], user: "u2" }));
    const socket = { user: { _id: "u1" }, emit: jest.fn() };
    const io = { to: jest.fn(() => ({ emit: jest.fn() })) };

    await messageServices.messageSeen({
      args: { message: "m1", room: "r1", clientVersion: 1 },
      socket,
      io,
      redisClient: {},
    });

    expect(Message.updateOne).not.toHaveBeenCalled();
    expect(io.to).not.toHaveBeenCalled();
  });

  test("messageSeen emits conflict payload and skips update on stale clientVersion", async () => {
    const conflictMessage = {
      _id: "m1",
      room: "r1",
      user: "u2",
      checkVersionConflict: () => ({
        hasConflict: true,
        serverVersion: 6,
        clientVersion: 2,
      }),
      toObject: () => ({ _id: "m1", room: "r1", stateVersion: 6 }),
    };
    Message.findById.mockResolvedValue(conflictMessage);
    const emit = jest.fn();
    const io = { to: jest.fn(() => ({ emit })) };
    const socket = { user: { _id: "u1" }, emit: jest.fn() };

    await messageServices.messageSeen({
      args: { message: "m1", room: "r1", clientVersion: 2 },
      socket,
      io,
      redisClient: {},
    });

    expect(Message.updateOne).not.toHaveBeenCalled();
    expect(io.to).toHaveBeenCalledWith("r1");
    expect(emit).toHaveBeenCalledWith(
      "messageSeen",
      expect.objectContaining({
        room: "r1",
        conflict: true,
        serverVersion: 6,
      })
    );
  });

  test("deliveredTo then messageSeen emits both events in order", async () => {
    Message.findById
      .mockResolvedValueOnce({
        _id: "m1",
        room: "r1",
        user: "u2",
        toObject: () => ({ _id: "m1", room: "r1" }),
      })
      .mockResolvedValueOnce({
        _id: "m1",
        room: "r1",
        user: "u2",
        stateVersion: 1,
        checkVersionConflict: () => ({ hasConflict: false }),
        toObject: () => ({ _id: "m1", room: "r1", deliveredTo: ["u1"] }),
      })
      .mockResolvedValueOnce({
        _id: "m1",
        room: "r1",
        user: "u2",
        checkVersionConflict: () => ({ hasConflict: false }),
        toObject: () => ({ _id: "m1", room: "r1" }),
      })
      .mockResolvedValueOnce({
        _id: "m1",
        room: "r1",
        user: "u2",
        stateVersion: 2,
        checkVersionConflict: () => ({ hasConflict: false }),
        toObject: () => ({
          _id: "m1",
          room: "r1",
          deliveredTo: ["u1"],
          seenBy: ["u1"],
          stateVersion: 2,
        }),
      });
    Room.findById.mockReturnValue(chainSelectLean({ members: ["u1", "u2"], user: "u2" }));
    const emit = jest.fn();
    const io = { to: jest.fn(() => ({ emit })) };
    const socket = { user: { _id: "u1" }, emit: jest.fn() };

    await messageServices.deliveredTo({
      args: { message: "m1", room: "r1" },
      socket,
      io,
      redisClient: {},
    });
    await messageServices.messageSeen({
      args: { message: "m1", room: "r1", clientVersion: 1 },
      socket,
      io,
      redisClient: {},
    });

    expect(Message.updateOne).toHaveBeenNthCalledWith(
      1,
      { _id: "m1" },
      { $addToSet: { deliveredTo: "u1" } }
    );
    expect(Message.updateOne).toHaveBeenNthCalledWith(
      2,
      { _id: "m1" },
      {
        $addToSet: { seenBy: "u1", deliveredTo: "u1" },
        $inc: { stateVersion: 1 },
      }
    );
    expect(io.to).toHaveBeenCalledWith("r1");
  });
});
