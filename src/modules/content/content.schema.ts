/**
 * The shape of every content document (Phase 12) — pure Zod, shared by the
 * editors, the service and the storefront. Drafts and published versions are
 * both checked against these, so nothing malformed reaches the site.
 *
 * Text is stored, never HTML. Every bilingual field is { en, bn } with
 * English required where the field is required; Bengali falls back to
 * English on the storefront.
 */
import { z } from "zod";

import { safeHref } from "./inline";

export const CONTENT_KINDS = ["HOME", "ANNOUNCEMENTS", "MENU", "FOOTER", "PAGE"] as const;
export type ContentKind = (typeof CONTENT_KINDS)[number];

const id = z.string().trim().min(1).max(40);
const shortText = (max: number) => z.string().trim().max(max).default("");

/** Bilingual text; `en` may be required. */
export function localized(max: number, required = false) {
  const shape = z.object({
    en: required ? z.string().trim().min(1, "Write the English text.").max(max) : shortText(max),
    bn: shortText(max),
  });
  // An optional text may be left out entirely; it is stored as empty.
  return required ? shape : shape.default({ en: "", bn: "" });
}
export interface Localized {
  en: string;
  bn: string;
}

export const EMPTY_TEXT: Localized = { en: "", bn: "" };

const isoOrNull = z
  .string()
  .trim()
  .max(40)
  .nullable()
  .default(null)
  .refine((value) => value === null || value === "" || !Number.isNaN(Date.parse(value)), {
    message: "Not a date and time.",
  })
  .transform((value) => (value === "" ? null : value));

export const scheduleSchema = z
  .object({ startsAt: isoOrNull, endsAt: isoOrNull })
  .default({ startsAt: null, endsAt: null })
  .refine(
    (value) =>
      value.startsAt === null ||
      value.endsAt === null ||
      Date.parse(value.startsAt) < Date.parse(value.endsAt),
    { message: "The end must be after the start." },
  );
export type Schedule = z.infer<typeof scheduleSchema>;

/** Where images may come from: Cloudinary, the dev/test mock store, bundled placeholders. */
export function isAllowedImageUrl(value: string): boolean {
  if (value.startsWith("/images/") || value.startsWith("/api/dev-uploads/")) {
    return !value.includes("..") && !/[\s"'<>]/.test(value);
  }
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "res.cloudinary.com";
  } catch {
    return false;
  }
}

export const imageSchema = z.object({
  url: z.string().trim().max(600).refine(isAllowedImageUrl, { message: "Upload the image again." }),
  /** Storage key, kept so the file can be found later. */
  key: z.string().trim().max(300).nullable().default(null),
  width: z.number().int().min(1).max(20_000).nullable().default(null),
  height: z.number().int().min(1).max(20_000).nullable().default(null),
  alt: localized(200),
});
export type ContentImage = z.infer<typeof imageSchema>;

/** A link to something on the site (by id, so renames never break it) or a URL. */
export const linkSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("category"), id }),
  z.object({ type: z.literal("page"), key: z.string().trim().min(1).max(80) }),
  z.object({ type: z.literal("tag"), slug: z.string().trim().min(1).max(80) }),
  z.object({ type: z.literal("product"), id }),
  z.object({
    type: z.literal("url"),
    href: z
      .string()
      .trim()
      .max(500)
      .refine((value) => safeHref(value) !== null, {
        message: "Use a full https:// address or a path starting with /.",
      }),
  }),
]);
export type ContentLink = z.infer<typeof linkSchema>;

const button = z.object({ label: localized(40, true), link: linkSchema });
export type ContentButton = z.infer<typeof button>;

// ---------------------------------------------------------------------------
// blocks (pages and the brand story)
// ---------------------------------------------------------------------------

const TEXT_MAX = 5_000;

export const blockSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("heading"),
    id,
    level: z.union([z.literal(2), z.literal(3)]).default(2),
    text: localized(200, true),
  }),
  z.object({ type: z.literal("paragraph"), id, text: localized(TEXT_MAX, true) }),
  z.object({
    type: z.literal("list"),
    id,
    style: z.enum(["bullet", "number"]).default("bullet"),
    items: z.array(localized(1_000, true)).min(1).max(50),
  }),
  z.object({ type: z.literal("image"), id, image: imageSchema, caption: localized(300) }),
  z.object({
    type: z.literal("table"),
    id,
    header: z.array(localized(200)).min(1).max(8),
    rows: z.array(z.array(localized(500)).min(1).max(8)).max(50),
  }),
  z.object({ type: z.literal("callout"), id, text: localized(1_000, true) }),
]);
export type ContentBlock = z.infer<typeof blockSchema>;

const blocks = z.array(blockSchema).max(200).default([]);

// ---------------------------------------------------------------------------
// home
// ---------------------------------------------------------------------------

export const TRUST_ICONS = ["cash", "return", "truck", "shield", "phone", "store"] as const;
export const PRODUCT_RULES = [
  "new",
  "featured",
  "bestselling",
  "tag",
  "category",
  "manual",
] as const;

const sectionBase = { id, enabled: z.boolean().default(true) };

export const heroSlideSchema = z.object({
  id,
  desktop: imageSchema,
  mobile: imageSchema.nullable().default(null),
  eyebrow: localized(60),
  title: localized(120, true),
  subtitle: localized(240),
  primary: button.nullable().default(null),
  secondary: button.nullable().default(null),
  textTone: z.enum(["dark", "light"]).default("dark"),
  schedule: scheduleSchema,
});

export const homeSectionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("hero"),
    ...sectionBase,
    slides: z.array(heroSlideSchema).min(1).max(6),
  }),
  z.object({
    type: z.literal("categories"),
    ...sectionBase,
    eyebrow: localized(60),
    title: localized(120),
    description: localized(300),
    /** Empty: the active top-level categories, in their own order. */
    categoryIds: z.array(id).max(12).default([]),
  }),
  z.object({
    type: z.literal("products"),
    ...sectionBase,
    title: localized(120, true),
    description: localized(300),
    rule: z.enum(PRODUCT_RULES),
    tagSlug: z.string().trim().max(80).nullable().default(null),
    categoryId: id.nullable().default(null),
    productIds: z.array(id).max(24).default([]),
    limit: z.number().int().min(2).max(24).default(8),
    viewAll: linkSchema.nullable().default(null),
  }),
  z.object({
    type: z.literal("promo"),
    ...sectionBase,
    image: imageSchema,
    eyebrow: localized(60),
    title: localized(120, true),
    body: localized(400),
    cta: button.nullable().default(null),
    tone: z.enum(["accent", "dark"]).default("accent"),
    schedule: scheduleSchema,
  }),
  z.object({
    type: z.literal("collections"),
    ...sectionBase,
    eyebrow: localized(60),
    title: localized(120, true),
    description: localized(300),
    items: z
      .array(
        z.object({
          id,
          image: imageSchema,
          title: localized(80, true),
          description: localized(200),
          link: linkSchema,
        }),
      )
      .min(1)
      .max(6),
  }),
  z.object({
    type: z.literal("story"),
    ...sectionBase,
    image: imageSchema.nullable().default(null),
    eyebrow: localized(60),
    title: localized(120, true),
    blocks,
    stats: z
      .array(z.object({ id, value: z.string().trim().min(1).max(12), label: localized(40, true) }))
      .max(4)
      .default([]),
    cta: button.nullable().default(null),
  }),
  z.object({
    type: z.literal("trust"),
    ...sectionBase,
    items: z
      .array(
        z.object({
          id,
          icon: z.enum(TRUST_ICONS),
          title: localized(60, true),
          text: localized(160),
        }),
      )
      .min(1)
      .max(6),
  }),
]);
export type HomeSection = z.infer<typeof homeSectionSchema>;

export const homeSchema = z.object({ sections: z.array(homeSectionSchema).max(20).default([]) });
export type HomeContent = z.infer<typeof homeSchema>;

// ---------------------------------------------------------------------------
// announcement bar, menu, footer
// ---------------------------------------------------------------------------

export const ANNOUNCEMENT_TONES = ["primary", "accent", "neutral"] as const;

export const announcementsSchema = z.object({
  messages: z
    .array(
      z.object({
        id,
        enabled: z.boolean().default(true),
        text: localized(120, true),
        link: linkSchema.nullable().default(null),
        tone: z.enum(ANNOUNCEMENT_TONES).default("primary"),
        schedule: scheduleSchema,
      }),
    )
    .max(5)
    .default([]),
});
export type AnnouncementsContent = z.infer<typeof announcementsSchema>;

const menuLeaf = z.object({
  id,
  enabled: z.boolean().default(true),
  /** Blank: the linked category's or page's own name. */
  label: localized(40),
  link: linkSchema,
});

export const menuSchema = z.object({
  items: z
    .array(menuLeaf.extend({ children: z.array(menuLeaf).max(12).default([]) }))
    .max(8)
    .default([]),
});
export type MenuContent = z.infer<typeof menuSchema>;
export type MenuItem = MenuContent["items"][number];

export const footerSchema = z.object({
  blurb: localized(400),
  columns: z
    .array(
      z.object({
        id,
        title: localized(40, true),
        links: z.array(menuLeaf).max(12).default([]),
      }),
    )
    .max(4)
    .default([]),
  showBranches: z.boolean().default(true),
  showPaymentMethods: z.boolean().default(true),
});
export type FooterContent = z.infer<typeof footerSchema>;

// ---------------------------------------------------------------------------
// pages
// ---------------------------------------------------------------------------

export const PAGE_LAYOUTS = ["standard", "faq", "contact"] as const;

export const pageSchema = z.object({
  title: localized(120, true),
  summary: localized(300),
  seoTitle: localized(70),
  seoDescription: localized(160),
  ogImage: imageSchema.nullable().default(null),
  layout: z.enum(PAGE_LAYOUTS).default("standard"),
  blocks,
  faq: z
    .array(
      z.object({
        id,
        title: localized(80, true),
        items: z
          .array(z.object({ id, question: localized(200, true), answer: localized(2_000, true) }))
          .max(50),
      }),
    )
    .max(12)
    .default([]),
});
export type PageContent = z.infer<typeof pageSchema>;

export const CONTENT_SCHEMAS = {
  HOME: homeSchema,
  ANNOUNCEMENTS: announcementsSchema,
  MENU: menuSchema,
  FOOTER: footerSchema,
  PAGE: pageSchema,
} as const satisfies Record<ContentKind, z.ZodType>;

export type ContentOf<K extends ContentKind> = z.infer<(typeof CONTENT_SCHEMAS)[K]>;

/** Largest JSON a document may be. */
export const MAX_DOCUMENT_BYTES = 256 * 1024;

// ---------------------------------------------------------------------------
// keys and slugs
// ---------------------------------------------------------------------------

export const SINGLETON_KEYS = {
  home: "HOME",
  announcements: "ANNOUNCEMENTS",
  "menu.header": "MENU",
  footer: "FOOTER",
} as const satisfies Record<string, ContentKind>;

export const PAGE_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Pages with a route of their own; everything else lives at /pages/<slug>. */
export const SYSTEM_PAGES = {
  about: "/about",
  contact: "/contact",
  faq: "/faq",
  "privacy-policy": "/privacy-policy",
  terms: "/terms",
  "shipping-returns": "/shipping-returns",
  "shipping-info": "/shipping-info",
  "size-guide": "/size-guide",
} as const;
export type SystemPageSlug = keyof typeof SYSTEM_PAGES;

/** Slugs a new page may not take (routes that already exist). */
export const RESERVED_SLUGS = [
  ...Object.keys(SYSTEM_PAGES),
  "shop",
  "category",
  "product",
  "cart",
  "checkout",
  "account",
  "order",
  "track-order",
  "admin",
  "api",
  "en",
  "bn",
  "pages",
];

export function pageKey(slug: string): string {
  return `page.${slug}`;
}

export function pagePath(slug: string): string {
  return (SYSTEM_PAGES as Record<string, string>)[slug] ?? `/pages/${slug}`;
}

/** The return policy needs return.policy.publish to go live (Phase 9 rule). */
export const RETURN_POLICY_SLUG = "shipping-returns";
