jest.mock("bull", () =>
  jest.fn().mockImplementation(() => ({
    on: jest.fn(),
    process: jest.fn(),
    add: jest.fn(),
    close: jest.fn(),
  }))
);

jest.mock("../src/utils/logger", () => ({
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  messageEvent: jest.fn(),
}));

jest.mock("../src/models/message.model", () => ({}));
jest.mock("../src/models/user.model", () => ({}));
jest.mock("../notification", () => ({ sendPushNotification: jest.fn() }));
jest.mock("../src/sockets/services/room.services", () => ({
  isChatMuted: jest.fn(),
  isUserMuted: jest.fn(),
}));

const {
  buildPushContent,
  buildPushTitle,
  buildChatPushData,
} = require("../src/queues/messageQueue");

describe("message queue push payload helpers", () => {
  test("buildPushTitle formats mention title with room name", () => {
    expect(
      buildPushTitle({
        senderFullName: "ahmed",
        isMentioned: true,
        roomNameForPush: "General",
      })
    ).toBe("Ahmed mentioned you · General");
  });

  test("buildPushContent prefers encrypted placeholder", () => {
    expect(
      buildPushContent({
        type: "text",
        text: "hello",
        e2ee: { ciphertext: "abc123" },
      })
    ).toBe("Encrypted message");
  });

  test("buildChatPushData keeps room/message ids as strings", () => {
    const data = buildChatPushData({
      recipientStatus: "offline",
      content: "Image",
      roomId: { toString: () => "room-1" },
      messageId: { toString: () => "msg-9" },
      isMentioned: true,
    });
    expect(data).toEqual(
      expect.objectContaining({
        type: "chat_message",
        title: "New message",
        body: "Image",
        entityType: "room",
        entityId: "room-1",
        route: "/chats/room-1",
        priority: "high",
        dedupeKey: "chat_message:msg-9",
      })
    );
    expect(typeof data.createdAt).toBe("string");
  });
});
