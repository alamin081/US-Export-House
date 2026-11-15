/**
 * Checks the browser JavaScript of a finished `next build` for things that must
 * never reach a customer's or a cashier's browser: server secrets (by value)
 * and purchase-cost fields (by name).
 *
 *   npm run check:bundle            # checks .next/static
 *   npm run check:bundle -- .next-e2e
 *
 * Exits with 1 and lists every hit. Server chunks are not checked: only
 * `<dist>/static` is ever sent to browsers.
 *
 * The one allowed exception for cost field names: admin forms where staff
 * holding inventory.receive type purchase costs in (stock receiving and the
 * stock CSV import). They carry `data-cost-entry`; a chunk containing that
 * marker may name cost fields. Secret values are never allowed anywhere.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const distDir = process.argv[2] ?? ".next";
const root = join(process.cwd(), distDir, "static");

/** Field names that only exist to carry purchase cost. */
const FORBIDDEN_NAMES = ["costPoisha", "unitCostPoisha", "costValue", "cost_tk"];

const COST_ENTRY_MARKER = "data-cost-entry";

/** Secret environment variables, checked by value when set and long enough. */
const SECRET_ENV = [
  "AUTH_SECRET",
  "CLOUDINARY_API_SECRET",
  "CLOUDINARY_API_KEY",
  "DATABASE_URL",
  "DATABASE_URL_UNPOOLED",
  "SMS_API_KEY",
  "SSLCOMMERZ_STORE_PASSWORD",
  "STEADFAST_SECRET_KEY",
  "CRON_SECRET",
];

function files(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...files(path));
    else if (/\.(js|mjs|json|txt|html)$/.test(name)) out.push(path);
  }
  return out;
}

let list: string[];
try {
  list = files(root);
} catch {
  console.error(`[check-bundle] ${root} not found — run the build first.`);
  process.exit(1);
}

const secrets = SECRET_ENV.map((name) => [name, process.env[name] ?? ""] as const).filter(
  ([, value]) => value.length >= 12,
);
const hits: string[] = [];
for (const file of list) {
  const text = readFileSync(file, "utf8");
  if (!text.includes(COST_ENTRY_MARKER)) {
    for (const name of FORBIDDEN_NAMES) {
      if (text.includes(name)) hits.push(`${file}: field name "${name}"`);
    }
  }
  for (const [name, value] of secrets) {
    if (text.includes(value)) hits.push(`${file}: value of ${name}`);
  }
}

if (hits.length > 0) {
  console.error(`[check-bundle] ${hits.length} problem(s):`);
  for (const hit of hits) console.error(`  ${hit}`);
  process.exit(1);
}
console.info(
  `[check-bundle] OK: ${list.length} browser files, no cost fields, ${secrets.length} secret value(s) checked.`,
);
