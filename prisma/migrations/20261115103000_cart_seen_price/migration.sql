-- Phase 8: the price a cart line was last shown at, so the cart can say
-- "the price changed". Display only; totals always use the current price.
-- AlterTable
ALTER TABLE "CartItem" ADD COLUMN     "seenPricePoisha" INTEGER;

