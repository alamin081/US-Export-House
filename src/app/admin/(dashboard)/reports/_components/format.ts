import { formatMoney } from "@/lib/money";

/** Admin money: "৳1,250", "−৳80" for negatives, "—" for no value. */
export function money(poisha: number | null | undefined): string {
  if (poisha === null || poisha === undefined || !Number.isFinite(poisha)) return "—";
  const rounded = Math.round(poisha);
  const text = formatMoney(Math.abs(rounded), "en");
  return rounded < 0 ? `−${text}` : text;
}

export function count(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en-BD").format(value);
}

export function percent(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return `${value.toFixed(1)}%`;
}

export function cellText(value: string | number | null | undefined, kind: string): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "string") return value;
  if (kind === "money") return money(value);
  if (kind === "percent") return percent(value);
  return count(value);
}

/** Axis ticks: 0 / 2K / 1.5M, in taka for money. */
export function compact(value: number, kind: "money" | "int"): string {
  const base = kind === "money" ? value / 100 : value;
  const text = new Intl.NumberFormat("en", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(base);
  return kind === "money" ? `৳${text}` : text;
}
