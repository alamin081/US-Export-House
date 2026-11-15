import { describe, expect, it } from "vitest";

import {
  checkContent,
  contentParts,
  isLive,
  missingBengali,
} from "@/modules/content/content-checks";
import {
  CONTENT_SCHEMAS,
  isAllowedImageUrl,
  pagePath,
  RESERVED_SLUGS,
} from "@/modules/content/content.schema";
import { parseInline, plainText, safeHref, unsafeLinksIn } from "@/modules/content/inline";
import {
  fillPlaceholders,
  hasTodoNote,
  unknownPlaceholders,
  type PlaceholderValues,
} from "@/modules/content/placeholders";

const values: PlaceholderValues = {
  freeShippingThresholdPoisha: 250_000,
  returnWindowDays: 7,
  storePhone: "01711-000000",
  codMaxTotalPoisha: 2_000_000,
};

describe("links in content", () => {
  it("allows https, http, mailto, tel and site paths", () => {
    expect(safeHref("https://example.com/a?b=1")).toBe("https://example.com/a?b=1");
    expect(safeHref("/shop?tag=eid")).toBe("/shop?tag=eid");
    expect(safeHref("mailto:hello@example.com")).toBe("mailto:hello@example.com");
    expect(safeHref("tel:+8801711000000")).toBe("tel:+8801711000000");
  });

  it("refuses javascript:, data:, other sites in disguise and odd spellings", () => {
    for (const bad of [
      "javascript:alert(1)",
      "JaVaScRiPt:alert(1)",
      " javascript:alert(1)",
      "java\tscript:alert(1)",
      "java\nscript:alert(1)",
      "java" + String.fromCharCode(0) + "script:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "vbscript:msgbox(1)",
      "//evil.example",
      "/\\evil.example",
      "file:///etc/passwd",
      "/path with space",
    ]) {
      expect(safeHref(bad), bad).toBeNull();
    }
  });
});

describe("inline formatting (no HTML)", () => {
  it("turns **bold**, *italic* and [links] into tokens", () => {
    expect(parseInline("Hi **there** and *you*, see [our shop](/shop).")).toEqual([
      { type: "text", text: "Hi " },
      { type: "bold", text: "there" },
      { type: "text", text: " and " },
      { type: "italic", text: "you" },
      { type: "text", text: ", see " },
      { type: "link", text: "our shop", href: "/shop" },
      { type: "text", text: "." },
    ]);
  });

  it("keeps markup as plain characters, never as elements", () => {
    const typed = '<script>alert(1)</script><img src=x onerror="alert(1)">';
    const tokens = parseInline(typed);
    expect(tokens).toEqual([{ type: "text", text: typed }]);
  });

  it("shows an unsafe link as its label only and reports it", () => {
    const tokens = parseInline("[click](javascript:alert(1))");
    expect(tokens.some((token) => token.type === "link")).toBe(false);
    expect(tokens.map((token) => token.text).join("")).toBe("click)");
    expect(unsafeLinksIn("a [x](javascript:alert(1)) b [y](/ok)")).toEqual(["javascript:alert(1"]);
    expect(plainText("**Free** delivery")).toBe("Free delivery");
  });
});

describe("settings placeholders", () => {
  it("fills numbers from settings in both languages", () => {
    expect(fillPlaceholders("Free over {freeShippingThreshold}", values, "en")).toBe(
      "Free over ৳2,500",
    );
    expect(fillPlaceholders("{returnWindowDays} দিনের মধ্যে", values, "bn")).toBe("7 দিনের মধ্যে");
    expect(fillPlaceholders("Call {storePhone}", values, "en")).toBe("Call 01711-000000");
    expect(fillPlaceholders("Up to {codMaxTotal}", values, "en")).toBe("Up to ৳20,000");
  });

  it("changes when the setting changes", () => {
    const next = { ...values, freeShippingThresholdPoisha: 300_000 };
    expect(fillPlaceholders("{freeShippingThreshold}", next, "en")).toBe("৳3,000");
  });

  it("finds unknown placeholders and leaves them visible", () => {
    expect(unknownPlaceholders("{freeShippingThreshold} {discount}")).toEqual(["discount"]);
    expect(fillPlaceholders("{discount}", values, "en")).toBe("{discount}");
  });

  it("spots [write this] notes but not markdown links", () => {
    expect(hasTodoNote("[Write your brand story here]")).toBe(true);
    expect(hasTodoNote("See [our shop](/shop)")).toBe(false);
  });
});

describe("publishing checks", () => {
  const goodLink = () => null;

  it("blocks unknown placeholders, unsafe links and images without alt text", () => {
    const page = CONTENT_SCHEMAS.PAGE.parse({
      title: { en: "Offer {discount}", bn: "" },
      blocks: [
        { type: "paragraph", id: "p1", text: { en: "Go [here](javascript:x)", bn: "" } },
        {
          type: "image",
          id: "i1",
          image: {
            url: "https://res.cloudinary.com/shop/image/upload/a.jpg",
            alt: { en: "", bn: "" },
          },
        },
      ],
    });
    const issues = checkContent(page, { production: false, checkLink: goodLink });
    const errors = issues.filter((issue) => issue.level === "error").map((issue) => issue.message);
    expect(errors.some((message) => message.includes("{discount}"))).toBe(true);
    expect(errors.some((message) => message.includes("javascript"))).toBe(true);
    expect(errors.some((message) => message.includes("alt text"))).toBe(true);
  });

  it("allows [write] notes and placeholder pictures outside production only", () => {
    const page = CONTENT_SCHEMAS.PAGE.parse({
      title: { en: "About", bn: "" },
      blocks: [
        { type: "paragraph", id: "p1", text: { en: "[Write your story]", bn: "" } },
        {
          type: "image",
          id: "i1",
          image: { url: "/images/editorial/brand.svg", alt: { en: "Shop", bn: "" } },
        },
      ],
    });
    const dev = checkContent(page, { production: false, checkLink: goodLink });
    expect(dev.filter((issue) => issue.level === "error")).toEqual([]);
    const live = checkContent(page, { production: true, checkLink: goodLink });
    expect(live.filter((issue) => issue.level === "error")).toHaveLength(2);
  });

  it("reports links to things that are not live", () => {
    const menu = CONTENT_SCHEMAS.MENU.parse({
      items: [{ id: "m1", label: { en: "Eid", bn: "" }, link: { type: "page", key: "page.eid" } }],
    });
    const issues = checkContent(menu, {
      production: false,
      checkLink: (link) => (link.type === "page" ? "not published" : null),
    });
    expect(issues).toContainEqual({ level: "error", message: "not published" });
  });

  it("counts texts that still need Bengali", () => {
    const parts = contentParts(
      CONTENT_SCHEMAS.ANNOUNCEMENTS.parse({
        messages: [
          { id: "a", text: { en: "Free delivery", bn: "" } },
          { id: "b", text: { en: "COD", bn: "ক্যাশ অন ডেলিভারি" } },
        ],
      }),
    );
    expect(missingBengali(parts)).toBe(1);
  });
});

describe("content shapes", () => {
  it("requires English where it matters and defaults the rest", () => {
    expect(CONTENT_SCHEMAS.PAGE.safeParse({ title: { en: "", bn: "শুধু বাংলা" } }).success).toBe(
      false,
    );
    const footer = CONTENT_SCHEMAS.FOOTER.parse({});
    expect(footer).toMatchObject({ blurb: { en: "", bn: "" }, columns: [], showBranches: true });
  });

  it("refuses a third menu level and unknown section types", () => {
    const nested = {
      items: [
        {
          id: "a",
          link: { type: "url", href: "/shop" },
          children: [
            {
              id: "b",
              link: { type: "url", href: "/shop" },
              children: [{ id: "c", link: { type: "url", href: "/" } }],
            },
          ],
        },
      ],
    };
    const parsed = CONTENT_SCHEMAS.MENU.parse(nested);
    // Extra levels are dropped by the schema, never stored.
    expect("children" in parsed.items[0]!.children[0]!).toBe(false);
    expect(CONTENT_SCHEMAS.HOME.safeParse({ sections: [{ type: "html", id: "x" }] }).success).toBe(
      false,
    );
  });

  it("refuses a schedule that ends before it starts", () => {
    const result = CONTENT_SCHEMAS.ANNOUNCEMENTS.safeParse({
      messages: [
        {
          id: "a",
          text: { en: "Eid sale", bn: "" },
          schedule: { startsAt: "2026-04-14T00:00:00Z", endsAt: "2026-04-10T00:00:00Z" },
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("only takes images from Cloudinary, the mock store or bundled placeholders", () => {
    expect(isAllowedImageUrl("https://res.cloudinary.com/shop/image/upload/a.jpg")).toBe(true);
    expect(isAllowedImageUrl("/images/editorial/hero.svg")).toBe(true);
    expect(isAllowedImageUrl("https://evil.example/a.jpg")).toBe(false);
    expect(isAllowedImageUrl("javascript:alert(1)")).toBe(false);
    expect(isAllowedImageUrl("/images/../secret")).toBe(false);
  });

  it("maps page slugs to their addresses", () => {
    expect(pagePath("about")).toBe("/about");
    expect(pagePath("eid-offer")).toBe("/pages/eid-offer");
    expect(RESERVED_SLUGS).toContain("checkout");
  });
});

describe("schedules", () => {
  it("shows an item only inside its window", () => {
    const window = { startsAt: "2026-04-14T00:00:00+06:00", endsAt: "2026-04-21T00:00:00+06:00" };
    expect(isLive(window, new Date("2026-04-13T17:59:59Z"))).toBe(false);
    expect(isLive(window, new Date("2026-04-13T18:00:00Z"))).toBe(true);
    expect(isLive(window, new Date("2026-04-20T18:00:00Z"))).toBe(false);
    expect(isLive({ startsAt: null, endsAt: null }, new Date())).toBe(true);
  });
});
