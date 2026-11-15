/**
 * What an invoice says, frozen at the moment it is issued — pure. Reprinting
 * an invoice always shows this snapshot, never today's catalogue, prices or
 * shop details. Numbers are INV-YYMM-NNNNN (Bangladesh month); a correction
 * keeps the number and adds a version.
 */
import { formatOrderNumber } from "@/modules/checkout/checkout-rules";
import { vatIncluded, type StoreSettings } from "@/modules/settings/store-settings";

export const INVOICE_PREFIX = "INV";

export function formatInvoiceNumber(issuedAt: Date, sequence: number): string {
  return formatOrderNumber(INVOICE_PREFIX, issuedAt, sequence);
}

export interface InvoiceSnapshot {
  number: string;
  version: number;
  issuedAt: string;
  channel: "ONLINE" | "STORE";
  store: {
    nameEn: string;
    nameBn: string;
    addressEn: string;
    addressBn: string;
    phone: string;
    logoUrl: string;
    bin: string | null;
    branchName: string | null;
  };
  /** Null when VAT display is off; prices always include VAT. */
  vat: { ratePercent: number; includedPoisha: number } | null;
  order: { orderNumber: string; placedAt: string };
  customer: { name: string; phone: string; addressLines: string[] };
  items: Array<{
    nameEn: string;
    nameBn: string | null;
    sku: string;
    sizeEn: string | null;
    colourEn: string | null;
    quantity: number;
    unitPricePoisha: number;
    discountPoisha: number;
    lineTotalPoisha: number;
  }>;
  totals: {
    subtotalPoisha: number;
    discountPoisha: number;
    shippingPoisha: number;
    totalPoisha: number;
  };
  payment: {
    method: string | null;
    status: string;
    lines: Array<{ provider: string; amountPoisha: number; reference: string | null }>;
  };
  soldBy: string | null;
}

export interface InvoiceSource {
  channel: "ONLINE" | "STORE";
  orderNumber: string;
  placedAt: Date;
  customerName: string;
  customerPhone: string;
  shipLine1: string | null;
  shipLandmark: string | null;
  shipUpazilaName: string | null;
  shipDistrictName: string | null;
  shipDivisionName: string | null;
  subtotalPoisha: number;
  discountPoisha: number;
  shippingPoisha: number;
  totalPoisha: number;
  paymentMethod: string | null;
  paymentStatus: string;
  items: ReadonlyArray<{
    productNameEn: string;
    productNameBn: string | null;
    sku: string;
    sizeLabelEn: string | null;
    colourLabelEn: string | null;
    quantity: number;
    unitPricePoisha: number;
    discountPoisha: number;
    lineTotalPoisha: number;
  }>;
  payments: ReadonlyArray<{
    provider: string;
    amountPoisha: number;
    providerReference: string | null;
  }>;
  locationName: string | null;
  soldByName: string | null;
}

export function addressLines(source: {
  shipLine1: string | null;
  shipLandmark: string | null;
  shipUpazilaName: string | null;
  shipDistrictName: string | null;
  shipDivisionName: string | null;
}): string[] {
  return [
    source.shipLine1,
    source.shipLandmark === null ? null : `Near ${source.shipLandmark}`,
    [source.shipUpazilaName, source.shipDistrictName, source.shipDivisionName]
      .filter((part): part is string => part !== null && part !== "")
      .join(", "),
  ].filter((line): line is string => line !== null && line !== "");
}

export function buildInvoiceSnapshot(input: {
  number: string;
  version: number;
  issuedAt: Date;
  source: InvoiceSource;
  store: StoreSettings;
}): InvoiceSnapshot {
  const { source, store } = input;
  const vatShown = store.vatEnabled && store.vatShowBreakdown && store.vatRatePercent > 0;
  return {
    number: input.number,
    version: input.version,
    issuedAt: input.issuedAt.toISOString(),
    channel: source.channel,
    store: {
      nameEn: store.nameEn,
      nameBn: store.nameBn,
      addressEn: store.addressEn,
      addressBn: store.addressBn,
      phone: store.contactPhone,
      logoUrl: store.logoUrl,
      bin: store.vatEnabled && store.vatBin !== "" ? store.vatBin : null,
      branchName: source.channel === "STORE" ? source.locationName : null,
    },
    vat: vatShown
      ? {
          ratePercent: store.vatRatePercent,
          includedPoisha: vatIncluded(source.totalPoisha, store),
        }
      : null,
    order: { orderNumber: source.orderNumber, placedAt: source.placedAt.toISOString() },
    customer: {
      name: source.customerName,
      phone: source.customerPhone,
      addressLines: source.channel === "ONLINE" ? addressLines(source) : [],
    },
    items: source.items.map((item) => ({
      nameEn: item.productNameEn,
      nameBn: item.productNameBn,
      sku: item.sku,
      sizeEn: item.sizeLabelEn,
      colourEn: item.colourLabelEn,
      quantity: item.quantity,
      unitPricePoisha: item.unitPricePoisha,
      discountPoisha: item.discountPoisha,
      lineTotalPoisha: item.lineTotalPoisha,
    })),
    totals: {
      subtotalPoisha: source.subtotalPoisha,
      discountPoisha: source.discountPoisha,
      shippingPoisha: source.shippingPoisha,
      totalPoisha: source.totalPoisha,
    },
    payment: {
      method: source.paymentMethod,
      status: source.paymentStatus,
      lines: source.payments.map((payment) => ({
        provider: payment.provider,
        amountPoisha: payment.amountPoisha,
        reference: payment.providerReference,
      })),
    },
    soldBy: source.soldByName,
  };
}
