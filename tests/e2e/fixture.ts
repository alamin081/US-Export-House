import { join } from "node:path";

/** Written by create-fixture.ts, read by the specs. Git-ignored (e2e-results/). */
export const FIXTURE_FILE = join(process.cwd(), "e2e-results", "fixture.json");

export interface E2EFixture {
  run: string;
  password: string;
  managerEmail: string;
  inventoryEmail: string;
  categoryLabel: string;
  /** Phase 7: a branch, its sales staff, and a published product with sizes M and L. */
  salesEmail: string;
  branchCode: string;
  stockSlug: string;
  stockName: string;
  skuM: string;
  skuL: string;
  /** Phase 8: a product with stock online, a 10% coupon, Order Staff, phones. */
  checkoutSlug: string;
  checkoutName: string;
  couponCode: string;
  orderStaffEmail: string;
  /** Phase 9: a second item stocked online, swapped in by the order edit. */
  swapSku: string;
  /** Phase 9: a shop, its Branch Manager and an item without a barcode (labels and till). */
  tillManagerEmail: string;
  tillSku: string;
  tillBranchCode: string;
  phoneBn: string;
  phoneEn: string;
}
