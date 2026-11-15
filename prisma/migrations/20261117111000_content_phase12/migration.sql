-- Phase 12 content, additive only: content documents with immutable published
-- versions, and a map link on locations. The old Banner, HomeSection, MenuItem
-- and Page tables stay as they are (deprecated, no longer read).
-- AlterTable
ALTER TABLE "Location" ADD COLUMN     "mapUrl" TEXT;

-- CreateTable
CREATE TABLE "ContentDocument" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "kind" "ContentDocumentKind" NOT NULL,
    "slug" TEXT,
    "draft" JSONB NOT NULL,
    "draftRevision" INTEGER NOT NULL DEFAULT 0,
    "draftUpdatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "draftUpdatedById" TEXT,
    "isSample" BOOLEAN NOT NULL DEFAULT false,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "publishPermission" TEXT,
    "publishedVersionId" TEXT,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContentDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentVersion" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    "note" TEXT,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedById" TEXT,

    CONSTRAINT "ContentVersion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ContentDocument_key_key" ON "ContentDocument"("key");

-- CreateIndex
CREATE UNIQUE INDEX "ContentDocument_slug_key" ON "ContentDocument"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "ContentDocument_publishedVersionId_key" ON "ContentDocument"("publishedVersionId");

-- CreateIndex
CREATE INDEX "ContentDocument_kind_idx" ON "ContentDocument"("kind");

-- CreateIndex
CREATE UNIQUE INDEX "ContentVersion_documentId_number_key" ON "ContentVersion"("documentId", "number");

-- AddForeignKey
ALTER TABLE "ContentDocument" ADD CONSTRAINT "ContentDocument_publishedVersionId_fkey" FOREIGN KEY ("publishedVersionId") REFERENCES "ContentVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentVersion" ADD CONSTRAINT "ContentVersion_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "ContentDocument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- A published version is a record of what was live: it is never changed or
-- removed (restoring copies it into the draft and publishes a new version).
CREATE OR REPLACE FUNCTION content_version_immutable() RETURNS trigger
LANGUAGE plpgsql AS $fn$
BEGIN
  RAISE EXCEPTION 'CONTENT_VERSION_IMMUTABLE: published versions cannot be % ', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$fn$;

CREATE TRIGGER "ContentVersion_no_update_delete"
  BEFORE UPDATE OR DELETE ON "ContentVersion"
  FOR EACH ROW EXECUTE FUNCTION content_version_immutable();
