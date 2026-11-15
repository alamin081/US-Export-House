import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db } from "@/lib/db";
import type { StaffContext } from "@/modules/access/authorization";
import {
  createPage,
  deletePage,
  ensureSystemDocuments,
  getContentForEdit,
  publishContent,
  restoreVersion,
  saveDraft,
  unpublishPage,
} from "@/modules/content/content.service";
import { caught, runId, staffFor, testMeta } from "./order-fixture";

/**
 * Phase 12 content against the real test database: drafts and the revision
 * lock, who may publish, sample text and "[write]" notes never going live in
 * production, links to hidden things, immutable versions and restoring.
 */

const RUN = runId().toLowerCase();
const meta = testMeta;
let editor: StaffContext;
let manager: StaffContext;
const dev = { production: false };
const live = { production: true };

async function revision(key: string) {
  return (await db.contentDocument.findUniqueOrThrow({ where: { key } })).draftRevision;
}

function page(title: string, text: string, extra: object = {}) {
  return {
    title: { en: title, bn: "" },
    blocks: [{ type: "paragraph", id: "p1", text: { en: text, bn: "" } }],
    ...extra,
  };
}

beforeAll(async () => {
  editor = await staffFor(RUN, "Content Editor");
  manager = await staffFor(RUN, "Store Manager");
});

afterAll(async () => {
  await db.$disconnect();
});

describe("system documents", () => {
  it("are created once, as empty unpublished drafts, and never overwritten", async () => {
    await ensureSystemDocuments();
    const about = await db.contentDocument.findUniqueOrThrow({ where: { key: "page.about" } });
    expect(about.isSystem).toBe(true);
    const again = await ensureSystemDocuments();
    expect(again).toEqual([]);
    const policy = await db.contentDocument.findUniqueOrThrow({
      where: { key: "page.shipping-returns" },
    });
    expect(policy.publishPermission).toBe("return.policy.publish");
  });
});

describe("drafts and publishing", () => {
  const slug = `it-${RUN}`;
  const key = `page.${slug}`;

  it("lets a Content Editor create and save, but not publish", async () => {
    await createPage(editor, { slug, titleEn: "Eid offer" }, meta());
    expect(
      (await caught(createPage(editor, { slug: "checkout", titleEn: "x" }, meta()))).code,
    ).toBe("VALIDATION_FAILED");
    await saveDraft(
      editor,
      { key, revision: await revision(key), draft: page("Eid offer", "Ten days only.") },
      meta(),
      dev,
    );
    expect(
      (await caught(publishContent(editor, { key, revision: await revision(key) }, meta(), dev)))
        .code,
    ).toBe("FORBIDDEN");
    const view = await getContentForEdit(editor, key, dev);
    expect(view.canPublish).toBe(false);
  });

  it("refuses a save made on an old revision", async () => {
    const stale = (await revision(key)) - 1;
    expect(
      (
        await caught(
          saveDraft(
            editor,
            { key, revision: stale, draft: page("Eid offer", "Old tab") },
            meta(),
            dev,
          ),
        )
      ).code,
    ).toBe("CONFLICT");
  });

  it("refuses unsafe links and foreign images on save", async () => {
    const withForeignImage = {
      title: { en: "Eid offer", bn: "" },
      blocks: [
        {
          type: "image",
          id: "i1",
          image: {
            url: "https://res.cloudinary.com/someone-else/image/upload/a.jpg",
            alt: { en: "A", bn: "" },
          },
        },
      ],
    };
    expect(
      (
        await caught(
          saveDraft(
            editor,
            { key, revision: await revision(key), draft: withForeignImage },
            meta(),
            dev,
          ),
        )
      ).code,
    ).toBe("VALIDATION_FAILED");
    const menuWithScript = {
      items: [{ id: "m", link: { type: "url", href: "javascript:alert(1)" } }],
    };
    expect(
      (
        await caught(
          saveDraft(
            editor,
            { key: "menu.header", revision: await revision("menu.header"), draft: menuWithScript },
            meta(),
            dev,
          ),
        )
      ).code,
    ).toBe("VALIDATION_FAILED");
  });

  it("publishes as a new immutable version and restores an old one into the draft", async () => {
    await saveDraft(
      editor,
      { key, revision: await revision(key), draft: page("Eid offer", "Version one") },
      meta(),
      dev,
    );
    expect(
      (
        await publishContent(
          manager,
          { key, revision: await revision(key), note: "first" },
          meta(),
          dev,
        )
      ).version,
    ).toBe(1);
    await saveDraft(
      editor,
      { key, revision: await revision(key), draft: page("Eid offer", "Version two") },
      meta(),
      dev,
    );
    expect(
      (await publishContent(manager, { key, revision: await revision(key) }, meta(), dev)).version,
    ).toBe(2);

    const first = await db.contentVersion.findFirstOrThrow({
      where: { document: { key }, number: 1 },
    });
    await expect(
      db.contentVersion.update({ where: { id: first.id }, data: { note: "changed" } }),
    ).rejects.toThrow(/CONTENT_VERSION_IMMUTABLE/);
    await expect(db.contentVersion.delete({ where: { id: first.id } })).rejects.toThrow(
      /CONTENT_VERSION_IMMUTABLE/,
    );

    await restoreVersion(
      editor,
      { key, versionId: first.id, revision: await revision(key) },
      meta(),
      dev,
    );
    const draft = (await db.contentDocument.findUniqueOrThrow({ where: { key } })).draft as {
      blocks: Array<{ text: { en: string } }>;
    };
    expect(draft.blocks[0]!.text.en).toBe("Version one");
    // Still live: version 2, until someone publishes the restored draft.
    const view = await getContentForEdit(manager, key, dev);
    expect(view.publishedNumber).toBe(2);
    expect(view.changed).toBe(true);
    expect(
      await db.auditLog.count({
        where: { entityId: key, action: { in: ["content.published", "content.restored"] } },
      }),
    ).toBe(3);
  });

  it("refuses to publish a draft that changed after it was reviewed", async () => {
    const reviewed = await revision(key);
    await saveDraft(
      editor,
      { key, revision: reviewed, draft: page("Eid offer", "Changed meanwhile") },
      meta(),
      dev,
    );
    expect(
      (await caught(publishContent(manager, { key, revision: reviewed }, meta(), dev))).code,
    ).toBe("CONFLICT");
  });

  it("will not delete a page that was ever published", async () => {
    await unpublishPage(manager, key, meta());
    expect((await caught(deletePage(manager, key, meta()))).code).toBe("VALIDATION_FAILED");
    const draftOnly = `it-${RUN}-draft`;
    await createPage(editor, { slug: draftOnly, titleEn: "Never live" }, meta());
    expect((await caught(deletePage(editor, `page.${draftOnly}`, meta()))).code).toBe("FORBIDDEN");
    await deletePage(manager, `page.${draftOnly}`, meta());
    expect(await db.contentDocument.findUnique({ where: { key: `page.${draftOnly}` } })).toBeNull();
  });
});

describe("production rules", () => {
  const slug = `it-${RUN}-sample`;
  const key = `page.${slug}`;

  it("never publishes sample text in production, and the first save clears the mark", async () => {
    await createPage(editor, { slug, titleEn: "Sample" }, meta());
    await db.contentDocument.update({ where: { key }, data: { isSample: true } });
    const message = (
      await caught(publishContent(manager, { key, revision: await revision(key) }, meta(), live))
    ).message;
    expect(message).toMatch(/sample text/i);
    // Outside production the same draft may go live (development keeps its look).
    await publishContent(manager, { key, revision: await revision(key) }, meta(), dev);

    await saveDraft(
      editor,
      { key, revision: await revision(key), draft: page("Our story", "[Write your story]") },
      meta(),
      dev,
    );
    expect((await db.contentDocument.findUniqueOrThrow({ where: { key } })).isSample).toBe(false);
    const todo = (
      await caught(publishContent(manager, { key, revision: await revision(key) }, meta(), live))
    ).message;
    expect(todo).toMatch(/still to be written/);
    await saveDraft(
      editor,
      { key, revision: await revision(key), draft: page("Our story", "We sell shirts.") },
      meta(),
      dev,
    );
    await publishContent(manager, { key, revision: await revision(key) }, meta(), live);
  });

  it("refuses links to pages that are not live", async () => {
    const menuKey = `page.${slug}`;
    const draft = {
      title: { en: "Links", bn: "" },
      blocks: [],
      faq: [],
      layout: "standard",
    };
    await saveDraft(
      editor,
      { key: menuKey, revision: await revision(menuKey), draft },
      meta(),
      dev,
    );
    // A page linking to an unpublished page via the menu shape: use the header menu.
    await ensureSystemDocuments();
    const unpublished = `it-${RUN}-hidden`;
    await createPage(editor, { slug: unpublished, titleEn: "Hidden" }, meta());
    const menu = {
      items: [
        {
          id: "m1",
          label: { en: "Hidden", bn: "" },
          link: { type: "page", key: `page.${unpublished}` },
        },
      ],
    };
    const before = await db.contentDocument.findUniqueOrThrow({ where: { key: "menu.header" } });
    await saveDraft(
      editor,
      { key: "menu.header", revision: before.draftRevision, draft: menu },
      meta(),
      dev,
    );
    const message = (
      await caught(
        publishContent(
          manager,
          { key: "menu.header", revision: await revision("menu.header") },
          meta(),
          dev,
        ),
      )
    ).message;
    expect(message).toMatch(/not published/);
    // Put the shared menu draft back the way it was.
    await saveDraft(
      editor,
      { key: "menu.header", revision: await revision("menu.header"), draft: before.draft },
      meta(),
      dev,
    );
  });
});
