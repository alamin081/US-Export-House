/**
 * What has to be true before content goes live — pure, no database.
 *
 * Walks any content document and reports problems an editor must fix
 * (errors block publishing) and things worth a look (warnings).
 */
import type { ContentImage, ContentLink, Localized } from "./content.schema";
import { unsafeLinksIn } from "./inline";
import { hasTodoNote, unknownPlaceholders } from "./placeholders";

export interface ContentIssue {
  level: "error" | "warning";
  message: string;
}

const LINK_TYPES = new Set(["category", "page", "tag", "product", "url"]);

function isLocalized(value: unknown): value is Localized {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const keys = Object.keys(value);
  return (
    keys.length === 2 &&
    typeof (value as Localized).en === "string" &&
    typeof (value as Localized).bn === "string"
  );
}

function isLink(value: unknown): value is ContentLink {
  return (
    typeof value === "object" &&
    value !== null &&
    LINK_TYPES.has((value as { type?: unknown }).type as string) &&
    Object.keys(value).length === 2
  );
}

function isImage(value: unknown): value is ContentImage {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as ContentImage).url === "string" &&
    isLocalized((value as ContentImage).alt)
  );
}

export interface ContentParts {
  texts: Localized[];
  links: ContentLink[];
  images: ContentImage[];
}

/** Every bilingual text, link and image in a document. */
export function contentParts(data: unknown): ContentParts {
  const parts: ContentParts = { texts: [], links: [], images: [] };
  const visit = (value: unknown, depth: number) => {
    if (depth > 20 || value === null || typeof value !== "object") return;
    if (Array.isArray(value)) {
      for (const item of value) visit(item, depth + 1);
      return;
    }
    if (isLocalized(value)) {
      parts.texts.push(value);
      return;
    }
    if (isLink(value)) {
      parts.links.push(value);
      return;
    }
    if (isImage(value)) parts.images.push(value);
    for (const nested of Object.values(value)) visit(nested, depth + 1);
  };
  visit(data, 0);
  return parts;
}

/** Texts with English but no Bengali (they fall back to English on the site). */
export function missingBengali(parts: ContentParts): number {
  return parts.texts.filter((text) => text.en.trim() !== "" && text.bn.trim() === "").length;
}

export interface LinkCheck {
  /** Returns a reason when the link points at nothing live, else null. */
  (link: ContentLink): string | null;
}

export function checkContent(
  data: unknown,
  options: { production: boolean; checkLink: LinkCheck },
): ContentIssue[] {
  const parts = contentParts(data);
  const issues: ContentIssue[] = [];
  const seen = new Set<string>();
  const add = (issue: ContentIssue) => {
    const key = `${issue.level}:${issue.message}`;
    if (!seen.has(key)) {
      seen.add(key);
      issues.push(issue);
    }
  };
  for (const text of parts.texts) {
    for (const value of [text.en, text.bn]) {
      for (const name of unknownPlaceholders(value)) {
        add({
          level: "error",
          message: `Unknown placeholder {${name}} in “${value.slice(0, 60)}”.`,
        });
      }
      for (const href of unsafeLinksIn(value)) {
        add({ level: "error", message: `Link “${href.slice(0, 60)}” is not allowed.` });
      }
      if (hasTodoNote(value)) {
        add({
          level: options.production ? "error" : "warning",
          message: `Text still to be written: “${value.slice(0, 60)}”.`,
        });
      }
    }
  }
  for (const image of parts.images) {
    if (image.alt.en.trim() === "") {
      add({ level: "error", message: "Every image needs a short English description (alt text)." });
    }
    if (image.url.startsWith("/images/")) {
      add({
        level: options.production ? "error" : "warning",
        message: "A placeholder picture is still in use. Upload your own image.",
      });
    }
  }
  for (const link of parts.links) {
    const problem = options.checkLink(link);
    if (problem !== null) add({ level: "error", message: problem });
  }
  const untranslated = missingBengali(parts);
  if (untranslated > 0) {
    add({
      level: "warning",
      message: `${untranslated} text${untranslated === 1 ? "" : "s"} without Bengali — English is shown instead.`,
    });
  }
  return issues;
}

/** Whether a scheduled item is showing at `now`. */
export function isLive(schedule: { startsAt: string | null; endsAt: string | null }, now: Date) {
  const time = now.getTime();
  if (schedule.startsAt !== null && Date.parse(schedule.startsAt) > time) return false;
  if (schedule.endsAt !== null && Date.parse(schedule.endsAt) <= time) return false;
  return true;
}
