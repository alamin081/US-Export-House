/**
 * Application-wide constants.
 *
 * IMPORTANT: business rules (shipping rates, free-shipping threshold, return
 * window, OTP lifetime, reservation timeout) are NOT constants - they live in
 * the `Setting` table and are editable from the admin dashboard (spec section 3).
 * The values below are either technical limits or the development seed defaults
 * that will be written into `Setting` rows by `prisma/seed.ts` in Phase 4.
 */

/**
 * Human-readable order number prefix. The business confirmed the format
 * `UEH-<year>-<sequence>`, e.g. UEH-2026-001.
 */
export const ORDER_NUMBER_PREFIX = "UEH";

/** Format an order number the way the business writes it: UEH-2026-001. */
export function formatOrderNumber(year: number, sequence: number): string {
  return `${ORDER_NUMBER_PREFIX}-${year}-${String(sequence).padStart(3, "0")}`;
}

/** All money is stored as integer poisha. 1 BDT = 100 poisha. */
export const POISHA_PER_TAKA = 100;

export const CURRENCY_CODE = "BDT";
export const CURRENCY_SYMBOL = "৳"; // BENGALI RUPEE MARK

/** Bangladeshi mobile numbers are stored in E.164 form: +8801XXXXXXXXX. */
export const BD_PHONE_COUNTRY_CODE = "+880";

/**
 * Development seed defaults for settings that the business can change later.
 * Nothing in `src/modules` may read these at runtime - they exist so the seed
 * script and the setup documentation agree on one set of starting values.
 */
export const SEED_DEFAULTS = {
  shipping: {
    insideDhakaPoisha: 70 * POISHA_PER_TAKA,
    outsideDhakaPoisha: 130 * POISHA_PER_TAKA,
    freeShippingThresholdPoisha: 2500 * POISHA_PER_TAKA,
  },
  otp: {
    length: 6,
    lifetimeSeconds: 5 * 60,
  },
  orders: {
    /** Unpaid online orders release their stock reservation after this long. */
    unpaidReservationTtlSeconds: 30 * 60,
  },
  returns: {
    requestWindowDays: 7,
  },
} as const;

/**
 * Staff authentication policy. These are security limits rather than business
 * rules, so they live in code; changing them is a reviewed code change.
 */
export const AUTH_POLICY = {
  /**
   * How often an active session's `lastSeenAt` is refreshed. The idle timeout
   * and the absolute lifetime themselves are deployment settings
   * (STAFF_SESSION_IDLE_TIMEOUT_MINUTES, STAFF_SESSION_MAX_AGE_HOURS in env.ts).
   */
  sessionTouchIntervalSeconds: 5 * 60,
  /** Window over which failed sign-ins are counted. */
  loginWindowSeconds: 15 * 60,
  /** Failed attempts for one email within the window before it is throttled. */
  maxFailuresPerEmail: 5,
  /** Failed attempts from one IP within the window before it is throttled. */
  maxFailuresPerIp: 20,
  passwordMinLength: 12,
  passwordMaxLength: 128,
} as const;

/** Pagination defaults for admin tables and storefront listings. */
export const PAGE_SIZE = {
  storefront: 24,
  admin: 25,
  maxAdmin: 100,
} as const;
