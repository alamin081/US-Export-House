import "server-only";

import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import type { ContentKind } from "./content.schema";

/**
 * Content documents and their published versions (Phase 12). Writes that
 * must not race — saving a draft, publishing — lock the document row first.
 */

type Tx = Prisma.TransactionClient;

const DOCUMENT_SELECT = {
  id: true,
  key: true,
  kind: true,
  slug: true,
  draft: true,
  draftRevision: true,
  draftUpdatedAt: true,
  draftUpdatedById: true,
  isSample: true,
  isSystem: true,
  publishPermission: true,
  publishedVersionId: true,
  publishedAt: true,
  createdAt: true,
  publishedVersion: { select: { id: true, number: true, data: true, publishedAt: true } },
} satisfies Prisma.ContentDocumentSelect;

export type DocumentRow = Prisma.ContentDocumentGetPayload<{ select: typeof DOCUMENT_SELECT }>;

export async function findDocument(key: string): Promise<DocumentRow | null> {
  return db.contentDocument.findUnique({ where: { key }, select: DOCUMENT_SELECT });
}

export async function listDocuments(): Promise<DocumentRow[]> {
  return db.contentDocument.findMany({
    select: DOCUMENT_SELECT,
    orderBy: [{ kind: "asc" }, { key: "asc" }],
  });
}

export async function listVersions(documentId: string, take = 20) {
  return db.contentVersion.findMany({
    where: { documentId },
    select: { id: true, number: true, note: true, publishedAt: true, publishedById: true },
    orderBy: { number: "desc" },
    take,
  });
}

export async function findVersion(documentId: string, versionId: string) {
  return db.contentVersion.findFirst({
    where: { id: versionId, documentId },
    select: { id: true, number: true, data: true, publishedAt: true },
  });
}

/** What the storefront shows: the published data only. */
export async function findPublishedData(key: string): Promise<unknown> {
  const row = await db.contentDocument.findUnique({
    where: { key },
    select: { publishedVersion: { select: { data: true } } },
  });
  return row?.publishedVersion?.data ?? null;
}

export async function findDraftData(key: string): Promise<unknown> {
  const row = await db.contentDocument.findUnique({ where: { key }, select: { draft: true } });
  return row?.draft ?? null;
}

/** Published pages: slug, title and when they went live (menus, footer, sitemap). */
export async function findPublishedPages() {
  const rows = await db.contentDocument.findMany({
    where: { kind: "PAGE", publishedVersionId: { not: null }, slug: { not: null } },
    select: {
      key: true,
      slug: true,
      publishedAt: true,
      publishedVersion: { select: { data: true } },
    },
    orderBy: { slug: "asc" },
  });
  return rows.map((row) => ({
    key: row.key,
    slug: row.slug!,
    publishedAt: row.publishedAt,
    data: row.publishedVersion?.data ?? null,
  }));
}

export async function createDocument(data: {
  key: string;
  kind: ContentKind;
  slug: string | null;
  draft: Prisma.InputJsonValue;
  isSystem: boolean;
  isSample: boolean;
  publishPermission: string | null;
  userId: string | null;
}) {
  return db.contentDocument.create({
    data: {
      key: data.key,
      kind: data.kind,
      slug: data.slug,
      draft: data.draft,
      isSystem: data.isSystem,
      isSample: data.isSample,
      publishPermission: data.publishPermission,
      draftUpdatedById: data.userId,
    },
    select: DOCUMENT_SELECT,
  });
}

/** Locks one document row inside a transaction. */
export async function lockDocument(tx: Tx, key: string): Promise<DocumentRow | null> {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "ContentDocument" WHERE "key" = ${key} FOR UPDATE`;
  if (rows.length === 0) return null;
  return tx.contentDocument.findUnique({ where: { key }, select: DOCUMENT_SELECT });
}

export async function updateDraft(
  tx: Tx,
  id: string,
  data: { draft: Prisma.InputJsonValue; userId: string; now: Date },
) {
  return tx.contentDocument.update({
    where: { id },
    data: {
      draft: data.draft,
      draftRevision: { increment: 1 },
      draftUpdatedAt: data.now,
      draftUpdatedById: data.userId,
      // The owner's rule: the first real edit means it is no longer sample text.
      isSample: false,
    },
    select: { draftRevision: true },
  });
}

export async function createVersion(
  tx: Tx,
  data: {
    documentId: string;
    data: Prisma.InputJsonValue;
    note: string | null;
    userId: string;
    now: Date;
  },
) {
  const last = await tx.contentVersion.aggregate({
    where: { documentId: data.documentId },
    _max: { number: true },
  });
  return tx.contentVersion.create({
    data: {
      documentId: data.documentId,
      number: (last._max.number ?? 0) + 1,
      data: data.data,
      note: data.note,
      publishedById: data.userId,
      publishedAt: data.now,
    },
    select: { id: true, number: true },
  });
}

export async function setPublished(tx: Tx, id: string, versionId: string | null, now: Date | null) {
  await tx.contentDocument.update({
    where: { id },
    data: { publishedVersionId: versionId, publishedAt: now },
  });
}

export async function countVersions(documentId: string) {
  return db.contentVersion.count({ where: { documentId } });
}

export async function deleteDocument(id: string) {
  await db.contentDocument.delete({ where: { id } });
}

export async function setSettingInTx(tx: Tx, key: string, value: string, userId: string) {
  await tx.setting.upsert({
    where: { key },
    create: { key, value, valueType: "BOOLEAN", group: "returns", updatedByUserId: userId },
    update: { value, updatedByUserId: userId },
  });
}

// ---------------------------------------------------------------------------
// what links may point at
// ---------------------------------------------------------------------------

export async function findLinkTargets() {
  const [categories, tags, pages] = await Promise.all([
    db.category.findMany({
      where: { deletedAt: null },
      select: { id: true, slug: true, nameEn: true, nameBn: true, isActive: true, parentId: true },
      orderBy: [{ sortOrder: "asc" }, { nameEn: "asc" }],
    }),
    db.tag.findMany({
      select: { slug: true, nameEn: true, nameBn: true },
      orderBy: { nameEn: "asc" },
    }),
    db.contentDocument.findMany({
      where: { kind: "PAGE" },
      select: { key: true, slug: true, publishedVersionId: true, draft: true },
      orderBy: { slug: "asc" },
    }),
  ]);
  return { categories, tags, pages };
}

export async function findProductsForLinks(ids: readonly string[]) {
  if (ids.length === 0) return [];
  return db.product.findMany({
    where: { id: { in: [...ids] } },
    select: { id: true, slug: true, nameEn: true, nameBn: true, status: true, deletedAt: true },
  });
}

/** Product search for the editors (manual rows, product links). */
export async function searchProducts(term: string, take = 20) {
  return db.product.findMany({
    where: {
      deletedAt: null,
      status: "PUBLISHED",
      ...(term === ""
        ? {}
        : {
            OR: [
              { nameEn: { contains: term, mode: "insensitive" } },
              { code: { contains: term, mode: "insensitive" } },
            ],
          }),
    },
    select: { id: true, nameEn: true, code: true },
    orderBy: { updatedAt: "desc" },
    take,
  });
}

/** Branches shown on the storefront: active, real (not sample) branches. */
export async function findStorefrontBranches() {
  return db.location.findMany({
    where: { type: "BRANCH", isActive: true, deletedAt: null, isSample: false },
    select: {
      id: true,
      code: true,
      nameEn: true,
      nameBn: true,
      addressEn: true,
      addressBn: true,
      district: true,
      phone: true,
      hoursEn: true,
      hoursBn: true,
      mapUrl: true,
    },
    orderBy: [{ sortOrder: "asc" }, { nameEn: "asc" }],
  });
}

export async function findUserNames(ids: readonly string[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Map();
  const rows = await db.user.findMany({
    where: { id: { in: unique } },
    select: { id: true, name: true, email: true },
  });
  return new Map(rows.map((row) => [row.id, row.name ?? row.email ?? "staff"]));
}

export function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}
