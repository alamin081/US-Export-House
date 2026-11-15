-- Phase 12 product import: modes, statuses and planned actions. Kept in its
-- own migration, like every enum change.
-- CreateEnum
CREATE TYPE "ProductImportMode" AS ENUM ('ALL_OR_NOTHING', 'GOOD_ONLY');

-- CreateEnum
CREATE TYPE "ProductImportStatus" AS ENUM ('VALIDATED', 'APPLYING', 'DONE', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ProductImportAction" AS ENUM ('CREATE', 'UPDATE', 'UNCHANGED', 'ERROR');
