-- Phase 6: catalogue, images, options and search. ADDITIVE ONLY: new columns
-- (all nullable or with defaults), new tables, new indexes and constraints.
-- Nothing is dropped, renamed or retyped, and no existing row is modified.

-- Trigram search (works for Bengali and Latin text alike). Supported on Neon.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- CreateEnum
CREATE TYPE "SizeChartUnit" AS ENUM ('INCH', 'CM');

-- AlterTable
ALTER TABLE "Brand" ADD COLUMN     "descriptionBn" TEXT,
ADD COLUMN     "descriptionEn" TEXT,
ADD COLUMN     "logoStorageKey" TEXT;

-- AlterTable
ALTER TABLE "Category" ADD COLUMN     "code" TEXT,
ADD COLUMN     "imageStorageKey" TEXT,
ADD COLUMN     "seoDescriptionBn" TEXT,
ADD COLUMN     "seoDescriptionEn" TEXT,
ADD COLUMN     "seoTitleBn" TEXT,
ADD COLUMN     "seoTitleEn" TEXT;

-- AlterTable
ALTER TABLE "OptionValue" ADD COLUMN     "code" TEXT,
ADD COLUMN     "presetId" TEXT;

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "code" TEXT,
ADD COLUMN     "fit" TEXT,
ADD COLUMN     "seoDescriptionBn" TEXT,
ADD COLUMN     "seoDescriptionEn" TEXT,
ADD COLUMN     "seoTitleBn" TEXT,
ADD COLUMN     "seoTitleEn" TEXT,
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "ProductImage" ADD COLUMN     "bytes" INTEGER,
ADD COLUMN     "format" TEXT,
ADD COLUMN     "height" INTEGER,
ADD COLUMN     "storageKey" TEXT,
ADD COLUMN     "storageProvider" TEXT,
ADD COLUMN     "width" INTEGER;

-- AlterTable
ALTER TABLE "ProductVariant" ADD COLUMN     "optionKey" TEXT;

-- AlterTable
ALTER TABLE "SizeChart" ADD COLUMN     "unit" "SizeChartUnit" NOT NULL DEFAULT 'INCH';

-- CreateTable
CREATE TABLE "ProductCategory" (
    "productId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductCategory_pkey" PRIMARY KEY ("productId","categoryId")
);

-- CreateTable
CREATE TABLE "Tag" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "nameBn" TEXT,
    "aliases" TEXT[],
    "searchText" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductTag" (
    "productId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,

    CONSTRAINT "ProductTag_pkey" PRIMARY KEY ("productId","tagId")
);

-- CreateTable
CREATE TABLE "OptionPreset" (
    "id" TEXT NOT NULL,
    "type" "OptionType" NOT NULL,
    "group" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "valueEn" TEXT NOT NULL,
    "valueBn" TEXT,
    "hex" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OptionPreset_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProductCategory_categoryId_idx" ON "ProductCategory"("categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "Tag_slug_key" ON "Tag"("slug");

-- CreateIndex
CREATE INDEX "Tag_searchText_trgm_idx" ON "Tag" USING GIN ("searchText" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "ProductTag_tagId_idx" ON "ProductTag"("tagId");

-- CreateIndex
CREATE INDEX "OptionPreset_type_isActive_sortOrder_idx" ON "OptionPreset"("type", "isActive", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "OptionPreset_type_group_code_key" ON "OptionPreset"("type", "group", "code");

-- CreateIndex
CREATE UNIQUE INDEX "Category_code_key" ON "Category"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Product_code_key" ON "Product"("code");

-- CreateIndex
CREATE INDEX "Product_nameEn_trgm_idx" ON "Product" USING GIN ("nameEn" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "Product_nameBn_trgm_idx" ON "Product" USING GIN ("nameBn" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "ProductVariant_sku_trgm_idx" ON "ProductVariant" USING GIN ("sku" gin_trgm_ops);

-- AddForeignKey
ALTER TABLE "OptionValue" ADD CONSTRAINT "OptionValue_presetId_fkey" FOREIGN KEY ("presetId") REFERENCES "OptionPreset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductCategory" ADD CONSTRAINT "ProductCategory_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductCategory" ADD CONSTRAINT "ProductCategory_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductTag" ADD CONSTRAINT "ProductTag_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductTag" ADD CONSTRAINT "ProductTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------
-- Hand-written guard rails (Prisma has no syntax for these)
-- ---------------------------------------------------------------------------

-- A compare-at ("was") price must be higher than the price. Checked against
-- the existing 245 variants before writing this: 0 violations.
ALTER TABLE "ProductVariant"
  ADD CONSTRAINT "ProductVariant_compare_gt_price"
    CHECK ("comparePricePoisha" IS NULL OR "comparePricePoisha" > "pricePoisha");

-- SKU-safe codes: capital letters and digits only.
ALTER TABLE "Category"
  ADD CONSTRAINT "Category_code_format" CHECK ("code" IS NULL OR "code" ~ '^[A-Z]{2,4}$');
ALTER TABLE "OptionPreset"
  ADD CONSTRAINT "OptionPreset_code_format" CHECK ("code" ~ '^[A-Z0-9]{1,6}$');

-- Running number for product codes: UEH-{CATEGORY_CODE}{0001}.
CREATE SEQUENCE IF NOT EXISTS "product_code_seq" AS BIGINT START WITH 1 INCREMENT BY 1;
