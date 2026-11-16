/**
 * Access-control and settings reference data (staging, and later production):
 *
 *   - the seven system roles, each with its permission keys, exactly as
 *     src/modules/access/permissions.ts defines them (the code that checks
 *     permissions reads the same list, so the two cannot drift);
 *   - one Setting row per key the admin Settings page knows
 *     (src/modules/settings/settings.registry.ts), holding the code default.
 *
 * There is no Permission or RolePermission table: a role stores its keys in
 * `Role.permissions` (String[]), and the keys themselves live in code.
 *
 * CREATE-ONLY and pure: `planAccessAndSettings` only works out what is
 * missing. A role or setting that already exists (by unique name or key) is
 * never changed, so values edited in the admin are safe and running it again
 * creates nothing. No users, products, customers or orders are touched.
 */
import { SYSTEM_ROLES } from "../../src/modules/access/permissions";
import {
  DEPRECATED_SETTING_KEYS,
  SETTING_DEFINITIONS,
  settingValueType,
} from "../../src/modules/settings/settings.registry";

export interface RoleRow {
  name: string;
  description: string;
  permissions: string[];
  allLocations: boolean;
  isSystem: true;
}

export interface SettingRow {
  key: string;
  valueType: "STRING" | "INT" | "BOOLEAN" | "JSON";
  value: string;
  group: string;
  labelEn: string;
  labelBn: string | null;
  description: string | null;
  isPublic: false;
}

export interface ExistingRole {
  name: string;
  permissions: string[];
  deletedAt: Date | null;
}

export interface AccessAndSettingsPlan {
  rolesToCreate: RoleRow[];
  settingsToCreate: SettingRow[];
  /** Existing rows that differ from the code definition (reported, never changed). */
  warnings: string[];
}

export function systemRoleRows(): RoleRow[] {
  return SYSTEM_ROLES.map((role) => ({
    name: role.name,
    description: role.description,
    permissions: [...role.permissions],
    allLocations: role.allLocations,
    isSystem: true,
  }));
}

export function defaultSettingRows(): SettingRow[] {
  const deprecated: ReadonlySet<string> = new Set(DEPRECATED_SETTING_KEYS);
  return SETTING_DEFINITIONS.filter((definition) => !deprecated.has(definition.key)).map(
    (definition) => ({
      key: definition.key,
      valueType: settingValueType(definition),
      value: definition.defaultValue,
      group: definition.group,
      labelEn: definition.label.en,
      labelBn: definition.label.bn === "" ? null : definition.label.bn,
      description: definition.help.en === "" ? null : definition.help.en,
      // Nothing reads Setting.isPublic today; the storefront gets settings
      // through server code. Keep it closed.
      isPublic: false,
    }),
  );
}

function sameKeys(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((key) => set.has(key));
}

export function planAccessAndSettings(
  existingRoles: readonly ExistingRole[],
  existingSettingKeys: readonly string[],
): AccessAndSettingsPlan {
  const warnings: string[] = [];
  const rolesByName = new Map(existingRoles.map((role) => [role.name, role]));
  const rolesToCreate: RoleRow[] = [];

  for (const row of systemRoleRows()) {
    const existing = rolesByName.get(row.name);
    if (existing === undefined) {
      rolesToCreate.push(row);
      continue;
    }
    if (existing.deletedAt !== null) {
      warnings.push(`Role "${row.name}" exists but is deleted; left unchanged.`);
    } else if (!sameKeys(existing.permissions, row.permissions)) {
      warnings.push(`Role "${row.name}" exists with different permissions; left unchanged.`);
    }
  }

  const settingKeys = new Set(existingSettingKeys);
  const settingsToCreate = defaultSettingRows().filter((row) => !settingKeys.has(row.key));

  return { rolesToCreate, settingsToCreate, warnings };
}
