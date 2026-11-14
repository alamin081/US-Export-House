/**
 * Staff password hashing and policy.
 *
 * Argon2id with the OWASP-recommended parameters (19 MiB memory, 2 passes,
 * 1 lane). Hashes are stored in PHC format, which carries its own parameters,
 * so they can be raised later and old hashes upgraded on the next sign-in.
 *
 * This module has no server-only import on purpose: the one-time Super Admin
 * bootstrap script uses it outside Next.js.
 */
import { hash, parseOptions, verify, type Algorithm, type Options } from "@node-rs/argon2";

import { AUTH_POLICY } from "@/config/constants";

/** Algorithm.Argon2id. A const enum, so it is spelled out for isolatedModules. */
const ARGON2ID = 2 as Algorithm;

export const PASSWORD_HASH_OPTIONS: Required<
  Pick<Options, "memoryCost" | "timeCost" | "parallelism" | "algorithm">
> = {
  algorithm: ARGON2ID,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
};

export async function hashPassword(password: string): Promise<string> {
  return hash(password, PASSWORD_HASH_OPTIONS);
}

/** Constant-time comparison is done inside argon2's verify. */
export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    // A malformed hash must fail closed, never throw through to the caller.
    return false;
  }
}

/** True when a stored hash was made with weaker settings than today's. */
export function needsRehash(passwordHash: string): boolean {
  try {
    const current = parseOptions(passwordHash);
    return (
      current.algorithm !== PASSWORD_HASH_OPTIONS.algorithm ||
      current.memoryCost < PASSWORD_HASH_OPTIONS.memoryCost ||
      current.timeCost < PASSWORD_HASH_OPTIONS.timeCost
    );
  } catch {
    return true;
  }
}

/**
 * A real hash of a throwaway value. When an email does not exist the sign-in
 * still verifies against this, so the response time does not reveal which
 * email addresses have accounts.
 */
let dummyHashPromise: Promise<string> | undefined;
export function getTimingSafeDummyHash(): Promise<string> {
  dummyHashPromise ??= hashPassword("timing-safe-placeholder-never-a-real-password");
  return dummyHashPromise;
}

// A short deny-list of passwords that appear at the top of every breach list.
// Length is the main defence; this only catches the most obvious choices.
const COMMON_PASSWORDS = new Set([
  "password1234",
  "password12345",
  "password123456",
  "123456789012",
  "qwertyuiop12",
  "admin1234567",
  "administrator",
  "letmein12345",
  "welcome12345",
  "iloveyou1234",
  "bangladesh123",
  "usexporthouse",
]);

export type PasswordProblem = "too_short" | "too_long" | "contains_email" | "too_common";

/**
 * Password policy, following current NIST guidance: favour length over
 * composition rules, reject the obvious, never truncate.
 */
export function checkPasswordPolicy(password: string, email?: string): PasswordProblem[] {
  const problems: PasswordProblem[] = [];

  if (password.length < AUTH_POLICY.passwordMinLength) problems.push("too_short");
  if (password.length > AUTH_POLICY.passwordMaxLength) problems.push("too_long");

  const lowered = password.toLowerCase();
  if (email !== undefined) {
    const localPart = email.split("@")[0]?.toLowerCase() ?? "";
    if (localPart.length >= 4 && lowered.includes(localPart)) problems.push("contains_email");
  }

  if (COMMON_PASSWORDS.has(lowered)) problems.push("too_common");

  return problems;
}

export const PASSWORD_PROBLEM_MESSAGES: Record<PasswordProblem, string> = {
  too_short: `Use at least ${AUTH_POLICY.passwordMinLength} characters.`,
  too_long: `Use at most ${AUTH_POLICY.passwordMaxLength} characters.`,
  contains_email: "Do not include your email name in the password.",
  too_common: "This password is too common. Choose another.",
};
