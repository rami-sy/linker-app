const test = require("node:test");
const assert = require("node:assert/strict");

function buildExplorePageState({ currentPage, newData, existingUsers, total }) {
  const uniqueData =
    currentPage === 1
      ? newData
      : [...existingUsers, ...newData].filter(
          (user, index, arr) =>
            arr.findIndex((u) => String(u._id) === String(user._id)) === index
        );
  return {
    users: uniqueData,
    hasMore: total > uniqueData.length && newData.length > 0,
  };
}

test("page 1 replaces explore users", () => {
  const result = buildExplorePageState({
    currentPage: 1,
    newData: [{ _id: "a" }, { _id: "b" }],
    existingUsers: [{ _id: "old" }],
    total: 10,
  });
  assert.equal(result.users.length, 2);
  assert.equal(result.hasMore, true);
});

test("page 2 appends unique users", () => {
  const result = buildExplorePageState({
    currentPage: 2,
    newData: [{ _id: "c" }],
    existingUsers: [{ _id: "a" }, { _id: "b" }],
    total: 3,
  });
  assert.equal(result.users.length, 3);
  assert.equal(result.hasMore, false);
});

test("hasMore false when server returns empty page", () => {
  const result = buildExplorePageState({
    currentPage: 3,
    newData: [],
    existingUsers: [{ _id: "a" }],
    total: 1,
  });
  assert.equal(result.hasMore, false);
});
