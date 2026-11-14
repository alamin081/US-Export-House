-- Phase 6 (B1, approved by the owner on 2026-11-14).
-- Hand-written: renames the enum label in place. Postgres keeps every row that
-- held 'ACTIVE' (24 sample products) and they now read 'PUBLISHED'. Prisma's
-- generated migration would have dropped and recreated the enum instead.
ALTER TYPE "ProductStatus" RENAME VALUE 'ACTIVE' TO 'PUBLISHED';
