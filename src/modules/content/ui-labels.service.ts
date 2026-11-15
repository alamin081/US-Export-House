import "server-only";

import { unstable_cache } from "next/cache";
import { createTranslator } from "next-intl";
import { z } from "zod";

import { AppError } from "@/lib/errors";
import {
  defaultLabel,
  EDITABLE_LABELS,
  isEditableLabel,
  labelArguments,
  labelProblem,
  type Messages,
} from "@/i18n/editable-labels";
import { assertPermission, hasPermission, type StaffContext } from "@/modules/access/authorization";
import { AUDIT_ACTIONS, recordAudit, type RequestMeta } from "@/modules/audit/audit.service";
import en from "@/i18n/messages/en.json";
import bn from "@/i18n/messages/bn.json";
import { CONTENT_REVALIDATE_SECONDS, CONTENT_TAGS } from "./cache-tags";
import {
  deleteLabelOverride,
  findLabelOverrides,
  findUserNames,
  upsertLabelOverride,
} from "./content.repository";

/**
 * Rewording storefront UI labels (Phase 12). Editors with content.write may
 * look; saving goes live at once, so it needs content.publish. Only
 * allowlisted keys, with the same {placeholders} and plural shape as the
 * original, and never any markup. Clearing an override restores the code's
 * label.
 */

const DEFAULTS: Record<"en" | "bn", Messages> = { en: en as Messages, bn: bn as Messages };

/** Overrides for one language, cached until a label changes. */
export const cachedLabelOverrides = unstable_cache(
  async (locale: string) =>
    (await findLabelOverrides(locale)).map((row) => ({ key: row.key, value: row.value })),
  ["ui-label-overrides"],
  { tags: [CONTENT_TAGS.labels], revalidate: CONTENT_REVALIDATE_SECONDS },
);

export async function listLabels(staff: StaffContext) {
  assertPermission(staff, "content.write");
  const overrides = await findLabelOverrides();
  const names = await findUserNames(
    overrides.flatMap((row) => (row.updatedById === null ? [] : [row.updatedById])),
  );
  const byKey = new Map(overrides.map((row) => [`${row.locale}:${row.key}`, row]));
  return {
    canSave: hasPermission(staff, "content.publish"),
    labels: EDITABLE_LABELS.map((label) => {
      const view = (locale: "en" | "bn") => {
        const row = byKey.get(`${locale}:${label.key}`);
        return {
          original: defaultLabel(DEFAULTS[locale], label.key) ?? "",
          override: row?.value ?? null,
          updatedBy: row?.updatedById == null ? null : (names.get(row.updatedById) ?? null),
        };
      };
      return {
        key: label.key,
        where: label.where,
        placeholders: labelArguments(defaultLabel(DEFAULTS.en, label.key) ?? ""),
        en: view("en"),
        bn: view("bn"),
      };
    }),
  };
}

const saveSchema = z.object({
  key: z.string().min(3).max(80),
  locale: z.enum(["en", "bn"]),
  value: z.string().max(1000),
});

/** Checks the label really formats with next-intl, with sample values. */
function formatsCleanly(locale: "en" | "bn", text: string, args: readonly string[]): boolean {
  try {
    const t = createTranslator({
      locale,
      messages: { Check: { label: text } },
      onError: (error) => {
        throw error;
      },
    });
    t("Check.label", Object.fromEntries(args.map((name) => [name, 2])));
    return true;
  } catch {
    return false;
  }
}

export async function saveLabel(staff: StaffContext, raw: unknown, meta: RequestMeta) {
  assertPermission(staff, "content.publish");
  const input = saveSchema.parse(raw);
  if (!isEditableLabel(input.key))
    throw new AppError("FORBIDDEN", "This label cannot be changed here.");
  const original = defaultLabel(DEFAULTS[input.locale], input.key);
  if (original === undefined) throw new AppError("NOT_FOUND", "Unknown label.");
  const before =
    (await findLabelOverrides(input.locale)).find((row) => row.key === input.key)?.value ?? null;
  const value = input.value.trim();
  if (value === "" || value === original) {
    await deleteLabelOverride(input.locale, input.key);
  } else {
    const problem = labelProblem(original, value);
    if (problem !== null)
      throw new AppError("VALIDATION_FAILED", problem, { details: { field: input.key } });
    if (!formatsCleanly(input.locale, value, labelArguments(original))) {
      throw new AppError(
        "VALIDATION_FAILED",
        "The label's {placeholder} or plural form is broken.",
        {
          details: { field: input.key },
        },
      );
    }
    await upsertLabelOverride(input.locale, input.key, value, staff.userId);
  }
  await recordAudit({
    actorUserId: staff.userId,
    action: AUDIT_ACTIONS.labelsChanged,
    entityType: "ui_label",
    entityId: `${input.locale}:${input.key}`,
    before: { value: before ?? original, overridden: before !== null },
    after: {
      value: value === "" ? original : value,
      overridden: value !== "" && value !== original,
    },
    meta,
  });
}
