/**
 * Barcode encoders — pure, no dependencies. Each returns the symbol as a list
 * of modules (true = bar, false = space) that the SVG component draws at any
 * size; quiet zones are left to the caller.
 *
 * - EAN-13 for product labels: every USB scanner reads it and it fits a
 *   38×25 mm label. Our own codes use the GS1 "restricted circulation" range
 *   29 (never a real retail code): 29 + 10-digit sequence + check digit.
 * - Code 128 (set B) for order and invoice numbers on slips and labels:
 *   letters, digits and "-".
 */

// ---------------------------------------------------------------------------
// EAN-13
// ---------------------------------------------------------------------------

const EAN_L = [
  "0001101",
  "0011001",
  "0010011",
  "0111101",
  "0100011",
  "0110001",
  "0101111",
  "0111011",
  "0110111",
  "0001011",
] as const;
const EAN_G = [
  "0100111",
  "0110011",
  "0011011",
  "0100001",
  "0011101",
  "0111001",
  "0000101",
  "0010001",
  "0001001",
  "0010111",
] as const;
const EAN_R = [
  "1110010",
  "1100110",
  "1101100",
  "1000010",
  "1011100",
  "1001110",
  "1010000",
  "1000100",
  "1001000",
  "1110100",
] as const;
/** Which of the left six digits use the G set, chosen by the first digit. */
const EAN_PARITY = [
  "LLLLLL",
  "LLGLGG",
  "LLGGLG",
  "LLGGGL",
  "LGLLGG",
  "LGGLLG",
  "LGGGLL",
  "LGLGLG",
  "LGLGGL",
  "LGGLGL",
] as const;

/** Prefix of the shop's own EAN-13 codes (GS1 restricted circulation). */
export const INTERNAL_EAN_PREFIX = "29";
/** Digits of the running number between the prefix and the check digit. */
export const INTERNAL_EAN_SEQUENCE_DIGITS = 10;

/** Check digit for the first 12 digits of an EAN-13. */
export function ean13CheckDigit(first12: string): number {
  if (!/^\d{12}$/.test(first12))
    throw new Error("EAN-13 needs exactly 12 digits before the check.");
  let sum = 0;
  for (let index = 0; index < 12; index += 1) {
    sum += Number(first12[index]) * (index % 2 === 0 ? 1 : 3);
  }
  return (10 - (sum % 10)) % 10;
}

export function isValidEan13(code: string): boolean {
  return /^\d{13}$/.test(code) && ean13CheckDigit(code.slice(0, 12)) === Number(code[12]);
}

/** The shop's EAN-13 for a sequence number: 29 + zero-padded number + check digit. */
export function internalEan13(sequence: number): string {
  if (!Number.isSafeInteger(sequence) || sequence < 1) throw new Error("Bad barcode sequence.");
  const body = String(sequence).padStart(INTERNAL_EAN_SEQUENCE_DIGITS, "0");
  if (body.length > INTERNAL_EAN_SEQUENCE_DIGITS) throw new Error("Barcode sequence exhausted.");
  const first12 = `${INTERNAL_EAN_PREFIX}${body}`;
  return `${first12}${ean13CheckDigit(first12)}`;
}

function bits(pattern: string): boolean[] {
  return [...pattern].map((bit) => bit === "1");
}

/** 95 modules: start guard, six left digits, centre guard, six right digits, end guard. */
export function ean13Modules(code: string): boolean[] {
  if (!isValidEan13(code)) throw new Error(`Not a valid EAN-13: ${code}`);
  const digits = [...code].map(Number);
  const parity = EAN_PARITY[digits[0]!]!;
  const modules = bits("101");
  for (let index = 1; index <= 6; index += 1) {
    const set = parity[index - 1] === "G" ? EAN_G : EAN_L;
    modules.push(...bits(set[digits[index]!]!));
  }
  modules.push(...bits("01010"));
  for (let index = 7; index <= 12; index += 1) modules.push(...bits(EAN_R[digits[index]!]!));
  modules.push(...bits("101"));
  return modules;
}

// ---------------------------------------------------------------------------
// Code 128
// ---------------------------------------------------------------------------

/** Bar/space widths for symbol values 0-106 (106 = stop, 7 elements). */
export const CODE128_PATTERNS = [
  "212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312", "132212", "221213",
  "221312", "231212", "112232", "122132", "122231", "113222", "123122", "123221", "223211", "221132",
  "221231", "213212", "223112", "312131", "311222", "321122", "321221", "312212", "322112", "322211",
  "212123", "212321", "232121", "111323", "131123", "131321", "112313", "132113", "132311", "211313",
  "231113", "231311", "112133", "112331", "132131", "113123", "113321", "133121", "313121", "211331",
  "231131", "213113", "213311", "213131", "311123", "311321", "331121", "312113", "312311", "332111",
  "314111", "221411", "431111", "111224", "111422", "121124", "121421", "141122", "141221", "112214",
  "112412", "122114", "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111",
  "111242", "121142", "121241", "114212", "124112", "124211", "411212", "421112", "421211", "212141",
  "214121", "412121", "111143", "111341", "131141", "114113", "114311", "411113", "411311", "113141",
  "114131", "311141", "411131", "211412", "211214", "211232", "2331112",
] as const; // prettier-ignore

const CODE128_START_B = 104;
const CODE128_STOP = 106;

/** Symbol values for `text` in code set B, start and checksum included (no stop). */
export function code128Values(text: string): number[] {
  if (text.length === 0) throw new Error("Code 128 needs at least one character.");
  const values = [CODE128_START_B];
  for (const char of text) {
    const code = char.charCodeAt(0);
    if (code < 32 || code > 126) throw new Error(`Code 128 B cannot encode "${char}".`);
    values.push(code - 32);
  }
  const checksum =
    values.reduce((sum, value, index) => sum + value * (index === 0 ? 1 : index), 0) % 103;
  values.push(checksum);
  return values;
}

export function code128Modules(text: string): boolean[] {
  const modules: boolean[] = [];
  for (const value of [...code128Values(text), CODE128_STOP]) {
    const widths = CODE128_PATTERNS[value]!;
    [...widths].forEach((width, index) => {
      for (let n = 0; n < Number(width); n += 1) modules.push(index % 2 === 0);
    });
  }
  return modules;
}

// ---------------------------------------------------------------------------
// drawing
// ---------------------------------------------------------------------------

/** Runs of consecutive bars as [start, width] in modules, for compact SVG output. */
export function barRuns(modules: readonly boolean[]): Array<[number, number]> {
  const runs: Array<[number, number]> = [];
  let start = -1;
  modules.forEach((bar, index) => {
    if (bar && start < 0) start = index;
    if (!bar && start >= 0) {
      runs.push([start, index - start]);
      start = -1;
    }
  });
  if (start >= 0) runs.push([start, modules.length - start]);
  return runs;
}
