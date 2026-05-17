jest.mock("../notification", () => ({ sendPushNotification: jest.fn() }));
jest.mock("../src/models/message.model", () => ({ find: jest.fn() }));
jest.mock("../src/models/room.model", () => ({
  find: jest.fn(),
  findById: jest.fn(),
}));
jest.mock("../src/models/user.model", () => ({
  findById: jest.fn(),
}));
jest.mock("../src/models/device.model", () => ({
  findOneAndUpdate: jest.fn(),
  find: jest.fn(),
  findByIdAndUpdate: jest.fn(),
}));
jest.mock("../src/models/like.model", () => ({ find: jest.fn() }));
jest.mock("../src/models/visitors", () => ({}));

const User = require("../src/models/user.model");
const Room = require("../src/models/room.model");
const userServices = require("../src/sockets/services/user.services");

const createRedisMulti = () => {
  const pipeline = {
    set: jest.fn().mockReturnThis(),
    del: jest.fn().mockReturnThis(),
    exec: jest.fn().mockResolvedValue([]),
  };
  return pipeline;
};

describe("user services multi-device mapping", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("addUserSocketMapping stores latest primary and socket list", async () => {
    const pipeline = createRedisMulti();
    const redisClient = {
      isReady: true,
      get: jest.fn().mockResolvedValue(JSON.stringify(["sock-old"])),
      multi: jest.fn(() => pipeline),
    };

    const result = await userServices.addUserSocketMapping({
      redisClient,
      userId: "u1",
      socketId: "sock-new",
    });

    expect(result).toEqual(["sock-new", "sock-old"]);
    expect(pipeline.set).toHaveBeenNthCalledWith(1, "user:u1", "sock-new");
    expect(pipeline.set).toHaveBeenNthCalledWith(
      2,
      "user_sockets:u1",
      JSON.stringify(["sock-new", "sock-old"])
    );
    expect(pipeline.exec).toHaveBeenCalled();
  });

  test("removeUserSocketMapping keeps remaining sockets and updates primary", async () => {
    const pipeline = createRedisMulti();
    const redisClient = {
      isReady: true,
      get: jest.fn().mockResolvedValue(JSON.stringify(["sock-a", "sock-b"])),
      multi: jest.fn(() => pipeline),
    };

    const result = await userServices.removeUserSocketMapping({
      redisClient,
      userId: "u1",
      socketId: "sock-a",
    });

    expect(result).toEqual(["sock-b"]);
    expect(pipeline.set).toHaveBeenNthCalledWith(1, "user:u1", "sock-b");
    expect(pipeline.set).toHaveBeenNthCalledWith(
      2,
      "user_sockets:u1",
      JSON.stringify(["sock-b"])
    );
    expect(pipeline.del).not.toHaveBeenCalled();
  });

  test("removeUserSocketMapping deletes keys when no socket remains", async () => {
    const pipeline = createRedisMulti();
    const redisClient = {
      isReady: true,
      get: jest.fn().mockResolvedValue(JSON.stringify(["sock-a"])),
      multi: jest.fn(() => pipeline),
    };

    const result = await userServices.removeUserSocketMapping({
      redisClient,
      userId: "u1",
      socketId: "sock-a",
    });

    expect(result).toEqual([]);
    expect(pipeline.del).toHaveBeenCalledWith("user:u1");
    expect(pipeline.del).toHaveBeenCalledWith("user_sockets:u1");
  });

  test("userDisconnected does not mark offline when another socket is active", async () => {
    const pipeline = createRedisMulti();
    const redisClient = {
      isReady: true,
      get: jest.fn(async (key) => {
        if (key === "user_sockets:u1") return JSON.stringify(["sock-a", "sock-b"]);
        if (key === "user:u1") return "sock-b";
        return null;
      }),
      multi: jest.fn(() => pipeline),
      del: jest.fn().mockResolvedValue(1),
    };
    const io = {
      sockets: {
        sockets: new Map([["sock-b", { id: "sock-b", user: { _id: "u1" } }]]),
      },
    };
    const socket = { id: "sock-a", user: { _id: "u1" }, to: jest.fn(), emit: jest.fn() };

    await userServices.userDisconnected({ args: {}, socket, redisClient, io }, jest.fn());

    expect(User.findById).not.toHaveBeenCalled();
    expect(redisClient.del).not.toHaveBeenCalledWith("lastSeen:u1");
  });

  test("userDisconnected marks offline only for last active socket", async () => {
    const pipeline = createRedisMulti();
    const redisClient = {
      isReady: true,
      get: jest.fn(async (key) => {
        if (key === "user_sockets:u1") return JSON.stringify(["sock-a"]);
        if (key === "user:u1") return "sock-a";
        return null;
      }),
      multi: jest.fn(() => pipeline),
      del: jest.fn().mockResolvedValue(1),
    };
    const io = { sockets: { sockets: new Map() } };
    const socket = { id: "sock-a", user: { _id: "u1" }, to: jest.fn(), emit: jest.fn() };

    const userDoc = {
      password: "x",
      toObject: () => ({ _id: "u1" }),
      save: jest.fn().mockResolvedValue(undefined),
      status: "online",
      lastSeen: null,
    };
    User.findById
      .mockReturnValueOnce({
        select: jest.fn().mockReturnValue({
          populate: jest.fn().mockReturnValue({
            exec: jest.fn().mockResolvedValue(userDoc),
          }),
        }),
      })
      .mockReturnValueOnce({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue({
            friends: [],
            incomingFriendRequests: [],
            outgoingFriendRequests: [],
            privacySettings: { interactions: { status: "none", lastSeen: "noOne" } },
          }),
        }),
      });
    Room.find.mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue([]),
      }),
    });

    await userServices.userDisconnected({ args: {}, socket, redisClient, io }, jest.fn());

    expect(userDoc.save).toHaveBeenCalled();
    expect(redisClient.del).toHaveBeenCalledWith("lastSeen:u1");
  });
});
