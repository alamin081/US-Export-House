-- Phase 12 product import: the checked file (dry run) and its planned rows.
-- Additive only: two new tables, no existing table is changed.
-- CreateTable
CREATE TABLE "ProductImport" (
    "id" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileSha256" TEXT NOT NULL,
    "fileKind" TEXT NOT NULL,
    "headers" TEXT[],
    "mode" "ProductImportMode" NOT NULL DEFAULT 'ALL_OR_NOTHING',
    "status" "ProductImportStatus" NOT NULL DEFAULT 'VALIDATED',
    "rowCount" INTEGER NOT NULL,
    "createCount" INTEGER NOT NULL,
    "updateCount" INTEGER NOT NULL,
    "unchangedCount" INTEGER NOT NULL,
    "errorCount" INTEGER NOT NULL,
    "warningCount" INTEGER NOT NULL,
    "warnings" JSONB,
    "appliedCount" INTEGER NOT NULL DEFAULT 0,
    "skippedCount" INTEGER NOT NULL DEFAULT 0,
    "includeCost" BOOLEAN NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "failureReason" TEXT,

    CONSTRAINT "ProductImport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductImportRow" (
    "id" TEXT NOT NULL,
    "importId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "productCode" TEXT,
    "productName" TEXT NOT NULL,
    "productId" TEXT,
    "rowNumbers" INTEGER[],
    "action" "ProductImportAction" NOT NULL,
    "payload" JSONB NOT NULL,
    "diff" JSONB,
    "errors" JSONB,
    "warnings" JSONB,
    "sourceRows" JSONB NOT NULL,
    "requestedPublish" BOOLEAN NOT NULL DEFAULT false,
    "expectedVersion" INTEGER,
    "outcome" TEXT,
    "outcomeReason" TEXT,

    CONSTRAINT "ProductImportRow_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProductImport_fileSha256_idx" ON "ProductImport"("fileSha256");

-- CreateIndex
CREATE INDEX "ProductImport_createdAt_idx" ON "ProductImport"("createdAt");

-- CreateIndex
CREATE INDEX "ProductImportRow_importId_position_idx" ON "ProductImportRow"("importId", "position");

-- AddForeignKey
ALTER TABLE "ProductImportRow" ADD CONSTRAINT "ProductImportRow_importId_fkey" FOREIGN KEY ("importId") REFERENCES "ProductImport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

