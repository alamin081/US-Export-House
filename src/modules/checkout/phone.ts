/**
 * Bangladeshi mobile numbers — pure. Customers type them in many shapes:
 * "01712-345678", "+880 1712 345678", "8801712345678", "০১৭১২৩৪৫৬৭৮".
 * Every accepted shape is stored as +8801XXXXXXXXX, so a future customer
 * account can find its guest orders by number.
 */

const BENGALI_DIGITS = "০১২৩৪৫৬৭৮৯";

/** A mobile number is 01 + operator digit 3-9 + 8 digits. */
const LOCAL_MOBILE = /^01[3-9]\d{8}$/;

export type PhoneResult = { ok: true; phone: string } | { ok: false };

export function normalizeBdMobile(input: string): PhoneResult {
  const digits = input
    .trim()
    .replace(/[০-৯]/g, (digit) => String(BENGALI_DIGITS.indexOf(digit)))
    .replace(/[\s\-().]/g, "");
  if (!/^\+?\d+$/.test(digits)) return { ok: false };
  let local = digits.replace(/^\+/, "");
  if (local.startsWith("00880")) local = local.slice(5);
  else if (local.startsWith("880")) local = local.slice(3);
  if (!local.startsWith("0")) local = `0${local}`;
  return LOCAL_MOBILE.test(local) ? { ok: true, phone: `+88${local}` } : { ok: false };
}

/** +8801712345678 -> 01712-345678 (how staff read numbers). */
export function formatBdMobile(phone: string): string {
  const local = phone.replace(/^\+88/, "");
  return `${local.slice(0, 5)}-${local.slice(5)}`;
}

/** For staff without customer.read: 01***-***678. */
export function maskBdMobile(phone: string): string {
  const local = phone.replace(/^\+88/, "");
  return `${local.slice(0, 2)}***-***${local.slice(-3)}`;
}
