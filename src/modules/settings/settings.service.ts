import { findSettingValues } from "./settings.repository";
import {
  CATALOG_SETTING_KEYS,
  DEFAULT_CATALOG_SETTINGS,
  parseCatalogSettings,
  type CatalogSettings,
} from "./catalog-settings";
import {
  DEFAULT_INVENTORY_SETTINGS,
  INVENTORY_SETTING_KEYS,
  parseInventorySettings,
  type InventorySettings,
} from "./inventory-settings";

export { DEFAULT_CATALOG_SETTINGS, type CatalogSettings };
export { DEFAULT_INVENTORY_SETTINGS, type InventorySettings };

/**
 * Catalogue settings from the database. A database error falls back to the
 * defaults (logged), so a settings hiccup never takes the storefront down.
 */
export async function getCatalogSettings(): Promise<CatalogSettings> {
  try {
    const raw = await findSettingValues(Object.values(CATALOG_SETTING_KEYS));
    return parseCatalogSettings(raw, (message) => console.warn(`[settings] ${message}`));
  } catch (error) {
    console.error("[settings] could not load settings", error instanceof Error ? error.name : "");
    return DEFAULT_CATALOG_SETTINGS;
  }
}

/** Inventory settings from the database, falling back to the defaults. */
export async function getInventorySettings(): Promise<InventorySettings> {
  try {
    const raw = await findSettingValues(Object.values(INVENTORY_SETTING_KEYS));
    return parseInventorySettings(raw, (message) => console.warn(`[settings] ${message}`));
  } catch (error) {
    console.error("[settings] could not load settings", error instanceof Error ? error.name : "");
    return DEFAULT_INVENTORY_SETTINGS;
  }
}
