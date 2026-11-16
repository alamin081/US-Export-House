import { describe, expect, it, vi } from "vitest";

import {
  bootstrapStagingSuperAdmin,
  checkBootstrapState,
  checkSuperAdminRole,
  CONFIRMATION_WORD,
  normaliseEmail,
  redact,
  type BootstrapDeps,
  type BootstrapState,
  type BootstrapStore,
  type RoleSnapshot,
} from "../../scripts/lib/staging-bootstrap";
import { STAGING_DATABASE } from "../../scripts/lib/staging-seed-guard";
import { applyHiddenInput } from "../../scripts/lib/terminal-prompts";
import { PERMISSIONS, SUPER_ADMIN_ROLE } from "@/modules/access/permissions";

/**
 * Staging Super Admin bootstrap, with a fake store and fake prompts: no
 * database, no terminal. Every credential below is a fake test value.
 */

const PG_PASSWORD = "fake-db-password-123";
const DIRECT = `postgresql://role:${PG_PASSWORD}@${STAGING_DATABASE.neonEndpointId}.c-3.ap-southeast-1.aws.neon.tech/neondb?sslmode=require`;
const ENV = { APP_ENV: "staging", DATABASE_URL_UNPOOLED: DIRECT };
const ADMIN_PASSWORD = "Correct-Horse-Battery-42";

const ROLE: RoleSnapshot = {
  id: "role_super",
  name: SUPER_ADMIN_ROLE,
  permissions: [...PERMISSIONS],
  isSystem: true,
  allLocations: true,
  deletedAt: null,
};

function state(overrides: Partial<BootstrapState> = {}): BootstrapState {
  return {
    identity: {
      projectId: STAGING_DATABASE.neonProjectId,
      branchId: STAGING_DATABASE.neonBranchId,
      database: STAGING_DATABASE.database,
    },
    role: ROLE,
    superAdminAccounts: 0,
    ...overrides,
  };
}

interface FakeOptions {
  before?: BootstrapState;
  during?: BootstrapState;
  emailTaken?: boolean;
  answers?: string[];
  hidden?: string[];
  interactive?: boolean;
  createError?: Error;
  env?: Record<string, string | undefined>;
}

function setup(options: FakeOptions = {}) {
  const created: unknown[] = [];
  const store: BootstrapStore = {
    readState: vi.fn(async () => options.before ?? state()),
    isEmailTaken: vi.fn(async () => options.emailTaken ?? false),
    createSuperAdmin: vi.fn(async (input, recheck) => {
      const problem = recheck(options.during ?? state());
      if (problem !== null) throw new Error(problem);
      if (options.createError !== undefined) throw options.createError;
      created.push(input);
      return { id: "user_1", email: input.email };
    }),
    close: vi.fn(async () => undefined),
  };
  const answers = [...(options.answers ?? ["Admin@Example.com", "", CONFIRMATION_WORD])];
  const hidden = [...(options.hidden ?? [ADMIN_PASSWORD, ADMIN_PASSWORD])];
  const lines: string[] = [];
  const openStore = vi.fn(() => store);
  const deps: BootstrapDeps = {
    env: options.env ?? ENV,
    openStore,
    prompts: {
      isInteractive: options.interactive ?? true,
      ask: vi.fn(async () => answers.shift() ?? ""),
      askHidden: vi.fn(async () => hidden.shift() ?? ""),
    },
    hashPassword: vi.fn(async (password: string) => `argon2id$hash-of-${password.length}`),
    log: (line) => lines.push(line),
  };
  return { deps, store, created, lines, openStore };
}

async function refusal(options: FakeOptions): Promise<{ reason: string; created: unknown[] }> {
  const { deps, created } = setup(options);
  const result = await bootstrapStagingSuperAdmin(deps);
  if (result.ok) throw new Error("expected a refusal");
  return { reason: result.reason, created };
}

describe("staging bootstrap: environment", () => {
  it("refuses a wrong APP_ENV before connecting", async () => {
    const { deps, openStore } = setup({ env: { ...ENV, APP_ENV: "production" } });
    const result = await bootstrapStagingSuperAdmin(deps);
    expect(result).toEqual(expect.objectContaining({ ok: false }));
    expect(openStore).not.toHaveBeenCalled();
  });

  it("refuses the pooler, another endpoint and another database", async () => {
    const pooled = DIRECT.replace(
      STAGING_DATABASE.neonEndpointId,
      `${STAGING_DATABASE.neonEndpointId}-pooler`,
    );
    expect((await refusal({ env: { ...ENV, DATABASE_URL_UNPOOLED: pooled } })).reason).toContain(
      "pooler",
    );
    expect(
      (
        await refusal({
          env: { ...ENV, DATABASE_URL_UNPOOLED: DIRECT.replace("ep-odd-breeze", "ep-prod") },
        })
      ).reason,
    ).toContain("not the staging endpoint");
    expect(
      (await refusal({ env: { ...ENV, DATABASE_URL_UNPOOLED: DIRECT.replace("/neondb", "/x") } }))
        .reason,
    ).toContain('Database "x"');
    expect(
      (
        await refusal({
          env: { ...ENV, DATABASE_URL_UNPOOLED: DIRECT.replace("?sslmode=require", "") },
        })
      ).reason,
    ).toContain("sslmode");
  });

  it("refuses without an interactive terminal (no piped passwords)", async () => {
    const { deps, openStore } = setup({ interactive: false });
    const result = await bootstrapStagingSuperAdmin(deps);
    expect(result.ok).toBe(false);
    expect(openStore).not.toHaveBeenCalled();
    expect(deps.prompts.askHidden).not.toHaveBeenCalled();
  });
});

describe("staging bootstrap: server identity and role", () => {
  const identity = state().identity;

  it("refuses a wrong Neon project or branch before asking anything", async () => {
    for (const wrong of [
      { ...identity, projectId: "fancy-cake-09808437" },
      { ...identity, branchId: "br-main" },
      { ...identity, database: "postgres" },
    ]) {
      const { deps, created } = setup({ before: state({ identity: wrong }) });
      const result = await bootstrapStagingSuperAdmin(deps);
      expect(result.ok).toBe(false);
      expect(deps.prompts.ask).not.toHaveBeenCalled();
      expect(created).toEqual([]);
    }
  });

  it("checks the Super Admin role: missing, inactive, incomplete, extra", () => {
    expect(checkSuperAdminRole(null)).toContain("does not exist");
    expect(checkSuperAdminRole({ ...ROLE, deletedAt: new Date() })).toContain("inactive");
    expect(checkSuperAdminRole({ ...ROLE, isSystem: false })).toContain("system role");
    expect(checkSuperAdminRole({ ...ROLE, allLocations: false })).toContain("all locations");
    expect(
      checkSuperAdminRole({ ...ROLE, permissions: PERMISSIONS.filter((k) => k !== "role.manage") }),
    ).toContain("missing 1 of 49");
    expect(
      checkSuperAdminRole({ ...ROLE, permissions: [...PERMISSIONS, "everything.delete"] }),
    ).toContain("exactly the 49");
    expect(checkSuperAdminRole(ROLE)).toBeNull();
  });

  it("refuses when the role is missing, inactive or incomplete", async () => {
    expect((await refusal({ before: state({ role: null }) })).reason).toContain("does not exist");
    expect(
      (await refusal({ before: state({ role: { ...ROLE, deletedAt: new Date() } }) })).reason,
    ).toContain("inactive");
    expect(
      (await refusal({ before: state({ role: { ...ROLE, permissions: ["catalog.read"] } }) }))
        .reason,
    ).toContain("missing 48 of 49");
  });
});

describe("staging bootstrap: duplicates", () => {
  it("refuses when any account already holds the Super Admin role", async () => {
    const { reason, created } = await refusal({ before: state({ superAdminAccounts: 1 }) });
    expect(reason).toContain("already exists");
    expect(created).toEqual([]);
    expect(checkBootstrapState(state({ superAdminAccounts: 2 }))).toContain("(2)");
  });

  it("refuses an email that is already in use, before asking for a password", async () => {
    const { deps, created } = setup({ emailTaken: true });
    const result = await bootstrapStagingSuperAdmin(deps);
    expect(result.ok).toBe(false);
    expect(deps.prompts.askHidden).not.toHaveBeenCalled();
    expect(created).toEqual([]);
  });

  it("re-checks inside the transaction (a Super Admin created meanwhile)", async () => {
    const { reason, created } = await refusal({ during: state({ superAdminAccounts: 1 }) });
    expect(reason).toContain("nothing was written");
    expect(created).toEqual([]);
  });

  it("re-checks the role id inside the transaction", async () => {
    const { reason } = await refusal({ during: state({ role: { ...ROLE, id: "role_other" } }) });
    expect(reason).toContain("role changed");
  });
});

describe("staging bootstrap: input and password", () => {
  it("creates exactly one Super Admin with the hashed password", async () => {
    const { deps, created, store, lines } = setup();
    const result = await bootstrapStagingSuperAdmin(deps);
    expect(result).toEqual({ ok: true, email: "admin@example.com" });
    expect(created).toEqual([
      {
        email: "admin@example.com",
        name: "Super Admin",
        passwordHash: `argon2id$hash-of-${ADMIN_PASSWORD.length}`,
        roleId: ROLE.id,
      },
    ]);
    expect(deps.hashPassword).toHaveBeenCalledWith(ADMIN_PASSWORD);
    expect(store.close).toHaveBeenCalled();
    expect(lines.join("\n")).not.toContain(ADMIN_PASSWORD);
    expect(lines.join("\n")).not.toContain(PG_PASSWORD);
  });

  it("refuses an invalid email, a weak password and a mismatch", async () => {
    expect((await refusal({ answers: ["not-an-email"] })).reason).toContain("valid email");
    expect((await refusal({ hidden: ["short", "short"] })).reason).toContain("at least 12");
    expect((await refusal({ hidden: [ADMIN_PASSWORD, `${ADMIN_PASSWORD}x`] })).reason).toContain(
      "do not match",
    );
  });

  it("writes nothing unless the operator types the confirmation word", async () => {
    const { reason, created } = await refusal({
      answers: ["admin@example.com", "", "yes"],
    });
    expect(reason).toContain("Not confirmed");
    expect(created).toEqual([]);
  });

  it("never shows the password or connection string in an error", async () => {
    const leak = new Error(`insert failed for ${ADMIN_PASSWORD} via ${DIRECT}`);
    const { reason, created } = await refusal({ createError: leak });
    expect(created).toEqual([]);
    expect(reason).not.toContain(ADMIN_PASSWORD);
    expect(reason).not.toContain(PG_PASSWORD);
    expect(reason).not.toContain(DIRECT);
    expect(reason).toContain("***");
  });

  it("closes the store even when a step throws", async () => {
    const { deps, store } = setup();
    vi.mocked(store.readState).mockRejectedValueOnce(new Error("connection reset"));
    const result = await bootstrapStagingSuperAdmin(deps);
    expect(result.ok).toBe(false);
    expect(store.close).toHaveBeenCalled();
  });
});

describe("helpers", () => {
  it("normalises emails", () => {
    expect(normaliseEmail("  Admin@Example.COM ")).toBe("admin@example.com");
    expect(normaliseEmail("admin@example")).toBeNull();
    expect(normaliseEmail("a b@example.com")).toBeNull();
  });

  it("redacts every secret, longest first", () => {
    expect(redact("x secret-long y secret", ["secret", "secret-long"])).toBe("x *** y ***");
    expect(redact("ab", ["ab"])).toBe("ab"); // too short to be a secret
  });

  it("hidden input: typing, backspace, enter and Ctrl+C", () => {
    expect(applyHiddenInput("", "abc\r")).toEqual({ buffer: "abc", done: true, cancelled: false });
    expect(applyHiddenInput("abc", "\u007fd")).toEqual({
      buffer: "abd",
      done: false,
      cancelled: false,
    });
    expect(applyHiddenInput("abc", "\u0003").cancelled).toBe(true);
    // Arrow keys and other escape sequences never reach the password.
    expect(applyHiddenInput("", "\u001b[Aab\u001b[3~c").buffer).toBe("abc");
    expect(applyHiddenInput("", "a\u0001b").buffer).toBe("ab");
  });
});
