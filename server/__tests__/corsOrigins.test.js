const {
  getAllowedOriginsList,
  DEFAULT_DEV_ORIGINS,
} = require("../src/utils/corsOrigins");

describe("corsOrigins", () => {
  const original = process.env.CORS_ORIGIN;

  afterEach(() => {
    if (original === undefined) {
      delete process.env.CORS_ORIGIN;
    } else {
      process.env.CORS_ORIGIN = original;
    }
  });

  test("uses CORS_ORIGIN when set", () => {
    process.env.CORS_ORIGIN = "https://a.example,https://b.example";
    expect(getAllowedOriginsList()).toEqual([
      "https://a.example",
      "https://b.example",
    ]);
  });

  test("defaults to dev list when unset", () => {
    delete process.env.CORS_ORIGIN;
    expect(getAllowedOriginsList()).toEqual(DEFAULT_DEV_ORIGINS);
  });
});
