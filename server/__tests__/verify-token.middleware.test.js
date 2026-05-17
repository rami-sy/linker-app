process.env.JWT_SECRET = "jest-test-secret";

const jwt = require("jsonwebtoken");
const verifyToken = require("../src/middlewares/verify-token");

describe("verifyToken middleware", () => {
  test("403 when no token", (done) => {
    const req = { headers: {} };
    const res = {
      status(code) {
        expect(code).toBe(403);
        return this;
      },
      send(body) {
        expect(body.message).toMatch(/token/i);
        done();
      },
    };
    verifyToken(req, res, () => {
      done(new Error("next should not run"));
    });
  });

  test("calls next with req.user when token valid", (done) => {
    const uid = "507f1f77bcf86cd799439011";
    const token = jwt.sign({ _id: uid }, "jest-test-secret", { expiresIn: "1h" });
    const req = { headers: { "x-access-token": token } };
    const res = {
      status() {
        done(new Error("should not error"));
      },
      send() {
        done(new Error("should not send"));
      },
    };
    verifyToken(req, res, () => {
      expect(req.user._id).toBe(uid);
      expect(req.user.daysRemaining).toBeDefined();
      done();
    });
  });
});
