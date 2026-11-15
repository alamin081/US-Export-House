import "server-only";

import { env } from "@/config/env";
import { AppError } from "@/lib/errors";
import { formatTakaInput, parseTakaInput } from "@/lib/money";
import { hasPermission, type StaffContext } from "@/modules/access/authorization";
import type { PermissionKey } from "@/modules/access/permissions";
import { AUDIT_ACTIONS, recordAudit, type RequestMeta } from "@/modules/audit/audit.service";
import {
  SETTING_DEFINITIONS,
  SETTING_GROUPS,
  listValues,
  settingDefinition,
  toStored,
  type SettingDefinition,
  type SettingGroup,
} from "./settings.registry";
import { findSettingRows, upsertSettingRows, type SettingWrite } from "./settings.repository";

/**
 * The Settings page (Phase 12): every setting in one place, grouped, each
 * validated by its own module's rules, audited before/after, and refreshing
 * the caches it feeds. Secrets are never settings — only whether an
 * integration is configured is shown.
 */

const PAGE_PERMISSIONS: readonly PermissionKey[] = [
  "settings.write",
  "checkout.settings",
  "content.write",
];

function invalid(message: string, field?: string) {
  return new AppError("VALIDATION_FAILED", message, {
    details: field === undefined ? {} : { field },
  });
}

export function canOpenSettings(staff: StaffContext): boolean {
  return PAGE_PERMISSIONS.some((permission) => hasPermission(staff, permission));
}

export function canEditSetting(staff: StaffContext, definition: SettingDefinition): boolean {
  return (
    definition.editedAt === undefined &&
    definition.permissions.some((permission) => hasPermission(staff, permission))
  );
}

/** Stored text as the form shows it (money in taka). */
function toInput(definition: SettingDefinition, stored: string): string {
  if (definition.kind === "money") {
    const poisha = Number(stored);
    return Number.isFinite(poisha) ? formatTakaInput(poisha) : stored;
  }
  return stored;
}

export interface SettingView {
  key: string;
  kind: SettingDefinition["kind"];
  label: { en: string; bn: string };
  help: { en: string; bn: string };
  unit: string | null;
  options: ReadonlyArray<{ value: string; label: string }>;
  value: string;
  /** Chosen values of a list setting. */
  selected: string[];
  defaultValue: string;
  isDefault: boolean;
  editable: boolean;
  editedAt: { href: string; label: string } | null;
  updatedAt: string | null;
  updatedBy: string | null;
}

export async function getSettingsPage(staff: StaffContext) {
  if (!canOpenSettings(staff)) {
    throw new AppError("FORBIDDEN", "Missing permission settings.write", {
      messageKey: "errors.forbidden",
    });
  }
  const rows = new Map(
    (await findSettingRows(SETTING_DEFINITIONS.map((definition) => definition.key))).map((row) => [
      row.key,
      row,
    ]),
  );
  const groups = SETTING_GROUPS.map((group) => {
    const settings: SettingView[] = SETTING_DEFINITIONS.filter(
      (definition) => definition.group === group.key,
    ).map((definition) => {
      const row = rows.get(definition.key);
      const stored = row?.value ?? definition.defaultValue;
      // A stored value that no longer passes the rules counts as the default.
      const valid = definition.parser.safeParse(stored).success;
      const current = valid ? stored : definition.defaultValue;
      return {
        key: definition.key,
        kind: definition.kind,
        label: definition.label,
        help: definition.help,
        unit: definition.unit ?? null,
        options: definition.options ?? [],
        value: toInput(definition, current),
        selected: definition.kind === "multi" ? listValues(definition, current) : [],
        defaultValue: toInput(definition, definition.defaultValue),
        isDefault: current === definition.defaultValue,
        editable: canEditSetting(staff, definition),
        editedAt: definition.editedAt ?? null,
        updatedAt: row?.updatedAt.toISOString() ?? null,
        updatedBy: row?.updatedBy?.name ?? row?.updatedBy?.email ?? null,
      };
    });
    return { ...group, settings, editable: settings.some((setting) => setting.editable) };
  }).filter((group) =>
    // A pointer to another screen shows only to staff who may change it there.
    group.settings.some(
      (setting) =>
        setting.editable ||
        (setting.editedAt !== null &&
          settingDefinition(setting.key)?.permissions.some((key) => hasPermission(staff, key))),
    ),
  );
  return { groups, status: integrationStatus() };
}

/** Turns what the form sent into the stored text, or throws a field error. */
export function storedFromInput(definition: SettingDefinition, raw: unknown): string {
  let text: string;
  if (definition.kind === "multi") {
    const values = Array.isArray(raw)
      ? raw.map(String)
      : String(raw ?? "")
          .split(",")
          .filter(Boolean);
    text = definition.listFormat === "csv" ? values.join(",") : JSON.stringify(values);
  } else if (definition.kind === "bool") {
    text = raw === true || raw === "true" || raw === "on" ? "true" : "false";
  } else if (definition.kind === "money") {
    const poisha = parseTakaInput(String(raw ?? "").trim());
    if (poisha === null)
      throw invalid(`${definition.label.en}: enter an amount in taka.`, definition.key);
    text = String(poisha);
  } else if (definition.kind === "json") {
    const source = String(raw ?? "").trim();
    try {
      text = JSON.stringify(JSON.parse(source));
    } catch {
      throw invalid(`${definition.label.en}: this is not valid JSON.`, definition.key);
    }
  } else {
    text = String(raw ?? "").trim();
  }
  const parsed = definition.parser.safeParse(text);
  if (!parsed.success) throw invalid(`${definition.label.en}: not a valid value.`, definition.key);
  // Store the normalised form (e.g. "7" not "07").
  if (definition.kind === "text" || definition.kind === "textarea") return text;
  if (definition.kind === "multi" && definition.listFormat === "csv") {
    return (parsed.data as string[]).join(",");
  }
  return toStored(parsed.data);
}

function valueType(definition: SettingDefinition): SettingWrite["valueType"] {
  if (definition.kind === "bool") return "BOOLEAN";
  if (definition.kind === "money" || definition.kind === "int" || definition.kind === "percent") {
    return "INT";
  }
  if (definition.kind === "json" || definition.kind === "multi") return "JSON";
  return "STRING";
}

/**
 * Saves the changed settings of one group. Every value is checked before
 * anything is written; one bad value saves nothing. Returns the cache tags
 * to refresh.
 */
export async function saveSettings(
  staff: StaffContext,
  group: SettingGroup,
  values: Record<string, unknown>,
  meta: RequestMeta,
): Promise<{ changed: string[]; tags: string[] }> {
  const keys = Object.keys(values);
  const definitions = keys.map((key) => {
    const definition = settingDefinition(key);
    if (definition === undefined || definition.group !== group) {
      throw invalid(`Unknown setting ${key}.`, key);
    }
    if (!canEditSetting(staff, definition)) {
      throw new AppError("FORBIDDEN", `You may not change ${definition.label.en}.`, {
        messageKey: "errors.forbidden",
      });
    }
    return definition;
  });
  const current = new Map((await findSettingRows(keys)).map((row) => [row.key, row.value]));
  const writes: SettingWrite[] = [];
  const before: Record<string, string> = {};
  const after: Record<string, string> = {};
  for (const definition of definitions) {
    const stored = storedFromInput(definition, values[definition.key]);
    const previous = current.get(definition.key) ?? definition.defaultValue;
    if (stored === previous) continue;
    before[definition.key] = previous;
    after[definition.key] = stored;
    writes.push({
      key: definition.key,
      value: stored,
      valueType: valueType(definition),
      group: definition.group,
      labelEn: definition.label.en,
    });
  }
  if (writes.length === 0) return { changed: [], tags: [] };
  await upsertSettingRows(writes, staff.userId);
  await recordAudit({
    actorUserId: staff.userId,
    action: AUDIT_ACTIONS.settingsChanged,
    entityType: "setting",
    entityId: writes.map((write) => write.key).join(","),
    before,
    after,
    meta,
  });
  const tags = new Set<string>();
  for (const definition of definitions) {
    if (writes.some((write) => write.key === definition.key)) {
      for (const tag of definition.tags) tags.add(tag);
    }
  }
  return { changed: writes.map((write) => write.key), tags: [...tags] };
}

/** Puts one setting back to its default (saved as a value, audited). */
export async function resetSetting(staff: StaffContext, key: string, meta: RequestMeta) {
  const definition = settingDefinition(key);
  if (definition === undefined) throw invalid(`Unknown setting ${key}.`, key);
  const raw =
    definition.kind === "money"
      ? formatTakaInput(Number(definition.defaultValue))
      : definition.kind === "multi"
        ? listValues(definition, definition.defaultValue)
        : definition.defaultValue;
  return saveSettings(staff, definition.group, { [key]: raw }, meta);
}

/** Whether integrations are set up — yes/no only, never a value. */
export function integrationStatus() {
  const cloudinary =
    env.STORAGE_PROVIDER === "cloudinary" &&
    Boolean(env.CLOUDINARY_CLOUD_NAME) &&
    Boolean(env.CLOUDINARY_API_KEY) &&
    Boolean(env.CLOUDINARY_API_SECRET);
  return [
    { name: "Environment", value: env.APP_ENV, ok: true },
    {
      name: "Image storage (Cloudinary)",
      value: cloudinary
        ? "Connected"
        : env.STORAGE_PROVIDER === "local"
          ? "Test storage"
          : "Not connected",
      ok: cloudinary,
    },
    { name: "Database", value: "Connected", ok: true },
    {
      name: "SMS",
      value: env.SMS_PROVIDER === "dev" ? "Not connected (development)" : "Connected",
      ok: env.SMS_PROVIDER !== "dev" && Boolean(env.SMS_API_KEY),
    },
    {
      name: "Online payment (SSLCOMMERZ)",
      value:
        env.PAYMENT_SSLCOMMERZ_MODE === "disabled" ? "Off (Phase 10)" : env.PAYMENT_SSLCOMMERZ_MODE,
      ok: env.PAYMENT_SSLCOMMERZ_MODE === "live",
    },
    {
      name: "Courier (Steadfast)",
      value:
        env.COURIER_STEADFAST_MODE === "mock"
          ? "Typed in by hand (Phase 11)"
          : env.COURIER_STEADFAST_MODE,
      ok: env.COURIER_STEADFAST_MODE === "live",
    },
  ];
}
