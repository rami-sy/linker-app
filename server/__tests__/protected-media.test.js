const {
  safeBasenameFromUrlPath,
  isProtectedMediaEnabled,
} = require("../src/middlewares/protected-media.middleware");

describe("protected-media", () => {
  describe("safeBasenameFromUrlPath", () => {
    test("returns basename for simple path", () => {
      expect(safeBasenameFromUrlPath("/abc.mp4")).toBe("abc.mp4");
    });

    test("strips query string", () => {
      expect(safeBasenameFromUrlPath("/x/y/file.png?token=a")).toBe("file.png");
    });

    test("rejects path traversal", () => {
      expect(safeBasenameFromUrlPath("/../etc/passwd")).toBeNull();
    });

    test("decodes URI component", () => {
      expect(safeBasenameFromUrlPath("/hello%20world.txt")).toBe("hello world.txt");
    });
  });

  describe("isProtectedMediaEnabled", () => {
    const keys = ["NODE_ENV", "MEDIA_REQUIRE_AUTH"];

    afterEach(() => {
      keys.forEach((k) => delete process.env[k]);
    });

    test("MEDIA_REQUIRE_AUTH=false disables", () => {
      process.env.MEDIA_REQUIRE_AUTH = "false";
      process.env.NODE_ENV = "production";
      expect(isProtectedMediaEnabled()).toBe(false);
    });

    test("MEDIA_REQUIRE_AUTH=true enables even in development", () => {
      process.env.MEDIA_REQUIRE_AUTH = "true";
      process.env.NODE_ENV = "development";
      expect(isProtectedMediaEnabled()).toBe(true);
    });

    test("unset + production enables", () => {
      delete process.env.MEDIA_REQUIRE_AUTH;
      process.env.NODE_ENV = "production";
      expect(isProtectedMediaEnabled()).toBe(true);
    });

    test("unset + development disables", () => {
      delete process.env.MEDIA_REQUIRE_AUTH;
      process.env.NODE_ENV = "development";
      expect(isProtectedMediaEnabled()).toBe(false);
    });
  });
});
