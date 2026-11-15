import { formatTakaInput } from "@/lib/money";
import { requireStaffPage } from "@/modules/access/access.service";
import { saveStoreSettingsAction } from "@/modules/checkout-admin/checkout-admin.actions";
import {
  CHECKOUT_SETTING_LABELS,
  getCheckoutSettingsForStaff,
  getStoreSettingsForStaff,
  isMoneySetting,
  STORE_FIELD_LABELS,
  type StoreField,
} from "@/modules/checkout-admin/checkout-admin.service";
import type { CheckoutSettings } from "@/modules/settings/checkout-settings";
import { forPage } from "../page-guard";
import { CheckoutSettingsForm, type SettingRow } from "./settings-form";

export const metadata = { title: "Checkout settings" };

const GROUPS: ReadonlyArray<{ title: string; fields: ReadonlyArray<keyof CheckoutSettings> }> = [
  {
    title: "Cart and orders",
    fields: [
      "maxQtyPerVariant",
      "maxItemsPerOrder",
      "codMaxTotalPoisha",
      "cartTtlDays",
      "couponOnSaleItems",
      "freeShippingThresholdPoisha",
    ],
  },
  {
    title: "Protection",
    fields: [
      "maxOpenOrdersPerPhone",
      "maxOrdersPerIpPerHour",
      "duplicateWindowMinutes",
      "minFillSeconds",
      "couponAttemptsPer15Min",
      "trackAttemptsPer15Min",
    ],
  },
  {
    title: "Review flags (Phase 9 confirms these orders by phone)",
    fields: ["reviewItemsAtLeast", "reviewFirstOrderAtLeastPoisha"],
  },
  { title: "Shop", fields: ["storeContactPhone", "orderNumberPrefix"] },
];

/** Every checkout rule the business may change, with its current value. */
export default async function CheckoutSettingsPage() {
  const staff = await requireStaffPage("checkout.settings");
  const [settings, store] = await Promise.all([
    forPage(getCheckoutSettingsForStaff(staff)),
    forPage(getStoreSettingsForStaff(staff)),
  ]);
  const storeRows = (fields: readonly StoreField[]) =>
    fields.map((field): SettingRow => ({
      field,
      label: STORE_FIELD_LABELS[field],
      kind: typeof store[field] === "boolean" ? "boolean" : "text",
      value: String(store[field]),
    }));

  const groups = GROUPS.map((group) => ({
    title: group.title,
    rows: group.fields.map((field): SettingRow => ({
      field,
      label: CHECKOUT_SETTING_LABELS[field],
      kind: typeof settings[field] === "boolean" ? "boolean" : "text",
      value: isMoneySetting(field)
        ? formatTakaInput(settings[field] as number)
        : String(settings[field]),
    })),
  }));

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="text-2xl font-semibold tracking-tight">Checkout settings</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Provisional values agreed for launch. Each change is in the audit log with the old and new
        value.
      </p>
      <CheckoutSettingsForm groups={groups} />

      <h2 className="mt-12 text-xl font-semibold tracking-tight">Shop details on invoices</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Printed on invoices, receipts and labels. Empty fields are left off. Prices always include
        VAT; the BIN and the VAT share print only when switched on.
      </p>
      <CheckoutSettingsForm
        testId="store-settings-form"
        submitLabel="Save shop details"
        save={saveStoreSettingsAction}
        groups={[
          {
            title: "Shop",
            rows: storeRows(["nameEn", "nameBn", "addressEn", "addressBn", "logoUrl"]),
          },
          {
            title: "VAT on invoices",
            rows: storeRows(["vatEnabled", "vatRatePercent", "vatBin", "vatShowBreakdown"]),
          },
        ]}
      />
    </div>
  );
}
