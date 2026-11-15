"use server";

import { revalidatePath, updateTag } from "next/cache";

import { getRequestMeta, requireStaffAction } from "@/modules/access/access.service";
import { actionError } from "@/modules/access/action-result";
import type { ActionResult } from "@/modules/access/action-state";
import { resetSetting, saveSettings } from "./settings-admin.service";
import { SETTING_GROUPS, type SettingGroup } from "./settings.registry";

/**
 * Settings page actions (Phase 12). The service checks each setting's own
 * permission; the storefront caches a changed setting feeds are refreshed.
 */

function isGroup(value: string): value is SettingGroup {
  return SETTING_GROUPS.some((group) => group.key === value);
}

function refresh(tags: readonly string[]) {
  for (const tag of tags) updateTag(tag);
  revalidatePath("/admin/settings");
}

export async function saveSettingsAction(
  group: string,
  values: Record<string, unknown>,
): Promise<ActionResult> {
  try {
    const staff = await requireStaffAction();
    if (!isGroup(group)) return { status: "error", message: "Unknown group." };
    const result = await saveSettings(staff, group, values, await getRequestMeta());
    refresh(result.tags);
    return {
      status: "success",
      message:
        result.changed.length === 0
          ? "Nothing changed."
          : `Saved ${result.changed.length} setting${result.changed.length === 1 ? "" : "s"}.`,
    };
  } catch (error) {
    return actionError(error);
  }
}

export async function resetSettingAction(key: string): Promise<ActionResult> {
  try {
    const staff = await requireStaffAction();
    const result = await resetSetting(staff, key, await getRequestMeta());
    refresh(result.tags);
    return { status: "success", message: "Back to the default." };
  } catch (error) {
    return actionError(error);
  }
}
