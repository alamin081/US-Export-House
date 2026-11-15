-- Phase 8 (approved by the owner on 2026-11-15). Enum changes only, in their
-- own migration: a value added by ADD VALUE cannot be used in the same
-- transaction, and the next migration's CHECK uses FREE_SHIPPING.
ALTER TYPE "CouponType" ADD VALUE IF NOT EXISTS 'FREE_SHIPPING';

CREATE TYPE "CouponScopeMode" AS ENUM ('INCLUDE', 'EXCLUDE');
CREATE TYPE "GeoAreaKind" AS ENUM ('UPAZILA', 'METRO_THANA');
