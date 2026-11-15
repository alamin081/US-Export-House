import "server-only";

import { z } from "zod";

import type { StaffContext } from "@/modules/access/authorization";
import { assertPermission } from "@/modules/access/authorization";
import { AUDIT_ACTIONS, type RequestMeta } from "@/modules/audit/audit.service";
import { findCartVariants, findCategoryAncestors } from "@/modules/cart/cart.repository";
import { evaluateCoupon } from "@/modules/checkout/coupon-rules";
import { buildQuote, itemsFingerprint, type PricedLine } from "@/modules/checkout/pricing";
import { issueInvoiceInTx } from "@/modules/invoices/invoice.service";
import { applyStockMovements, parse } from "@/modules/inventory/inventory.service";
import { notify } from "@/modules/notifications/notification.service";
import { getCheckoutSettings } from "@/modules/settings/settings.service";
import { resolveDeliveryArea, type DeliveryArea } from "@/modules/shipping/shipping.service";
import { auditInTx, conflict, invalid, withLockedOrder } from "./order-context";
import { couponForEdit, planEditedLines, reservationDelta } from "./order-rules";
import { isAddressCorrectable, isEditable, type OrderStatus } from "./order-state";

/**
 * Changing an order before it is packed — the usual result of the
 * confirmation call (another size, one more shirt, a new address) — and
 * moving it to another fulfilment location. Everything happens in one
 * transaction: the reservation changes, the money is recalculated (the
 * coupon is checked again and dropped if it no longer applies) and the
 * before/after goes to the audit log.
 */

type VariantRow = Awaited<ReturnType<typeof findCartVariants>>[number];

const areaSchema = z.object({
  divisionId: z.string().max(20),
  districtId: z.string().max(20),
  upazilaId: z.string().max(20),
});

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value === "" ? null : value))
    .nullable()
    .default(null);

const editSchema = z.object({
  version: z.coerce.number().int().min(0),
  lines: z
    .array(
      z.object({
        variantId: z.string().min(1).max(40),
        quantity: z.coerce.number().int().min(0).max(100),
      }),
    )
    .max(100),
  customerName: z.string().trim().min(2, "Enter the customer's name.").max(80),
  area: areaSchema,
  street: z.string().trim().min(5, "Enter the street address.").max(200),
  landmark: optionalText(120),
  deliveryNote: optionalText(300),
});

function optionLabel(variant: VariantRow, type: "SIZE" | "COLOUR") {
  const link = variant.optionValues.find((value) => value.optionValue.option.type === type);
  return link === undefined
    ? { en: null, bn: null }
    : { en: link.optionValue.valueEn, bn: link.optionValue.valueBn };
}

function imageOf(variant: VariantRow): string | null {
  const colourId = variant.optionValues.find((link) => link.optionValue.option.type === "COLOUR")
    ?.optionValue.id;
  const images = variant.product.images;
  return (
    images.find((image) => colourId !== undefined && image.optionValueId === colourId)?.url ??
    images[0]?.url ??
    null
  );
}

function isLive(variant: VariantRow): boolean {
  return (
    variant.isActive &&
    variant.deletedAt === null &&
    variant.product.status === "PUBLISHED" &&
    variant.product.deletedAt === null
  );
}

async function loadVariants(ids: readonly string[]) {
  const variants = await findCartVariants(ids);
  const ancestors = await findCategoryAncestors([
    ...new Set(
      variants.flatMap((variant) => [
        variant.product.categoryId,
        ...variant.product.extraCategories.map((link) => link.categoryId),
      ]),
    ),
  ]);
  return new Map(
    variants.map((variant) => [
      variant.id,
      {
        row: variant,
        categoryIds: [
          ...new Set(
            [
              variant.product.categoryId,
              ...variant.product.extraCategories.map((link) => link.categoryId),
            ].flatMap((id) => ancestors.get(id) ?? [id]),
          ),
        ],
      },
    ]),
  );
}

function areaFields(area: DeliveryArea) {
  return {
    shipDivisionId: area.divisionId,
    shipDivisionName: area.divisionName.en,
    shipDistrictId: area.districtId,
    shipDistrictName: area.districtName.en,
    shipUpazilaId: area.upazilaId,
    shipUpazilaName: area.upazilaName.en,
    shipArea: area.upazilaName.en,
    shipCity: area.districtName.en,
  };
}

export interface EditResult {
  orderNumber: string;
  oldTotalPoisha: number;
  newTotalPoisha: number;
  couponRemoved: boolean;
  /** True when the customer should be told (money changed). */
  remindCustomer: boolean;
}

export async function editOrder(
  staff: StaffContext,
  orderId: string,
  raw: unknown,
  meta: RequestMeta,
): Promise<EditResult> {
  assertPermission(staff, "order.edit");
  const input = parse(editSchema, raw);
  const requested = input.lines.filter((line) => line.quantity > 0);
  if (requested.length === 0) {
    throw invalid("An order needs at least one item. Cancel it instead.", "lines");
  }
  const [area, settings, variants] = await Promise.all([
    resolveDeliveryArea(input.area),
    getCheckoutSettings(),
    loadVariants(requested.map((line) => line.variantId)),
  ]);
  if (area === null) throw invalid("Choose a valid delivery area.", "area");

  const result = await withLockedOrder(
    staff,
    orderId,
    { version: input.version },
    async ({ uow, tx, order }) => {
      if (order.channel !== "ONLINE" || !isEditable(order.status as OrderStatus)) {
        throw conflict("Only pending or confirmed orders can be edited.");
      }
      const currentPrices = await tx.variantPrices(requested.map((line) => line.variantId));
      const planned = planEditedLines({
        existing: order.items,
        requested,
        currentPrices,
      });
      if (!planned.ok)
        throw invalid("An item is no longer for sale. Remove it or pick another.", "lines");
      for (const line of planned.lines) {
        const variant = variants.get(line.variantId);
        if (variant === undefined) throw invalid("Unknown item.", "lines");
        if (line.priceSource === "CURRENT" && !isLive(variant.row)) {
          throw invalid(`${variant.row.sku} is not for sale.`, "lines");
        }
      }
      const priced: PricedLine[] = planned.lines.map((line) => {
        const variant = variants.get(line.variantId)!;
        return {
          key: line.variantId,
          unitPricePoisha: line.unitPricePoisha,
          compareAtPoisha:
            variant.row.comparePricePoisha !== null &&
            variant.row.comparePricePoisha > line.unitPricePoisha
              ? variant.row.comparePricePoisha
              : null,
          quantity: line.quantity,
          productId: variant.row.product.id,
          categoryIds: variant.categoryIds,
        };
      });

      // Lock order: order (held) -> coupon -> stock rows.
      let couponEffect = null;
      let couponRemoved = false;
      if (order.couponId !== null) {
        const coupon = await tx.lockCoupon(order.couponId);
        const evaluated =
          coupon === null
            ? null
            : evaluateCoupon({
                coupon: couponForEdit({ ...coupon, scopes: coupon.scopes }),
                lines: priced,
                now: order.placedAt,
                usesByPhone: 0,
                couponOnSaleItems: settings.couponOnSaleItems,
              });
        if (evaluated?.ok === true) {
          couponEffect = evaluated.effect;
        } else {
          couponRemoved = true;
          if (order.redemption !== null) {
            await tx.returnCouponUse(order.couponId);
            await tx.deleteRedemption(order.id);
          }
        }
      }
      const quote = buildQuote({
        lines: priced,
        coupon: couponEffect,
        zoneRatePoisha: area.zone.ratePoisha,
        freeShippingThresholdPoisha: area.zone.freeThresholdPoisha,
      });
      if (quote.totalPoisha > settings.codMaxTotalPoisha) {
        throw invalid("The new total is above the cash-on-delivery limit.", "lines");
      }

      const delta = reservationDelta(order.items, planned.lines);
      // Releases first, so a swap on the same stock row never looks short.
      const movements = [...delta]
        .sort((a, b) => a.quantity - b.quantity)
        .map((line) => ({
          variantId: line.variantId,
          locationId: order.locationId,
          type: line.quantity > 0 ? ("RESERVE" as const) : ("RELEASE" as const),
          quantity: line.quantity,
          referenceType: "ORDER",
          referenceId: order.id,
          userId: staff.userId,
          reason: `Order ${order.orderNumber} edited`,
        }));
      if (movements.length > 0) await applyStockMovements(uow, movements);

      const oldByVariant = new Map(
        order.items
          .filter((item) => item.variantId !== null)
          .map((item) => [item.variantId!, item]),
      );
      await tx.replaceItems(
        order.id,
        planned.lines.map((line) => {
          const old = oldByVariant.get(line.variantId);
          const variant = variants.get(line.variantId)!.row;
          const size = optionLabel(variant, "SIZE");
          const colour = optionLabel(variant, "COLOUR");
          const compareAt =
            variant.comparePricePoisha !== null && variant.comparePricePoisha > line.unitPricePoisha
              ? variant.comparePricePoisha
              : null;
          return {
            variantId: line.variantId,
            productNameEn: old?.productNameEn ?? variant.product.nameEn,
            productNameBn: old?.productNameBn ?? variant.product.nameBn,
            variantLabel: old?.variantLabel ?? variant.labelEn,
            sku: old?.sku ?? variant.sku,
            imageUrl: old?.imageUrl ?? imageOf(variant),
            unitPricePoisha: line.unitPricePoisha,
            quantity: line.quantity,
            lineTotalPoisha: line.unitPricePoisha * line.quantity,
            compareAtPoisha: old?.compareAtPoisha ?? compareAt,
            discountPoisha: quote.lineDiscounts.get(line.variantId) ?? 0,
            sizeLabelEn: old?.sizeLabelEn ?? size.en,
            sizeLabelBn: old?.sizeLabelBn ?? size.bn,
            colourLabelEn: old?.colourLabelEn ?? colour.en,
            colourLabelBn: old?.colourLabelBn ?? colour.bn,
          };
        }),
      );
      if (couponEffect !== null && order.redemption !== null) {
        await tx.updateRedemption(order.id, quote.discountPoisha);
      }
      await tx.updateOrder(order.id, {
        subtotalPoisha: quote.subtotalPoisha,
        discountPoisha: quote.discountPoisha,
        shippingPoisha: quote.shippingPoisha,
        totalPoisha: quote.totalPoisha,
        ...(couponRemoved ? { couponId: null, couponCode: null } : {}),
        zoneId: area.zone.id,
        zoneCode: area.zone.code,
        zoneName: area.zone.nameEn,
        customerName: input.customerName,
        shipName: input.customerName,
        shipLine1: input.street,
        shipLandmark: input.landmark,
        deliveryNote: input.deliveryNote,
        ...areaFields(area),
        itemsFingerprint: itemsFingerprint(
          planned.lines.map((line) => ({ key: line.variantId, quantity: line.quantity })),
        ),
      });
      await tx.setCodPaymentAmount(order.id, quote.totalPoisha);

      const summary = (
        items: ReadonlyArray<{ sku: string; quantity: number; unitPricePoisha: number }>,
      ) => items.map((item) => `${item.sku}×${item.quantity}@${item.unitPricePoisha}`);
      const before = {
        items: summary(order.items),
        totalPoisha: order.totalPoisha,
        shippingPoisha: order.shippingPoisha,
        discountPoisha: order.discountPoisha,
        couponCode: order.couponCode,
        zoneCode: order.zoneCode,
        upazilaId: order.shipUpazilaId,
      };
      const after = {
        items: summary(
          planned.lines.map((line) => ({
            sku: oldByVariant.get(line.variantId)?.sku ?? variants.get(line.variantId)!.row.sku,
            quantity: line.quantity,
            unitPricePoisha: line.unitPricePoisha,
          })),
        ),
        totalPoisha: quote.totalPoisha,
        shippingPoisha: quote.shippingPoisha,
        discountPoisha: quote.discountPoisha,
        couponCode: couponRemoved ? null : order.couponCode,
        zoneCode: area.zone.code,
        upazilaId: area.upazilaId,
      };
      const totalChanged = order.totalPoisha !== quote.totalPoisha;
      await tx.addHistory({
        orderId: order.id,
        status: order.status as OrderStatus,
        event: "EDITED",
        noteEn: [
          "Order edited.",
          totalChanged
            ? `Total ${order.totalPoisha / 100} → ${quote.totalPoisha / 100} taka.`
            : null,
          couponRemoved
            ? `Coupon ${order.couponCode ?? ""} no longer applies and was removed.`
            : null,
        ]
          .filter(Boolean)
          .join(" "),
        userId: staff.userId,
      });
      await auditInTx(uow, staff, meta, {
        action: AUDIT_ACTIONS.orderEdited,
        orderId: order.id,
        locationId: order.locationId,
        before,
        after,
      });
      return {
        orderNumber: order.orderNumber,
        oldTotalPoisha: order.totalPoisha,
        newTotalPoisha: quote.totalPoisha,
        couponRemoved,
        remindCustomer: totalChanged,
      };
    },
  );
  if (result.remindCustomer) {
    await notify({
      type: "order.updated",
      orderNumber: result.orderNumber,
      totalPoisha: result.newTotalPoisha,
    });
  }
  return result;
}

// ---------------------------------------------------------------------------
// fulfilment location
// ---------------------------------------------------------------------------

const locationSchema = z.object({
  version: z.coerce.number().int().min(0),
  locationId: z.string().min(1).max(40),
});

/**
 * Moves an unpacked order to another online-fulfilment location: release at
 * the old one and reserve at the new one in one transaction. If the new
 * location is short of anything, nothing changes and the SKUs are named.
 */
export async function changeFulfilmentLocation(
  staff: StaffContext,
  orderId: string,
  raw: unknown,
  meta: RequestMeta,
) {
  assertPermission(staff, "order.edit");
  const input = parse(locationSchema, raw);
  return withLockedOrder(staff, orderId, { version: input.version }, async ({ uow, tx, order }) => {
    if (order.channel !== "ONLINE" || !isEditable(order.status as OrderStatus)) {
      throw conflict("The location can change only before packing starts.");
    }
    if (order.locationId === input.locationId) throw invalid("The order already ships from there.");
    const target = await tx.findActiveLocation(input.locationId);
    if (target === null || !target.isOnlineFulfillment) {
      throw invalid("Choose an active online-fulfilment location.", "locationId");
    }
    if (!staff.allLocations && !staff.locationIds.includes(target.id)) {
      throw invalid("You do not have access to that location.", "locationId");
    }
    const lines = order.items.filter((item) => item.variantId !== null);
    const base = {
      referenceType: "ORDER",
      referenceId: order.id,
      userId: staff.userId,
      reason: `Order ${order.orderNumber} moved to ${target.code}`,
    };
    await applyStockMovements(uow, [
      ...lines.map((item) => ({
        ...base,
        variantId: item.variantId!,
        locationId: order.locationId,
        type: "RELEASE" as const,
        quantity: -item.quantity,
      })),
      ...lines.map((item) => ({
        ...base,
        variantId: item.variantId!,
        locationId: target.id,
        type: "RESERVE" as const,
        quantity: item.quantity,
      })),
    ]);
    await tx.updateOrder(order.id, { locationId: target.id });
    await tx.addHistory({
      orderId: order.id,
      status: order.status as OrderStatus,
      event: "LOCATION_CHANGED",
      noteEn: `Ships from ${target.code} instead of ${order.location.code}.`,
      userId: staff.userId,
    });
    await auditInTx(uow, staff, meta, {
      action: AUDIT_ACTIONS.orderLocationChanged,
      orderId: order.id,
      locationId: target.id,
      before: { locationId: order.locationId, code: order.location.code },
      after: { locationId: target.id, code: target.code },
    });
    return { orderNumber: order.orderNumber, locationCode: target.code };
  });
}

// ---------------------------------------------------------------------------
// address correction after packing (money unchanged)
// ---------------------------------------------------------------------------

const correctionSchema = z.object({
  version: z.coerce.number().int().min(0),
  customerName: z.string().trim().min(2, "Enter the customer's name.").max(80),
  area: areaSchema,
  street: z.string().trim().min(5, "Enter the street address.").max(200),
  landmark: optionalText(120),
  deliveryNote: optionalText(300),
  reason: z.string().trim().min(3, "Say why the address changed.").max(200),
});

/**
 * Fixes the delivery address of a packed or shipped order (a wrong road
 * number, a new landmark). Prices and the delivery charge do not change; if
 * the order already has an invoice, a new version with the same number is
 * issued and the old one is kept.
 */
export async function correctAddress(
  staff: StaffContext,
  orderId: string,
  raw: unknown,
  meta: RequestMeta,
) {
  assertPermission(staff, "order.edit");
  const input = parse(correctionSchema, raw);
  const area = await resolveDeliveryArea(input.area);
  if (area === null) throw invalid("Choose a valid delivery area.", "area");
  return withLockedOrder(staff, orderId, { version: input.version }, async ({ uow, tx, order }) => {
    if (order.channel !== "ONLINE" || !isAddressCorrectable(order.status as OrderStatus)) {
      throw conflict("This order's address can no longer be changed.");
    }
    const before = {
      customerName: order.customerName,
      shipLine1: order.shipLine1,
      shipLandmark: order.shipLandmark,
      shipUpazilaId: order.shipUpazilaId,
    };
    await tx.updateOrder(order.id, {
      customerName: input.customerName,
      shipName: input.customerName,
      shipLine1: input.street,
      shipLandmark: input.landmark,
      deliveryNote: input.deliveryNote,
      ...areaFields(area),
    });
    const current = order.invoices[0];
    const invoice =
      current === undefined
        ? null
        : await issueInvoiceInTx({
            uow,
            tx,
            orderId: order.id,
            current: { number: current.number, version: current.version },
            reason: `Address corrected: ${input.reason}`,
            userId: staff.userId,
            meta,
          });
    await tx.addHistory({
      orderId: order.id,
      status: order.status as OrderStatus,
      event: "ADDRESS_CORRECTED",
      noteEn: `Address corrected: ${input.reason}${invoice === null ? "" : ` (invoice ${invoice.number} v${invoice.version})`}`,
      userId: staff.userId,
    });
    await auditInTx(uow, staff, meta, {
      action: AUDIT_ACTIONS.orderAddressCorrected,
      orderId: order.id,
      locationId: order.locationId,
      before,
      after: {
        customerName: input.customerName,
        shipLine1: input.street,
        shipLandmark: input.landmark,
        shipUpazilaId: area.upazilaId,
        reason: input.reason,
      },
    });
    return { orderNumber: order.orderNumber, invoice };
  });
}
