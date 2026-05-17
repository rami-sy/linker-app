jest.mock("../src/models/room.model", () => ({
  findById: jest.fn(),
}));

const Room = require("../src/models/room.model");
const {
  isRoomAdmin,
  isRoomModerator,
  checkAdminPermissionSync,
} = require("../src/utils/permissions");

const adminUserId = "507f1f77bcf86cd799439011";
const otherUserId = "507f1f77bcf86cd799439012";

describe("permissions room helpers", () => {
  beforeEach(() => {
    Room.findById.mockReset();
  });

  test("isRoomAdmin true for admin role", async () => {
    Room.findById.mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue({
          roles: [{ user: adminUserId, role: "admin" }],
        }),
      }),
    });
    await expect(isRoomAdmin(adminUserId, "roomid")).resolves.toBe(true);
  });

  test("isRoomAdmin false for member role", async () => {
    Room.findById.mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue({
          roles: [{ user: adminUserId, role: "member" }],
        }),
      }),
    });
    await expect(isRoomAdmin(adminUserId, "roomid")).resolves.toBe(false);
  });

  test("isRoomModerator true for moderator", async () => {
    Room.findById.mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue({
          roles: [{ user: otherUserId, role: "moderator" }],
        }),
      }),
    });
    await expect(isRoomModerator(otherUserId, "roomid")).resolves.toBe(true);
  });

  test("checkAdminPermissionSync resolves admin role from room.roles", () => {
    const room = {
      isGroup: true,
      user: otherUserId,
      roles: [{ user: adminUserId, role: "admin" }],
      adminPermissions: {
        canModifyChatSettings: { enabled: true, roles: ["admin"] },
      },
    };

    expect(
      checkAdminPermissionSync(adminUserId, room, "canModifyChatSettings")
    ).toBe(true);
  });

  test("checkAdminPermissionSync denies member when permission requires admin", () => {
    const room = {
      isGroup: true,
      user: otherUserId,
      roles: [{ user: adminUserId, role: "member" }],
      adminPermissions: {
        canModifyChatSettings: { enabled: true, roles: ["admin"] },
      },
    };

    expect(
      checkAdminPermissionSync(adminUserId, room, "canModifyChatSettings")
    ).toBe(false);
  });
});
