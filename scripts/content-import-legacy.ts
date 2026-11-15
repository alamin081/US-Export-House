/**
 * Phase 12: turns the Phase 3 sample content into content documents, so the
 * storefront keeps a familiar shape while the owner writes the real text.
 *
 *   npm run content:import-legacy            # dry run: prints everything, writes nothing
 *   npm run content:import-legacy -- --apply # creates the documents
 *
 * Owner's rules (2026-11-15):
 *   - create-only: a document that already exists is never touched;
 *   - no invented facts: founding year, showroom counts, "500+ styles",
 *     delivery times, made-up addresses, phones and showrooms are NOT carried
 *     over; they become "[write …]" notes or settings placeholders, and
 *     branches come only from the Location table;
 *   - every imported document is marked as sample text (isSample), which
 *     cannot be published when APP_ENV=production; on other environments the
 *     first version is published so the site looks as before;
 *   - the empty system pages (Terms, Shipping information, Size guide) are
 *     created as unpublished drafts.
 */
import { config as loadEnvFiles } from "dotenv";

loadEnvFiles({ path: [".env.local", ".env"], quiet: true });

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../src/generated/prisma/client";
import { CONTENT_SCHEMAS, type ContentKind } from "../src/modules/content/content.schema";

const APPLY = process.argv.includes("--apply");
const PRODUCTION = process.env.APP_ENV === "production";
const T = (en: string, bn = "") => ({ en, bn });
const NOTE = (en: string, bn: string) => T(`[${en}]`, `[${bn}]`);
let counter = 0;
const id = () => `imp${(counter += 1).toString(36).padStart(4, "0")}`;
const placeholder = (url: string, alt: string, altBn: string) => ({
  url,
  key: null,
  width: null,
  height: null,
  alt: T(alt, altBn),
});
const NO_SCHEDULE = { startsAt: null, endsAt: null };

/** What happened to the old text, printed in the dry run for the owner. */
const decisions: string[] = [];
const decide = (line: string) => decisions.push(line);

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (connectionString === undefined || connectionString === "")
    throw new Error("DATABASE_URL is not set.");
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  try {
    const categories = new Map(
      (
        await prisma.category.findMany({
          where: { deletedAt: null },
          select: { id: true, slug: true },
        })
      ).map((row) => [row.slug, row.id]),
    );
    const category = (slug: string) => {
      const found = categories.get(slug);
      return found === undefined
        ? ({ type: "url", href: "/shop" } as const)
        : ({ type: "category", id: found } as const);
    };
    const page = (slug: string) => ({ type: "page", key: `page.${slug}` }) as const;
    const url = (href: string) => ({ type: "url", href }) as const;

    // -------------------------------------------------------------- home
    decide(
      'HOME hero: kept the eyebrow and title; the subtitle ("at any of our showrooms") became a [write] note.',
    );
    decide(
      'HOME promo 1: title uses {freeShippingThreshold}; the old "Inside Dhaka ৳70, outside ৳130" text was dropped (rates live in delivery zones).',
    );
    decide('HOME promo 2: "or pay online" dropped — online payment is not live yet (Phase 10).');
    decide('HOME collections: titles kept; "six shirts", "12 pieces" and similar counts dropped.');
    decide(
      'HOME brand story: "Since 2009", "3 showrooms", "500+ styles", "7 day returns" and the founding story dropped; a [write your story] note instead.',
    );
    decide(
      "HOME reviews and newsletter sections: not imported (no reviews feature; the newsletter form is removed).",
    );
    const home = {
      sections: [
        {
          type: "hero",
          id: id(),
          enabled: true,
          slides: [
            {
              id: id(),
              desktop: placeholder(
                "/images/editorial/hero.svg",
                "Shirts and polos on a rail",
                "র‍্যাকে ঝোলানো শার্ট ও পোলো",
              ),
              mobile: null,
              eyebrow: T("New season", "নতুন সিজন"),
              title: T(
                "Menswear built for Bangladeshi weather",
                "বাংলাদেশের আবহাওয়ার জন্য তৈরি পুরুষদের পোশাক",
              ),
              subtitle: NOTE(
                "Write a short line about the collection",
                "কালেকশন নিয়ে একটি ছোট লাইন লিখুন",
              ),
              primary: { label: T("Shop the collection", "কালেকশন দেখুন"), link: url("/shop") },
              secondary: { label: T("Find a branch", "শাখা খুঁজুন"), link: page("contact") },
              textTone: "dark",
              schedule: NO_SCHEDULE,
            },
          ],
        },
        {
          type: "categories",
          id: id(),
          enabled: true,
          eyebrow: T(""),
          title: T("Shop by category", "ক্যাটাগরি অনুযায়ী কিনুন"),
          description: T(""),
          categoryIds: [],
        },
        {
          type: "products",
          id: id(),
          enabled: true,
          title: T("New arrivals", "নতুন এসেছে"),
          description: T(""),
          rule: "new",
          tagSlug: null,
          categoryId: null,
          productIds: [],
          limit: 4,
          viewAll: null,
        },
        {
          type: "promo",
          id: id(),
          enabled: true,
          image: placeholder(
            "/images/editorial/promo-shipping.svg",
            "A delivery parcel",
            "ডেলিভারির পার্সেল",
          ),
          eyebrow: T("Free delivery", "ফ্রি ডেলিভারি"),
          title: T(
            "Free delivery over {freeShippingThreshold}",
            "{freeShippingThreshold} টাকার বেশি অর্ডারে ফ্রি ডেলিভারি",
          ),
          body: T(""),
          cta: { label: T("Start shopping", "কিনতে শুরু করুন"), link: url("/shop") },
          tone: "accent",
          schedule: NO_SCHEDULE,
        },
        {
          type: "products",
          id: id(),
          enabled: true,
          title: T("Featured", "বাছাই করা পণ্য"),
          description: T(""),
          rule: "featured",
          tagSlug: null,
          categoryId: null,
          productIds: [],
          limit: 4,
          viewAll: null,
        },
        {
          type: "collections",
          id: id(),
          enabled: true,
          eyebrow: T(""),
          title: T("Collections", "কালেকশন"),
          description: T(""),
          items: [
            {
              id: id(),
              image: placeholder(
                "/images/editorial/collection-office.svg",
                "Office shirts",
                "অফিসের শার্ট",
              ),
              title: T("Office Essentials", "অফিস এসেনশিয়ালস"),
              description: T(""),
              link: category("formal-shirts"),
            },
            {
              id: id(),
              image: placeholder(
                "/images/editorial/collection-weekend.svg",
                "Weekend shirts and polos",
                "ছুটির দিনের শার্ট ও পোলো",
              ),
              title: T("Weekend Casual", "উইকেন্ড ক্যাজুয়াল"),
              description: T(""),
              link: category("casual-shirts"),
            },
            {
              id: id(),
              image: placeholder(
                "/images/editorial/collection-denim.svg",
                "Denim jeans",
                "ডেনিম জিন্স",
              ),
              title: T("The Denim Edit", "ডেনিম এডিট"),
              description: T(""),
              link: category("denim-jeans"),
            },
          ],
        },
        {
          type: "story",
          id: id(),
          enabled: true,
          image: placeholder("/images/editorial/brand.svg", "Inside the shop", "দোকানের ভেতর"),
          eyebrow: T(""),
          title: T("About US Export House", "ইউএস এক্সপোর্ট হাউস সম্পর্কে"),
          blocks: [
            {
              type: "paragraph",
              id: id(),
              text: NOTE("Write your brand story here", "এখানে আপনার ব্র্যান্ডের গল্প লিখুন"),
            },
          ],
          stats: [],
          cta: { label: T("Read more", "আরও পড়ুন"), link: page("about") },
        },
        {
          type: "promo",
          id: id(),
          enabled: true,
          image: placeholder(
            "/images/editorial/promo-cod.svg",
            "Paying the courier on delivery",
            "ডেলিভারির সময় টাকা দেওয়া",
          ),
          eyebrow: T("Cash on delivery", "ক্যাশ অন ডেলিভারি"),
          title: T("Pay when it arrives", "পণ্য হাতে পেয়ে টাকা দিন"),
          body: T("Cash on delivery is available.", "ক্যাশ অন ডেলিভারি সুবিধা আছে।"),
          cta: null,
          tone: "dark",
          schedule: NO_SCHEDULE,
        },
      ],
    };

    // ---------------------------------------------------- announcements
    decide('ANNOUNCEMENT: "৳2,500" became {freeShippingThreshold}.');
    const announcements = {
      messages: [
        {
          id: id(),
          enabled: true,
          text: T(
            "Free delivery on orders over {freeShippingThreshold} · Cash on delivery available",
            "{freeShippingThreshold} টাকার বেশি অর্ডারে ফ্রি ডেলিভারি · ক্যাশ অন ডেলিভারি সুবিধা",
          ),
          link: null,
          tone: "primary",
          schedule: NO_SCHEDULE,
        },
      ],
    };

    // ------------------------------------------------------------- menu
    decide(
      "MENU: the current header links (Shop all, four categories, About, Contact), linked by category id and page.",
    );
    const leaf = (label: [string, string], link: unknown) => ({
      id: id(),
      enabled: true,
      label: T(...label),
      link,
    });
    const menu = {
      items: [
        { ...leaf(["Shop all", "সব পণ্য"], url("/shop")), children: [] },
        { ...leaf(["", ""], category("formal-shirts")), children: [] },
        { ...leaf(["", ""], category("casual-shirts")), children: [] },
        { ...leaf(["", ""], category("polo-t-shirts")), children: [] },
        { ...leaf(["", ""], category("denim-jeans")), children: [] },
        { ...leaf(["About", "আমাদের সম্পর্কে"], page("about")), children: [] },
        { ...leaf(["Contact", "যোগাযোগ"], page("contact")), children: [] },
      ],
    };

    // ----------------------------------------------------------- footer
    decide(
      'FOOTER: "sold online and in three showrooms" dropped from the brand line; showrooms come from Locations.',
    );
    const footer = {
      blurb: T(
        "Menswear cut for Bangladeshi weather. Shirts, polos and denim.",
        "বাংলাদেশের আবহাওয়ার জন্য তৈরি পুরুষদের পোশাক। শার্ট, পোলো ও ডেনিম।",
      ),
      columns: [
        {
          id: id(),
          title: T("Shop", "কেনাকাটা"),
          links: [
            leaf(["Shop all", "সব পণ্য"], url("/shop")),
            leaf(["", ""], category("formal-shirts")),
            leaf(["", ""], category("casual-shirts")),
            leaf(["", ""], category("polo-t-shirts")),
            leaf(["", ""], category("denim-jeans")),
          ],
        },
        {
          id: id(),
          title: T("Help", "সহায়তা"),
          links: [
            leaf(["Track order", "অর্ডার ট্র্যাক"], url("/track-order")),
            leaf(["FAQ", "সাধারণ জিজ্ঞাসা"], page("faq")),
            leaf(["Shipping & returns", "শিপিং ও রিটার্ন"], page("shipping-returns")),
            leaf(["Privacy", "প্রাইভেসি"], page("privacy-policy")),
            leaf(["Contact", "যোগাযোগ"], page("contact")),
          ],
        },
      ],
      showBranches: true,
      showPaymentMethods: true,
    };

    // ------------------------------------------------------------ pages
    const para = (en: string, bn: string) => ({ type: "paragraph", id: id(), text: T(en, bn) });
    const heading = (en: string, bn: string) => ({
      type: "heading",
      id: id(),
      level: 2,
      text: T(en, bn),
    });
    const legal = {
      type: "callout",
      id: id(),
      text: NOTE(
        "Have this checked by a lawyer before publishing",
        "প্রকাশের আগে আইনজীবী দিয়ে যাচাই করুন",
      ),
    };

    decide(
      'ABOUT: the founding story and "how we choose fabric" claims dropped; headings kept with [write] notes.',
    );
    const about = {
      title: T("About us", "আমাদের সম্পর্কে"),
      summary: T(""),
      layout: "standard",
      blocks: [
        heading("Our story", "আমাদের গল্প"),
        para("[Write how the shop started]", "[দোকান কীভাবে শুরু হলো লিখুন]"),
        heading("What we sell", "আমরা কী বিক্রি করি"),
        para("[Write about your products and fabrics]", "[আপনার পণ্য ও কাপড় সম্পর্কে লিখুন]"),
      ],
    };

    decide(
      "CONTACT: the made-up showrooms dropped; the page lists real branches from Locations, the shop phone and WhatsApp from Settings. The contact form is removed.",
    );
    const contact = {
      title: T("Contact", "যোগাযোগ"),
      summary: T(
        "Call us or visit a branch during opening hours.",
        "খোলার সময়ে ফোন করুন বা শাখায় আসুন।",
      ),
      layout: "contact",
      blocks: [],
    };

    decide(
      "FAQ: kept only answers the system makes true (guest checkout, cancel before shipping, charge shown at checkout, tracking, exchange). Dropped: login by SMS, accounts, colour photography. Delivery time became a [write] note.",
    );
    const qa = (q: [string, string], a: [string, string]) => ({
      id: id(),
      question: T(...q),
      answer: T(...a),
    });
    const faq = {
      title: T("Frequently asked questions", "সাধারণ প্রশ্ন"),
      summary: T(""),
      layout: "faq",
      blocks: [],
      faq: [
        {
          id: id(),
          title: T("Orders", "অর্ডার"),
          items: [
            qa(
              ["Do I need an account to order?", "অর্ডার করতে কি অ্যাকাউন্ট লাগবে?"],
              [
                "No. You check out with your phone number and delivery address.",
                "না। ফোন নম্বর ও ডেলিভারির ঠিকানা দিয়েই অর্ডার করা যায়।",
              ],
            ),
            qa(
              ["Can I change or cancel an order?", "অর্ডার বদলানো বা বাতিল করা যাবে?"],
              [
                "Yes, until it is handed to the courier. Call us at {storePhone}.",
                "হ্যাঁ, কুরিয়ারে দেওয়ার আগ পর্যন্ত। {storePhone} নম্বরে ফোন করুন।",
              ],
            ),
            qa(
              ["Can I track my parcel?", "পার্সেল ট্র্যাক করা যাবে?"],
              [
                "Yes. Enter your order number and phone number on the [Track order](/track-order) page.",
                "হ্যাঁ। [অর্ডার ট্র্যাক](/track-order) পেজে অর্ডার নম্বর ও ফোন নম্বর দিন।",
              ],
            ),
          ],
        },
        {
          id: id(),
          title: T("Delivery", "ডেলিভারি"),
          items: [
            qa(
              ["What does delivery cost?", "ডেলিভারি চার্জ কত?"],
              [
                "It depends on your area and is shown at checkout before you confirm. Orders over {freeShippingThreshold} ship free.",
                "এলাকা অনুযায়ী; অর্ডার নিশ্চিত করার আগে চেকআউটে দেখানো হয়। {freeShippingThreshold} টাকার বেশি অর্ডারে ডেলিভারি ফ্রি।",
              ],
            ),
            qa(
              ["How long does delivery take?", "ডেলিভারিতে কত দিন লাগে?"],
              ["[Write how long delivery takes]", "[ডেলিভারিতে কত দিন লাগে লিখুন]"],
            ),
          ],
        },
        {
          id: id(),
          title: T("Returns", "রিটার্ন"),
          items: [
            qa(
              ["Can I return an item?", "পণ্য ফেরত দেওয়া যাবে?"],
              [
                "Yes, within {returnWindowDays} days of delivery. See the [return policy](/shipping-returns).",
                "হ্যাঁ, ডেলিভারির {returnWindowDays} দিনের মধ্যে। [রিটার্ন নীতি](/shipping-returns) দেখুন।",
              ],
            ),
            qa(
              ["Can I exchange for another size?", "অন্য সাইজে বদলানো যাবে?"],
              [
                "Yes, subject to stock. Ask from the [Track order](/track-order) page or call {storePhone}.",
                "হ্যাঁ, স্টক থাকা সাপেক্ষে। [অর্ডার ট্র্যাক](/track-order) পেজ থেকে অনুরোধ করুন বা {storePhone} নম্বরে ফোন করুন।",
              ],
            ),
          ],
        },
      ],
    };

    decide(
      "PRIVACY: the old text described accounts and an online payment gateway that are not live; replaced by headings with [write] notes and a lawyer check note.",
    );
    const privacy = {
      title: T("Privacy policy", "গোপনীয়তা নীতি"),
      summary: T(""),
      layout: "standard",
      blocks: [
        legal,
        heading("What we collect", "আমরা কী তথ্য রাখি"),
        para("[Write what customer data you keep and why]", "[কোন তথ্য কেন রাখেন লিখুন]"),
        heading("Who we share it with", "কার সাথে শেয়ার করি"),
        para(
          "[Write who sees customer data, e.g. the courier]",
          "[কে তথ্য দেখে লিখুন, যেমন কুরিয়ার]",
        ),
      ],
    };

    decide(
      'SHIPPING & RETURNS: delivery rates, "5pm cut-off" and delivery times dropped; the return window and free-delivery amount come from settings. Needs return.policy.publish to go live.',
    );
    const returnsPage = {
      title: T("Return & exchange policy", "রিটার্ন ও এক্সচেঞ্জ নীতি"),
      summary: T(""),
      layout: "standard",
      blocks: [
        heading("Delivery", "ডেলিভারি"),
        para(
          "The delivery charge depends on your area and is shown at checkout. Orders over {freeShippingThreshold} ship free.",
          "ডেলিভারি চার্জ এলাকা অনুযায়ী, চেকআউটে দেখানো হয়। {freeShippingThreshold} টাকার বেশি অর্ডারে ডেলিভারি ফ্রি।",
        ),
        heading("Returns", "রিটার্ন"),
        para(
          "You can ask for a return within {returnWindowDays} days of delivery.",
          "ডেলিভারির {returnWindowDays} দিনের মধ্যে রিটার্নের অনুরোধ করা যায়।",
        ),
        para(
          "[Write the conditions and how refunds are paid]",
          "[শর্ত ও রিফান্ড কীভাবে দেওয়া হয় লিখুন]",
        ),
      ],
    };

    const documents: Array<{
      key: string;
      kind: ContentKind;
      slug: string | null;
      draft: unknown;
      permission: string | null;
    }> = [
      { key: "home", kind: "HOME", slug: null, draft: home, permission: null },
      {
        key: "announcements",
        kind: "ANNOUNCEMENTS",
        slug: null,
        draft: announcements,
        permission: null,
      },
      { key: "menu.header", kind: "MENU", slug: null, draft: menu, permission: null },
      { key: "footer", kind: "FOOTER", slug: null, draft: footer, permission: null },
      { key: "page.about", kind: "PAGE", slug: "about", draft: about, permission: null },
      { key: "page.contact", kind: "PAGE", slug: "contact", draft: contact, permission: null },
      { key: "page.faq", kind: "PAGE", slug: "faq", draft: faq, permission: null },
      {
        key: "page.privacy-policy",
        kind: "PAGE",
        slug: "privacy-policy",
        draft: privacy,
        permission: null,
      },
      {
        key: "page.shipping-returns",
        kind: "PAGE",
        slug: "shipping-returns",
        draft: returnsPage,
        permission: "return.policy.publish",
      },
    ];
    const empties: Array<[string, string, string]> = [
      ["terms", "Terms and conditions", "শর্তাবলি"],
      ["shipping-info", "Shipping information", "ডেলিভারির তথ্য"],
      ["size-guide", "Size guide", "সাইজ গাইড"],
    ];

    const existing = new Set(
      (await prisma.contentDocument.findMany({ select: { key: true } })).map((row) => row.key),
    );
    console.info(
      `[content:import-legacy] ${APPLY ? "APPLY" : "DRY RUN"} · APP_ENV=${process.env.APP_ENV ?? "local"}`,
    );
    console.info("\nWhat happened to the old sample text:");
    for (const line of decisions) console.info(`  - ${line}`);
    console.info("\nDocuments:");

    let created = 0;
    const plan = [
      ...documents.map((document) => ({
        ...document,
        sample: true,
        publish: !PRODUCTION && document.permission === null,
      })),
      ...empties.map(([slug, en, bn]) => ({
        key: `page.${slug}`,
        kind: "PAGE" as const,
        slug,
        draft: { title: T(en, bn), layout: "standard" },
        permission: null,
        sample: false,
        publish: false,
      })),
    ];
    for (const document of plan) {
      const parsed = CONTENT_SCHEMAS[document.kind].parse(document.draft);
      const size = JSON.stringify(parsed).length;
      if (existing.has(document.key)) {
        console.info(`  = ${document.key.padEnd(24)} exists — left untouched`);
        continue;
      }
      const state = document.publish ? "create + publish v1" : "create as unpublished draft";
      console.info(
        `  + ${document.key.padEnd(24)} ${state}${document.sample ? " (sample)" : ""} · ${size} bytes`,
      );
      if (!APPLY) continue;
      await prisma.$transaction(async (tx) => {
        const row = await tx.contentDocument.create({
          data: {
            key: document.key,
            kind: document.kind,
            slug: document.slug,
            draft: parsed as object,
            isSample: document.sample,
            isSystem: true,
            publishPermission: document.permission,
          },
        });
        if (document.publish) {
          const version = await tx.contentVersion.create({
            data: {
              documentId: row.id,
              number: 1,
              data: parsed as object,
              note: "Imported sample content",
            },
          });
          await tx.contentDocument.update({
            where: { id: row.id },
            data: { publishedVersionId: version.id, publishedAt: new Date() },
          });
        }
        await tx.auditLog.create({
          data: {
            action: "content.imported",
            entityType: "content",
            entityId: document.key,
            after: {
              sample: document.sample,
              published: document.publish,
              via: "content:import-legacy",
            },
          },
        });
      });
      created += 1;
    }
    console.info(
      APPLY
        ? `\n[content:import-legacy] created ${created} document(s).`
        : "\n[content:import-legacy] nothing written. Run with --apply to create the documents above.",
    );
    if (!PRODUCTION) {
      console.info(
        "The return policy is created as a draft: publishing it needs return.policy.publish (it is the approval).",
      );
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error("[content:import-legacy] failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
