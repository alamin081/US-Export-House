import { formatTakaInput } from "@/lib/money";
import { requireStaffPage } from "@/modules/access/access.service";
import {
  CHECKOUT_SETTING_LABELS,
  getCheckoutSettingsForStaff,
  isMoneySetting,
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
  const settings = await forPage(getCheckoutSettingsForStaff(staff));

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
    </div>
  );
}
