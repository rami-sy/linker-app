const test = require("node:test");
const assert = require("node:assert/strict");

test("smoke: basic runtime sanity", () => {
  assert.equal(1 + 1, 2);
});
