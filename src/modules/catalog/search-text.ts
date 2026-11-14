/**
 * Search text normalisation, shared by the indexer (tags) and the query side,
 * so "Panjabi", " panjabi " and "PANJABI" match, and Bengali composed and
 * decomposed forms of the same word compare equal (NFC).
 */

/** Unicode NFC, lower case, single spaces. */
export function normalizeSearchText(value: string): string {
  return value.normalize("NFC").toLowerCase().replace(/\s+/g, " ").trim();
}

/** Up to five search terms of at least one character, each normalised. */
export function searchTerms(query: string): string[] {
  return normalizeSearchText(query)
    .split(" ")
    .filter((term) => term.length > 0)
    .slice(0, 5)
    .map((term) => term.slice(0, 40));
}

/** Escapes LIKE wildcards so a user's "%" or "_" is matched literally. */
export function escapeLike(term: string): string {
  return term.replace(/[\\%_]/g, (character) => `\\${character}`);
}

/** Normalised, de-duplicated alternative spellings. */
export function normalizeAliases(aliases: readonly string[]): string[] {
  return [...new Set(aliases.map(normalizeSearchText).filter((alias) => alias !== ""))].slice(
    0,
    20,
  );
}

/** The indexed text of a tag: both names and every alias. */
export function tagSearchText(tag: {
  nameEn: string;
  nameBn: string | null;
  aliases: readonly string[];
}): string {
  return normalizeAliases([tag.nameEn, tag.nameBn ?? "", ...tag.aliases]).join(" ");
}
