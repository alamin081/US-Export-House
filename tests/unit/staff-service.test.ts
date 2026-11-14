import { beforeEach, describe, expect, it, vi } from "vitest";

import { AppError } from "@/lib/errors";
import type { StaffContext } from "@/modules/access/authorization";
import { SYSTEM_ROLES } from "@/modules/access/permissions";

/**
 * Staff management rules, tested against mocked data access: the rules live
 * in the service, so they must hold no matter what the database returns.
 */
vi.mock("@/modules/access/access.repository", () => ({
  countOtherActiveSuperAdmins: vi.fn(),
  createStaffWithAccess: vi.fn(),
  deleteSessionsForUser: vi.fn(),
  findActiveRoleById: vi.fn(),
  findStaffById: vi.fn(),
  findStaffForLogin: vi.fn(),
  findUserIdByEmail: vi.fn(),
  listActiveLocations: vi.fn(),
  listActiveRoles: vi.fn(),
  listStaffWithAccess: vi.fn(),
  replaceStaffAccess: vi.fn(),
  updatePasswordHash: vi.fn(),
  updateStaffActive: vi.fn(),
}));

vi.mock("@/modules/audit/audit.service", async () => {
  const { AUDIT_ACTIONS } = await import("@/modules/audit/audit-actions");
  return { AUDIT_ACTIONS, recordAudit: vi.fn() };
});

const repo = await import("@/modules/access/access.repository");
const audit = await import("@/modules/audit/audit.service");
const service = await import("@/modules/access/staff.service");

const META = { ip: "203.0.113.1", userAgent: "vitest" };
const STRONG = "a long and decent passphrase";

function actor(roleName = "Super Admin"): StaffContext {
  const definition = SYSTEM_ROLES.find((role) => role.name === roleName);
  if (definition === undefined) throw new Error(roleName);
  return {
    userId: "actor-1",
    email: "boss@example.test",
    name: "Boss",
    roleId: `role-${roleName}`,
    roleName,
    permissions: definition.permissions,
    allLocations: definition.allLocations,
    locationIds: [],
    sessionId: "session-actor",
    sessionExpiresAt: new Date(Date.now() + 3_600_000).toISOString(),
  };
}

function target(roleName: string, overrides: Record<string, unknown> = {}) {
  return {
    id: "target-1",
    name: "Target",
    email: "target@example.test",
    isActive: true,
    passwordHash: "$argon2id$existing",
    role: { id: `role-${roleName}`, name: roleName, allLocations: roleName === "Super Admin" },
    locationAccess: [],
    ...overrides,
  };
}

async function expectCode(promise: Promise<unknown>, code: string, reason?: string) {
  try {
    await promise;
    expect.unreachable(`expected ${code}`);
  } catch (error) {
    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).code).toBe(code);
    if (reason !== undefined) expect((error as AppError).details?.reason).toBe(reason);
  }
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("permission is enforced inside the service", () => {
  it("refuses staff management to anyone without staff.manage", async () => {
    for (const roleName of ["Store Manager", "Branch Manager", "Content Editor"]) {
      await expectCode(
        service.createStaff(
          actor(roleName),
          { name: "X", email: "x@example.test", roleId: "r", locationIds: [], password: STRONG },
          META,
        ),
        "FORBIDDEN",
      );
      await expectCode(service.getStaffOverview(actor(roleName)), "FORBIDDEN");
    }
    expect(repo.createStaffWithAccess).not.toHaveBeenCalled();
  });
});

describe("creating staff", () => {
  it("rejects a weak password before touching the database", async () => {
    await expectCode(
      service.createStaff(
        actor(),
        { name: "X", email: "x@example.test", roleId: "r", locationIds: [], password: "short" },
        META,
      ),
      "VALIDATION_FAILED",
    );
    expect(repo.findUserIdByEmail).not.toHaveBeenCalled();
  });

  it("rejects a duplicate email", async () => {
    vi.mocked(repo.findUserIdByEmail).mockResolvedValue({ id: "someone" });
    await expectCode(
      service.createStaff(
        actor(),
        { name: "X", email: "x@example.test", roleId: "r", locationIds: [], password: STRONG },
        META,
      ),
      "CONFLICT",
    );
  });

  it("requires a location for branch-scoped roles", async () => {
    vi.mocked(repo.findUserIdByEmail).mockResolvedValue(null);
    vi.mocked(repo.findActiveRoleById).mockResolvedValue({
      id: "r-sales",
      name: "Branch Sales Staff",
      allLocations: false,
    });
    await expectCode(
      service.createStaff(
        actor(),
        {
          name: "X",
          email: "x@example.test",
          roleId: "r-sales",
          locationIds: [],
          password: STRONG,
        },
        META,
      ),
      "VALIDATION_FAILED",
    );
  });

  it("stores an Argon2id hash and audits without the password", async () => {
    vi.mocked(repo.findUserIdByEmail).mockResolvedValue(null);
    vi.mocked(repo.findActiveRoleById).mockResolvedValue({
      id: "r-content",
      name: "Content Editor",
      allLocations: true,
    });
    vi.mocked(repo.createStaffWithAccess).mockResolvedValue({
      id: "new-1",
      email: "x@example.test",
      name: "X",
    });

    await service.createStaff(
      actor(),
      {
        name: "X",
        email: "x@example.test",
        roleId: "r-content",
        locationIds: ["ignored"],
        password: STRONG,
      },
      META,
    );

    const stored = vi.mocked(repo.createStaffWithAccess).mock.calls[0]?.[0];
    expect(stored?.passwordHash.startsWith("$argon2id$")).toBe(true);
    expect(stored?.passwordHash).not.toContain(STRONG);
    // All-location roles never store explicit assignments.
    expect(stored?.locationIds).toEqual([]);

    const auditCall = JSON.stringify(vi.mocked(audit.recordAudit).mock.calls);
    expect(auditCall).not.toContain(STRONG);
    expect(auditCall).not.toContain("$argon2id$");
  });
});

describe("self-lock-out protection", () => {
  it("does not let anyone change their own role, status or password here", async () => {
    const me = actor();
    await expectCode(
      service.updateStaffAccess(me, { userId: me.userId, roleId: "r", locationIds: [] }, META),
      "CONFLICT",
      "self_change",
    );
    await expectCode(
      service.setStaffActive(me, { userId: me.userId, active: false }, META),
      "CONFLICT",
      "self_change",
    );
    await expectCode(
      service.resetStaffPassword(me, { userId: me.userId, password: STRONG }, META),
      "CONFLICT",
      "self_change",
    );
  });
});

describe("last Super Admin protection", () => {
  it("refuses to demote the last active Super Admin", async () => {
    vi.mocked(repo.findStaffById).mockResolvedValue(target("Super Admin"));
    vi.mocked(repo.findActiveRoleById).mockResolvedValue({
      id: "r-manager",
      name: "Store Manager",
      allLocations: true,
    });
    vi.mocked(repo.countOtherActiveSuperAdmins).mockResolvedValue(0);

    await expectCode(
      service.updateStaffAccess(
        actor(),
        { userId: "target-1", roleId: "r-manager", locationIds: [] },
        META,
      ),
      "CONFLICT",
      "last_super_admin",
    );
    expect(repo.replaceStaffAccess).not.toHaveBeenCalled();
  });

  it("refuses to deactivate the last active Super Admin", async () => {
    vi.mocked(repo.findStaffById).mockResolvedValue(target("Super Admin"));
    vi.mocked(repo.countOtherActiveSuperAdmins).mockResolvedValue(0);

    await expectCode(
      service.setStaffActive(actor(), { userId: "target-1", active: false }, META),
      "CONFLICT",
      "last_super_admin",
    );
    expect(repo.updateStaffActive).not.toHaveBeenCalled();
  });

  it("allows it when another Super Admin remains, and ends their sessions", async () => {
    vi.mocked(repo.findStaffById).mockResolvedValue(target("Super Admin"));
    vi.mocked(repo.countOtherActiveSuperAdmins).mockResolvedValue(1);
    vi.mocked(repo.deleteSessionsForUser).mockResolvedValue(2);

    await service.setStaffActive(actor(), { userId: "target-1", active: false }, META);

    expect(repo.updateStaffActive).toHaveBeenCalledWith("target-1", false);
    expect(repo.deleteSessionsForUser).toHaveBeenCalledWith("target-1");
  });
});

describe("password reset and session revocation", () => {
  it("hashes the new password and ends every session", async () => {
    vi.mocked(repo.findStaffById).mockResolvedValue(target("Order Staff"));
    vi.mocked(repo.deleteSessionsForUser).mockResolvedValue(3);

    await service.resetStaffPassword(actor(), { userId: "target-1", password: STRONG }, META);

    const [, newHash] = vi.mocked(repo.updatePasswordHash).mock.calls[0] ?? [];
    expect(newHash?.startsWith("$argon2id$")).toBe(true);
    expect(repo.deleteSessionsForUser).toHaveBeenCalledWith("target-1");
    expect(JSON.stringify(vi.mocked(audit.recordAudit).mock.calls)).not.toContain(STRONG);
  });

  it("keeps the current session when revoking your own sessions", async () => {
    const me = actor();
    vi.mocked(repo.findStaffById).mockResolvedValue(target("Super Admin", { id: me.userId }));
    vi.mocked(repo.deleteSessionsForUser).mockResolvedValue(1);

    await service.revokeStaffSessions(me, { userId: me.userId }, META);

    expect(repo.deleteSessionsForUser).toHaveBeenCalledWith(me.userId, me.sessionId);
  });
});
