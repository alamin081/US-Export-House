# Content (Phase 12)

Everything on the storefront that is not a product comes from the database
and is edited at `/admin/content`. Nothing is hard-coded in the app; fixed UI
labels stay in `src/i18n/messages/*.json`.

## Model

| Table             | What                                                                                                                                                   |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `ContentDocument` | One editable thing: `home`, `announcements`, `menu.header`, `footer`, `page.<slug>`. Holds the `draft` (JSON) and a `draftRevision` (optimistic lock). |
| `ContentVersion`  | A published copy of a draft. Immutable: a database trigger refuses UPDATE and DELETE.                                                                  |

The JSON shape of every kind is a Zod schema in
`src/modules/content/content.schema.ts`, checked on save and on publish.
Text is stored as `{ en, bn }`; Bengali falls back to English.

The old `Banner`, `HomeSection`, `MenuItem` and `Page` tables are deprecated
and no longer read (rows kept).

## No HTML

Pages are a list of blocks (heading, paragraph, list, image, table, note).
Text may use `**bold**`, `*italic*` and `[label](link)`; `src/modules/content/inline.ts`
turns that into React elements with text children. Links pass `safeHref`
(https, http, mailto, tel, `/path` only). Nothing an editor types is rendered
as HTML; the only `dangerouslySetInnerHTML` is the FAQ JSON-LD, which is
escaped JSON built from plain text.

## Placeholders

`{freeShippingThreshold}`, `{returnWindowDays}`, `{storePhone}`, `{codMaxTotal}`
are filled from settings when the page renders. An unknown `{name}` blocks
publishing. A `[write this]` note is a warning in development and blocks
publishing when `APP_ENV=production`.

## Permissions

| Permission              | Can                                                               |
| ----------------------- | ----------------------------------------------------------------- |
| `content.write`         | edit and save drafts, create pages, copy a version into the draft |
| `content.publish`       | publish, take a page off the site, delete a never-published page  |
| `return.policy.publish` | also needed to publish `page.shipping-returns` (the approval)     |

## Preview

`/api/admin/preview?key=…&locale=bn|en[&at=…]` (staff with `content.write`)
turns on Next.js draft mode and redirects to the page the document appears
on. The storefront shows drafts only while draft mode is on **and** a staff
session with `content.write` is present. `/api/admin/preview/exit` ends it.
The admin preview page frames the storefront at phone, tablet and desktop width.

## Cache

Published content is cached by tag (`content:<key>`, `content:pages`,
`content:branches`, `settings`); publishing calls `updateTag`. Storefront
pages revalidate every 300 seconds, so scheduled slides and announcements
switch on and off within five minutes of their start or end — no cron.

## Sample content

`npm run content:import-legacy` (dry run) / `-- --apply` creates the documents
from the Phase 3 samples, create-only, without invented facts, marked as
sample. Sample documents cannot be published when `APP_ENV=production`; the
first save from the editor clears the mark. `ensureSystemDocuments()` creates
any missing system document as an empty draft (staging and production).
