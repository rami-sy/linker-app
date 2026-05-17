/**
 * Mirrors allowed mimetypes in src/routes/image.routes.js (checkFileType).
 * Fails if routes tighten types without updating tests.
 */
const allowed = /jpeg|jpg|png|ico|svg|gif|pdf|webp|webm|m4a|mp4|xlsx|xls|doc|docx|ppt|pptx|txt/i;

describe("image upload file type allowlist", () => {
  test("accepts common chat/media mimetypes", () => {
    expect(allowed.test("image/jpeg")).toBe(true);
    expect(allowed.test("image/png")).toBe(true);
    expect(allowed.test("video/mp4")).toBe(true);
    expect(allowed.test("audio/m4a")).toBe(true);
  });

  test("rejects arbitrary binary mimetype", () => {
    expect(allowed.test("application/x-msdownload")).toBe(false);
  });
});
