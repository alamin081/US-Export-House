import {
  PERMISSION_DESCRIPTIONS,
  PERMISSION_GROUPS,
  SENSITIVE_PERMISSIONS,
  SUPER_ADMIN_ONLY,
} from "@/modules/access/permissions";

/** The permission groups with descriptions, ready for the role form. */
export function permissionGroupsForForm() {
  return PERMISSION_GROUPS.map((group) => ({
    label: group.label,
    keys: group.keys.map((key) => ({
      key,
      en: PERMISSION_DESCRIPTIONS[key].en,
      bn: PERMISSION_DESCRIPTIONS[key].bn,
      sensitive: SENSITIVE_PERMISSIONS.includes(key),
      superAdminOnly: SUPER_ADMIN_ONLY.includes(key),
    })),
  }));
}
