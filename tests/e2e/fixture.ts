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
}
