import "server-only";

import { z } from "zod";

import { env, isProductionDeployment } from "@/config/env";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { assertPermission, hasPermission, type StaffContext } from "@/modules/access/authorization";
import { isPermissionKey } from "@/modules/access/permissions";
import { AUDIT_ACTIONS, recordAudit, type RequestMeta } from "@/modules/audit/audit.service";
import { checkContent, contentParts, missingBengali, type ContentIssue } from "./content-checks";
import {
  CONTENT_SCHEMAS,
  MAX_DOCUMENT_BYTES,
  PAGE_SLUG,
  RESERVED_SLUGS,
  RETURN_POLICY_SLUG,
  SINGLETON_KEYS,
  pageKey,
  pagePath,
  type ContentKind,
  type ContentLink,
  type PageContent,
} from "./content.schema";
import * as repo from "./content.repository";

/**
 * Content (Phase 12): drafts, publishing, versions and the checks in between.
 *
 *   content.write    edit drafts, create pages, restore an old version into the draft
 *   content.publish  put a draft live, unpublish a page, delete a never-published page
 *   + the document's own publishPermission (return.policy.publish for the
 *     return policy, the Phase 9 approval rule)
 *
 * Nothing goes live with an unknown placeholder, an unsafe link, an image
 * without alt text or a link to something that is not live. Sample content
 * and "[write this]" notes cannot be published in production.
 */

export interface ContentOptions {
  /** Defaults to APP_ENV=production; tests pass it explicitly. */
  production?: boolean;
  now?: Date;
}

const RETURN_POLICY_APPROVED = "returns.policyApproved";

function invalid(message: string, field?: string): AppError {
  return new AppError("VALIDATION_FAILED", message, {
    details: field === undefined ? {} : { field },
  });
}

function notFound(): AppError {
  return new AppError("NOT_FOUND", "This content does not exist.");
}

function kindOfKey(key: string): ContentKind | null {
  if (key in SINGLETON_KEYS) return SINGLETON_KEYS[key as keyof typeof SINGLETON_KEYS];
  if (key.startsWith("page.") && PAGE_SLUG.test(key.slice(5))) return "PAGE";
  return null;
}

/** Validates a document against its kind's schema; throws with the first problem. */
export function parseContent(kind: ContentKind, data: unknown) {
  const size = Buffer.byteLength(JSON.stringify(data ?? null), "utf8");
  if (size > MAX_DOCUMENT_BYTES) throw invalid("This content is too large to save.");
  const parsed = CONTENT_SCHEMAS[kind].safeParse(data);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const where = issue?.path.join(" › ") ?? "";
    throw invalid(
      `${issue?.message ?? "Invalid content."}${where === "" ? "" : ` (${where})`}`,
      where,
    );
  }
  return parsed.data;
}

/** Images must be ours: our Cloudinary account (or the mock store in tests). */
function checkImageOwnership(data: unknown) {
  const cloud = env.CLOUDINARY_CLOUD_NAME ?? "";
  for (const image of contentParts(data).images) {
    if (!image.url.startsWith("https://res.cloudinary.com/")) continue;
    if (cloud === "" || !image.url.startsWith(`https://res.cloudinary.com/${cloud}/`)) {
      throw invalid("An image is not from this shop's image store. Upload it again.");
    }
  }
}

// ---------------------------------------------------------------------------
// link checks (publishing)
// ---------------------------------------------------------------------------

async function linkChecker(selfKey: string) {
  const targets = await repo.findLinkTargets();
  const productIds = new Set<string>();
  return {
    remember(links: readonly ContentLink[]) {
      for (const link of links) if (link.type === "product") productIds.add(link.id);
    },
    async build() {
      const products = new Map(
        (await repo.findProductsForLinks([...productIds])).map((row) => [row.id, row]),
      );
      return (link: ContentLink): string | null => {
        switch (link.type) {
          case "category": {
            const category = targets.categories.find((row) => row.id === link.id);
            return category === undefined || !category.isActive
              ? "A link points at a category that is hidden or deleted."
              : null;
          }
          case "page": {
            if (link.key === selfKey) return null;
            const page = targets.pages.find((row) => row.key === link.key);
            return page === undefined || page.publishedVersionId === null
              ? `A link points at the page “${link.key.replace(/^page\./, "")}”, which is not published.`
              : null;
          }
          case "tag":
            return targets.tags.some((row) => row.slug === link.slug)
              ? null
              : `A link points at the tag “${link.slug}”, which does not exist.`;
          case "product": {
            const product = products.get(link.id);
            return product === undefined ||
              product.status !== "PUBLISHED" ||
              product.deletedAt !== null
              ? "A link points at a product that is not published."
              : null;
          }
          case "url":
            return null;
        }
      };
    },
  };
}

export async function issuesFor(
  key: string,
  data: unknown,
  production: boolean,
): Promise<ContentIssue[]> {
  const checker = await linkChecker(key);
  checker.remember(contentParts(data).links);
  const checkLink = await checker.build();
  return checkContent(data, { production, checkLink });
}

// ---------------------------------------------------------------------------
// the documents the site relies on
// ---------------------------------------------------------------------------

/** Titles of the pages every shop has; the owner writes the text. */
export const SYSTEM_PAGE_DEFAULTS: Record<
  string,
  { title: { en: string; bn: string }; layout: "standard" | "faq" | "contact" }
> = {
  about: { title: { en: "About us", bn: "আমাদের সম্পর্কে" }, layout: "standard" },
  contact: { title: { en: "Contact", bn: "যোগাযোগ" }, layout: "contact" },
  faq: { title: { en: "Frequently asked questions", bn: "সাধারণ প্রশ্ন" }, layout: "faq" },
  "privacy-policy": { title: { en: "Privacy policy", bn: "গোপনীয়তা নীতি" }, layout: "standard" },
  terms: { title: { en: "Terms and conditions", bn: "শর্তাবলি" }, layout: "standard" },
  "shipping-returns": {
    title: { en: "Return & exchange policy", bn: "রিটার্ন ও এক্সচেঞ্জ নীতি" },
    layout: "standard",
  },
  "shipping-info": {
    title: { en: "Shipping information", bn: "ডেলিভারির তথ্য" },
    layout: "standard",
  },
  "size-guide": { title: { en: "Size guide", bn: "সাইজ গাইড" }, layout: "standard" },
};

/**
 * Creates any missing system document as an empty, unpublished draft
 * (create-only: an existing document is never touched). Staging and
 * production start this way; the owner writes and publishes the text.
 */
export async function ensureSystemDocuments(userId: string | null = null): Promise<string[]> {
  const existing = new Set((await repo.listDocuments()).map((row) => row.key));
  const wanted: Array<{
    key: string;
    kind: ContentKind;
    slug: string | null;
    draft: unknown;
    permission: string | null;
  }> = [
    { key: "home", kind: "HOME", slug: null, draft: { sections: [] }, permission: null },
    {
      key: "announcements",
      kind: "ANNOUNCEMENTS",
      slug: null,
      draft: { messages: [] },
      permission: null,
    },
    { key: "menu.header", kind: "MENU", slug: null, draft: { items: [] }, permission: null },
    {
      key: "footer",
      kind: "FOOTER",
      slug: null,
      draft: CONTENT_SCHEMAS.FOOTER.parse({}),
      permission: null,
    },
    ...Object.entries(SYSTEM_PAGE_DEFAULTS).map(([slug, page]) => ({
      key: pageKey(slug),
      kind: "PAGE" as const,
      slug,
      draft: CONTENT_SCHEMAS.PAGE.parse({ title: page.title, layout: page.layout }),
      permission: slug === RETURN_POLICY_SLUG ? "return.policy.publish" : null,
    })),
  ];
  const created: string[] = [];
  for (const document of wanted) {
    if (existing.has(document.key)) continue;
    try {
      await repo.createDocument({
        key: document.key,
        kind: document.kind,
        slug: document.slug,
        draft: document.draft as object,
        isSystem: true,
        isSample: false,
        publishPermission: document.permission,
        userId,
      });
      created.push(document.key);
    } catch (error) {
      // Created by a parallel request: fine, it exists now.
      if (!repo.isUniqueViolation(error)) throw error;
    }
  }
  return created;
}

// ---------------------------------------------------------------------------
// reads for the admin
// ---------------------------------------------------------------------------

function titleOf(row: repo.DocumentRow): string {
  if (row.kind !== "PAGE") {
    return {
      HOME: "Home page",
      ANNOUNCEMENTS: "Announcement bar",
      MENU: "Header menu",
      FOOTER: "Footer",
      PAGE: "Page",
    }[row.kind];
  }
  const draft = row.draft as Partial<PageContent> | null;
  return draft?.title?.en || row.slug || row.key;
}

function sameJson(a: unknown, b: unknown) {
  return JSON.stringify(a) === JSON.stringify(b);
}

export async function listContent(staff: StaffContext) {
  assertPermission(staff, "content.write");
  await ensureSystemDocuments(staff.userId);
  const rows = await repo.listDocuments();
  return rows.map((row) => ({
    key: row.key,
    kind: row.kind,
    slug: row.slug,
    title: titleOf(row),
    path: row.slug === null ? null : pagePath(row.slug),
    isSample: row.isSample,
    isSystem: row.isSystem,
    published: row.publishedVersionId !== null,
    publishedAt: row.publishedAt,
    changed: row.publishedVersion === null || !sameJson(row.publishedVersion.data, row.draft),
    draftUpdatedAt: row.draftUpdatedAt,
    missingBengali: missingBengali(contentParts(row.draft)),
  }));
}

export async function getContentForEdit(
  staff: StaffContext,
  key: string,
  options: ContentOptions = {},
) {
  assertPermission(staff, "content.write");
  const row = await repo.findDocument(key);
  if (row === null) throw notFound();
  const production = options.production ?? isProductionDeployment;
  const [rawVersions, issues] = await Promise.all([
    repo.listVersions(row.id),
    issuesFor(row.key, row.draft, production),
  ]);
  const names = await repo.findUserNames(
    rawVersions.flatMap((version) =>
      version.publishedById === null ? [] : [version.publishedById],
    ),
  );
  const versions = rawVersions.map((version) => ({
    id: version.id,
    number: version.number,
    note: version.note,
    publishedAt: version.publishedAt.toISOString(),
    by: version.publishedById === null ? "—" : (names.get(version.publishedById) ?? "—"),
  }));
  const extraPermission =
    row.publishPermission !== null && isPermissionKey(row.publishPermission)
      ? row.publishPermission
      : null;
  return {
    key: row.key,
    kind: row.kind,
    slug: row.slug,
    title: titleOf(row),
    path: row.slug === null ? (row.kind === "HOME" ? "/" : null) : pagePath(row.slug),
    draft: row.draft,
    revision: row.draftRevision,
    draftUpdatedAt: row.draftUpdatedAt,
    isSample: row.isSample,
    isSystem: row.isSystem,
    publishedNumber: row.publishedVersion?.number ?? null,
    publishedAt: row.publishedAt,
    changed: row.publishedVersion === null || !sameJson(row.publishedVersion.data, row.draft),
    versions,
    issues,
    canPublish:
      hasPermission(staff, "content.publish") &&
      (extraPermission === null || hasPermission(staff, extraPermission)),
    publishPermission: extraPermission,
    production,
  };
}

export async function getVersionData(staff: StaffContext, key: string, versionId: string) {
  assertPermission(staff, "content.write");
  const row = await repo.findDocument(key);
  if (row === null) throw notFound();
  const version = await repo.findVersion(row.id, versionId);
  if (version === null) throw notFound();
  return { kind: row.kind, ...version };
}

// ---------------------------------------------------------------------------
// writes
// ---------------------------------------------------------------------------

const saveSchema = z.object({
  key: z.string().min(1).max(100),
  revision: z.coerce.number().int().min(0),
  draft: z.unknown(),
});

/** Saves the draft. Refused when someone else saved since it was opened. */
export async function saveDraft(
  staff: StaffContext,
  raw: unknown,
  meta: RequestMeta,
  options: ContentOptions = {},
) {
  assertPermission(staff, "content.write");
  const input = saveSchema.parse(raw);
  const kind = kindOfKey(input.key);
  if (kind === null) throw notFound();
  const draft = parseContent(kind, input.draft);
  checkImageOwnership(draft);
  const now = options.now ?? new Date();
  const result = await db.$transaction(async (tx) => {
    const row = await repo.lockDocument(tx, input.key);
    if (row === null) throw notFound();
    if (row.draftRevision !== input.revision) {
      throw new AppError(
        "CONFLICT",
        "Someone else saved this content after you opened it. Reload to see their changes.",
      );
    }
    const saved = await repo.updateDraft(tx, row.id, {
      draft: draft as object,
      userId: staff.userId,
      now,
    });
    return { row, revision: saved.draftRevision };
  });
  // One audit row per editing session rather than per keystroke-save.
  const quietFor = now.getTime() - result.row.draftUpdatedAt.getTime();
  if (result.row.draftUpdatedById !== staff.userId || quietFor > 15 * 60 * 1000) {
    await recordAudit({
      actorUserId: staff.userId,
      action: AUDIT_ACTIONS.contentDraftSaved,
      entityType: "content",
      entityId: input.key,
      before: { revision: result.row.draftRevision, sample: result.row.isSample },
      after: { revision: result.revision },
      meta,
    });
  }
  return { revision: result.revision };
}

function assertCanPublish(staff: StaffContext, row: repo.DocumentRow) {
  assertPermission(staff, "content.publish");
  if (row.publishPermission !== null) {
    if (!isPermissionKey(row.publishPermission)) {
      throw new AppError("FORBIDDEN", "This content cannot be published.");
    }
    assertPermission(staff, row.publishPermission);
  }
}

const publishSchema = z.object({
  key: z.string().min(1).max(100),
  revision: z.coerce.number().int().min(0),
  note: z.string().trim().max(200).optional().default(""),
});

/**
 * Puts the current draft live as a new version. The caller must name the
 * draft revision it reviewed, so a change made meanwhile is not published
 * unseen.
 */
export async function publishContent(
  staff: StaffContext,
  raw: unknown,
  meta: RequestMeta,
  options: ContentOptions = {},
) {
  const input = publishSchema.parse(raw);
  const production = options.production ?? isProductionDeployment;
  const preview = await repo.findDocument(input.key);
  if (preview === null) throw notFound();
  assertCanPublish(staff, preview);
  if (production && preview.isSample) {
    throw invalid(
      "This is sample text. Edit and save it with your own text before publishing on the live site.",
    );
  }
  const data = parseContent(preview.kind, preview.draft);
  const issues = (await issuesFor(preview.key, data, production)).filter(
    (issue) => issue.level === "error",
  );
  if (issues.length > 0) throw invalid(issues.map((issue) => issue.message).join(" "));
  const now = options.now ?? new Date();

  const version = await db.$transaction(async (tx) => {
    const row = await repo.lockDocument(tx, input.key);
    if (row === null) throw notFound();
    if (row.draftRevision !== input.revision || !sameJson(row.draft, preview.draft)) {
      throw new AppError(
        "CONFLICT",
        "The draft changed while you were publishing. Check it again.",
      );
    }
    if (production && row.isSample) throw invalid("This is sample text.");
    const created = await repo.createVersion(tx, {
      documentId: row.id,
      data: data as object,
      note: input.note === "" ? null : input.note,
      userId: staff.userId,
      now,
    });
    await repo.setPublished(tx, row.id, created.id, now);
    if (row.slug === RETURN_POLICY_SLUG) {
      await repo.setSettingInTx(tx, RETURN_POLICY_APPROVED, "true", staff.userId);
    }
    return created;
  });
  await recordAudit({
    actorUserId: staff.userId,
    action: AUDIT_ACTIONS.contentPublished,
    entityType: "content",
    entityId: input.key,
    before: { version: preview.publishedVersion?.number ?? null },
    after: { version: version.number, note: input.note === "" ? null : input.note },
    meta,
  });
  if (preview.slug === RETURN_POLICY_SLUG) {
    await recordAudit({
      actorUserId: staff.userId,
      action: AUDIT_ACTIONS.returnPolicyPublished,
      entityType: "content",
      entityId: input.key,
      after: { version: version.number },
      meta,
    });
  }
  return { version: version.number, slug: preview.slug, kind: preview.kind };
}

/** Takes a page off the site (it stays as a draft with its history). */
export async function unpublishPage(staff: StaffContext, key: string, meta: RequestMeta) {
  const row = await repo.findDocument(key);
  if (row === null) throw notFound();
  assertCanPublish(staff, row);
  if (row.kind !== "PAGE") throw invalid("Only pages can be taken off the site.");
  if (row.publishedVersionId === null) return { slug: row.slug };
  await db.$transaction(async (tx) => {
    await repo.setPublished(tx, row.id, null, null);
    if (row.slug === RETURN_POLICY_SLUG) {
      await repo.setSettingInTx(tx, RETURN_POLICY_APPROVED, "false", staff.userId);
    }
  });
  await recordAudit({
    actorUserId: staff.userId,
    action:
      row.slug === RETURN_POLICY_SLUG
        ? AUDIT_ACTIONS.returnPolicyUnpublished
        : AUDIT_ACTIONS.contentUnpublished,
    entityType: "content",
    entityId: key,
    before: { version: row.publishedVersion?.number ?? null },
    after: { version: null },
    meta,
  });
  return { slug: row.slug };
}

/** Copies an old version into the draft; publishing it is a separate step. */
export async function restoreVersion(
  staff: StaffContext,
  raw: unknown,
  meta: RequestMeta,
  options: ContentOptions = {},
) {
  assertPermission(staff, "content.write");
  const input = z
    .object({
      key: z.string().min(1).max(100),
      versionId: z.string().min(1).max(40),
      revision: z.coerce.number().int().min(0),
    })
    .parse(raw);
  const row = await repo.findDocument(input.key);
  if (row === null) throw notFound();
  const version = await repo.findVersion(row.id, input.versionId);
  if (version === null) throw notFound();
  const result = await saveDraft(
    staff,
    { key: input.key, revision: input.revision, draft: version.data },
    meta,
    options,
  );
  await recordAudit({
    actorUserId: staff.userId,
    action: AUDIT_ACTIONS.contentRestored,
    entityType: "content",
    entityId: input.key,
    after: { fromVersion: version.number, revision: result.revision },
    meta,
  });
  return result;
}

const newPageSchema = z.object({
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(2)
    .max(60)
    .regex(PAGE_SLUG, "Use lowercase English letters, digits and hyphens, e.g. eid-offer."),
  titleEn: z.string().trim().min(1, "Write the English title.").max(120),
  titleBn: z.string().trim().max(120).optional().default(""),
});

export function emptyPage(title: { en: string; bn: string }): PageContent {
  return CONTENT_SCHEMAS.PAGE.parse({ title });
}

export async function createPage(staff: StaffContext, raw: unknown, meta: RequestMeta) {
  assertPermission(staff, "content.write");
  const input = newPageSchema.parse(raw);
  if (RESERVED_SLUGS.includes(input.slug))
    throw invalid("That address is already used by the site.", "slug");
  try {
    const row = await repo.createDocument({
      key: pageKey(input.slug),
      kind: "PAGE",
      slug: input.slug,
      draft: emptyPage({ en: input.titleEn, bn: input.titleBn }) as object,
      isSystem: false,
      isSample: false,
      publishPermission: null,
      userId: staff.userId,
    });
    await recordAudit({
      actorUserId: staff.userId,
      action: AUDIT_ACTIONS.contentCreated,
      entityType: "content",
      entityId: row.key,
      after: { slug: input.slug },
      meta,
    });
    return { key: row.key };
  } catch (error) {
    if (repo.isUniqueViolation(error)) throw invalid("A page with that address exists.", "slug");
    throw error;
  }
}

/** Deletes a page that was never published and is not one the site relies on. */
export async function deletePage(staff: StaffContext, key: string, meta: RequestMeta) {
  assertPermission(staff, "content.publish");
  const row = await repo.findDocument(key);
  if (row === null) throw notFound();
  if (row.kind !== "PAGE" || row.isSystem) throw invalid("This page cannot be deleted.");
  if ((await repo.countVersions(row.id)) > 0) {
    throw invalid("This page has been published before. Take it off the site instead.");
  }
  await repo.deleteDocument(row.id);
  await recordAudit({
    actorUserId: staff.userId,
    action: AUDIT_ACTIONS.contentDeleted,
    entityType: "content",
    entityId: key,
    before: { slug: row.slug },
    meta,
  });
}

// ---------------------------------------------------------------------------
// pickers for the editors
// ---------------------------------------------------------------------------

export async function getLinkTargets(staff: StaffContext) {
  assertPermission(staff, "content.write");
  const targets = await repo.findLinkTargets();
  return {
    categories: targets.categories
      .filter((row) => row.isActive)
      .map((row) => ({ id: row.id, name: row.nameEn, parentId: row.parentId })),
    tags: targets.tags.map((row) => ({ slug: row.slug, name: row.nameEn })),
    pages: targets.pages.map((row) => ({
      key: row.key,
      slug: row.slug ?? "",
      title: (row.draft as Partial<PageContent> | null)?.title?.en || row.slug || row.key,
      published: row.publishedVersionId !== null,
    })),
  };
}

export async function findProductsForPicker(
  staff: StaffContext,
  term: string,
  ids: readonly string[] = [],
) {
  assertPermission(staff, "content.write");
  const [found, named] = await Promise.all([
    repo.searchProducts(term.trim().slice(0, 60)),
    repo.findProductsForLinks(ids),
  ]);
  return {
    results: found.map((row) => ({ id: row.id, name: row.nameEn, code: row.code })),
    named: named.map((row) => ({
      id: row.id,
      name: row.nameEn,
      live: row.status === "PUBLISHED" && row.deletedAt === null,
    })),
  };
}

/** The document key for a pathname typed into a page, for redirects. */
export { pagePath, pageKey };
