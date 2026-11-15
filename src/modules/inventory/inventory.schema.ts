import { z } from "zod";

import { ADJUSTMENT_REASONS } from "./inventory-rules";
import { SHORTAGE_REASONS } from "./transfer-rules";

/**
 * Server-side validation for every inventory input. Forms post strings, so
 * numbers are coerced; ids are cuid-like strings (seeded ones included).
 */

const id = z.string().trim().min(1).max(64);
const quantity = z.coerce
  .number()
  .int("Enter a whole number.")
  .min(1, "At least 1.")
  .max(1_000_000);
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => (value === undefined || value === "" ? null : value));
const costPoisha = z.coerce.number().int().min(0).max(1_000_000_000).nullable().optional();
const bool = z
  .union([z.boolean(), z.enum(["true", "false", "on", ""])])
  .optional()
  .transform((value) => value === true || value === "true" || value === "on");

// ---------------------------------------------------------------------------
// locations
// ---------------------------------------------------------------------------

export const LOCATION_CODE_PATTERN = /^[A-Z0-9]+(-[A-Z0-9]+)*$/;

export const locationSaveSchema = z.object({
  id: id.optional(),
  code: z
    .string()
    .trim()
    .transform((value) => value.toUpperCase())
    .pipe(
      z
        .string()
        .min(2, "At least 2 characters.")
        .max(20, "At most 20 characters.")
        .regex(
          LOCATION_CODE_PATTERN,
          "Capital letters and digits, in groups joined by hyphens (WH-01).",
        ),
    ),
  type: z.enum(["BRANCH", "WAREHOUSE"]),
  nameEn: z.string().trim().min(2, "Enter the English name.").max(80),
  nameBn: optionalText(80),
  division: optionalText(40),
  district: optionalText(40),
  thana: optionalText(60),
  addressEn: optionalText(200),
  addressBn: optionalText(200),
  phone: z
    .string()
    .trim()
    .max(20)
    .optional()
    .transform((value) => (value === undefined || value === "" ? null : value))
    .refine((value) => value === null || /^\+?[0-9 -]{6,20}$/.test(value), "Enter a phone number."),
  hoursEn: optionalText(120),
  hoursBn: optionalText(120),
  /** Google Maps link for the contact page and footer (Phase 12). */
  mapUrl: z
    .string()
    .trim()
    .max(500)
    .optional()
    .transform((value) => (value === undefined || value === "" ? null : value))
    .refine(
      (value) =>
        value === null ||
        /^https:\/\/(maps\.app\.goo\.gl|goo\.gl\/maps|maps\.google\.com|www\.google\.com\/maps)[/?]/.test(
          value,
        ),
      "Paste a Google Maps link (https://maps.app.goo.gl/… or https://www.google.com/maps/…).",
    ),
  sortOrder: z.coerce.number().int().min(0).max(9999).default(0),
  isActive: bool,
  isOnlineFulfillment: bool,
  isDefaultOnlineFulfillment: bool,
  /** Set after the "this location still holds stock" warning was shown. */
  confirmDeactivate: bool,
});

export type LocationSaveInput = z.infer<typeof locationSaveSchema>;

// ---------------------------------------------------------------------------
// stock
// ---------------------------------------------------------------------------

export const adjustSchema = z
  .object({
    locationId: id,
    variantId: id,
    delta: z.coerce
      .number()
      .int("Enter a whole number.")
      .min(-1_000_000)
      .max(1_000_000)
      .refine((value) => value !== 0, "Enter a number other than zero."),
    reason: z.enum(ADJUSTMENT_REASONS),
    note: optionalText(300),
    confirmed: bool,
  })
  .refine((value) => value.reason !== "OTHER" || (value.note?.length ?? 0) >= 3, {
    message: "Write a note when the reason is Other.",
    path: ["note"],
  });

export const receiveSchema = z.object({
  locationId: id,
  kind: z.enum(["OPENING", "PURCHASE"]).default("PURCHASE"),
  supplierReference: optionalText(80),
  note: optionalText(300),
  lines: z
    .array(z.object({ variantId: id, quantity, unitCostPoisha: costPoisha }))
    .min(1, "Add at least one item.")
    .max(5000),
});

export const thresholdSchema = z.object({
  locationId: id,
  variantId: id,
  threshold: z
    .union([z.literal(""), z.null(), z.coerce.number().int().min(0).max(10_000)])
    .transform((value) => (value === "" ? null : value)),
});

const stockLines = z
  .array(z.object({ variantId: id, quantity }))
  .min(1)
  .max(500);

export const reserveSchema = z.object({
  locationId: id,
  lines: stockLines,
  referenceType: z.string().trim().min(1).max(40),
  referenceId: z.string().trim().min(1).max(64),
});

export const commitSaleSchema = reserveSchema.extend({
  channel: z.enum(["ONLINE", "STORE"]),
  /** False for a till sale that never reserved stock. */
  fromReservation: z.boolean().default(true),
});

export const importModeSchema = z.enum(["OPENING", "PURCHASE"]);

export const matrixQuerySchema = z.object({
  q: z.string().trim().max(80).optional(),
  locationId: id.optional().or(z.literal("").transform(() => undefined)),
  categoryId: id.optional().or(z.literal("").transform(() => undefined)),
  stock: z
    .enum(["low", "out"])
    .optional()
    .or(z.literal("").transform(() => undefined)),
  page: z.coerce.number().int().min(1).max(10_000).catch(1),
});

export const movementQuerySchema = z.object({
  locationId: id.optional().or(z.literal("").transform(() => undefined)),
  type: z
    .string()
    .trim()
    .max(40)
    .optional()
    .or(z.literal("").transform(() => undefined)),
  from: z.iso
    .date()
    .optional()
    .or(z.literal("").transform(() => undefined)),
  to: z.iso
    .date()
    .optional()
    .or(z.literal("").transform(() => undefined)),
  page: z.coerce.number().int().min(1).max(10_000).catch(1),
});

// ---------------------------------------------------------------------------
// transfers
// ---------------------------------------------------------------------------

export const transferDraftSchema = z
  .object({
    id: id.optional(),
    fromLocationId: id,
    toLocationId: id,
    note: optionalText(300),
    lines: z
      .array(z.object({ variantId: id, quantity }))
      .min(1, "Add at least one item.")
      .max(500),
  })
  .refine((value) => value.fromLocationId !== value.toLocationId, {
    message: "Choose two different locations.",
    path: ["toLocationId"],
  });

export const transferReceiveSchema = z.object({
  transferId: id,
  lines: z
    .array(
      z.object({
        itemId: id,
        quantityReceived: z.coerce.number().int().min(0).max(1_000_000),
        reason: z.enum(SHORTAGE_REASONS).nullable().optional(),
      }),
    )
    .min(1),
  note: optionalText(300),
});

export const transferCancelSchema = z.object({
  transferId: id,
  reason: z.string().trim().min(3, "Say why the transfer is cancelled.").max(300),
});

export const transferListSchema = z.object({
  status: z
    .enum(["DRAFT", "APPROVED", "DISPATCHED", "RECEIVED", "CANCELLED"])
    .optional()
    .or(z.literal("").transform(() => undefined)),
  locationId: id.optional().or(z.literal("").transform(() => undefined)),
  page: z.coerce.number().int().min(1).max(10_000).catch(1),
});

// ---------------------------------------------------------------------------
// stock counts
// ---------------------------------------------------------------------------

export const countStartSchema = z.object({
  locationId: id,
  categoryId: id.optional().or(z.literal("").transform(() => undefined)),
  note: optionalText(300),
});

export const countRecordSchema = z.union([
  z.object({ countId: id, code: z.string().trim().min(1).max(64), mode: z.literal("scan") }),
  z.object({
    countId: id,
    variantId: id,
    mode: z.literal("set"),
    countedQty: z.coerce.number().int().min(0).max(1_000_000),
  }),
]);

export const countApplySchema = z.object({
  countId: id,
  zeroUncounted: bool,
  confirmZeroUncounted: bool,
});
