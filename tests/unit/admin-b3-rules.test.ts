import { describe, expect, it } from "vitest";

import en from "@/i18n/messages/en.json";
import bn from "@/i18n/messages/bn.json";
import {
  applyLabelOverrides,
  defaultLabel,
  EDITABLE_LABELS,
  isEditableLabel,
  labelArguments,
  labelProblem,
  type Messages,
} from "@/i18n/editable-labels";
import { PERMISSION_DESCRIPTIONS, PERMISSIONS } from "@/modules/access/permissions";
import { auditDiff, maskPhone, maskPhones } from "@/modules/audit/audit-view";
import { CATALOG_SETTING_KEYS } from "@/modules/settings/catalog-settings";
import { CHECKOUT_SETTING_KEYS } from "@/modules/settings/checkout-settings";
import { INVENTORY_SETTING_KEYS } from "@/modules/settings/inventory-settings";
import { ORDER_SETTING_KEYS } from "@/modules/settings/order-settings";
import { POS_SETTING_KEYS } from "@/modules/settings/pos-settings";
import { REPORT_SETTING_KEYS } from "@/modules/settings/report-settings";
import { RETURNS_SETTING_KEYS } from "@/modules/settings/returns-settings";
import {
  DEPRECATED_SETTING_KEYS,
  listValues,
  SETTING_DEFINITIONS,
} from "@/modules/settings/settings.registry";
import { SITE_SETTING_KEYS } from "@/modules/settings/site-settings";
import { STORE_SETTING_KEYS } from "@/modules/settings/store-settings";

describe("settings registry", () => {
  const codeKeys = [
    CATALOG_SETTING_KEYS,
    CHECKOUT_SETTING_KEYS,
    INVENTORY_SETTING_KEYS,
    ORDER_SETTING_KEYS,
    POS_SETTING_KEYS,
    REPORT_SETTING_KEYS,
    RETURNS_SETTING_KEYS,
    SITE_SETTING_KEYS,
    STORE_SETTING_KEYS,
  ].flatMap((keys) => Object.values(keys));

  it("lists every setting the code reads (deprecated ones excepted), once", () => {
    const listed = SETTING_DEFINITIONS.map((definition) => definition.key);
    expect(new Set(listed).size).toBe(listed.length);
    const missing = [...new Set(codeKeys)].filter(
      (key) =>
        !listed.includes(key) && !(DEPRECATED_SETTING_KEYS as readonly string[]).includes(key),
    );
    expect(missing).toEqual([]);
    for (const key of DEPRECATED_SETTING_KEYS) expect(listed).not.toContain(key);
  });

  it("has defaults that pass their own rules", () => {
    for (const definition of SETTING_DEFINITIONS) {
      expect(definition.parser.safeParse(definition.defaultValue).success, definition.key).toBe(
        true,
      );
    }
  });

  it("never stores a secret", () => {
    for (const definition of SETTING_DEFINITIONS) {
      expect(definition.key).not.toMatch(/secret|password|token|api_?key|credential/i);
    }
  });

  it("keeps the owner's defaults", () => {
    const value = (key: string) =>
      SETTING_DEFINITIONS.find((entry) => entry.key === key)?.defaultValue;
    expect(value("footer.paymentMethods")).toBe('["COD"]');
    expect(value("dashboard.staleShipmentDays")).toBe("5");
    expect(value("dashboard.codOverdueDays")).toBe("7");
    expect(value("reports.weekStartsOn")).toBe("6");
    expect(listValues({ listFormat: "csv" }, value("orders.couriers")!)).toContain("STEADFAST");
  });

  it("lets content editors change store details and social links, not VAT or refunds", () => {
    const byKey = (key: string) => SETTING_DEFINITIONS.find((entry) => entry.key === key)!;
    expect(byKey("store.whatsapp").permissions).toContain("content.write");
    expect(byKey("social.facebookUrl").permissions).toContain("content.write");
    expect(byKey("vat.enabled").permissions).not.toContain("content.write");
    expect(byKey("refund.approvalAbovePoisha").permissions).toEqual(["settings.write"]);
  });
});

describe("permission descriptions", () => {
  it("describe every permission in both languages", () => {
    for (const key of PERMISSIONS) {
      expect(PERMISSION_DESCRIPTIONS[key].en.length, key).toBeGreaterThan(5);
      expect(PERMISSION_DESCRIPTIONS[key].bn.length, key).toBeGreaterThan(2);
    }
  });
});

describe("storefront label overrides", () => {
  it("only allow keys that exist in both languages", () => {
    for (const label of EDITABLE_LABELS) {
      expect(defaultLabel(en as Messages, label.key), label.key).toBeTypeOf("string");
      expect(defaultLabel(bn as Messages, label.key), label.key).toBeTypeOf("string");
    }
  });

  it("lock checkout, payment, order and policy wording", () => {
    for (const label of EDITABLE_LABELS) {
      expect(label.key).not.toMatch(
        /^(Checkout|CartErrors|errors|OrderView|ReturnRequest|Policy)\./,
      );
    }
    expect(isEditableLabel("Checkout.placeOrder")).toBe(false);
  });

  it("apply allowed overrides and ignore the rest", () => {
    const merged = applyLabelOverrides(en as Messages, [
      { key: "Home.newArrivalsTitle", value: "Just in" },
      { key: "Checkout.title", value: "Hacked" },
      { key: "Home.doesNotExist", value: "x" },
    ]);
    expect(merged.Home?.newArrivalsTitle).toBe("Just in");
    expect(merged.Checkout).toBe((en as Messages).Checkout);
    expect(merged.Home?.doesNotExist).toBeUndefined();
    // The original messages are untouched.
    expect((en as Messages).Home?.newArrivalsTitle).toBe("New arrivals");
  });

  it("keep placeholders and plural forms intact", () => {
    expect(labelArguments("Results for “{query}”")).toEqual(["query"]);
    expect(
      labelArguments(
        "{count, plural, =0 {No products} one {{countText} product} other {{countText} products}}",
      ),
    ).toEqual(["count", "countText"]);
    expect(labelProblem("Results for “{query}”", "Found: {query}")).toBeNull();
    expect(labelProblem("Results for “{query}”", "Found something")).toMatch(/\{query\}/);
    expect(labelProblem("New arrivals", "New {stuff}")).toMatch(/no \{placeholders\}/);
    expect(labelProblem("New arrivals", "<b>New</b>")).toMatch(/< or >/);
    expect(labelProblem("New arrivals", "x".repeat(41))).toMatch(/under 40/);
    expect(
      labelProblem(
        "{count, plural, one {{countText} item} other {{countText} items}}",
        "{count, plural, one {{countText} piece}}",
      ),
    ).toMatch(/plural/);
  });
});

describe("audit display", () => {
  it("masks Bangladeshi phone numbers wherever they appear", () => {
    expect(maskPhone("01712345678")).toBe("017•••••678");
    expect(maskPhone("+8801812345678")).toBe("018•••••678");
    expect(maskPhone("call 01712345678 now")).toBe("call 017•••••678 now");
    expect(maskPhones({ customer: { phone: "01912345678" }, total: 500 })).toEqual({
      customer: { phone: "019•••••678" },
      total: 500,
    });
    expect(maskPhone("UEH-2611-00001")).toBe("UEH-2611-00001");
  });

  it("shows a field-by-field difference", () => {
    const rows = auditDiff({ value: "7", kept: true }, { value: "10", kept: true, added: "x" });
    expect(rows).toEqual([
      { path: "added", before: null, after: "x", change: "added" },
      { path: "kept", before: "true", after: "true", change: "same" },
      { path: "value", before: "7", after: "10", change: "changed" },
    ]);
  });
});
