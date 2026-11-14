import { describe, expect, it } from "vitest";

import { formatTakaInput, parseTakaInput } from "@/lib/money";
import { productSaveSchema, variantInputSchema } from "@/modules/catalog/catalog.schema";
import {
  buildTree,
  checkCategoryMove,
  depthOf,
  flattenTree,
  type TreeNode,
} from "@/modules/catalog/category-tree";
import { draftWarnings, missingForPublish } from "@/modules/catalog/publish-rules";
import {
  escapeLike,
  normalizeSearchText,
  searchTerms,
  tagSearchText,
} from "@/modules/catalog/search-text";
import {
  buildProductCode,
  DEFAULT_SKU_PATTERN,
  isValidSku,
  renderSku,
  toSkuSegment,
} from "@/modules/catalog/sku";
import { firstFreeSlug, isValidSlug, slugify } from "@/modules/catalog/slug";
import {
  combinationKey,
  duplicateKeys,
  generateMatrix,
  optionKeyOf,
} from "@/modules/catalog/variant-matrix";
import {
  DEFAULT_CATALOG_SETTINGS,
  parseCatalogSettings,
} from "@/modules/settings/catalog-settings";

describe("slugs", () => {
  it("suggests a slug from an English name", () => {
    expect(slugify("Classic White Oxford Shirt")).toBe("classic-white-oxford-shirt");
    expect(slugify("  Slim-Fit  Chinos & Belt!! ")).toBe("slim-fit-chinos-and-belt");
    expect(slugify("Café Crème")).toBe("cafe-creme");
  });

  it("gives nothing for a Bengali-only name, so the admin types one", () => {
    expect(slugify("পাঞ্জাবি")).toBe("");
  });

  it("validates the shape", () => {
    expect(isValidSlug("navy-panjabi-2")).toBe(true);
    for (const bad of [
      "",
      "Navy",
      "navy--panjabi",
      "-navy",
      "navy_panjabi",
      "পাঞ্জাবি",
      "a".repeat(81),
    ]) {
      expect(isValidSlug(bad)).toBe(false);
    }
  });

  it("finds the first free slug", async () => {
    const taken = new Set(["oxford", "oxford-2"]);
    expect(await firstFreeSlug("oxford", async (candidate) => taken.has(candidate))).toBe(
      "oxford-3",
    );
    expect(await firstFreeSlug("linen", async () => false)).toBe("linen");
  });
});

describe("product codes and SKUs", () => {
  it("builds UEH-{category}{4 digits}", () => {
    expect(buildProductCode("UEH", "SH", 12)).toBe("UEH-SH0012");
    expect(buildProductCode("UEH", "PNJ", 1234)).toBe("UEH-PNJ1234");
    expect(() => buildProductCode("UEH", "sh", 1)).toThrow();
    expect(() => buildProductCode("UEH", "SH", 0)).toThrow();
    expect(() => buildProductCode("UEH", "SH", 10_000)).toThrow();
  });

  it("renders the default pattern {PRODUCT_CODE}-{COLOUR}-{SIZE}", () => {
    expect(
      renderSku(DEFAULT_SKU_PATTERN, { productCode: "UEH-SH0012", colour: "NVY", size: "L" }),
    ).toBe("UEH-SH0012-NVY-L");
  });

  it("drops a missing part with its hyphen", () => {
    expect(
      renderSku(DEFAULT_SKU_PATTERN, { productCode: "UEH-SH0012", colour: null, size: "XL" }),
    ).toBe("UEH-SH0012-XL");
    expect(renderSku(DEFAULT_SKU_PATTERN, { productCode: "UEH-SH0012" })).toBe("UEH-SH0012");
  });

  it("keeps only capital letters, digits and hyphens", () => {
    expect(renderSku("{PRODUCT_CODE}-{SIZE}", { productCode: "UEH-SH0012", size: "15.5" })).toBe(
      "UEH-SH0012-155",
    );
    expect(toSkuSegment("Navy blue!")).toBe("NAVYBLUE");
    expect(isValidSku("UEH-SH0012-NVY-L")).toBe(true);
    for (const bad of ["ueh-sh0012", "UEH_SH", "UEH--SH", "-UEH", "UEH SH", "UEH.SH"]) {
      expect(isValidSku(bad)).toBe(false);
    }
  });
});

describe("variant matrix", () => {
  const sizes = [
    { ref: "s", code: "S" },
    { ref: "m", code: "M" },
  ];
  const colours = [
    { ref: "nvy", code: "NVY" },
    { ref: "wht", code: "WHT" },
    { ref: "blk", code: "BLK" },
  ];

  it("creates every size x colour combination", () => {
    const cells = generateMatrix(sizes, colours);
    expect(cells).toHaveLength(6);
    expect(cells[0]?.key).toBe("size:s|colour:nvy");
  });

  it("leaves out the combinations the admin removed", () => {
    const excluded = new Set([combinationKey(sizes[0] ?? null, colours[2] ?? null)]);
    const cells = generateMatrix(sizes, colours, excluded);
    expect(cells).toHaveLength(5);
    expect(cells.map((cell) => cell.key)).not.toContain("size:s|colour:blk");
  });

  it("works with one dimension or none", () => {
    expect(generateMatrix(sizes, [])).toHaveLength(2);
    expect(generateMatrix([], colours)).toHaveLength(3);
    expect(generateMatrix([], [])).toEqual([{ key: "", size: null, colour: null }]);
  });

  it("builds an order-independent database key and spots duplicates", () => {
    expect(optionKeyOf(["b", "a"])).toBe(optionKeyOf(["a", "b"]));
    expect(optionKeyOf([])).toBe("");
    expect(duplicateKeys(["a", "b", "a", "c", "b"]).sort()).toEqual(["a", "b"]);
  });
});

describe("publish requirements", () => {
  const ready = {
    nameEn: "Navy Panjabi",
    nameBn: "নেভি পাঞ্জাবি",
    imageCount: 1,
    variants: [{ isActive: true, deleted: false, pricePoisha: 250_000 }],
  };

  it("passes a complete product", () => {
    expect(missingForPublish(ready)).toEqual([]);
  });

  it("lists exactly what is missing", () => {
    expect(missingForPublish({ ...ready, nameBn: " " })).toEqual(["name_bn"]);
    expect(missingForPublish({ ...ready, imageCount: 0 })).toEqual(["image"]);
    expect(
      missingForPublish({
        ...ready,
        variants: [{ isActive: false, deleted: false, pricePoisha: 100 }],
      }),
    ).toEqual(["active_variant"]);
    expect(
      missingForPublish({
        ...ready,
        variants: [
          { isActive: true, deleted: false, pricePoisha: 100 },
          { isActive: true, deleted: false, pricePoisha: 0 },
        ],
      }),
    ).toEqual(["price"]);
    expect(missingForPublish({ nameEn: "", nameBn: null, imageCount: 0, variants: [] })).toEqual([
      "name_en",
      "name_bn",
      "image",
      "active_variant",
    ]);
  });

  it("warns about drafts without a price or Bengali name", () => {
    expect(draftWarnings({ ...ready, nameBn: null, variants: [] })).toEqual([
      "Bengali translation missing",
      "No price yet",
    ]);
  });
});

describe("category tree", () => {
  // men > shirts > formal ; men > trousers ; kids
  const nodes = new Map<string, TreeNode>(
    [
      { id: "men", parentId: null },
      { id: "shirts", parentId: "men" },
      { id: "formal", parentId: "shirts" },
      { id: "trousers", parentId: "men" },
      { id: "kids", parentId: null },
    ].map((node) => [node.id, node]),
  );

  it("measures depth", () => {
    expect(depthOf("formal", nodes)).toBe(3);
    expect(depthOf(null, nodes)).toBe(0);
  });

  it("refuses a category as its own parent", () => {
    expect(checkCategoryMove("shirts", "shirts", nodes, 3)).toBe("self_parent");
  });

  it("refuses moving a category under its own descendant (cycle)", () => {
    expect(checkCategoryMove("men", "formal", nodes, 5)).toBe("cycle");
    expect(checkCategoryMove("shirts", "formal", nodes, 5)).toBe("cycle");
  });

  it("enforces the maximum depth, counting the moved subtree", () => {
    expect(checkCategoryMove(null, "formal", nodes, 3)).toBe("too_deep");
    expect(checkCategoryMove("shirts", "trousers", nodes, 3)).toBe("too_deep");
    expect(checkCategoryMove("trousers", "kids", nodes, 3)).toBeNull();
    expect(checkCategoryMove(null, "shirts", nodes, 3)).toBeNull();
  });

  it("rejects an unknown parent", () => {
    expect(checkCategoryMove(null, "ghost", nodes, 3)).toBe("unknown_parent");
  });

  it("builds and flattens the tree in sibling order", () => {
    const rows = [
      { id: "b", parentId: null, sortOrder: 1, nameEn: "B" },
      { id: "a", parentId: null, sortOrder: 0, nameEn: "A" },
      { id: "a1", parentId: "a", sortOrder: 0, nameEn: "A1" },
    ];
    const flat = flattenTree(buildTree(rows));
    expect(flat.map((row) => `${row.node.id}:${row.depth}`)).toEqual(["a:1", "a1:2", "b:1"]);
  });
});

describe("money input", () => {
  it("parses taka typed in the admin into integer poisha", () => {
    expect(parseTakaInput("1250")).toBe(125_000);
    expect(parseTakaInput("1,250.5")).toBe(125_050);
    expect(parseTakaInput("1250.05")).toBe(125_005);
    expect(parseTakaInput("৳ 2,490")).toBe(249_000);
    expect(parseTakaInput("১২৫০")).toBe(125_000);
    expect(parseTakaInput("0")).toBe(0);
  });

  it("refuses anything that is not a plain amount", () => {
    for (const bad of ["", "-5", "12.345", "abc", "1e3", "12.3.4"]) {
      expect(parseTakaInput(bad)).toBeNull();
    }
  });

  it("round-trips through the form value", () => {
    for (const poisha of [0, 5, 125_000, 125_050, 199_999]) {
      expect(parseTakaInput(formatTakaInput(poisha))).toBe(poisha);
    }
  });

  it("rejects a compare-at price that is not higher than the price", () => {
    const base = { sku: "", price: "1000", isActive: true };
    expect(variantInputSchema.safeParse({ ...base, comparePrice: "1000" }).success).toBe(false);
    expect(variantInputSchema.safeParse({ ...base, comparePrice: "900" }).success).toBe(false);
    expect(variantInputSchema.safeParse({ ...base, comparePrice: "1200" }).success).toBe(true);
    expect(variantInputSchema.safeParse({ ...base, comparePrice: "" }).success).toBe(true);
  });

  it("refuses lower-case or punctuated SKUs at the form boundary", () => {
    const base = { price: "1000", isActive: true };
    expect(variantInputSchema.parse({ ...base, sku: "ueh-sh0012-nvy-l" }).sku).toBe(
      "UEH-SH0012-NVY-L",
    );
    expect(variantInputSchema.safeParse({ ...base, sku: "UEH SH 12" }).success).toBe(false);
  });

  it("requires an English name and a valid slug", () => {
    const parsed = productSaveSchema.safeParse({ nameEn: " ", slug: "Bad Slug", categoryId: "c1" });
    expect(parsed.success).toBe(false);
    const paths = parsed.success ? [] : parsed.error.issues.map((issue) => issue.path.join("."));
    expect(paths).toEqual(expect.arrayContaining(["nameEn", "slug"]));
  });
});

describe("search text", () => {
  it("normalises case, spaces and Unicode form", () => {
    expect(normalizeSearchText("  Navy   PANJABI ")).toBe("navy panjabi");
    // Composed and decomposed forms of the same Bengali text compare equal.
    // ো (U+09CB) is the composed form of ে + া (U+09C7 U+09BE).
    expect(normalizeSearchText("কো")).toBe(normalizeSearchText("কো"));
  });

  it("splits a query into at most five terms", () => {
    expect(searchTerms("a b c d e f g")).toEqual(["a", "b", "c", "d", "e"]);
    expect(searchTerms("   ")).toEqual([]);
  });

  it("escapes LIKE wildcards", () => {
    expect(escapeLike("50%_off")).toBe("50\\%\\_off");
  });

  it("indexes a tag under all its spellings", () => {
    expect(
      tagSearchText({
        nameEn: "Panjabi",
        nameBn: "পাঞ্জাবি",
        aliases: ["Punjabi", "panjabi", " "],
      }),
    ).toBe("panjabi পাঞ্জাবি punjabi");
  });
});

describe("catalogue settings", () => {
  it("uses the agreed defaults when rows are missing", () => {
    const settings = parseCatalogSettings(new Map());
    expect(settings).toEqual(DEFAULT_CATALOG_SETTINGS);
    expect(settings.numerals).toBe("latin");
    expect(settings.maxCategoryDepth).toBe(3);
    expect(settings.maxUploadBytes).toBe(8 * 1024 * 1024);
    expect(settings.fits.map((fit) => fit.key)).toEqual([
      "slim",
      "regular",
      "relaxed",
      "oversized",
      "comfort",
    ]);
  });

  it("reads valid rows and falls back on broken ones", () => {
    const warnings: string[] = [];
    const settings = parseCatalogSettings(
      new Map([
        ["storefront.numerals", "bengali"],
        ["catalog.maxCategoryDepth", "4"],
        ["catalog.fits", "not json"],
        ["catalog.skuPattern", "{COLOUR}-{SIZE}"],
      ]),
      (message) => warnings.push(message),
    );
    expect(settings.numerals).toBe("bengali");
    expect(settings.maxCategoryDepth).toBe(4);
    expect(settings.fits).toEqual(DEFAULT_CATALOG_SETTINGS.fits);
    expect(settings.skuPattern).toBe(DEFAULT_CATALOG_SETTINGS.skuPattern);
    expect(warnings).toHaveLength(2);
  });
});
