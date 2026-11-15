"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Save, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { FieldHint, Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  deleteCouponAction,
  saveCouponAction,
} from "@/modules/checkout-admin/checkout-admin.actions";
import { TextField } from "../catalogue/fields";

export interface CouponFormValue {
  code: string;
  type: "PERCENTAGE" | "FIXED" | "FREE_SHIPPING";
  value: string;
  labelEn: string;
  labelBn: string;
  minSubtotal: string;
  maxDiscount: string;
  startsAt: string;
  endsAt: string;
  usageLimit: string;
  usageLimitPerCustomer: string;
  isActive: boolean;
  includeCategoryIds: string[];
  excludeCategoryIds: string[];
  includeProductSlugs: string;
  excludeProductSlugs: string;
}

export const EMPTY_COUPON: CouponFormValue = {
  code: "",
  type: "PERCENTAGE",
  value: "10",
  labelEn: "",
  labelBn: "",
  minSubtotal: "",
  maxDiscount: "",
  startsAt: "",
  endsAt: "",
  usageLimit: "",
  usageLimitPerCustomer: "1",
  isActive: true,
  includeCategoryIds: [],
  excludeCategoryIds: [],
  includeProductSlugs: "",
  excludeProductSlugs: "",
};

/** Create or edit a coupon. Amounts are typed in taka; times are Bangladesh time. */
export function CouponForm({
  id,
  initial,
  categories,
  usedCount,
}: {
  id: string | null;
  initial: CouponFormValue;
  categories: ReadonlyArray<{ id: string; nameEn: string }>;
  usedCount: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [value, setValue] = useState(initial);
  const [message, setMessage] = useState<{ ok: boolean; text: string; field?: string } | null>(
    null,
  );
  const set = <K extends keyof CouponFormValue>(key: K, next: CouponFormValue[K]) =>
    setValue((current) => ({ ...current, [key]: next }));
  const errorFor = (field: string) =>
    message?.ok === false && message.field === field ? message.text : undefined;
  const toggle = (key: "includeCategoryIds" | "excludeCategoryIds", categoryId: string) =>
    set(
      key,
      value[key].includes(categoryId)
        ? value[key].filter((item) => item !== categoryId)
        : [...value[key], categoryId],
    );

  const save = () =>
    startTransition(async () => {
      const result = await saveCouponAction(id, value);
      if (result.status === "success") {
        setMessage({ ok: true, text: result.message });
        if (id === null && result.id !== undefined) router.push(`/admin/coupons/${result.id}`);
        else router.refresh();
      } else if (result.status === "error") {
        setMessage({
          ok: false,
          text: result.message,
          ...(result.field === undefined ? {} : { field: result.field }),
        });
      }
    });

  const remove = () =>
    startTransition(async () => {
      const result = await deleteCouponAction(id ?? "");
      if (result.status === "success") router.push("/admin/coupons");
      else if (result.status === "error") setMessage({ ok: false, text: result.message });
    });

  return (
    <form
      className="flex flex-col gap-8"
      onSubmit={(event) => {
        event.preventDefault();
        save();
      }}
      data-testid="coupon-form"
    >
      <section className="grid gap-5 sm:grid-cols-2">
        <TextField
          label="Code"
          name="code"
          required
          value={value.code}
          onChange={(next) => set("code", next.toUpperCase())}
          error={errorFor("code")}
          hint={usedCount > 0 ? "Used coupons keep their code." : "Letters and digits, e.g. EID15."}
          disabled={usedCount > 0}
        />
        <div>
          <Label htmlFor="coupon-type" required>
            Type
          </Label>
          <Select
            id="coupon-type"
            value={value.type}
            onChange={(event) => set("type", event.target.value as CouponFormValue["type"])}
          >
            <option value="PERCENTAGE">Percentage off</option>
            <option value="FIXED">Fixed amount off (taka)</option>
            <option value="FREE_SHIPPING">Free delivery</option>
          </Select>
        </div>
        {value.type === "FREE_SHIPPING" ? null : (
          <TextField
            label={value.type === "PERCENTAGE" ? "Percent" : "Amount (taka)"}
            name="value"
            required
            inputMode="decimal"
            value={value.value}
            onChange={(next) => set("value", next)}
            error={errorFor("value")}
          />
        )}
        {value.type === "PERCENTAGE" ? (
          <TextField
            label="Largest discount (taka, optional)"
            name="maxDiscount"
            inputMode="decimal"
            value={value.maxDiscount}
            onChange={(next) => set("maxDiscount", next)}
            error={errorFor("maxDiscount")}
          />
        ) : null}
        <TextField
          label="Minimum of eligible items (taka, optional)"
          name="minSubtotal"
          inputMode="decimal"
          value={value.minSubtotal}
          onChange={(next) => set("minSubtotal", next)}
          error={errorFor("minSubtotal")}
          hint="Counted on the items the coupon applies to."
        />
        <TextField
          label="Label (English)"
          name="labelEn"
          value={value.labelEn}
          onChange={(next) => set("labelEn", next)}
        />
        <TextField
          label="Label (Bengali)"
          name="labelBn"
          lang="bn"
          value={value.labelBn}
          onChange={(next) => set("labelBn", next)}
        />
      </section>

      <section className="grid gap-5 sm:grid-cols-2">
        <TextField
          label="Starts (Bangladesh time, optional)"
          name="startsAt"
          type="datetime-local"
          value={value.startsAt}
          onChange={(next) => set("startsAt", next)}
          error={errorFor("startsAt")}
        />
        <TextField
          label="Ends (Bangladesh time, optional)"
          name="endsAt"
          type="datetime-local"
          value={value.endsAt}
          onChange={(next) => set("endsAt", next)}
          error={errorFor("endsAt")}
        />
        <TextField
          label="Total uses (optional)"
          name="usageLimit"
          inputMode="numeric"
          value={value.usageLimit}
          onChange={(next) => set("usageLimit", next)}
          error={errorFor("usageLimit")}
        />
        <TextField
          label="Uses per phone number (optional)"
          name="usageLimitPerCustomer"
          inputMode="numeric"
          value={value.usageLimitPerCustomer}
          onChange={(next) => set("usageLimitPerCustomer", next)}
          error={errorFor("usageLimitPerCustomer")}
          hint="Cancelled orders do not count."
        />
      </section>

      <section className="grid gap-5 lg:grid-cols-2">
        {(["includeCategoryIds", "excludeCategoryIds"] as const).map((key) => (
          <fieldset key={key} className="rounded-lg border border-border p-4">
            <legend className="px-1 text-sm font-medium">
              {key === "includeCategoryIds"
                ? "Only these categories (none ticked: every category)"
                : "Never these categories"}
            </legend>
            <div className="mt-2 grid max-h-56 gap-1.5 overflow-y-auto sm:grid-cols-2">
              {categories.map((category) => (
                <label key={category.id} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={value[key].includes(category.id)}
                    onChange={() => toggle(key, category.id)}
                  />
                  {category.nameEn}
                </label>
              ))}
            </div>
          </fieldset>
        ))}
        <div>
          <Label htmlFor="include-products">Only these products (slugs, optional)</Label>
          <Textarea
            id="include-products"
            rows={2}
            value={value.includeProductSlugs}
            onChange={(event) => set("includeProductSlugs", event.target.value)}
            aria-invalid={errorFor("includeProductSlugs") !== undefined || undefined}
          />
          {errorFor("includeProductSlugs") === undefined ? (
            <FieldHint>Separate with commas or spaces.</FieldHint>
          ) : (
            <FieldHint tone="error">{errorFor("includeProductSlugs")}</FieldHint>
          )}
        </div>
        <div>
          <Label htmlFor="exclude-products">Never these products (slugs, optional)</Label>
          <Textarea
            id="exclude-products"
            rows={2}
            value={value.excludeProductSlugs}
            onChange={(event) => set("excludeProductSlugs", event.target.value)}
          />
        </div>
      </section>

      <label className="flex items-center gap-2 text-sm">
        <Checkbox
          checked={value.isActive}
          onChange={(event) => set("isActive", event.target.checked)}
        />
        Active (customers can use it)
      </label>

      {message === null ? null : (
        <p
          role={message.ok ? "status" : "alert"}
          className={message.ok ? "text-sm text-success" : "text-sm text-destructive"}
          data-testid="coupon-message"
        >
          {message.text}
        </p>
      )}

      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={pending} data-testid="save-coupon">
          {pending ? (
            <Loader2 aria-hidden="true" className="animate-spin" />
          ) : (
            <Save aria-hidden="true" />
          )}
          Save coupon
        </Button>
        {id === null || usedCount > 0 ? null : (
          <Button type="button" variant="outline" disabled={pending} onClick={remove}>
            <Trash2 aria-hidden="true" />
            Delete
          </Button>
        )}
      </div>
    </form>
  );
}
