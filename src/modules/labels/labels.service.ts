import "server-only";

import { z } from "zod";

import { AppError } from "@/lib/errors";
import {
  assertPermission,
  hasAnyPermission,
  type StaffContext,
} from "@/modules/access/authorization";
import { AUDIT_ACTIONS, recordAudit, type RequestMeta } from "@/modules/audit/audit.service";
import { getPosSettings } from "@/modules/settings/settings.service";
import {
  assignMissingBarcodes,
  countVariantsWithoutBarcode,
  findDocumentQuantities,
  findProductVariantIds,
  findVariantsForLabels,
  findVariantsWithoutBarcode,
} from "./labels.repository";

/**
 * Barcode labels: generating the shop's EAN-13 for variants that have none
 * (never replacing an existing barcode), and the data a label sheet prints.
 */

export const MAX_LABELS = 1000;

/** Generating barcodes needs label.print or catalog.write (owner decision). */
function assertCanGenerate(staff: StaffContext) {
  if (!hasAnyPermission(staff, ["label.print", "catalog.write"])) {
    assertPermission(staff, "label.print");
  }
}

export async function countMissingBarcodes(staff: StaffContext) {
  assertCanGenerate(staff);
  return countVariantsWithoutBarcode();
}

/** Fills empty barcodes only, in batches, with one audit row listing them. */
export async function generateMissingBarcodes(
  staff: StaffContext | null,
  meta: RequestMeta,
  options: { limit?: number } = {},
) {
  if (staff !== null) assertCanGenerate(staff);
  const variants = await findVariantsWithoutBarcode(options.limit ?? 5000);
  const assigned = await assignMissingBarcodes(variants.map((variant) => variant.id));
  if (assigned.length > 0) {
    await recordAudit({
      actorUserId: staff?.userId ?? null,
      action: AUDIT_ACTIONS.barcodesGenerated,
      entityType: "ProductVariant",
      entityId: null,
      before: { barcode: null },
      after: {
        count: assigned.length,
        variants: assigned.map((row) => `${row.sku}=${row.barcode}`),
      },
      meta,
    });
  }
  return assigned;
}

export interface LabelData {
  variantId: string;
  barcode: string | null;
  sku: string;
  name: string;
  size: string | null;
  colour: string | null;
  pricePoisha: number;
}

const sourceSchema = z.object({
  items: z.string().max(20_000).optional(),
  product: z.string().max(40).optional(),
  receipt: z.string().max(40).optional(),
  transfer: z.string().max(40).optional(),
});

function parseItems(text: string): Array<{ variantId: string; quantity: number }> {
  return text
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part !== "")
    .map((part) => {
      const [variantId = "", count = "1"] = part.split(":");
      return { variantId, quantity: Math.max(0, Math.min(500, Number.parseInt(count, 10) || 0)) };
    })
    .filter((line) => /^[a-z0-9_-]{8,40}$/i.test(line.variantId) && line.quantity > 0);
}

/**
 * Labels to print, one entry per physical label: from a list
 * (variantId:qty,...), a product (one each), a stock receipt or a transfer
 * (as many as arrived / were sent).
 */
export async function getLabelSheet(staff: StaffContext, raw: Record<string, string | undefined>) {
  assertPermission(staff, "label.print");
  const source = sourceSchema.parse(raw);
  let lines: Array<{ variantId: string; quantity: number }> = [];
  if (source.items !== undefined && source.items !== "") lines = parseItems(source.items);
  else if (source.product !== undefined) {
    lines = (await findProductVariantIds(source.product)).map((variantId) => ({
      variantId,
      quantity: 1,
    }));
  } else if (source.receipt !== undefined) {
    lines = await findDocumentQuantities("receipt", source.receipt);
  } else if (source.transfer !== undefined) {
    lines = await findDocumentQuantities("transfer", source.transfer);
  }
  const total = lines.reduce((sum, line) => sum + line.quantity, 0);
  if (total > MAX_LABELS)
    throw new AppError("VALIDATION_FAILED", `At most ${MAX_LABELS} labels at once.`);
  const variants = new Map(
    (await findVariantsForLabels(lines.map((line) => line.variantId))).map((row) => [row.id, row]),
  );
  const labels: LabelData[] = [];
  for (const line of lines) {
    const variant = variants.get(line.variantId);
    if (variant === undefined) continue;
    const option = (type: "SIZE" | "COLOUR") =>
      variant.optionValues.find((link) => link.optionValue.option.type === type)?.optionValue
        .valueEn ?? null;
    for (let copy = 0; copy < line.quantity; copy += 1) {
      labels.push({
        variantId: variant.id,
        barcode: variant.barcode,
        sku: variant.sku,
        name: variant.product.nameEn,
        size: option("SIZE"),
        colour: option("COLOUR"),
        pricePoisha: variant.pricePoisha,
      });
    }
  }
  const settings = await getPosSettings();
  return {
    labels,
    missingBarcodes: new Set(
      labels.filter((label) => label.barcode === null).map((label) => label.sku),
    ).size,
    widthMm: settings.labelWidthMm,
    heightMm: settings.labelHeightMm,
  };
}
