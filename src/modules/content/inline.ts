/**
 * Inline formatting for content text — pure, no HTML anywhere.
 *
 * Editors may write **bold**, *italic* and [label](link). The text is turned
 * into tokens that React renders as elements with plain text children, so a
 * typed `<script>` or `<img onerror=…>` is shown as characters, never run.
 * Links pass `safeHref`: only https, http, mailto, tel and site paths.
 */

export type InlineToken =
  | { type: "text"; text: string }
  | { type: "bold"; text: string }
  | { type: "italic"; text: string }
  | { type: "link"; text: string; href: string };

/** Characters browsers ignore inside a URL scheme (used to disguise "javascript:"). */
const IGNORED_IN_SCHEME = /[\u0000-\u0020\u007f-\u009f\u200b-\u200f\u2028\u2029\ufeff]/g;

/**
 * The link as written when it is safe, otherwise null. Allowed: https:,
 * http:, mailto:, tel:, and paths starting with a single "/".
 */
export function safeHref(raw: string): string | null {
  const value = raw.trim();
  if (value === "" || value.length > 500) return null;
  if (value.startsWith("/")) {
    // "//host" and "/\host" are other sites in disguise.
    if (value.startsWith("//") || value.startsWith("/\\")) return null;
    return /[\s<>"']/.test(value) ? null : value;
  }
  const compact = value.replace(IGNORED_IN_SCHEME, "").toLowerCase();
  const scheme = /^([a-z][a-z0-9+.-]*):/.exec(compact)?.[1];
  if (scheme === undefined) return null;
  if (scheme === "mailto") return /^mailto:[^\s<>"']+@[^\s<>"']+$/i.test(value) ? value : null;
  if (scheme === "tel") return /^tel:\+?[0-9 ()-]{3,20}$/i.test(value) ? value : null;
  if (scheme !== "https" && scheme !== "http") return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

/** True for links that leave the site. */
export function isExternalHref(href: string): boolean {
  return /^https?:/i.test(href);
}

const TOKEN = /\*\*([^*\n]+)\*\*|\*([^*\n]+)\*|\[([^\]\n]{1,200})\]\(([^)\s]{1,500})\)/g;

/** Splits text into plain, bold, italic and link tokens. Unsafe links stay plain text. */
export function parseInline(text: string): InlineToken[] {
  const tokens: InlineToken[] = [];
  let last = 0;
  for (const match of text.matchAll(TOKEN)) {
    const index = match.index ?? 0;
    if (index > last) tokens.push({ type: "text", text: text.slice(last, index) });
    if (match[1] !== undefined) tokens.push({ type: "bold", text: match[1] });
    else if (match[2] !== undefined) tokens.push({ type: "italic", text: match[2] });
    else {
      const href = safeHref(match[4]!);
      tokens.push(
        href === null ? { type: "text", text: match[3]! } : { type: "link", text: match[3]!, href },
      );
    }
    last = index + match[0].length;
  }
  if (last < text.length) tokens.push({ type: "text", text: text.slice(last) });
  return tokens;
}

/** Links written in a text that would be dropped as unsafe (shown to the editor). */
export function unsafeLinksIn(text: string): string[] {
  const bad: string[] = [];
  for (const match of text.matchAll(TOKEN)) {
    if (match[4] !== undefined && safeHref(match[4]) === null) bad.push(match[4]);
  }
  return bad;
}

/** Plain text without the formatting marks (for meta descriptions and JSON-LD). */
export function plainText(text: string): string {
  return parseInline(text)
    .map((token) => token.text)
    .join("");
}
