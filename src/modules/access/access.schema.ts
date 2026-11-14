import { z } from "zod";

import { AUTH_POLICY } from "@/config/constants";

/**
 * Input contracts for sign-in and staff management. Every Server Action and
 * Route Handler parses its input with these before a service sees it.
 */

/** Emails are compared and stored lower-cased. */
export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email({ message: "Enter a valid email address." }));

/**
 * Sign-in only checks the shape: the policy (length, deny-list) applies when a
 * password is set, never when one is tried, so it cannot leak which rule failed.
 */
export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(AUTH_POLICY.passwordMaxLength),
});
export type LoginInput = z.infer<typeof loginSchema>;

const idSchema = z.string().min(1).max(64);

export const createStaffSchema = z.object({
  name: z.string().trim().min(2, "Enter the staff member's name.").max(120),
  email: emailSchema,
  roleId: idSchema,
  locationIds: z.array(idSchema).max(50).default([]),
  password: z.string().max(AUTH_POLICY.passwordMaxLength),
});
export type CreateStaffInput = z.infer<typeof createStaffSchema>;

export const updateStaffAccessSchema = z.object({
  userId: idSchema,
  roleId: idSchema,
  locationIds: z.array(idSchema).max(50).default([]),
});
export type UpdateStaffAccessInput = z.infer<typeof updateStaffAccessSchema>;

export const setStaffActiveSchema = z.object({
  userId: idSchema,
  active: z.boolean(),
});
export type SetStaffActiveInput = z.infer<typeof setStaffActiveSchema>;

export const resetStaffPasswordSchema = z.object({
  userId: idSchema,
  password: z.string().max(AUTH_POLICY.passwordMaxLength),
});
export type ResetStaffPasswordInput = z.infer<typeof resetStaffPasswordSchema>;

export const staffIdSchema = z.object({ userId: idSchema });

export const changeOwnPasswordSchema = z
  .object({
    currentPassword: z.string().min(1).max(AUTH_POLICY.passwordMaxLength),
    newPassword: z.string().max(AUTH_POLICY.passwordMaxLength),
    confirmPassword: z.string().max(AUTH_POLICY.passwordMaxLength),
  })
  .refine((value) => value.newPassword === value.confirmPassword, {
    message: "The two new passwords do not match.",
    path: ["confirmPassword"],
  });
export type ChangeOwnPasswordInput = z.infer<typeof changeOwnPasswordSchema>;

/**
 * Only same-site admin paths are accepted as a post-login destination, which
 * closes the classic open-redirect hole in sign-in forms.
 */
export function safeAdminCallback(value: unknown): string {
  if (typeof value !== "string") return "/admin";
  if (!value.startsWith("/admin") || value.startsWith("//") || value.includes("\\")) {
    return "/admin";
  }
  if (value.startsWith("/admin/login")) return "/admin";
  return value;
}
