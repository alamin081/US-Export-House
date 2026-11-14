import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AUTH_POLICY } from "@/config/constants";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { createSessionRecord, listActiveLocations } from "@/modules/access/access.repository";
import {
  authenticateStaff,
  revokeSessionToken,
  validateSessionToken,
} from "@/modules/access/auth.service";
import { locationScope, type StaffContext } from "@/modules/access/authorization";
import { hashPassword, verifyPassword } from "@/modules/access/password";
import { generateSessionToken, hashSessionToken } from "@/modules/access/session-token";
import {
  changeOwnPassword,
  createStaff,
  resetStaffPassword,
  setStaffActive,
  updateStaffAccess,
} from "@/modules/access/staff.service";
import { AUDIT_ACTIONS } from "@/modules/audit/audit-actions";

/**
 * End-to-end checks of sign-in, sessions, RBAC and auditing against a real
 * PostgreSQL test database. Every record uses a per-run prefix, so runs never
 * collide and nothing pre-existing is modified.
 */

const RUN = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const PASSWORD = "integration passphrase 2026";

const email = (label: string) => `it-${RUN}-${label}@test.local`;
let ipCounter = 0;
/** A fresh documentation-range IP per scenario, so per-IP throttling stays isolated. */
const freshIp = () => `198.18.${(Date.now() % 250) + 1}.${(ipCounter += 1) % 250}`;
const meta = (ip = freshIp()) => ({ ip, userAgent: "integration-test" });

async function roleId(name: string) {
  const role = await db.role.findFirstOrThrow({ where: { name, deletedAt: null } });
  return role.id;
}

async function locationId(code: string) {
  const location = await db.location.findFirstOrThrow({ where: { code } });
  return location.id;
}

async function makeStaff(opts: {
  label: string;
  role: string;
  locations?: string[];
  password?: string | null;
  isActive?: boolean;
  kind?: "STAFF" | "CUSTOMER";
}) {
  const locationIds = await Promise.all((opts.locations ?? []).map(locationId));
  return db.user.create({
    data: {
      kind: opts.kind ?? "STAFF",
      email: email(opts.label),
      name: `IT ${opts.label}`,
      passwordHash: opts.password === null ? null : await hashPassword(opts.password ?? PASSWORD),
      roleId: opts.kind === "CUSTOMER" ? null : await roleId(opts.role),
      isActive: opts.isActive ?? true,
      locationAccess: { create: locationIds.map((id) => ({ locationId: id })) },
    },
  });
}

/** Signs in for real and returns the token plus the validated context. */
async function signIn(label: string, password = PASSWORD) {
  const result = await authenticateStaff({ email: email(label), password }, meta());
  if (!result.ok) throw new Error(`sign-in failed for ${label}: ${result.reason}`);
  const context = await validateSessionToken(result.sessionToken);
  if (context === null) throw new Error("session did not validate");
  return { token: result.sessionToken, context };
}

async function expectAppError(promise: Promise<unknown>, code: string) {
  await expect(promise).rejects.toSatisfy(
    (error: unknown) => error instanceof AppError && error.code === code,
  );
}

let superAdmin: { token: string; context: StaffContext };

beforeAll(async () => {
  await makeStaff({ label: "super", role: "Super Admin" });
  superAdmin = await signIn("super");
});

afterAll(async () => {
  await db.$disconnect();
});

// ---------------------------------------------------------------------------

describe("staff sign-in", () => {
  it("signs in with the right password and opens a database session", async () => {
    await makeStaff({ label: "ok", role: "Order Staff", locations: ["WH-DHK"] });
    const result = await authenticateStaff({ email: email("ok"), password: PASSWORD }, meta());

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Only the SHA-256 of the token is stored.
    expect(
      await db.session.findUnique({ where: { sessionToken: result.sessionToken } }),
    ).toBeNull();
    const stored = await db.session.findUnique({
      where: { sessionToken: hashSessionToken(result.sessionToken) },
    });
    expect(stored).not.toBeNull();

    const context = await validateSessionToken(result.sessionToken);
    expect(context?.roleName).toBe("Order Staff");
    expect(context?.permissions).toContain("order.process");
    expect(context?.permissions).not.toContain("staff.manage");

    const user = await db.user.findUniqueOrThrow({ where: { email: email("ok") } });
    expect(user.lastLogin).not.toBeNull();
    expect(
      await db.auditLog.count({
        where: { action: AUDIT_ACTIONS.loginSucceeded, entityId: user.id },
      }),
    ).toBe(1);
  });

  it("gives the same answer for a wrong password and an unknown email", async () => {
    await makeStaff({ label: "wrong", role: "Order Staff", locations: ["WH-DHK"] });

    const wrong = await authenticateStaff(
      { email: email("wrong"), password: "not the password at all" },
      meta(),
    );
    const unknown = await authenticateStaff({ email: email("nobody"), password: PASSWORD }, meta());

    expect(wrong).toEqual({ ok: false, reason: "invalid_credentials" });
    expect(unknown).toEqual({ ok: false, reason: "invalid_credentials" });

    const reasons = await db.auditLog.findMany({
      where: {
        action: AUDIT_ACTIONS.loginFailed,
        entityId: { in: [email("wrong"), email("nobody")] },
      },
      select: { entityId: true, after: true },
    });
    expect(reasons.map((row) => (row.after as { reason: string }).reason).sort()).toEqual([
      "unknown_email",
      "wrong_password",
    ]);
  });

  it("refuses deactivated staff, staff without a password, and customers", async () => {
    await makeStaff({
      label: "inactive",
      role: "Order Staff",
      isActive: false,
      locations: ["WH-DHK"],
    });
    await makeStaff({ label: "nopass", role: "Super Admin", password: null });
    await makeStaff({ label: "customer", role: "", kind: "CUSTOMER" });

    for (const label of ["inactive", "nopass", "customer"]) {
      const result = await authenticateStaff({ email: email(label), password: PASSWORD }, meta());
      expect(result).toEqual({ ok: false, reason: "invalid_credentials" });
    }
  });

  it(`throttles an email after ${AUTH_POLICY.maxFailuresPerEmail} failures, even with the right password`, async () => {
    await makeStaff({ label: "throttle", role: "Order Staff", locations: ["WH-DHK"] });

    for (let attempt = 0; attempt < AUTH_POLICY.maxFailuresPerEmail; attempt += 1) {
      const result = await authenticateStaff(
        { email: email("throttle"), password: `wrong-guess-number-${attempt}` },
        meta(),
      );
      expect(result).toEqual({ ok: false, reason: "invalid_credentials" });
    }

    const blocked = await authenticateStaff(
      { email: email("throttle"), password: PASSWORD },
      meta(),
    );
    expect(blocked).toEqual({ ok: false, reason: "throttled" });
    expect(
      await db.auditLog.count({
        where: { action: AUDIT_ACTIONS.loginThrottled, entityId: email("throttle") },
      }),
    ).toBe(1);
  });

  it(`throttles an IP after ${AUTH_POLICY.maxFailuresPerIp} failures across emails`, async () => {
    const ip = `198.19.${(Date.now() % 250) + 1}.77`;
    for (let attempt = 0; attempt < AUTH_POLICY.maxFailuresPerIp; attempt += 1) {
      await authenticateStaff(
        { email: email(`spray-${attempt}`), password: "spray attempt password" },
        meta(ip),
      );
    }
    await makeStaff({ label: "victim", role: "Order Staff", locations: ["WH-DHK"] });
    const result = await authenticateStaff(
      { email: email("victim"), password: PASSWORD },
      meta(ip),
    );
    expect(result).toEqual({ ok: false, reason: "throttled" });
  });
});

describe("sessions", () => {
  it("ends immediately on sign-out", async () => {
    await makeStaff({ label: "logout", role: "Content Editor" });
    const { token } = await signIn("logout");

    await revokeSessionToken(token, meta());

    expect(await validateSessionToken(token)).toBeNull();
    const user = await db.user.findUniqueOrThrow({ where: { email: email("logout") } });
    expect(
      await db.auditLog.count({ where: { action: AUDIT_ACTIONS.logout, userId: user.id } }),
    ).toBe(1);
  });

  it("rejects expired and unknown sessions", async () => {
    const user = await makeStaff({ label: "expired", role: "Content Editor" });
    const token = generateSessionToken();
    await createSessionRecord({
      userId: user.id,
      tokenHash: hashSessionToken(token),
      expires: new Date(Date.now() - 1_000),
      ip: null,
      userAgent: null,
    });

    expect(await validateSessionToken(token)).toBeNull();
    expect(await validateSessionToken(generateSessionToken())).toBeNull();
    expect(await validateSessionToken("")).toBeNull();
  });

  it("applies a role change on the very next request", async () => {
    const user = await makeStaff({
      label: "promote",
      role: "Branch Sales Staff",
      locations: ["BR-GUL"],
    });
    const { token, context } = await signIn("promote");
    expect(context.permissions).not.toContain("inventory.adjust");

    await updateStaffAccess(
      superAdmin.context,
      {
        userId: user.id,
        roleId: await roleId("Branch Manager"),
        locationIds: [await locationId("BR-GUL")],
      },
      meta(),
    );

    const after = await validateSessionToken(token);
    expect(after?.roleName).toBe("Branch Manager");
    expect(after?.permissions).toContain("inventory.adjust");
  });

  it("ends every session when an account is deactivated", async () => {
    const user = await makeStaff({
      label: "deactivate",
      role: "Order Staff",
      locations: ["WH-DHK"],
    });
    const { token } = await signIn("deactivate");

    await setStaffActive(superAdmin.context, { userId: user.id, active: false }, meta());

    expect(await validateSessionToken(token)).toBeNull();
    expect(await db.session.count({ where: { userId: user.id } })).toBe(0);
  });

  it("ends sessions on a password reset, and only the new password works", async () => {
    const user = await makeStaff({ label: "reset", role: "Order Staff", locations: ["WH-DHK"] });
    const { token } = await signIn("reset");
    const newPassword = "a brand new passphrase 2026";

    await resetStaffPassword(
      superAdmin.context,
      { userId: user.id, password: newPassword },
      meta(),
    );

    expect(await validateSessionToken(token)).toBeNull();
    expect(
      (await authenticateStaff({ email: email("reset"), password: PASSWORD }, meta())).ok,
    ).toBe(false);
    expect(
      (await authenticateStaff({ email: email("reset"), password: newPassword }, meta())).ok,
    ).toBe(true);
  });

  it("keeps the current device signed in when staff change their own password", async () => {
    await makeStaff({ label: "selfpw", role: "Inventory Staff", locations: ["WH-DHK"] });
    const phone = await signIn("selfpw");
    const laptop = await signIn("selfpw");
    const newPassword = "my own new passphrase 2026";

    await changeOwnPassword(
      laptop.context,
      { currentPassword: PASSWORD, newPassword, confirmPassword: newPassword },
      meta(),
    );

    expect(await validateSessionToken(laptop.token)).not.toBeNull();
    expect(await validateSessionToken(phone.token)).toBeNull();

    const stored = await db.user.findUniqueOrThrow({ where: { email: email("selfpw") } });
    expect(await verifyPassword(stored.passwordHash ?? "", newPassword)).toBe(true);
  });
});

describe("role-based access", () => {
  it("lets only Super Admin manage staff", async () => {
    await makeStaff({ label: "manager", role: "Store Manager" });
    const manager = await signIn("manager");

    await expectAppError(
      createStaff(
        manager.context,
        {
          name: "Nope",
          email: email("nope"),
          roleId: await roleId("Order Staff"),
          locationIds: [],
          password: PASSWORD,
        },
        meta(),
      ),
      "FORBIDDEN",
    );
    expect(await db.user.findUnique({ where: { email: email("nope") } })).toBeNull();
  });

  it("creates staff with a hashed password and an audit trail free of secrets", async () => {
    const secret = "staff created via service 2026";
    const created = await createStaff(
      superAdmin.context,
      {
        name: "Gulshan Seller",
        email: email("seller"),
        roleId: await roleId("Branch Sales Staff"),
        locationIds: [await locationId("BR-GUL")],
        password: secret,
      },
      meta(),
    );

    const stored = await db.user.findUniqueOrThrow({ where: { id: created.id } });
    expect(stored.passwordHash?.startsWith("$argon2id$")).toBe(true);

    const rows = await db.auditLog.findMany({ where: { entityId: created.id } });
    const serialized = JSON.stringify(rows);
    expect(serialized).not.toContain(secret);
    expect(serialized).not.toContain("$argon2id$");
  });

  it("scopes branch staff to their own branch", async () => {
    await makeStaff({ label: "gulshan", role: "Branch Sales Staff", locations: ["BR-GUL"] });
    const { context } = await signIn("gulshan");

    const visible = await listActiveLocations(locationScope(context));
    expect(visible.map((location) => location.code)).toEqual(["BR-GUL"]);
  });

  it("gives all-location roles every active location", async () => {
    const { context } = superAdmin;
    const visible = await listActiveLocations(locationScope(context));
    const all = await db.location.count({ where: { isActive: true, deletedAt: null } });
    expect(visible.length).toBe(all);
  });
});

describe("one-time Super Admin bootstrap", () => {
  const script = join(process.cwd(), "scripts", "bootstrap-super-admin.ts");
  const tsxCli = join(process.cwd(), "node_modules", "tsx", "dist", "cli.mjs");

  function runBootstrap(env: Record<string, string>) {
    return spawnSync(process.execPath, [tsxCli, script], {
      env: { ...process.env, ...env },
      encoding: "utf8",
      timeout: 60_000,
    });
  }

  it("refuses a weak password and never prints it", () => {
    const weak = "weakpw";
    const run = runBootstrap({ SUPER_ADMIN_EMAIL: email("boot-weak"), SUPER_ADMIN_PASSWORD: weak });
    expect(run.status).toBe(1);
    expect(`${run.stdout}${run.stderr}`).toContain("does not meet the policy");
    expect(`${run.stdout}${run.stderr}`).not.toContain(weak);
  });

  it("refuses to run again once a Super Admin can sign in", () => {
    const strong = "bootstrap second run 2026";
    const run = runBootstrap({
      SUPER_ADMIN_EMAIL: email("boot-again"),
      SUPER_ADMIN_PASSWORD: strong,
    });
    expect(run.status).toBe(1);
    expect(`${run.stdout}${run.stderr}`).toContain("only runs once");
    expect(`${run.stdout}${run.stderr}`).not.toContain(strong);
  });
});
