"use client";

import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { FieldHint, Label } from "@/components/ui/label";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { formatDate } from "@/lib/datetime";
import { requestReturnAction } from "@/modules/returns/returns.actions";
import type { CustomerReturnOptions } from "@/modules/returns/returns.service";

const control =
  "h-11 w-full rounded-md border border-input bg-card px-3 text-sm disabled:cursor-not-allowed disabled:opacity-60";

/**
 * Return or exchange request after the order was looked up. The server
 * checks everything again (window, phone, quantities, stock) and limits tries.
 */
export function ReturnRequestForm({
  options,
  phone,
  showPolicy,
}: {
  options: CustomerReturnOptions;
  phone: string;
  showPolicy: boolean;
}) {
  const t = useTranslations("ReturnRequest");
  const locale = useLocale() as Locale;
  const bn = locale === "bn";
  const [type, setType] = useState<"RETURN" | "EXCHANGE">("RETURN");
  const [reasonCode, setReasonCode] = useState("");
  const [reason, setReason] = useState("");
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [replacements, setReplacements] = useState<Record<string, string>>({});
  const [files, setFiles] = useState<File[]>([]);
  const [sent, setSent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (sent !== null) {
    return (
      <p
        className="mt-8 rounded-md border border-success bg-success/10 p-4 text-sm"
        role="status"
        data-testid="return-sent"
      >
        {t("sent", { reference: sent })}
      </p>
    );
  }

  return (
    <form
      className="mt-8 flex flex-col gap-5 border-t border-border pt-6"
      data-testid="return-request-form"
      onSubmit={(event) => {
        event.preventDefault();
        setError(null);
        const form = new FormData();
        form.set(
          "payload",
          JSON.stringify({
            token: options.token,
            phone,
            type,
            reasonCode,
            reason,
            items: options.items
              .filter((item) => (quantities[item.orderItemId] ?? 0) > 0)
              .map((item) => ({
                orderItemId: item.orderItemId,
                quantity: quantities[item.orderItemId],
                exchangeVariantId:
                  type === "EXCHANGE" ? (replacements[item.orderItemId] ?? "") : "",
              })),
          }),
        );
        for (const file of files.slice(0, options.maxPhotos)) form.append("photos", file);
        startTransition(async () => {
          const result = await requestReturnAction(form);
          if (result.ok) setSent(result.reference);
          else setError(result.message ?? t(`error${result.error}`));
        });
      }}
    >
      <div>
        <h3 className="text-lg font-semibold">{t("heading")}</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("intro", { date: formatDate(options.windowEndsAt, locale) })}{" "}
          {showPolicy ? (
            <Link href="/shipping-returns" className="underline underline-offset-2">
              {t("policyLink")}
            </Link>
          ) : null}
        </p>
      </div>

      <fieldset className="flex flex-col gap-2 text-sm">
        <legend className="mb-1 font-medium">{t("typeLabel")}</legend>
        {(["RETURN", "EXCHANGE"] as const).map((value) => (
          <label key={value} className="flex items-center gap-2">
            <input
              type="radio"
              name="returnType"
              value={value}
              checked={type === value}
              onChange={() => setType(value)}
            />
            {t(`type${value}`)}
          </label>
        ))}
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 text-sm font-medium">{t("itemsLabel")}</legend>
        {options.items.map((item) => (
          <div key={item.orderItemId} className="rounded-md border border-border p-3 text-sm">
            <p className="font-medium">
              {bn ? (item.nameBn ?? item.nameEn) : item.nameEn}
              <span className="ms-1 text-muted-foreground">
                {[item.sizeEn, item.colourEn].filter(Boolean).join(" · ")}
              </span>
            </p>
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                {t("quantityLabel")}
                <select
                  className={control}
                  data-testid="return-quantity"
                  value={quantities[item.orderItemId] ?? 0}
                  onChange={(event) =>
                    setQuantities((current) => ({
                      ...current,
                      [item.orderItemId]: Number(event.target.value),
                    }))
                  }
                >
                  {Array.from({ length: item.returnable + 1 }, (_, count) => (
                    <option key={count} value={count}>
                      {count}
                    </option>
                  ))}
                </select>
              </label>
              {type === "EXCHANGE" ? (
                <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                  {t("replaceWith")}
                  {item.exchangeOptions.length === 0 ? (
                    <span className="text-sm text-foreground">{t("noOptions")}</span>
                  ) : (
                    <select
                      className={control}
                      data-testid="return-replacement"
                      value={replacements[item.orderItemId] ?? ""}
                      onChange={(event) =>
                        setReplacements((current) => ({
                          ...current,
                          [item.orderItemId]: event.target.value,
                        }))
                      }
                    >
                      <option value="">{t("choose")}</option>
                      {item.exchangeOptions.map((option) => (
                        <option key={option.variantId} value={option.variantId}>
                          {bn ? (option.labelBn ?? option.labelEn) : option.labelEn}
                        </option>
                      ))}
                    </select>
                  )}
                </label>
              ) : null}
            </div>
          </div>
        ))}
      </fieldset>

      <div>
        <Label htmlFor="returnReason" required>
          {t("reasonLabel")}
        </Label>
        <select
          id="returnReason"
          className={control}
          value={reasonCode}
          onChange={(event) => setReasonCode(event.target.value)}
        >
          <option value="">{t("choose")}</option>
          {options.reasons.map((value) => (
            <option key={value} value={value}>
              {t(`reason${value}`)}
            </option>
          ))}
        </select>
      </div>
      <div>
        <Label htmlFor="returnDetails">{t("detailsLabel")}</Label>
        <textarea
          id="returnDetails"
          rows={2}
          maxLength={500}
          className="w-full rounded-md border border-input bg-card px-3 py-2 text-sm"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
      </div>
      {options.maxPhotos > 0 ? (
        <div>
          <Label htmlFor="returnPhotos">{t("photosLabel", { count: options.maxPhotos })}</Label>
          <input
            id="returnPhotos"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            className="text-sm"
            onChange={(event) =>
              setFiles(Array.from(event.target.files ?? []).slice(0, options.maxPhotos))
            }
          />
        </div>
      ) : null}
      {error === null ? null : (
        <FieldHint tone="error" role="alert" data-testid="return-error">
          {error}
        </FieldHint>
      )}
      <div>
        <Button type="submit" disabled={pending || reasonCode === ""} data-testid="return-submit">
          {t("submit")}
        </Button>
      </div>
    </form>
  );
}
