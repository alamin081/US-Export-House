"use client";

import { Button } from "@/components/ui/button";
import type {
  AnnouncementsContent,
  ContentLink,
  FooterContent,
  Localized,
  MenuContent,
  PageContent,
} from "@/modules/content/content.schema";
import { BlocksEditor } from "./blocks-editor";
import {
  ChoiceField,
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
} from "./fields";

// ---------------------------------------------------------------------------
// announcement bar
// ---------------------------------------------------------------------------

export function AnnouncementsEditor({
  value,
  onChange,
}: {
  value: AnnouncementsContent;
  onChange: (value: AnnouncementsContent) => void;
}) {
  const messages = value.messages;
  const set = (next: AnnouncementsContent["messages"]) => onChange({ ...value, messages: next });
  return (
    <div className="flex flex-col gap-3">
      <Hint
        en="The strip above the header. Several messages take turns every 6 seconds. Keep each one short."
        bn="হেডারের উপরের ছোট পট্টি। একাধিক বার্তা থাকলে পালাক্রমে দেখাবে।"
      />
      {messages.map((message, index) => {
        const update = (patch: Partial<typeof message>) =>
          set(replaceAt(messages, index, { ...message, ...patch }));
        return (
          <Panel
            key={message.id}
            title={`Message ${index + 1}`}
            testId={`announcement-${index}`}
            actions={
              <div className="flex items-center gap-3">
                <Toggle
                  label="Show"
                  checked={message.enabled}
                  onChange={(enabled) => update({ enabled })}
                />
                <ItemTools
                  index={index}
                  count={messages.length}
                  label="message"
                  onMove={(to) => set(move(messages, index, to))}
                  onRemove={() => set(messages.filter((_, at) => at !== index))}
                />
              </div>
            }
          >
            <LocalizedField
              label="Text"
              value={message.text}
              required
              maxLength={120}
              placeholders
              testId={`announcement-${index}-text`}
              hintEn="Example: Free delivery on orders over {freeShippingThreshold}"
              hintBn="সংখ্যা হাতে না লিখে “Insert setting” থেকে বসান, তাহলে setting বদলালে লেখাও বদলাবে।"
              onChange={(text) => update({ text })}
            />
            <LinkPicker
              label="Link (optional)"
              value={message.link}
              allowNone
              onChange={(link) => update({ link })}
            />
            <ChoiceField
              label="Colour"
              value={message.tone}
              options={[
                { value: "primary", label: "Dark (brand)" },
                { value: "accent", label: "Accent" },
                { value: "neutral", label: "Light grey" },
              ]}
              onChange={(tone) => update({ tone })}
            />
            <ScheduleField value={message.schedule} onChange={(schedule) => update({ schedule })} />
          </Panel>
        );
      })}
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={messages.length >= 5}
        data-testid="add-announcement"
        onClick={() =>
          set([
            ...messages,
            {
              id: newId(),
              enabled: true,
              text: EMPTY,
              link: null,
              tone: "primary",
              schedule: { startsAt: null, endsAt: null },
            },
          ])
        }
      >
        Add message
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// header menu
// ---------------------------------------------------------------------------

interface LinkItem {
  id: string;
  enabled: boolean;
  label: Localized;
  link: ContentLink;
}

function LinkItemFields({
  item,
  onChange,
}: {
  item: LinkItem;
  onChange: (item: LinkItem) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <LinkPicker
        label="Goes to"
        value={item.link}
        onChange={(link) => link !== null && onChange({ ...item, link })}
      />
      <LocalizedField
        label="Label (optional)"
        value={item.label}
        maxLength={40}
        hintEn="Empty: the category's or page's own name."
        hintBn="খালি রাখলে ক্যাটাগরি বা পেজের নিজের নাম দেখাবে।"
        onChange={(label) => onChange({ ...item, label })}
      />
      <Toggle
        label="Show"
        checked={item.enabled}
        onChange={(enabled) => onChange({ ...item, enabled })}
      />
    </div>
  );
}

const newLink = (): LinkItem => ({
  id: newId(),
  enabled: true,
  label: EMPTY,
  link: { type: "url", href: "/shop" },
});

export function MenuEditor({
  value,
  onChange,
}: {
  value: MenuContent;
  onChange: (value: MenuContent) => void;
}) {
  const items = value.items;
  const set = (next: MenuContent["items"]) => onChange({ ...value, items: next });
  return (
    <div className="flex flex-col gap-3">
      <Hint
        en="The main menu, used on computers and phones. Up to 8 items, each with up to 12 items under it."
        bn="প্রধান মেনু — কম্পিউটার ও মোবাইলে একই। প্রতিটির নিচে আরও আইটেম রাখা যায় (২ স্তর পর্যন্ত)।"
      />
      {items.map((item, index) => (
        <Panel
          key={item.id}
          title={`${index + 1}. ${item.label.en || "Menu item"}`}
          testId={`menu-item-${index}`}
          actions={
            <ItemTools
              index={index}
              count={items.length}
              label="menu item"
              onMove={(to) => set(move(items, index, to))}
              onRemove={() => set(items.filter((_, at) => at !== index))}
            />
          }
        >
          <LinkItemFields
            item={item}
            onChange={(next) => set(replaceAt(items, index, { ...item, ...next }))}
          />
          <div className="ms-4 flex flex-col gap-3 border-s border-border ps-4">
            {item.children.map((child, childIndex) => (
              <div key={child.id} className="rounded-md border border-border p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">
                    Under “{item.label.en || "menu item"}”
                  </span>
                  <ItemTools
                    index={childIndex}
                    count={item.children.length}
                    label="sub-item"
                    onMove={(to) =>
                      set(
                        replaceAt(items, index, {
                          ...item,
                          children: move(item.children, childIndex, to),
                        }),
                      )
                    }
                    onRemove={() =>
                      set(
                        replaceAt(items, index, {
                          ...item,
                          children: item.children.filter((_, at) => at !== childIndex),
                        }),
                      )
                    }
                  />
                </div>
                <LinkItemFields
                  item={child}
                  onChange={(next) =>
                    set(
                      replaceAt(items, index, {
                        ...item,
                        children: replaceAt(item.children, childIndex, next),
                      }),
                    )
                  }
                />
              </div>
            ))}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={item.children.length >= 12}
              onClick={() =>
                set(replaceAt(items, index, { ...item, children: [...item.children, newLink()] }))
              }
            >
              Add an item under this one
            </Button>
          </div>
        </Panel>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={items.length >= 8}
        data-testid="add-menu-item"
        onClick={() => set([...items, { ...newLink(), children: [] }])}
      >
        Add menu item
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// footer
// ---------------------------------------------------------------------------

export function FooterEditor({
  value,
  onChange,
}: {
  value: FooterContent;
  onChange: (value: FooterContent) => void;
}) {
  const columns = value.columns;
  const setColumns = (next: FooterContent["columns"]) => onChange({ ...value, columns: next });
  return (
    <div className="flex flex-col gap-3">
      <Panel title="Brand line">
        <LocalizedField
          label="Short text under the shop name"
          value={value.blurb}
          multiline
          rows={2}
          maxLength={400}
          placeholders
          onChange={(blurb) => onChange({ ...value, blurb })}
        />
        <Hint
          en="The shop's address, phone, logo and social links come from Settings ▸ Store information and SEO & social. Branches come from Locations."
          bn="ঠিকানা, ফোন, লোগো ও সোশ্যাল লিংক Settings থেকে; শাখার তথ্য Locations থেকে আসে।"
        />
      </Panel>
      {columns.map((column, index) => (
        <Panel
          key={column.id}
          title={`Column: ${column.title.en || "untitled"}`}
          testId={`footer-column-${index}`}
          actions={
            <ItemTools
              index={index}
              count={columns.length}
              label="column"
              onMove={(to) => setColumns(move(columns, index, to))}
              onRemove={() => setColumns(columns.filter((_, at) => at !== index))}
            />
          }
        >
          <LocalizedField
            label="Column title"
            value={column.title}
            required
            maxLength={40}
            onChange={(title) => setColumns(replaceAt(columns, index, { ...column, title }))}
          />
          {column.links.map((link, linkIndex) => (
            <div key={link.id} className="rounded-md border border-border p-3">
              <div className="mb-2 flex justify-end">
                <ItemTools
                  index={linkIndex}
                  count={column.links.length}
                  label="link"
                  onMove={(to) =>
                    setColumns(
                      replaceAt(columns, index, {
                        ...column,
                        links: move(column.links, linkIndex, to),
                      }),
                    )
                  }
                  onRemove={() =>
                    setColumns(
                      replaceAt(columns, index, {
                        ...column,
                        links: column.links.filter((_, at) => at !== linkIndex),
                      }),
                    )
                  }
                />
              </div>
              <LinkItemFields
                item={link}
                onChange={(next) =>
                  setColumns(
                    replaceAt(columns, index, {
                      ...column,
                      links: replaceAt(column.links, linkIndex, next),
                    }),
                  )
                }
              />
            </div>
          ))}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={column.links.length >= 12}
            onClick={() =>
              setColumns(
                replaceAt(columns, index, { ...column, links: [...column.links, newLink()] }),
              )
            }
          >
            Add link
          </Button>
        </Panel>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={columns.length >= 4}
        onClick={() => setColumns([...columns, { id: newId(), title: EMPTY, links: [] }])}
      >
        Add column
      </Button>
      <Panel title="Also in the footer">
        <Toggle
          label="List the branches (from Locations, active branches only)"
          checked={value.showBranches}
          onChange={(showBranches) => onChange({ ...value, showBranches })}
        />
        <Toggle
          label="Show the payment methods (Settings ▸ SEO & social; cash on delivery only until online payment)"
          checked={value.showPaymentMethods}
          onChange={(showPaymentMethods) => onChange({ ...value, showPaymentMethods })}
        />
      </Panel>
    </div>
  );
}

// ---------------------------------------------------------------------------
// pages
// ---------------------------------------------------------------------------

export function PageEditor({
  value,
  onChange,
  slug,
}: {
  value: PageContent;
  onChange: (value: PageContent) => void;
  slug: string;
}) {
  const groups = value.faq;
  const setGroups = (next: PageContent["faq"]) => onChange({ ...value, faq: next });
  return (
    <div className="flex flex-col gap-3">
      <Panel title="Title and summary">
        <LocalizedField
          label="Title"
          value={value.title}
          required
          maxLength={120}
          testId="page-title"
          onChange={(title) => onChange({ ...value, title })}
        />
        <LocalizedField
          label="Summary under the title (optional)"
          value={value.summary}
          multiline
          rows={2}
          maxLength={300}
          placeholders
          onChange={(summary) => onChange({ ...value, summary })}
        />
        <ChoiceField
          label="Layout"
          value={value.layout}
          options={[
            { value: "standard", label: "Text page" },
            { value: "faq", label: "Questions and answers (FAQ)" },
            { value: "contact", label: "Contact (adds phone, WhatsApp and branches)" },
          ]}
          onChange={(layout) => onChange({ ...value, layout })}
        />
      </Panel>

      <Panel title="Page text">
        <BlocksEditor blocks={value.blocks} onChange={(blocks) => onChange({ ...value, blocks })} />
      </Panel>

      {value.layout === "faq" ? (
        <Panel title="Questions and answers">
          {groups.map((group, index) => (
            <div
              key={group.id}
              className="rounded-md border border-border p-3"
              data-testid={`faq-group-${index}`}
            >
              <div className="mb-3 flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground uppercase">
                  Group {index + 1}
                </span>
                <ItemTools
                  index={index}
                  count={groups.length}
                  label="group"
                  onMove={(to) => setGroups(move(groups, index, to))}
                  onRemove={() => setGroups(groups.filter((_, at) => at !== index))}
                />
              </div>
              <div className="flex flex-col gap-3">
                <LocalizedField
                  label="Group name"
                  value={group.title}
                  required
                  maxLength={80}
                  onChange={(title) => setGroups(replaceAt(groups, index, { ...group, title }))}
                />
                {group.items.map((item, itemIndex) => (
                  <div key={item.id} className="rounded-md border border-dashed border-border p-3">
                    <div className="mb-2 flex justify-end">
                      <ItemTools
                        index={itemIndex}
                        count={group.items.length}
                        label="question"
                        onMove={(to) =>
                          setGroups(
                            replaceAt(groups, index, {
                              ...group,
                              items: move(group.items, itemIndex, to),
                            }),
                          )
                        }
                        onRemove={() =>
                          setGroups(
                            replaceAt(groups, index, {
                              ...group,
                              items: group.items.filter((_, at) => at !== itemIndex),
                            }),
                          )
                        }
                      />
                    </div>
                    <LocalizedField
                      label="Question"
                      value={item.question}
                      required
                      maxLength={200}
                      onChange={(question) =>
                        setGroups(
                          replaceAt(groups, index, {
                            ...group,
                            items: replaceAt(group.items, itemIndex, { ...item, question }),
                          }),
                        )
                      }
                    />
                    <LocalizedField
                      label="Answer"
                      value={item.answer}
                      required
                      multiline
                      maxLength={2000}
                      placeholders
                      onChange={(answer) =>
                        setGroups(
                          replaceAt(groups, index, {
                            ...group,
                            items: replaceAt(group.items, itemIndex, { ...item, answer }),
                          }),
                        )
                      }
                    />
                  </div>
                ))}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    setGroups(
                      replaceAt(groups, index, {
                        ...group,
                        items: [...group.items, { id: newId(), question: EMPTY, answer: EMPTY }],
                      }),
                    )
                  }
                >
                  Add question
                </Button>
              </div>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setGroups([...groups, { id: newId(), title: EMPTY, items: [] }])}
          >
            Add group
          </Button>
        </Panel>
      ) : null}

      <Panel title="Search engines and sharing">
        <p className="text-xs text-muted-foreground">
          Address: <code>{slug}</code> — set when the page was created.
        </p>
        <LocalizedField
          label="Search title (≤ 60 letters, optional)"
          value={value.seoTitle}
          maxLength={70}
          onChange={(seoTitle) => onChange({ ...value, seoTitle })}
        />
        <LocalizedField
          label="Search description (≤ 160 letters, optional)"
          value={value.seoDescription}
          multiline
          rows={2}
          maxLength={160}
          onChange={(seoDescription) => onChange({ ...value, seoDescription })}
        />
        <ImageField
          label="Share picture (optional)"
          value={value.ogImage}
          sizeHint="1200 × 630 px (1.91:1), shown when the page is shared on Facebook or WhatsApp."
          minWidth={1200}
          onChange={(ogImage) => onChange({ ...value, ogImage })}
        />
      </Panel>
    </div>
  );
}
