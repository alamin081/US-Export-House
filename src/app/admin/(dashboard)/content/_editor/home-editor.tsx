"use client";

import { useContext, useEffect, useState } from "react";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { searchProductsAction } from "@/modules/content/content.actions";
import {
  PRODUCT_RULES,
  TRUST_ICONS,
  type ContentButton,
  type HomeContent,
  type HomeSection,
} from "@/modules/content/content.schema";
import { BlocksEditor } from "./blocks-editor";
import {
  ChoiceField,
  EditorContext,
  EMPTY,
  Hint,
  ImageField,
  ItemTools,
  LinkPicker,
  LocalizedField,
  move,
  newId,
  Panel,
  replaceAt,
  ScheduleField,
  Toggle,
  withNewIds,
} from "./fields";

type SectionType = HomeSection["type"];

const SECTION_LABELS: Record<SectionType, string> = {
  hero: "Hero banner",
  categories: "Category tiles",
  products: "Product row",
  promo: "Promo banner",
  collections: "Collections / lookbook",
  story: "Brand story",
  trust: "Trust badges",
};

const PLACEHOLDER_IMAGE = {
  url: "/images/editorial/hero.svg",
  key: null,
  width: null,
  height: null,
  alt: EMPTY,
};

const NO_SCHEDULE = { startsAt: null, endsAt: null };

function newSection(type: SectionType): HomeSection {
  const base = { id: newId(), enabled: true };
  switch (type) {
    case "hero":
      return {
        ...base,
        type,
        slides: [
          {
            id: newId(),
            desktop: PLACEHOLDER_IMAGE,
            mobile: null,
            eyebrow: EMPTY,
            title: EMPTY,
            subtitle: EMPTY,
            primary: null,
            secondary: null,
            textTone: "dark",
            schedule: NO_SCHEDULE,
          },
        ],
      };
    case "categories":
      return { ...base, type, eyebrow: EMPTY, title: EMPTY, description: EMPTY, categoryIds: [] };
    case "products":
      return {
        ...base,
        type,
        title: EMPTY,
        description: EMPTY,
        rule: "new",
        tagSlug: null,
        categoryId: null,
        productIds: [],
        limit: 8,
        viewAll: null,
      };
    case "promo":
      return {
        ...base,
        type,
        image: PLACEHOLDER_IMAGE,
        eyebrow: EMPTY,
        title: EMPTY,
        body: EMPTY,
        cta: null,
        tone: "accent",
        schedule: NO_SCHEDULE,
      };
    case "collections":
      return {
        ...base,
        type,
        eyebrow: EMPTY,
        title: EMPTY,
        description: EMPTY,
        items: [
          {
            id: newId(),
            image: PLACEHOLDER_IMAGE,
            title: EMPTY,
            description: EMPTY,
            link: { type: "url", href: "/shop" },
          },
        ],
      };
    case "story":
      return {
        ...base,
        type,
        image: null,
        eyebrow: EMPTY,
        title: EMPTY,
        blocks: [],
        stats: [],
        cta: null,
      };
    case "trust":
      return {
        ...base,
        type,
        items: [{ id: newId(), icon: "cash", title: EMPTY, text: EMPTY }],
      };
  }
}

function ButtonField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: ContentButton | null;
  onChange: (value: ContentButton | null) => void;
}) {
  return (
    <div className="rounded-md border border-dashed border-border p-3">
      <Toggle
        label={label}
        checked={value !== null}
        onChange={(on) =>
          onChange(on ? { label: EMPTY, link: { type: "url", href: "/shop" } } : null)
        }
      />
      {value === null ? null : (
        <div className="mt-3 flex flex-col gap-3">
          <LocalizedField
            label="Button text"
            value={value.label}
            required
            maxLength={40}
            onChange={(text) => onChange({ ...value, label: text })}
          />
          <LinkPicker
            label="Button goes to"
            value={value.link}
            onChange={(link) => link !== null && onChange({ ...value, link })}
          />
        </div>
      )}
    </div>
  );
}

function ProductPicker({
  ids,
  onChange,
}: {
  ids: readonly string[];
  onChange: (ids: string[]) => void;
}) {
  const [term, setTerm] = useState("");
  const [results, setResults] = useState<Array<{ id: string; name: string; code: string | null }>>(
    [],
  );
  const [names, setNames] = useState<Record<string, string>>({});
  useEffect(() => {
    let cancelled = false;
    void searchProductsAction(term, [...ids]).then((found) => {
      if (cancelled) return;
      setResults(found.results);
      setNames((current) => ({
        ...current,
        ...Object.fromEntries(
          found.named.map((row) => [row.id, row.live ? row.name : `${row.name} (not live)`]),
        ),
      }));
    });
    return () => {
      cancelled = true;
    };
    // Search when the term changes; the chosen ids only need naming once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [term]);
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-medium">Products, in this order</p>
      <ol className="flex flex-col gap-1">
        {ids.map((id, index) => (
          <li
            key={id}
            className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-1.5 text-sm"
          >
            <span>{names[id] ?? id}</span>
            <ItemTools
              index={index}
              count={ids.length}
              label="product"
              onMove={(to) => onChange(move(ids, index, to))}
              onRemove={() => onChange(ids.filter((value) => value !== id))}
            />
          </li>
        ))}
      </ol>
      <Input
        placeholder="Search published products by name or code"
        value={term}
        onChange={(event) => setTerm(event.target.value)}
        aria-label="Search products"
      />
      <ul className="flex max-h-48 flex-col overflow-y-auto rounded-md border border-border">
        {results
          .filter((row) => !ids.includes(row.id))
          .map((row) => (
            <li key={row.id}>
              <button
                type="button"
                className="w-full px-3 py-1.5 text-left text-sm hover:bg-secondary"
                onClick={() => {
                  setNames((current) => ({ ...current, [row.id]: row.name }));
                  onChange([...ids, row.id].slice(0, 24));
                }}
              >
                {row.name}
                {row.code === null ? "" : ` · ${row.code}`}
              </button>
            </li>
          ))}
      </ul>
    </div>
  );
}

function SectionFields({
  section,
  onChange,
}: {
  section: HomeSection;
  onChange: (section: HomeSection) => void;
}) {
  const { targets } = useContext(EditorContext);
  switch (section.type) {
    case "hero":
      return (
        <div className="flex flex-col gap-4">
          {section.slides.map((slide, index) => {
            const set = (patch: Partial<typeof slide>) =>
              onChange({
                ...section,
                slides: replaceAt(section.slides, index, { ...slide, ...patch }),
              });
            return (
              <div
                key={slide.id}
                className="rounded-md border border-border p-3"
                data-testid={`hero-slide-${index}`}
              >
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                    Slide {index + 1}
                  </span>
                  <ItemTools
                    index={index}
                    count={section.slides.length}
                    label="slide"
                    onMove={(to) =>
                      onChange({ ...section, slides: move(section.slides, index, to) })
                    }
                    onCopy={() =>
                      onChange({
                        ...section,
                        slides: [...section.slides, withNewIds(slide)].slice(0, 6),
                      })
                    }
                    onRemove={() =>
                      section.slides.length > 1 &&
                      onChange({
                        ...section,
                        slides: section.slides.filter((_, at) => at !== index),
                      })
                    }
                  />
                </div>
                <div className="flex flex-col gap-4">
                  <ImageField
                    label="Desktop picture"
                    value={slide.desktop}
                    required
                    sizeHint="Wide: 16:7, at least 1920 × 840 px."
                    minWidth={1920}
                    testId={`hero-${index}-desktop`}
                    onChange={(image) => image !== null && set({ desktop: image })}
                  />
                  <ImageField
                    label="Mobile picture (optional)"
                    value={slide.mobile}
                    sizeHint="Tall: 4:5, at least 1080 × 1350 px. Without one, phones crop the desktop picture."
                    minWidth={1080}
                    onChange={(image) => set({ mobile: image })}
                  />
                  <LocalizedField
                    label="Small line above the title"
                    value={slide.eyebrow}
                    maxLength={60}
                    onChange={(eyebrow) => set({ eyebrow })}
                  />
                  <LocalizedField
                    label="Title"
                    value={slide.title}
                    required
                    maxLength={120}
                    placeholders
                    testId={`hero-${index}-title`}
                    onChange={(title) => set({ title })}
                  />
                  <LocalizedField
                    label="Subtitle"
                    value={slide.subtitle}
                    multiline
                    rows={2}
                    maxLength={240}
                    placeholders
                    onChange={(subtitle) => set({ subtitle })}
                  />
                  <ButtonField
                    label="Main button"
                    value={slide.primary}
                    onChange={(primary) => set({ primary })}
                  />
                  <ButtonField
                    label="Second button"
                    value={slide.secondary}
                    onChange={(secondary) => set({ secondary })}
                  />
                  <ChoiceField
                    label="Text colour"
                    value={slide.textTone}
                    options={[
                      { value: "dark", label: "Dark text (for light pictures)" },
                      { value: "light", label: "White text (for dark pictures)" },
                    ]}
                    onChange={(textTone) => set({ textTone })}
                  />
                  <ScheduleField
                    value={slide.schedule}
                    onChange={(schedule) => set({ schedule })}
                  />
                </div>
              </div>
            );
          })}
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={section.slides.length >= 6}
            onClick={() => {
              const first = (newSection("hero") as Extract<HomeSection, { type: "hero" }>)
                .slides[0]!;
              onChange({ ...section, slides: [...section.slides, first] });
            }}
          >
            Add slide
          </Button>
        </div>
      );

    case "categories":
      return (
        <div className="flex flex-col gap-4">
          <LocalizedField
            label="Small line above the title"
            value={section.eyebrow}
            maxLength={60}
            onChange={(eyebrow) => onChange({ ...section, eyebrow })}
          />
          <LocalizedField
            label="Title (optional)"
            value={section.title}
            maxLength={120}
            onChange={(title) => onChange({ ...section, title })}
          />
          <LocalizedField
            label="Description (optional)"
            value={section.description}
            maxLength={300}
            onChange={(description) => onChange({ ...section, description })}
          />
          <fieldset>
            <legend className="mb-1 text-sm font-medium">Categories</legend>
            <Hint
              en="None ticked: every top-level category, in its own order."
              bn="কিছু না বাছলে সব প্রধান ক্যাটাগরি দেখাবে।"
            />
            <div className="mt-2 grid gap-1 sm:grid-cols-2">
              {targets.categories.map((category) => (
                <Toggle
                  key={category.id}
                  label={`${category.parentId === null ? "" : "— "}${category.name}`}
                  checked={section.categoryIds.includes(category.id)}
                  onChange={(on) =>
                    onChange({
                      ...section,
                      categoryIds: on
                        ? [...section.categoryIds, category.id].slice(0, 12)
                        : section.categoryIds.filter((id) => id !== category.id),
                    })
                  }
                />
              ))}
            </div>
          </fieldset>
        </div>
      );

    case "products":
      return (
        <div className="flex flex-col gap-4">
          <LocalizedField
            label="Title"
            value={section.title}
            required
            maxLength={120}
            onChange={(title) => onChange({ ...section, title })}
          />
          <LocalizedField
            label="Description (optional)"
            value={section.description}
            maxLength={300}
            onChange={(description) => onChange({ ...section, description })}
          />
          <ChoiceField
            label="Which products"
            value={section.rule}
            options={PRODUCT_RULES.map((rule) => ({
              value: rule,
              label: {
                new: "Newest",
                featured: "Featured (ticked on the product)",
                bestselling: "Best selling (last 30 days)",
                tag: "From a collection (tag)",
                category: "From a category",
                manual: "Picked by hand",
              }[rule],
            }))}
            onChange={(rule) => onChange({ ...section, rule })}
          />
          {section.rule === "tag" ? (
            <ChoiceField
              label="Collection"
              value={section.tagSlug ?? ""}
              options={[
                { value: "", label: "Choose…" },
                ...targets.tags.map((tag) => ({ value: tag.slug, label: tag.name })),
              ]}
              onChange={(tagSlug) =>
                onChange({ ...section, tagSlug: tagSlug === "" ? null : tagSlug })
              }
            />
          ) : null}
          {section.rule === "category" ? (
            <ChoiceField
              label="Category"
              value={section.categoryId ?? ""}
              options={[
                { value: "", label: "Choose…" },
                ...targets.categories.map((row) => ({ value: row.id, label: row.name })),
              ]}
              onChange={(categoryId) =>
                onChange({ ...section, categoryId: categoryId === "" ? null : categoryId })
              }
            />
          ) : null}
          {section.rule === "manual" ? (
            <ProductPicker
              ids={section.productIds}
              onChange={(productIds) => onChange({ ...section, productIds })}
            />
          ) : null}
          <div>
            <label className="mb-1 block text-sm font-medium" htmlFor={`${section.id}-limit`}>
              How many (2–24)
            </label>
            <Input
              id={`${section.id}-limit`}
              type="number"
              min={2}
              max={24}
              value={section.limit}
              onChange={(event) =>
                onChange({
                  ...section,
                  limit: Math.max(2, Math.min(24, Number(event.target.value) || 8)),
                })
              }
            />
          </div>
          <LinkPicker
            label="“View all” goes to (empty: chosen automatically)"
            value={section.viewAll}
            allowNone
            onChange={(viewAll) => onChange({ ...section, viewAll })}
          />
        </div>
      );

    case "promo":
      return (
        <div className="flex flex-col gap-4">
          <ImageField
            label="Picture"
            value={section.image}
            required
            sizeHint="16:9, at least 1600 × 900 px."
            minWidth={1600}
            onChange={(image) => image !== null && onChange({ ...section, image })}
          />
          <LocalizedField
            label="Small line above the title"
            value={section.eyebrow}
            maxLength={60}
            onChange={(eyebrow) => onChange({ ...section, eyebrow })}
          />
          <LocalizedField
            label="Title"
            value={section.title}
            required
            maxLength={120}
            placeholders
            onChange={(title) => onChange({ ...section, title })}
          />
          <LocalizedField
            label="Text"
            value={section.body}
            multiline
            rows={3}
            maxLength={400}
            placeholders
            onChange={(body) => onChange({ ...section, body })}
          />
          <ButtonField
            label="Link button"
            value={section.cta}
            onChange={(cta) => onChange({ ...section, cta })}
          />
          <ChoiceField
            label="Colour"
            value={section.tone}
            options={[
              { value: "accent", label: "Light (brand accent)" },
              { value: "dark", label: "Dark" },
            ]}
            onChange={(tone) => onChange({ ...section, tone })}
          />
          <ScheduleField
            value={section.schedule}
            onChange={(schedule) => onChange({ ...section, schedule })}
          />
        </div>
      );

    case "collections":
      return (
        <div className="flex flex-col gap-4">
          <LocalizedField
            label="Small line above the title"
            value={section.eyebrow}
            maxLength={60}
            onChange={(eyebrow) => onChange({ ...section, eyebrow })}
          />
          <LocalizedField
            label="Title"
            value={section.title}
            required
            maxLength={120}
            onChange={(title) => onChange({ ...section, title })}
          />
          <LocalizedField
            label="Description"
            value={section.description}
            maxLength={300}
            onChange={(description) => onChange({ ...section, description })}
          />
          {section.items.map((item, index) => {
            const set = (patch: Partial<typeof item>) =>
              onChange({
                ...section,
                items: replaceAt(section.items, index, { ...item, ...patch }),
              });
            return (
              <div key={item.id} className="rounded-md border border-border p-3">
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground uppercase">
                    Collection {index + 1}
                  </span>
                  <ItemTools
                    index={index}
                    count={section.items.length}
                    label="collection"
                    onMove={(to) => onChange({ ...section, items: move(section.items, index, to) })}
                    onRemove={() =>
                      section.items.length > 1 &&
                      onChange({ ...section, items: section.items.filter((_, at) => at !== index) })
                    }
                  />
                </div>
                <div className="flex flex-col gap-4">
                  <ImageField
                    label="Picture"
                    value={item.image}
                    required
                    sizeHint="Portrait 4:5, at least 900 × 1125 px."
                    minWidth={900}
                    onChange={(image) => image !== null && set({ image })}
                  />
                  <LocalizedField
                    label="Title"
                    value={item.title}
                    required
                    maxLength={80}
                    onChange={(title) => set({ title })}
                  />
                  <LocalizedField
                    label="Short text"
                    value={item.description}
                    maxLength={200}
                    onChange={(description) => set({ description })}
                  />
                  <LinkPicker
                    label="Goes to"
                    value={item.link}
                    onChange={(link) => link !== null && set({ link })}
                  />
                </div>
              </div>
            );
          })}
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={section.items.length >= 6}
            onClick={() => {
              const first = (
                newSection("collections") as Extract<HomeSection, { type: "collections" }>
              ).items[0]!;
              onChange({ ...section, items: [...section.items, first] });
            }}
          >
            Add collection
          </Button>
        </div>
      );

    case "story":
      return (
        <div className="flex flex-col gap-4">
          <ImageField
            label="Picture (optional)"
            value={section.image}
            sizeHint="16:9, at least 1600 × 900 px."
            minWidth={1600}
            onChange={(image) => onChange({ ...section, image })}
          />
          <LocalizedField
            label="Small line above the title"
            value={section.eyebrow}
            maxLength={60}
            onChange={(eyebrow) => onChange({ ...section, eyebrow })}
          />
          <LocalizedField
            label="Title"
            value={section.title}
            required
            maxLength={120}
            onChange={(title) => onChange({ ...section, title })}
          />
          <BlocksEditor
            blocks={section.blocks}
            onChange={(blocks) => onChange({ ...section, blocks })}
          />
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-medium">Numbers (optional, up to 4)</legend>
            <Hint
              en="Only facts you can stand behind, e.g. years in business."
              bn="শুধু সত্য তথ্য দিন, যেমন কত বছর ধরে ব্যবসা।"
            />
            {section.stats.map((stat, index) => (
              <div key={stat.id} className="grid items-end gap-2 sm:grid-cols-[8rem_1fr_auto]">
                <div>
                  <label
                    className="mb-1 block text-xs text-muted-foreground"
                    htmlFor={`${stat.id}-value`}
                  >
                    Number
                  </label>
                  <Input
                    id={`${stat.id}-value`}
                    value={stat.value}
                    maxLength={12}
                    onChange={(event) =>
                      onChange({
                        ...section,
                        stats: replaceAt(section.stats, index, {
                          ...stat,
                          value: event.target.value,
                        }),
                      })
                    }
                  />
                </div>
                <LocalizedField
                  label="Label"
                  value={stat.label}
                  required
                  maxLength={40}
                  onChange={(label) =>
                    onChange({
                      ...section,
                      stats: replaceAt(section.stats, index, { ...stat, label }),
                    })
                  }
                />
                <ItemTools
                  index={index}
                  count={section.stats.length}
                  label="number"
                  onMove={(to) => onChange({ ...section, stats: move(section.stats, index, to) })}
                  onRemove={() =>
                    onChange({ ...section, stats: section.stats.filter((_, at) => at !== index) })
                  }
                />
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={section.stats.length >= 4}
              onClick={() =>
                onChange({
                  ...section,
                  stats: [...section.stats, { id: newId(), value: "", label: EMPTY }],
                })
              }
            >
              Add a number
            </Button>
          </fieldset>
          <ButtonField
            label="“Read more” link"
            value={section.cta}
            onChange={(cta) => onChange({ ...section, cta })}
          />
        </div>
      );

    case "trust":
      return (
        <div className="flex flex-col gap-4">
          {section.items.map((item, index) => {
            const set = (patch: Partial<typeof item>) =>
              onChange({
                ...section,
                items: replaceAt(section.items, index, { ...item, ...patch }),
              });
            return (
              <div key={item.id} className="rounded-md border border-border p-3">
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground uppercase">
                    Badge {index + 1}
                  </span>
                  <ItemTools
                    index={index}
                    count={section.items.length}
                    label="badge"
                    onMove={(to) => onChange({ ...section, items: move(section.items, index, to) })}
                    onRemove={() =>
                      section.items.length > 1 &&
                      onChange({ ...section, items: section.items.filter((_, at) => at !== index) })
                    }
                  />
                </div>
                <div className="flex flex-col gap-4">
                  <ChoiceField
                    label="Icon"
                    value={item.icon}
                    options={TRUST_ICONS.map((icon) => ({
                      value: icon,
                      label: {
                        cash: "Cash",
                        return: "Return",
                        truck: "Delivery truck",
                        shield: "Shield",
                        phone: "Phone",
                        store: "Shop",
                      }[icon],
                    }))}
                    onChange={(icon) => set({ icon })}
                  />
                  <LocalizedField
                    label="Title"
                    value={item.title}
                    required
                    maxLength={60}
                    placeholders
                    onChange={(title) => set({ title })}
                  />
                  <LocalizedField
                    label="Short text"
                    value={item.text}
                    maxLength={160}
                    placeholders
                    onChange={(text) => set({ text })}
                  />
                </div>
              </div>
            );
          })}
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={section.items.length >= 6}
            onClick={() =>
              onChange({
                ...section,
                items: [
                  ...section.items,
                  { id: newId(), icon: "shield", title: EMPTY, text: EMPTY },
                ],
              })
            }
          >
            Add badge
          </Button>
        </div>
      );
  }
}

function summary(section: HomeSection): string {
  switch (section.type) {
    case "hero":
      return `${section.slides.length} slide${section.slides.length === 1 ? "" : "s"}${section.slides.some((slide) => slide.schedule.startsAt !== null || slide.schedule.endsAt !== null) ? ", scheduled" : ""}`;
    case "products":
      return `${section.title.en || "untitled"} · ${section.rule} · ${section.limit}`;
    case "categories":
      return section.categoryIds.length === 0
        ? "all top-level"
        : `${section.categoryIds.length} chosen`;
    case "collections":
      return `${section.items.length} collection${section.items.length === 1 ? "" : "s"}`;
    case "trust":
      return `${section.items.length} badge${section.items.length === 1 ? "" : "s"}`;
    default:
      return section.title.en || "untitled";
  }
}

export function HomeEditor({
  value,
  onChange,
}: {
  value: HomeContent;
  onChange: (value: HomeContent) => void;
}) {
  const [open, setOpen] = useState<string | null>(value.sections[0]?.id ?? null);
  const sections = value.sections;
  const set = (next: HomeSection[]) => onChange({ ...value, sections: next });
  return (
    <div className="flex flex-col gap-3">
      <Hint
        en="Sections show on the home page from top to bottom. Switch one off to hide it without deleting."
        bn="সেকশনগুলো উপর থেকে নিচে এই ক্রমে দেখাবে। বন্ধ করলে মুছে যায় না, শুধু লুকানো থাকে।"
      />
      {sections.map((section, index) => (
        <Panel
          key={section.id}
          testId={`home-section-${index}`}
          title={`${index + 1}. ${SECTION_LABELS[section.type]} — ${summary(section)}`}
          actions={
            <div className="flex items-center gap-3">
              <Toggle
                label="Show"
                checked={section.enabled}
                onChange={(enabled) => set(replaceAt(sections, index, { ...section, enabled }))}
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setOpen(open === section.id ? null : section.id)}
              >
                {open === section.id ? "Close" : "Edit"}
              </Button>
              <ItemTools
                index={index}
                count={sections.length}
                label="section"
                onMove={(to) => set(move(sections, index, to))}
                onCopy={() =>
                  set([
                    ...sections.slice(0, index + 1),
                    withNewIds(section),
                    ...sections.slice(index + 1),
                  ])
                }
                onRemove={() => set(sections.filter((_, at) => at !== index))}
              />
            </div>
          }
        >
          {open === section.id ? (
            <SectionFields
              section={section}
              onChange={(next) => set(replaceAt(sections, index, next))}
            />
          ) : (
            <p className="text-xs text-muted-foreground">
              {section.enabled ? "Shown" : "Hidden"} · Edit to change it.
            </p>
          )}
        </Panel>
      ))}
      <div className="flex flex-wrap gap-2 rounded-lg border border-dashed border-border p-3">
        <span className="w-full text-sm font-medium">Add a section</span>
        {(Object.keys(SECTION_LABELS) as SectionType[]).map((type) => (
          <Button
            key={type}
            type="button"
            variant="outline"
            size="sm"
            data-testid={`add-section-${type}`}
            onClick={() => {
              const section = newSection(type);
              set([...sections, section]);
              setOpen(section.id);
            }}
          >
            <Plus aria-hidden="true" className="size-3.5" />
            {SECTION_LABELS[type]}
          </Button>
        ))}
      </div>
    </div>
  );
}
