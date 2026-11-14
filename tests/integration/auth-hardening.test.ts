import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AUTH_POLICY } from "@/config/constants";
import { db } from "@/lib/db";
import { createSessionRecord } from "@/modules/access/access.repository";
import {
  authenticateStaff,
  endStaffSession,
  purgeExpiredAuthRecords,
  validateSessionToken,
} from "@/modules/access/auth.service";
import { hashPassword } from "@/modules/access/password";
import { throttleKey } from "@/modules/access/login-throttle";
import { generateSessionToken, hashSessionToken } from "@/modules/access/session-token";
import { AUDIT_ACTIONS } from "@/modules/audit/audit-actions";

/**
 * Phase 5 follow-ups against the real test database: database-backed sign-in
 * throttling under parallel load, idle and absolute session limits, sign-out
 * auditing with request metadata, the clean-up job and the placeholder script.
 */

const RUN = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const PASSWORD = "integration passphrase 2026";
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

const email = (label: string) => `ith-${RUN}-${label}@test.local`;
let ipCounter = 0;
const freshIp = () => `198.51.${(Date.now() % 250) + 1}.${(ipCounter += 1) % 250}`;

async function makeStaff(label: string, role = "Order Staff") {
  const roleRow = await db.role.findFirstOrThrow({ where: { name: role, deletedAt: null } });
  return db.user.create({
    data: {
      kind: "STAFF",
      email: email(label),
      name: `ITH ${label}`,
      passwordHash: await hashPassword(PASSWORD),
      roleId: roleRow.id,
      isActive: true,
    },
  });
}

async function openSession(userId: string, opts: { expiresIn: number; lastSeenAgo: number }) {
  const token = generateSessionToken();
  const created = await createSessionRecord({
    userId,
    tokenHash: hashSessionToken(token),
    expires: new Date(Date.now() + opts.expiresIn),
    ip: null,
    userAgent: null,
  });
  await db.session.update({
    where: { id: created.id },
    data: { lastSeenAt: new Date(Date.now() - opts.lastSeenAgo) },
  });
  return { token, id: created.id };
}

afterAll(async () => {
  await db.$disconnect();
});

describe("sign-in throttling under parallel requests", () => {
  it(`lets only ${AUTH_POLICY.maxFailuresPerEmail} of many simultaneous guesses reach the password check`, async () => {
    await makeStaff("burst");
    const attempts = 12;

    const results = await Promise.all(
      Array.from({ length: attempts }, (_, index) =>
        authenticateStaff(
          { email: email("burst"), password: `parallel wrong guess ${index}` },
          { ip: freshIp(), userAgent: "parallel" },
        ),
      ),
    );

    const invalid = results.filter(
      (result) => !result.ok && result.reason === "invalid_credentials",
    );
    const throttled = results.filter((result) => !result.ok && result.reason === "throttled");
    expect(invalid).toHaveLength(AUTH_POLICY.maxFailuresPerEmail);
    expect(throttled).toHaveLength(attempts - AUTH_POLICY.maxFailuresPerEmail);

    const row = await db.authThrottle.findUniqueOrThrow({
      where: { key: throttleKey("email", email("burst")) },
    });
    expect(row.attempts).toBe(attempts);

    // Locked even with the right password, until the window ends.
    expect(
      await authenticateStaff(
        { email: email("burst"), password: PASSWORD },
        { ip: freshIp(), userAgent: null },
      ),
    ).toEqual({ ok: false, reason: "throttled" });
  });

  it(`holds the per-IP limit of ${AUTH_POLICY.maxFailuresPerIp} across parallel emails`, async () => {
    const ip = `198.51.${(Date.now() % 250) + 1}.251`;
    const attempts = AUTH_POLICY.maxFailuresPerIp + 8;

    const results = await Promise.all(
      Array.from({ length: attempts }, (_, index) =>
        authenticateStaff(
          { email: email(`spray-${index}`), password: "spray attempt password" },
          { ip, userAgent: "parallel" },
        ),
      ),
    );

    expect(results.filter((result) => !result.ok && result.reason === "throttled")).toHaveLength(8);
  });

  it("gives the reservation back after a successful sign-in", async () => {
    await makeStaff("refund");
    const ip = freshIp();
    const result = await authenticateStaff(
      { email: email("refund"), password: PASSWORD },
      { ip, userAgent: null },
    );
    expect(result.ok).toBe(true);

    const rows = await db.authThrottle.findMany({
      where: { key: { in: [throttleKey("email", email("refund")), throttleKey("ip", ip)] } },
    });
    expect(rows).toHaveLength(2);
    for (const row of rows) expect(row.attempts).toBe(0);
  });

  it("starts a fresh window once the old one has ended", async () => {
    await makeStaff("window");
    const key = throttleKey("email", email("window"));
    await db.authThrottle.create({
      data: {
        key,
        attempts: 50,
        windowStartedAt: new Date(Date.now() - HOUR),
        expiresAt: new Date(Date.now() - MINUTE),
      },
    });

    const result = await authenticateStaff(
      { email: email("window"), password: PASSWORD },
      { ip: freshIp(), userAgent: null },
    );
    expect(result.ok).toBe(true);
    expect((await db.authThrottle.findUniqueOrThrow({ where: { key } })).attempts).toBe(0);
  });
});

describe("session limits", () => {
  it("ends and removes a session idle for longer than the timeout", async () => {
    const user = await makeStaff("idle");
    const { token, id } = await openSession(user.id, {
      expiresIn: 48 * HOUR,
      lastSeenAgo: 9 * HOUR,
    });

    expect(await validateSessionToken(token)).toBeNull();
    expect(await db.session.findUnique({ where: { id } })).toBeNull();
  });

  it("keeps an active session and refreshes lastSeenAt at most every few minutes", async () => {
    const user = await makeStaff("active");
    const stale = await openSession(user.id, { expiresIn: 48 * HOUR, lastSeenAgo: 10 * MINUTE });
    const fresh = await openSession(user.id, { expiresIn: 48 * HOUR, lastSeenAgo: MINUTE });
    const freshBefore = (await db.session.findUniqueOrThrow({ where: { id: fresh.id } }))
      .lastSeenAt;

    expect(await validateSessionToken(stale.token)).not.toBeNull();
    expect(await validateSessionToken(fresh.token)).not.toBeNull();

    const staleAfter = await db.session.findUniqueOrThrow({ where: { id: stale.id } });
    expect(Date.now() - staleAfter.lastSeenAt.getTime()).toBeLessThan(MINUTE);
    const freshAfter = await db.session.findUniqueOrThrow({ where: { id: fresh.id } });
    expect(freshAfter.lastSeenAt.getTime()).toBe(freshBefore.getTime());
  });

  it("ends an active session at its absolute expiry", async () => {
    const user = await makeStaff("absolute");
    const { token } = await openSession(user.id, { expiresIn: -1_000, lastSeenAgo: 0 });
    expect(await validateSessionToken(token)).toBeNull();
  });

  it("sets the absolute expiry from the configured lifetime at sign-in", async () => {
    await makeStaff("lifetime");
    const before = Date.now();
    const result = await authenticateStaff(
      { email: email("lifetime"), password: PASSWORD },
      { ip: freshIp(), userAgent: null },
    );
    if (!result.ok) throw new Error("sign-in failed");

    const stored = await db.session.findUniqueOrThrow({
      where: { sessionToken: hashSessionToken(result.sessionToken) },
    });
    const lifetime = stored.expires.getTime() - before;
    // .env.example default: 7 days.
    expect(lifetime).toBeGreaterThan(7 * 24 * HOUR - MINUTE);
    expect(lifetime).toBeLessThan(7 * 24 * HOUR + MINUTE);
  });
});

describe("sign-out audit", () => {
  it("records the IP and user agent of the request that signed out", async () => {
    const user = await makeStaff("logout");
    const { token, id } = await openSession(user.id, { expiresIn: HOUR, lastSeenAgo: 0 });

    await endStaffSession(id, { ip: "203.0.113.44", userAgent: "Mozilla/5.0 (integration)" });

    expect(await validateSessionToken(token)).toBeNull();
    const row = await db.auditLog.findFirstOrThrow({
      where: { action: AUDIT_ACTIONS.logout, userId: user.id },
    });
    expect(row.ip).toBe("203.0.113.44");
    expect(row.userAgent).toBe("Mozilla/5.0 (integration)");
    expect(row.entityId).toBe(id);

    // A second sign-out of the same session writes nothing more.
    await endStaffSession(id, { ip: "203.0.113.44", userAgent: null });
    expect(
      await db.auditLog.count({ where: { action: AUDIT_ACTIONS.logout, userId: user.id } }),
    ).toBe(1);
  });
});

describe("scheduled clean-up", () => {
  it("removes expired and idle sessions and finished throttle windows only", async () => {
    const user = await makeStaff("purge");
    const expired = await openSession(user.id, { expiresIn: -MINUTE, lastSeenAgo: 0 });
    const idle = await openSession(user.id, { expiresIn: 48 * HOUR, lastSeenAgo: 9 * HOUR });
    const live = await openSession(user.id, { expiresIn: 48 * HOUR, lastSeenAgo: MINUTE });

    const oldKey = `email:purge-old-${RUN}`;
    const liveKey = `email:purge-live-${RUN}`;
    await db.authThrottle.createMany({
      data: [
        { key: oldKey, attempts: 3, expiresAt: new Date(Date.now() - MINUTE) },
        { key: liveKey, attempts: 3, expiresAt: new Date(Date.now() + HOUR) },
      ],
    });

    const removed = await purgeExpiredAuthRecords();
    expect(removed.sessions).toBeGreaterThanOrEqual(2);
    expect(removed.throttles).toBeGreaterThanOrEqual(1);

    const remaining = await db.session.findMany({
      where: { userId: user.id },
      select: { id: true },
    });
    expect(remaining.map((row) => row.id)).toEqual([live.id]);
    expect(remaining.map((row) => row.id)).not.toContain(expired.id);
    expect(remaining.map((row) => row.id)).not.toContain(idle.id);
    expect(await db.authThrottle.findUnique({ where: { key: oldKey } })).toBeNull();
    expect(await db.authThrottle.findUnique({ where: { key: liveKey } })).not.toBeNull();
  });
});

describe("placeholder Super Admin retirement script", () => {
  const script = join(process.cwd(), "scripts", "retire-placeholder-admin.ts");
  const tsxCli = join(process.cwd(), "node_modules", "tsx", "dist", "cli.mjs");

  beforeAll(async () => {
    // A real Super Admin who has signed in, so the script's safety check passes.
    await makeStaff("real-super", "Super Admin");
    const result = await authenticateStaff(
      { email: email("real-super"), password: PASSWORD },
      { ip: freshIp(), userAgent: null },
    );
    expect(result.ok).toBe(true);
  });

  it("changes nothing without --confirm (dry run)", async () => {
    const before = await db.user.findMany({
      where: { email: "admin@usexporthouse.local" },
      select: { isActive: true, updatedAt: true },
    });

    const run = spawnSync(process.execPath, [tsxCli, script], {
      env: { ...process.env },
      encoding: "utf8",
      timeout: 60_000,
    });
    expect(run.status).toBe(0);
    const output = `${run.stdout}${run.stderr}`;
    expect(output).toMatch(/DRY RUN|already inactive|does not exist/);

    const after = await db.user.findMany({
      where: { email: "admin@usexporthouse.local" },
      select: { isActive: true, updatedAt: true },
    });
    expect(after).toEqual(before);
  });
});
