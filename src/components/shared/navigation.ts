/**
 * Site navigation.
 *
 * In Phase 12 this comes from the `MenuItem` table so a Content Editor can
 * reorder it; the shape stays the same, which is why the labels are i18n keys
 * rather than strings.
 */
export interface NavItem {
  /** Key inside the `Nav` namespace of the message files. */
  key: string;
  href: string;
}

export const MAIN_NAV: readonly NavItem[] = [
  { key: "shop", href: "/shop" },
  { key: "formalShirts", href: "/category/formal-shirts" },
  { key: "casualShirts", href: "/category/casual-shirts" },
  { key: "poloTShirts", href: "/category/polo-t-shirts" },
  { key: "denimJeans", href: "/category/denim-jeans" },
  { key: "about", href: "/about" },
  { key: "contact", href: "/contact" },
];

export const SHOP_NAV: readonly NavItem[] = [
  { key: "shop", href: "/shop" },
  { key: "formalShirts", href: "/category/formal-shirts" },
  { key: "casualShirts", href: "/category/casual-shirts" },
  { key: "poloTShirts", href: "/category/polo-t-shirts" },
  { key: "denimJeans", href: "/category/denim-jeans" },
];

export const HELP_NAV: readonly NavItem[] = [
  { key: "trackOrder", href: "/track-order" },
  { key: "faq", href: "/faq" },
  { key: "shippingReturns", href: "/shipping-returns" },
  { key: "privacy", href: "/privacy-policy" },
  { key: "contact", href: "/contact" },
];

export const ACCOUNT_NAV: readonly NavItem[] = [
  { key: "account", href: "/account" },
  { key: "trackOrder", href: "/track-order" },
];
