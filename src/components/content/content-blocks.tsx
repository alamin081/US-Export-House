import { Info } from "lucide-react";

import { MediaImage } from "@/components/shared/media-image";
import type { Locale } from "@/i18n/routing";
import type { ContentBlock } from "@/modules/content/content.schema";
import type { PlaceholderValues } from "@/modules/content/placeholders";
import { localText, RichText } from "./rich-text";

/** Page and brand-story blocks: headings, paragraphs, lists, images, tables, notes. */
export function ContentBlocks({
  blocks,
  locale,
  values,
}: {
  blocks: readonly ContentBlock[];
  locale: Locale;
  values: PlaceholderValues;
}) {
  return (
    <>
      {blocks.map((block) => {
        switch (block.type) {
          case "heading":
            return block.level === 2 ? (
              <h2 key={block.id}>
                <RichText text={block.text} locale={locale} values={values} />
              </h2>
            ) : (
              <h3 key={block.id}>
                <RichText text={block.text} locale={locale} values={values} />
              </h3>
            );
          case "paragraph":
            return (
              <p key={block.id} className="whitespace-pre-line">
                <RichText text={block.text} locale={locale} values={values} />
              </p>
            );
          case "list": {
            const items = block.items.map((item, index) => (
              <li key={index}>
                <RichText text={item} locale={locale} values={values} />
              </li>
            ));
            return block.style === "number" ? (
              <ol key={block.id} className="mt-3 list-decimal space-y-1.5 pl-5">
                {items}
              </ol>
            ) : (
              <ul key={block.id}>{items}</ul>
            );
          }
          case "image":
            return (
              <figure key={block.id} className="not-prose my-8">
                <MediaImage
                  src={block.image.url}
                  alt={localText(block.image.alt, locale)}
                  ratio="video"
                  fit="contain"
                  className="rounded-lg"
                  sizes="(max-width: 768px) 100vw, 720px"
                />
                {localText(block.caption, locale) === "" ? null : (
                  <figcaption className="mt-2 text-xs text-muted-foreground">
                    <RichText text={block.caption} locale={locale} values={values} />
                  </figcaption>
                )}
              </figure>
            );
          case "table":
            return (
              <div key={block.id} className="my-6 overflow-x-auto rounded-lg border border-border">
                <table className="w-full text-sm">
                  <thead className="bg-secondary/60 text-left text-foreground">
                    <tr>
                      {block.header.map((cell, index) => (
                        <th key={index} scope="col" className="px-3 py-2 font-medium">
                          <RichText text={cell} locale={locale} values={values} />
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {block.rows.map((row, rowIndex) => (
                      <tr key={rowIndex} className="border-t border-border">
                        {row.map((cell, index) => (
                          <td key={index} className="px-3 py-2 align-top">
                            <RichText text={cell} locale={locale} values={values} />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          case "callout":
            return (
              <p
                key={block.id}
                className="my-6 flex gap-3 rounded-lg border border-border bg-secondary/50 p-4 text-sm text-foreground"
              >
                <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                <span>
                  <RichText text={block.text} locale={locale} values={values} />
                </span>
              </p>
            );
        }
      })}
    </>
  );
}
