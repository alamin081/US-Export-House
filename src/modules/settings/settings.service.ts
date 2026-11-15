import { findSettingValues } from "./settings.repository";
import {
  CATALOG_SETTING_KEYS,
  DEFAULT_CATALOG_SETTINGS,
  parseCatalogSettings,
  type CatalogSettings,
} from "./catalog-settings";
import {
  CHECKOUT_SETTING_KEYS,
  DEFAULT_CHECKOUT_SETTINGS,
  parseCheckoutSettings,
  type CheckoutSettings,
} from "./checkout-settings";
import {
  DEFAULT_INVENTORY_SETTINGS,
  INVENTORY_SETTING_KEYS,
  parseInventorySettings,
  type InventorySettings,
} from "./inventory-settings";
import {
  DEFAULT_ORDER_SETTINGS,
  ORDER_SETTING_KEYS,
  parseOrderSettings,
  type OrderSettings,
} from "./order-settings";
import {
  DEFAULT_STORE_SETTINGS,
  STORE_SETTING_KEYS,
  parseStoreSettings,
  type StoreSettings,
} from "./store-settings";
import {
  DEFAULT_RETURNS_SETTINGS,
  parseReturnsSettings,
  RETURNS_SETTING_KEYS,
  type ReturnsSettings,
} from "./returns-settings";
import {
  DEFAULT_POS_SETTINGS,
  parsePosSettings,
  POS_SETTING_KEYS,
  type PosSettings,
} from "./pos-settings";
import {
  DEFAULT_REPORT_SETTINGS,
  parseReportSettings,
  REPORT_SETTING_KEYS,
  type ReportSettings,
} from "./report-settings";
import {
  DEFAULT_SITE_SETTINGS,
  parseSiteSettings,
  SITE_SETTING_KEYS,
  type SiteSettings,
} from "./site-settings";

export { DEFAULT_CATALOG_SETTINGS, type CatalogSettings };
export { DEFAULT_INVENTORY_SETTINGS, type InventorySettings };
export { DEFAULT_CHECKOUT_SETTINGS, type CheckoutSettings };
export { DEFAULT_ORDER_SETTINGS, type OrderSettings };
export { DEFAULT_STORE_SETTINGS, type StoreSettings };
export { DEFAULT_RETURNS_SETTINGS, type ReturnsSettings };
export { DEFAULT_POS_SETTINGS, type PosSettings };
export { DEFAULT_REPORT_SETTINGS, type ReportSettings };
export { DEFAULT_SITE_SETTINGS, type SiteSettings };

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

/** Checkout settings from the database, falling back to the defaults. */
export async function getCheckoutSettings(): Promise<CheckoutSettings> {
  try {
    const raw = await findSettingValues(Object.values(CHECKOUT_SETTING_KEYS));
    return parseCheckoutSettings(raw, (message) => console.warn(`[settings] ${message}`));
  } catch (error) {
    console.error("[settings] could not load settings", error instanceof Error ? error.name : "");
    return DEFAULT_CHECKOUT_SETTINGS;
  }
}

/** Order processing settings from the database, falling back to the defaults. */
export async function getOrderSettings(): Promise<OrderSettings> {
  try {
    const raw = await findSettingValues(Object.values(ORDER_SETTING_KEYS));
    return parseOrderSettings(raw, (message) => console.warn(`[settings] ${message}`));
  } catch (error) {
    console.error("[settings] could not load settings", error instanceof Error ? error.name : "");
    return DEFAULT_ORDER_SETTINGS;
  }
}

/** Shop details and VAT display switches, falling back to the defaults. */
export async function getStoreSettings(): Promise<StoreSettings> {
  try {
    const raw = await findSettingValues(Object.values(STORE_SETTING_KEYS));
    return parseStoreSettings(raw, (message) => console.warn(`[settings] ${message}`));
  } catch (error) {
    console.error("[settings] could not load settings", error instanceof Error ? error.name : "");
    return DEFAULT_STORE_SETTINGS;
  }
}

/** Return, exchange and refund settings, falling back to the defaults. */
export async function getReturnsSettings(): Promise<ReturnsSettings> {
  try {
    const raw = await findSettingValues(Object.values(RETURNS_SETTING_KEYS));
    return parseReturnsSettings(raw, (message) => console.warn(`[settings] ${message}`));
  } catch (error) {
    console.error("[settings] could not load settings", error instanceof Error ? error.name : "");
    return DEFAULT_RETURNS_SETTINGS;
  }
}

/** Till and label settings, falling back to the defaults. */
export async function getPosSettings(): Promise<PosSettings> {
  try {
    const raw = await findSettingValues(Object.values(POS_SETTING_KEYS));
    return parsePosSettings(raw, (message) => console.warn(`[settings] ${message}`));
  } catch (error) {
    console.error("[settings] could not load settings", error instanceof Error ? error.name : "");
    return DEFAULT_POS_SETTINGS;
  }
}

/** Dashboard and report settings, falling back to the defaults. */
export async function getReportSettings(): Promise<ReportSettings> {
  try {
    const raw = await findSettingValues(Object.values(REPORT_SETTING_KEYS));
    return parseReportSettings(raw, (message) => console.warn(`[settings] ${message}`));
  } catch (error) {
    console.error("[settings] could not load settings", error instanceof Error ? error.name : "");
    return DEFAULT_REPORT_SETTINGS;
  }
}

/** Social links, footer payment methods and the default share image. */
export async function getSiteSettings(): Promise<SiteSettings> {
  try {
    const raw = await findSettingValues(Object.values(SITE_SETTING_KEYS));
    return parseSiteSettings(raw, (message) => console.warn(`[settings] ${message}`));
  } catch (error) {
    console.error("[settings] could not load settings", error instanceof Error ? error.name : "");
    return DEFAULT_SITE_SETTINGS;
  }
}
