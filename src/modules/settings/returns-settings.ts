/**
 * Return, exchange and refund settings (Phase 9), stored as `Setting` rows.
 * The values below are the fallbacks when a row is missing or malformed.
 * Owner decisions 2026-11-15: 7-day window, delivery charge refunded only for
 * a defective or wrong item, refunds above ৳5,000 need approval.
 */
import { z } from "zod";

export interface ReturnsSettings {
  /** Days after delivery a return or exchange may be requested. */
  windowDays: number;
  /** The return policy page has been approved and published. */
  policyApproved: boolean;
  /** Refund the delivery charge when the item was defective or wrong. */
  refundShippingOnFault: boolean;
  /** Who pays delivery for an exchange (the shop always pays on its own fault). */
  exchangeShippingPaidBy: "CUSTOMER" | "SHOP";
  /** Customer return requests per IP per 15 minutes. */
  requestsPer15Min: number;
  maxPhotos: number;
  /** Refunds above this need refund.approve. */
  refundApprovalAbovePoisha: number;
  conditionsEn: string;
  conditionsBn: string;
}

export const DEFAULT_RETURNS_SETTINGS: ReturnsSettings = {
  windowDays: 7,
  policyApproved: false,
  refundShippingOnFault: true,
  exchangeShippingPaidBy: "CUSTOMER",
  requestsPer15Min: 5,
  maxPhotos: 3,
  refundApprovalAbovePoisha: 500_000,
  conditionsEn: "Unused, unwashed, with original tags and packaging.",
  conditionsBn: "অব্যবহৃত, না-ধোয়া, অরিজিনাল ট্যাগ ও প্যাকেজিং সহ।",
};

export const RETURNS_SETTING_KEYS = {
  windowDays: "returns.windowDays",
  policyApproved: "returns.policyApproved",
  refundShippingOnFault: "returns.refundShippingOnFault",
  exchangeShippingPaidBy: "returns.exchangeShippingPaidBy",
  requestsPer15Min: "returns.requestsPer15Min",
  maxPhotos: "returns.maxPhotos",
  refundApprovalAbovePoisha: "refund.approvalAbovePoisha",
  conditionsEn: "returns.conditionsEn",
  conditionsBn: "returns.conditionsBn",
} as const satisfies Record<keyof ReturnsSettings, string>;

const bool = z.enum(["true", "false"]).transform((value) => value === "true");

export const returnsSettingParsers = {
  windowDays: z.coerce.number().int().min(0).max(90),
  policyApproved: bool,
  refundShippingOnFault: bool,
  exchangeShippingPaidBy: z.enum(["CUSTOMER", "SHOP"]),
  requestsPer15Min: z.coerce.number().int().min(1).max(1000),
  maxPhotos: z.coerce.number().int().min(0).max(10),
  refundApprovalAbovePoisha: z.coerce.number().int().min(0).max(100_000_000),
  conditionsEn: z.string().max(500),
  conditionsBn: z.string().max(500),
} satisfies Record<keyof ReturnsSettings, z.ZodType>;

export function parseReturnsSettings(
  raw: ReadonlyMap<string, string>,
  warn: (message: string) => void = () => {},
): ReturnsSettings {
  const result: Record<string, unknown> = { ...DEFAULT_RETURNS_SETTINGS };
  for (const field of Object.keys(returnsSettingParsers) as Array<keyof ReturnsSettings>) {
    const value = raw.get(RETURNS_SETTING_KEYS[field]);
    if (value === undefined) continue;
    const parsed = returnsSettingParsers[field].safeParse(value.trim());
    if (parsed.success) result[field] = parsed.data;
    else warn(`Setting ${RETURNS_SETTING_KEYS[field]} is invalid; using the default.`);
  }
  return result as unknown as ReturnsSettings;
}
