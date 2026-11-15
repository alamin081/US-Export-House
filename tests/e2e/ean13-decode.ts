/**
 * Decodes an EAN-13 from the bars drawn on a page (x and width of each black
 * rect), using the standard's own tables — written here independently of the
 * app's encoder, so a wrong table or drawing bug would fail the test.
 */

const L: Record<string, number> = {
  "0001101": 0, "0011001": 1, "0010011": 2, "0111101": 3, "0100011": 4,
  "0110001": 5, "0101111": 6, "0111011": 7, "0110111": 8, "0001011": 9,
}; // prettier-ignore
const G: Record<string, number> = {
  "0100111": 0, "0110011": 1, "0011011": 2, "0100001": 3, "0011101": 4,
  "0111001": 5, "0000101": 6, "0010001": 7, "0001001": 8, "0010111": 9,
}; // prettier-ignore
const R: Record<string, number> = {
  "1110010": 0, "1100110": 1, "1101100": 2, "1000010": 3, "1011100": 4,
  "1001110": 5, "1010000": 6, "1000100": 7, "1001000": 8, "1110100": 9,
}; // prettier-ignore
const FIRST_DIGIT: Record<string, number> = {
  LLLLLL: 0, LLGLGG: 1, LLGGLG: 2, LLGGGL: 3, LGLLGG: 4,
  LGGLLG: 5, LGGGLL: 6, LGLGLG: 7, LGLGGL: 8, LGGLGL: 9,
}; // prettier-ignore

export function decodeEan13(bars: ReadonlyArray<{ x: number; width: number }>): string {
  const sorted = [...bars].sort((a, b) => a.x - b.x);
  const start = sorted[0]!.x;
  const end = sorted.at(-1)!.x + sorted.at(-1)!.width;
  const moduleWidth = (end - start) / 95;
  const modules = Array.from({ length: 95 }, () => "0");
  for (const bar of sorted) {
    const from = Math.round((bar.x - start) / moduleWidth);
    const count = Math.round(bar.width / moduleWidth);
    for (let index = from; index < from + count && index < 95; index += 1) modules[index] = "1";
  }
  const bits = modules.join("");
  if (bits.slice(0, 3) !== "101" || bits.slice(45, 50) !== "01010" || bits.slice(92) !== "101") {
    throw new Error(`Guard bars not found: ${bits}`);
  }
  let parity = "";
  const digits: number[] = [];
  for (let index = 0; index < 6; index += 1) {
    const chunk = bits.slice(3 + index * 7, 10 + index * 7);
    if (chunk in L) {
      parity += "L";
      digits.push(L[chunk]!);
    } else if (chunk in G) {
      parity += "G";
      digits.push(G[chunk]!);
    } else throw new Error(`Bad left digit ${chunk}`);
  }
  for (let index = 0; index < 6; index += 1) {
    const chunk = bits.slice(50 + index * 7, 57 + index * 7);
    if (!(chunk in R)) throw new Error(`Bad right digit ${chunk}`);
    digits.push(R[chunk]!);
  }
  const first = FIRST_DIGIT[parity];
  if (first === undefined) throw new Error(`Bad parity ${parity}`);
  const code = [first, ...digits];
  const sum = code
    .slice(0, 12)
    .reduce((total, digit, index) => total + digit * (index % 2 === 0 ? 1 : 3), 0);
  if ((10 - (sum % 10)) % 10 !== code[12]) throw new Error("Check digit mismatch");
  return code.join("");
}
