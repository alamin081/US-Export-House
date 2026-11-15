-- Phase 12: admin overrides for storefront UI labels (approved by the owner,
-- 2026-11-15, plan section 12). Additive only.
-- CreateTable
CREATE TABLE "UiLabelOverride" (
    "id" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UiLabelOverride_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UiLabelOverride_locale_key_key" ON "UiLabelOverride"("locale", "key");

