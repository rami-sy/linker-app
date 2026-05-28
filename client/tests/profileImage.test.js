const test = require("node:test");
const assert = require("node:assert/strict");

test("profile image ordering helpers", async () => {
  const {
    getOrderedProfileImages,
    getPrimaryProfileImagePath,
  } = await import("../src/utils/profileImage.js");

  const images = [
    { _id: "1", path: "/a.jpg", index: 2 },
    { _id: "2", path: "/b.jpg", index: 0 },
    { _id: "3", path: "/c.jpg", index: 1 },
  ];
  const ordered = getOrderedProfileImages(images);
  assert.deepEqual(
    ordered.map((img) => img._id),
    ["2", "3", "1"]
  );

  const noIndex = [{ _id: "1", path: "/a.jpg" }, { _id: "2", path: "/b.jpg" }];
  assert.equal(getPrimaryProfileImagePath(noIndex), "/a.jpg");
  assert.equal(getOrderedProfileImages([{ _id: "1" }, { _id: "2", path: "/b.jpg" }]).length, 1);
});
