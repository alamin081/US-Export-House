import { join } from "node:path";

/** Written by create-fixture.ts, read by the specs. Git-ignored (e2e-results/). */
export const FIXTURE_FILE = join(process.cwd(), "e2e-results", "fixture.json");

export interface E2EFixture {
  run: string;
  password: string;
  managerEmail: string;
  inventoryEmail: string;
  categoryLabel: string;
}
