/**
 * Storefront-wide links and switches (Phase 12): social profiles, the payment
 * methods shown in the footer and the default share image. Empty values are
 * simply not shown.
 *
 * Owner decision 2026-11-15: until online payment arrives (Phase 10) the
 * footer shows cash on delivery only, so customers are not told about card,
 * bKash or Nagad payments they cannot make yet.
 */
import { z } from "zod";

export const PAYMENT_METHOD_KEYS = ["COD", "BKASH", "NAGAD", "VISA", "MASTERCARD"] as const;
export type PaymentMethodKey = (typeof PAYMENT_METHOD_KEYS)[number];

export const PAYMENT_METHOD_LABELS: Record<PaymentMethodKey, { en: string; bn: string }> = {
  COD: { en: "Cash on delivery", bn: "ক্যাশ অন ডেলিভারি" },
  BKASH: { en: "bKash", bn: "বিকাশ" },
  NAGAD: { en: "Nagad", bn: "নগদ" },
  VISA: { en: "Visa", bn: "ভিসা" },
  MASTERCARD: { en: "Mastercard", bn: "মাস্টারকার্ড" },
};

export interface SiteSettings {
  facebookUrl: string;
  instagramUrl: string;
  youtubeUrl: string;
  tiktokUrl: string;
  footerPaymentMethods: PaymentMethodKey[];
  /** Share image when a page has none of its own (https). */
  defaultOgImageUrl: string;
}

export const DEFAULT_SITE_SETTINGS: SiteSettings = {
  facebookUrl: "",
  instagramUrl: "",
  youtubeUrl: "",
  tiktokUrl: "",
  footerPaymentMethods: ["COD"],
  defaultOgImageUrl: "",
};

export const SITE_SETTING_KEYS = {
  facebookUrl: "social.facebookUrl",
  instagramUrl: "social.instagramUrl",
  youtubeUrl: "social.youtubeUrl",
  tiktokUrl: "social.tiktokUrl",
  footerPaymentMethods: "footer.paymentMethods",
  defaultOgImageUrl: "seo.defaultOgImageUrl",
} as const satisfies Record<keyof SiteSettings, string>;

const profile = (hosts: readonly string[]) =>
  z
    .string()
    .trim()
    .max(300)
    .refine((value) => {
      if (value === "") return true;
      try {
        const url = new URL(value);
        return url.protocol === "https:" && hosts.some((host) => url.hostname.endsWith(host));
      } catch {
        return false;
      }
    });

export const siteSettingParsers = {
  facebookUrl: profile(["facebook.com", "fb.com"]),
  instagramUrl: profile(["instagram.com"]),
  youtubeUrl: profile(["youtube.com", "youtu.be"]),
  tiktokUrl: profile(["tiktok.com"]),
  footerPaymentMethods: z
    .string()
    .transform((value, context) => {
      try {
        return JSON.parse(value) as unknown;
      } catch {
        context.addIssue({ code: "custom", message: "Not JSON" });
        return z.NEVER;
      }
    })
    .pipe(z.array(z.enum(PAYMENT_METHOD_KEYS)).max(PAYMENT_METHOD_KEYS.length)),
  defaultOgImageUrl: z
    .string()
    .trim()
    .max(500)
    .refine((value) => value === "" || /^https:\/\/\S+$/.test(value)),
} satisfies Record<keyof SiteSettings, z.ZodType>;

export function parseSiteSettings(
  raw: ReadonlyMap<string, string>,
  warn: (message: string) => void = () => {},
): SiteSettings {
  const result: Record<string, unknown> = { ...DEFAULT_SITE_SETTINGS };
  for (const field of Object.keys(siteSettingParsers) as Array<keyof SiteSettings>) {
    const value = raw.get(SITE_SETTING_KEYS[field]);
    if (value === undefined) continue;
    const parsed = siteSettingParsers[field].safeParse(value.trim());
    if (parsed.success) result[field] = parsed.data;
    else warn(`Setting ${SITE_SETTING_KEYS[field]} is invalid; using the default.`);
  }
  return result as unknown as SiteSettings;
}
