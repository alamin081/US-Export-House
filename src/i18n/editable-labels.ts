/**
 * Storefront labels the admin may reword (Phase 12, owner-approved). Pure.
 *
 * Only keys listed here can be overridden; a new key in the message files is
 * not editable until it is added here on purpose. Locked on purpose:
 * checkout, payment and fraud messages (Checkout, CartErrors, errors), order
 * states and return terms (OrderView, ReturnRequest, Policy) and technical
 * labels — wrong wording there could mislead a customer about money or
 * rights.
 */

export interface EditableLabel {
  key: string;
  /** Where the label appears, for the editor. */
  where: string;
}

const L = (key: string, where: string): EditableLabel => ({ key, where });

export const EDITABLE_LABELS: readonly EditableLabel[] = [
  L("Common.brandName", "Shop name in the header and page titles"),
  L("Common.brandShort", "Wordmark in the header"),
  L("Common.brandTagline", "Small line under the wordmark"),
  L("Common.searchPlaceholder", "Header search box"),
  L("Common.viewAll", "“View all” links on the home page"),
  L("Common.backToHome", "Error pages"),
  L("Nav.shop", "Menu item before a menu is published"),
  L("Nav.trackOrder", "Announcement bar and mobile menu"),
  L("Footer.visitHeading", "Footer: branches heading"),
  L("Footer.socialHeading", "Footer: social links"),
  L("Footer.paymentHeading", "Footer: payment methods"),
  L("Footer.copyright", "Footer: copyright line"),
  L("Home.categoriesTitle", "Home (before the home page is published): categories heading"),
  L("Home.newArrivalsTitle", "Home (before the home page is published): new products heading"),
  ...[
    "title",
    "description",
    "resultsCount",
    "searchResultsFor",
    "filtersTitle",
    "openFilters",
    "closeFilters",
    "categoryFilter",
    "allCategories",
    "sizeFilter",
    "priceFilter",
    "priceAny",
    "priceUnder",
    "priceBetween",
    "priceOver",
    "availabilityFilter",
    "inStockOnly",
    "sortLabel",
    "sortFeatured",
    "sortNewest",
    "sortPriceAsc",
    "sortPriceDesc",
    "noResultsTitle",
    "noResultsBody",
    "clearFilters",
    "colourFilter",
    "brandFilter",
    "priceMin",
    "priceMax",
    "pageStatus",
    "previousPage",
    "nextPage",
  ].map((key) => L(`Shop.${key}`, "Shop and category pages")),
  L("Category.productCount", "Category page: number of products"),
  L("Category.notFoundTitle", "Missing category page"),
  L("Category.notFoundBody", "Missing category page"),
  ...[
    "tagNew",
    "tagBestseller",
    "tagSale",
    "soldOut",
    "lowStock",
    "inStock",
    "outOfStock",
    "addToCart",
    "addedToCart",
    "buyNow",
    "sizeLabel",
    "colourLabel",
    "selectSize",
    "selectColour",
    "sizeGuide",
    "sizeGuideTitle",
    "sizeGuideNote",
    "quantity",
    "descriptionTitle",
    "fabricTitle",
    "careTitle",
    "fitTitle",
    "brandTitle",
    "availableAtTitle",
    "relatedTitle",
    "deliveryNote",
    "returnsNote",
    "notFoundTitle",
    "notFoundBody",
    "fromPrice",
    "saveBadge",
    "unavailableCombination",
    "viewCart",
    "keepShopping",
  ].map((key) => L(`Product.${key}`, "Product page and product cards")),
  ...[
    "title",
    "emptyTitle",
    "emptyBody",
    "continueShopping",
    "proceedToCheckout",
    "freeShippingReached",
    "freeShippingProgress",
  ].map((key) => L(`Cart.${key}`, "Cart page")),
  ...["title", "description", "submit", "notFoundTitle", "notFoundBody"].map((key) =>
    L(`TrackOrder.${key}`, "Order tracking page"),
  ),
  L("Contact.whatsapp", "Contact page: WhatsApp button"),
  L("Contact.branchesTitle", "Contact page: branches heading"),
  L("Contact.openMap", "Contact page: map link"),
  ...[
    "siteName",
    "defaultTitle",
    "defaultDescription",
    "homeTitle",
    "shopTitle",
    "trackOrderTitle",
  ].map((key) => L(`Metadata.${key}`, "Browser tab and search results")),
];

const KEYS = new Set(EDITABLE_LABELS.map((label) => label.key));

export function isEditableLabel(key: string): boolean {
  return KEYS.has(key);
}

export type Messages = Record<string, Record<string, unknown>>;

/** The code's own text for "Namespace.key", or undefined. */
export function defaultLabel(messages: Messages, key: string): string | undefined {
  const [namespace, name] = key.split(".");
  const value =
    namespace === undefined || name === undefined ? undefined : messages[namespace]?.[name];
  return typeof value === "string" ? value : undefined;
}

/**
 * Messages with the allowed overrides applied. Anything not on the
 * allowlist, or without a default in the code, is ignored.
 */
export function applyLabelOverrides(
  messages: Messages,
  overrides: ReadonlyArray<{ key: string; value: string }>,
): Messages {
  if (overrides.length === 0) return messages;
  const result: Messages = { ...messages };
  for (const override of overrides) {
    if (!isEditableLabel(override.key) || defaultLabel(messages, override.key) === undefined)
      continue;
    const [namespace, name] = override.key.split(".") as [string, string];
    result[namespace] = { ...result[namespace], [name]: override.value };
  }
  return result;
}

/** Names of the {placeholders} a label uses (including those inside plural branches). */
export function labelArguments(text: string): string[] {
  const names = new Set<string>();
  for (const match of text.matchAll(/\{\s*([A-Za-z][A-Za-z0-9_]*)\s*[,}]/g)) names.add(match[1]!);
  return [...names].sort();
}

/** Why an override cannot be saved, or null when it is fine. */
export function labelProblem(defaultText: string, value: string): string | null {
  const text = value.trim();
  if (text === "") return "Write the label, or reset it to use the original.";
  if (/[<>]/.test(text)) return "Labels cannot contain < or >.";
  const limit = Math.max(40, defaultText.length * 2);
  if (text.length > limit) return `Keep it under ${limit} characters.`;
  const expected = labelArguments(defaultText);
  const actual = labelArguments(text);
  if (expected.join(",") !== actual.join(",")) {
    return expected.length === 0
      ? "This label has no {placeholders}; remove the curly brackets."
      : `Keep exactly these placeholders: ${expected.map((name) => `{${name}}`).join(", ")}.`;
  }
  const opens = (text.match(/\{/g) ?? []).length;
  const closes = (text.match(/\}/g) ?? []).length;
  if (opens !== closes) return "The curly brackets do not match.";
  if (/plural/.test(defaultText) && !/\bother\s*\{/.test(text)) {
    return "Keep the plural form, including its “other {…}” part.";
  }
  return null;
}
