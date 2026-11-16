/**
 * Staging-only Super Admin bootstrap: the rules and the flow, without any
 * real database or terminal, so every refusal is unit-tested with fakes.
 * `scripts/bootstrap-super-admin-staging.ts` wires in Prisma, the terminal
 * prompts and the application's own Argon2id hashing.
 *
 * Order of work (nothing is written before the last step):
 *   1. environment: APP_ENV=staging, the pinned direct staging connection
 *      (shared with the staging seed: scripts/lib/staging-seed-guard.ts);
 *   2. read-only state: the server's Neon project/branch/database, the
 *      "Super Admin" role (active, system, exactly the 49 code permissions)
 *      and no account holding that role yet;
 *   3. email (validated, not in use), password typed twice without echo
 *      (application password policy), then a typed confirmation;
 *   4. one transaction: lock, re-check everything above, create the user,
 *      write the audit entry.
 *
 * Secrets: the password and the connection string are removed from every
 * message this flow prints, whatever an underlying error contains.
 */
import { checkPasswordPolicy, PASSWORD_PROBLEM_MESSAGES } from "../../src/modules/access/password";
import { PERMISSIONS, SUPER_ADMIN_ROLE } from "../../src/modules/access/permissions";
import { checkServerIdentity, checkStagingTarget, type ServerIdentity } from "./staging-seed-guard";

export interface RoleSnapshot {
  id: string;
  name: string;
  permissions: readonly string[];
  isSystem: boolean;
  allLocations: boolean;
  deletedAt: Date | null;
}

/** Everything the bootstrap must re-check, read in one go. */
export interface BootstrapState {
  identity: ServerIdentity;
  role: RoleSnapshot | null;
  /** Accounts of any kind or state that already hold the Super Admin role. */
  superAdminAccounts: number;
}

export interface NewSuperAdmin {
  email: string;
  name: string;
  passwordHash: string;
  roleId: string;
}

/** The database side, implemented with Prisma in the entry script. */
export interface BootstrapStore {
  /** Read-only snapshot (runs in a READ ONLY transaction). */
  readState(): Promise<BootstrapState>;
  isEmailTaken(email: string): Promise<boolean>;
  /**
   * In ONE transaction: take the bootstrap lock, re-read the state, call
   * `recheck` (abort without writing if it returns a message), check the email
   * again, then create the user and the audit entry.
   */
  createSuperAdmin(
    input: NewSuperAdmin,
    recheck: (state: BootstrapState) => string | null,
  ): Promise<{ id: string; email: string }>;
  close(): Promise<void>;
}

export interface BootstrapPrompts {
  /** Whether input comes from a real terminal (hidden input needs one). */
  isInteractive: boolean;
  ask(question: string): Promise<string>;
  /** Reads a line without echoing it. */
  askHidden(question: string): Promise<string>;
}

export interface BootstrapDeps {
  env: Record<string, string | undefined>;
  openStore(connectionString: string): BootstrapStore;
  prompts: BootstrapPrompts;
  hashPassword(password: string): Promise<string>;
  log(line: string): void;
}

export type BootstrapResult = { ok: true; email: string } | { ok: false; reason: string };

/** The exact word the operator types to confirm the write. */
export const CONFIRMATION_WORD = "CREATE";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** The Super Admin role must exist, be active and hold exactly the code permissions. */
export function checkSuperAdminRole(role: RoleSnapshot | null): string | null {
  if (role === null) {
    return `The "${SUPER_ADMIN_ROLE}" role does not exist. Run the staging reference seed first.`;
  }
  if (role.deletedAt !== null) return `The "${SUPER_ADMIN_ROLE}" role is deleted (inactive).`;
  if (!role.isSystem) return `The "${SUPER_ADMIN_ROLE}" role is not marked as a system role.`;
  if (!role.allLocations) return `The "${SUPER_ADMIN_ROLE}" role does not cover all locations.`;
  const held = new Set(role.permissions);
  const missing = PERMISSIONS.filter((key) => !held.has(key));
  if (missing.length > 0) {
    return `The "${SUPER_ADMIN_ROLE}" role is missing ${missing.length} of ${PERMISSIONS.length} permissions (${missing.join(", ")}).`;
  }
  const expected: ReadonlySet<string> = new Set(PERMISSIONS);
  const unknown = [...held].filter((key) => !expected.has(key));
  if (unknown.length > 0 || role.permissions.length !== PERMISSIONS.length) {
    return `The "${SUPER_ADMIN_ROLE}" role does not hold exactly the ${PERMISSIONS.length} expected permissions.`;
  }
  return null;
}

/** Identity, role and "no Super Admin yet", in the order an operator would fix them. */
export function checkBootstrapState(state: BootstrapState): string | null {
  const identity = checkServerIdentity(state.identity);
  if (identity !== null) return identity;
  const role = checkSuperAdminRole(state.role);
  if (role !== null) return role;
  if (state.superAdminAccounts > 0) {
    return (
      `An account with the "${SUPER_ADMIN_ROLE}" role already exists ` +
      `(${state.superAdminAccounts}). This bootstrap only creates the first one; ` +
      "add further staff from /admin/staff."
    );
  }
  return null;
}

export function normaliseEmail(raw: string): string | null {
  const email = raw.trim().toLowerCase();
  return EMAIL_PATTERN.test(email) && email.length <= 254 ? email : null;
}

/** Removes every secret from a message; longest first so substrings cannot leak. */
export function redact(text: string, secrets: readonly string[]): string {
  return [...new Set(secrets.filter((secret) => secret.length >= 4))]
    .sort((a, b) => b.length - a.length)
    .reduce((out, secret) => out.split(secret).join("***"), text);
}

function connectionSecrets(connectionString: string): string[] {
  const secrets = [connectionString];
  try {
    const password = new URL(connectionString).password;
    if (password !== "") secrets.push(password, decodeURIComponent(password));
  } catch {
    // not a URL: the whole string is already listed
  }
  return secrets;
}

export async function bootstrapStagingSuperAdmin(deps: BootstrapDeps): Promise<BootstrapResult> {
  const target = checkStagingTarget(deps.env);
  if (!target.ok) return { ok: false, reason: `Refusing to run: ${target.reason}` };

  if (!deps.prompts.isInteractive) {
    return {
      ok: false,
      reason:
        "This command needs an interactive terminal so the password can be typed without " +
        "echo. Run it yourself in PowerShell, Windows Terminal or cmd (not piped, not via a script).",
    };
  }

  const secrets = connectionSecrets(target.connectionString);
  const store = deps.openStore(target.connectionString);
  try {
    deps.log(`Target: ${target.label} (staging)`);

    const before = await store.readState();
    const problem = checkBootstrapState(before);
    if (problem !== null) return { ok: false, reason: `Refusing to run: ${problem}` };
    deps.log(
      `Verified: Neon project ${before.identity.projectId}, branch ${before.identity.branchId}, ` +
        `database ${before.identity.database}; role "${SUPER_ADMIN_ROLE}" with ${PERMISSIONS.length} permissions; no Super Admin yet.`,
    );

    const email = normaliseEmail(await deps.prompts.ask("Super Admin email: "));
    if (email === null) return { ok: false, reason: "That is not a valid email address." };
    if (await store.isEmailTaken(email)) {
      return {
        ok: false,
        reason: "An account with that email already exists; this command never modifies accounts.",
      };
    }
    const name = (await deps.prompts.ask("Display name [Super Admin]: ")).trim() || "Super Admin";

    const password = await deps.prompts.askHidden("Password (not shown): ");
    secrets.push(password);
    const problems = checkPasswordPolicy(password, email);
    if (problems.length > 0) {
      return {
        ok: false,
        reason: `Password rejected: ${problems.map((p) => PASSWORD_PROBLEM_MESSAGES[p]).join(" ")}`,
      };
    }
    const repeated = await deps.prompts.askHidden("Repeat password: ");
    if (repeated !== password) return { ok: false, reason: "The two passwords do not match." };

    const confirmation = await deps.prompts.ask(
      `Create Super Admin ${email} on ${target.label}? Type ${CONFIRMATION_WORD} to continue: `,
    );
    if (confirmation.trim() !== CONFIRMATION_WORD) {
      return { ok: false, reason: "Not confirmed. Nothing was written." };
    }

    const passwordHash = await deps.hashPassword(password);
    secrets.push(passwordHash);
    const created = await store.createSuperAdmin(
      { email, name, passwordHash, roleId: before.role?.id ?? "" },
      (state) => {
        const again = checkBootstrapState(state);
        if (again !== null) return again;
        return state.role?.id === before.role?.id
          ? null
          : "The Super Admin role changed meanwhile.";
      },
    );
    return { ok: true, email: created.email };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, reason: `Failed, nothing was written: ${redact(message, secrets)}` };
  } finally {
    await store.close().catch(() => undefined);
  }
}
