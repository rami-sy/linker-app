const Report = require("../src/models/report.model");
const { createReport } = require("../src/controllers/report.controller");

jest.mock("../src/models/report.model");

function createRes() {
  return {
    statusCode: 200,
    payload: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    send(payload) {
      this.payload = payload;
      return this;
    },
  };
}

describe("report.controller.createReport", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("returns 401 when reporter is missing", async () => {
    const req = { body: { type: "abuse", description: "test" }, user: null };
    const res = createRes();

    await createReport(req, res);

    expect(res.statusCode).toBe(401);
    expect(res.payload.type).toBe("error");
  });

  test("creates contextual report successfully", async () => {
    const save = jest.fn().mockResolvedValue({
      _id: "r1",
      type: "abuse",
      description: "bad behavior",
    });
    Report.mockImplementation(() => ({ save }));
    const req = {
      user: { _id: "u1" },
      body: {
        type: "abuse",
        description: "bad behavior",
        email: "a@b.com",
        targetUser: "u2",
        room: "room1",
      },
    };
    const res = createRes();

    await createReport(req, res);

    expect(Report).toHaveBeenCalledWith(
      expect.objectContaining({
        reporter: "u1",
        type: "abuse",
        targetUser: "u2",
        room: "room1",
      })
    );
    expect(res.statusCode).toBe(201);
    expect(res.payload.type).toBe("success");
  });

  test("falls back unknown type to other", async () => {
    const save = jest.fn().mockResolvedValue({ _id: "r2", type: "other" });
    Report.mockImplementation(() => ({ save }));
    const req = {
      user: { _id: "u1" },
      body: {
        type: "totally_unknown_type",
        description: "desc",
      },
    };
    const res = createRes();

    await createReport(req, res);

    expect(Report).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "other",
      })
    );
    expect(res.statusCode).toBe(201);
  });
});
