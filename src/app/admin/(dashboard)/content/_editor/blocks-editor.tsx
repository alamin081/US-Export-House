"use client";

import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { ContentBlock, Localized } from "@/modules/content/content.schema";
import {
  ChoiceField,
  EMPTY,
  FORMATTING_HINT,
  ImageField,
  ItemTools,
  LocalizedField,
  move,
  newId,
  replaceAt,
  withNewIds,
} from "./fields";

/**
 * The page body as a list of blocks. Text is plain with a little formatting
 * (**bold**, *italic*, [link](address)); nothing typed here can become HTML.
 */

const BLOCK_LABELS: Record<ContentBlock["type"], string> = {
  heading: "Heading",
  paragraph: "Paragraph",
  list: "List",
  image: "Image",
  table: "Table",
  callout: "Note",
};

function newBlock(type: ContentBlock["type"]): ContentBlock {
  const id = newId();
  switch (type) {
    case "heading":
      return { type, id, level: 2, text: EMPTY };
    case "paragraph":
      return { type, id, text: EMPTY };
    case "list":
      return { type, id, style: "bullet", items: [EMPTY] };
    case "image":
      return {
        type,
        id,
        image: {
          url: "/images/editorial/brand.svg",
          key: null,
          width: null,
          height: null,
          alt: EMPTY,
        },
        caption: EMPTY,
      };
    case "table":
      return { type, id, header: [EMPTY, EMPTY], rows: [[EMPTY, EMPTY]] };
    case "callout":
      return { type, id, text: EMPTY };
  }
}

function BlockFields({
  block,
  onChange,
}: {
  block: ContentBlock;
  onChange: (block: ContentBlock) => void;
}) {
  switch (block.type) {
    case "heading":
      return (
        <>
          <ChoiceField
            label="Size"
            value={String(block.level) as "2" | "3"}
            options={[
              { value: "2", label: "Section heading" },
              { value: "3", label: "Small heading" },
            ]}
            onChange={(level) => onChange({ ...block, level: level === "2" ? 2 : 3 })}
          />
          <LocalizedField
            label="Heading"
            value={block.text}
            required
            maxLength={200}
            onChange={(text) => onChange({ ...block, text })}
          />
        </>
      );
    case "paragraph":
    case "callout":
      return (
        <LocalizedField
          label={block.type === "callout" ? "Note text" : "Text"}
          value={block.text}
          required
          multiline
          rows={5}
          placeholders
          hintEn={FORMATTING_HINT.en}
          hintBn={FORMATTING_HINT.bn}
          onChange={(text) => onChange({ ...block, text })}
        />
      );
    case "list":
      return (
        <>
          <ChoiceField
            label="Style"
            value={block.style}
            options={[
              { value: "bullet", label: "• Bullets" },
              { value: "number", label: "1. Numbered" },
            ]}
            onChange={(style) => onChange({ ...block, style })}
          />
          {block.items.map((item, index) => (
            <div key={index} className="flex items-start gap-2">
              <div className="flex-1">
                <LocalizedField
                  label={`Item ${index + 1}`}
                  value={item}
                  required
                  placeholders
                  onChange={(next) =>
                    onChange({ ...block, items: replaceAt(block.items, index, next) })
                  }
                />
              </div>
              <ItemTools
                index={index}
                count={block.items.length}
                label="item"
                onMove={(to) => onChange({ ...block, items: move(block.items, index, to) })}
                onRemove={() =>
                  onChange({ ...block, items: block.items.filter((_, at) => at !== index) })
                }
              />
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onChange({ ...block, items: [...block.items, EMPTY] })}
          >
            Add item
          </Button>
        </>
      );
    case "image":
      return (
        <>
          <ImageField
            label="Image"
            value={block.image}
            required
            sizeHint="Any shape; at least 800 px wide."
            minWidth={800}
            onChange={(image) => image !== null && onChange({ ...block, image })}
          />
          <LocalizedField
            label="Caption (optional)"
            value={block.caption}
            maxLength={300}
            onChange={(caption) => onChange({ ...block, caption })}
          />
        </>
      );
    case "table": {
      const columns = block.header.length;
      const setCell = (row: number, column: number, value: Localized) =>
        onChange({
          ...block,
          rows: replaceAt(block.rows, row, replaceAt(block.rows[row]!, column, value)),
        });
      return (
        <div className="flex flex-col gap-3">
          <p className="text-xs text-muted-foreground">
            Columns: {columns} (up to 8). Each cell has English and Bengali. টেবিলের প্রতিটি ঘরে দুই
            ভাষায় লিখুন।
          </p>
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={columns >= 8}
              onClick={() =>
                onChange({
                  ...block,
                  header: [...block.header, EMPTY],
                  rows: block.rows.map((row) => [...row, EMPTY]),
                })
              }
            >
              Add column
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={columns <= 1}
              onClick={() =>
                onChange({
                  ...block,
                  header: block.header.slice(0, -1),
                  rows: block.rows.map((row) => row.slice(0, -1)),
                })
              }
            >
              Remove last column
            </Button>
          </div>
          <div
            className="grid gap-2"
            style={{ gridTemplateColumns: `repeat(${columns}, minmax(10rem, 1fr))` }}
          >
            {block.header.map((cell, column) => (
              <LocalizedField
                key={`h${column}`}
                label={`Header ${column + 1}`}
                value={cell}
                onChange={(value) =>
                  onChange({ ...block, header: replaceAt(block.header, column, value) })
                }
              />
            ))}
            {block.rows.map((row, rowIndex) =>
              row.map((cell, column) => (
                <LocalizedField
                  key={`${rowIndex}-${column}`}
                  label={`Row ${rowIndex + 1}, column ${column + 1}`}
                  value={cell}
                  placeholders={column === 0}
                  onChange={(value) => setCell(rowIndex, column, value)}
                />
              )),
            )}
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={block.rows.length >= 50}
              onClick={() =>
                onChange({
                  ...block,
                  rows: [...block.rows, Array.from({ length: columns }, () => EMPTY)],
                })
              }
            >
              Add row
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={block.rows.length === 0}
              onClick={() => onChange({ ...block, rows: block.rows.slice(0, -1) })}
            >
              Remove last row
            </Button>
          </div>
        </div>
      );
    }
  }
}

export function BlocksEditor({
  blocks,
  onChange,
}: {
  blocks: readonly ContentBlock[];
  onChange: (blocks: ContentBlock[]) => void;
}) {
  return (
    <div className="flex flex-col gap-3" data-testid="blocks-editor">
      {blocks.length === 0 ? (
        <p className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
          No text yet. Add a heading or a paragraph below. নিচের বাটন থেকে লেখা যোগ করুন।
        </p>
      ) : null}
      {blocks.map((block, index) => (
        <div
          key={block.id}
          className="rounded-md border border-border p-3"
          data-testid={`block-${index}`}
        >
          <div className="mb-3 flex items-center justify-between">
            <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              {BLOCK_LABELS[block.type]}
            </span>
            <ItemTools
              index={index}
              count={blocks.length}
              label={BLOCK_LABELS[block.type].toLowerCase()}
              onMove={(to) => onChange(move(blocks, index, to))}
              onCopy={() =>
                onChange([
                  ...blocks.slice(0, index + 1),
                  withNewIds(block),
                  ...blocks.slice(index + 1),
                ])
              }
              onRemove={() => onChange(blocks.filter((_, at) => at !== index))}
            />
          </div>
          <div className="flex flex-col gap-3">
            <BlockFields
              block={block}
              onChange={(next) => onChange(replaceAt(blocks, index, next))}
            />
          </div>
        </div>
      ))}
      <div className="flex flex-wrap gap-2">
        {(Object.keys(BLOCK_LABELS) as Array<ContentBlock["type"]>).map((type) => (
          <Button
            key={type}
            type="button"
            size="sm"
            variant="outline"
            onClick={() => onChange([...blocks, newBlock(type)])}
            data-testid={`add-block-${type}`}
          >
            <Plus aria-hidden="true" className="size-3.5" />
            {BLOCK_LABELS[type]}
          </Button>
        ))}
      </div>
    </div>
  );
}
