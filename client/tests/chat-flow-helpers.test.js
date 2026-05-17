const test = require("node:test");
const assert = require("node:assert/strict");

const {
  parseChatPushData,
  buildChatPushRoute,
  findMessageIndexByKey,
} = require("../src/utils/chat-flow-helpers");

test("push mention builds room route with params", () => {
  const parsed = parseChatPushData({
    type: "chat_message",
    roomId: "room-1",
    messageId: "m-10",
    mention: "true",
  });

  assert.deepEqual(parsed, {
    roomId: "room-1",
    messageId: "m-10",
    isMention: true,
  });

  const route = buildChatPushRoute(parsed);
  assert.deepEqual(route, {
    pathname: "/chats/room-1",
    params: { pushMention: "1", highlightMessageId: "m-10" },
  });
});

test("jump-to-message resolver matches uuId and _id", () => {
  const messages = [
    { _id: "1", text: "a" },
    { uuId: "uuid-2", text: "b" },
    { _id: "3", uuId: "uuid-3", text: "c" },
  ];

  assert.equal(findMessageIndexByKey(messages, "uuid-2"), 1);
  assert.equal(findMessageIndexByKey(messages, "3"), 2);
  assert.equal(findMessageIndexByKey(messages, "missing"), -1);
});

test("non-chat push payload is ignored", () => {
  const parsed = parseChatPushData({
    type: "friend_request",
    roomId: "room-x",
  });
  assert.equal(parsed, null);
});

test("chat push route is null without room id", () => {
  assert.equal(buildChatPushRoute({ roomId: "" }), null);
  assert.equal(parseChatPushData({ type: "chat_message", roomId: "" }), null);
});
