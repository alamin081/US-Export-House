/**
 * ============================================================================
 * PHASE 3 MOCK CATALOGUE — NOT REAL DATA
 * ============================================================================
 *
 * Typed sample data so the storefront UI can be built and reviewed before the
 * database exists. Every reader goes through the query functions at the bottom
 * of this file, which are deliberately shaped like the Phase 6 service calls
 * (`catalog.service.ts`), so swapping the source is a one-file change.
 *
 * Rules kept here on purpose:
 *  - Prices are integer poisha (1 BDT = 100 poisha).
 *  - English copy is mandatory, Bengali is optional and falls back to English.
 *    A few products intentionally have no Bengali text so the fallback is
 *    visible during review.
 *  - Images are generated placeholders in `public/images/products/`. Dropping
 *    real photography in at the same paths needs no code change.
 */
import type { LocalizedText } from "@/lib/content";

export type CategorySlug = "formal-shirts" | "casual-shirts" | "polo-t-shirts" | "denim-jeans";

export type ProductTag = "new" | "bestseller" | "sale";

export type Availability = "in_stock" | "low_stock" | "out_of_stock";

export interface MockCategory {
  slug: CategorySlug;
  name: LocalizedText;
  tagline: LocalizedText;
  description: LocalizedText;
  image: string;
}

export interface MockProductImage {
  src: string;
  alt: LocalizedText;
}

export interface MockColour {
  name: LocalizedText;
  /** Swatch colour only; the real palette comes from the product photography. */
  hex: string;
}

export interface MockProduct {
  id: string;
  slug: string;
  sku: string;
  name: LocalizedText;
  summary: LocalizedText;
  description: readonly LocalizedText[];
  fabric: LocalizedText;
  care: readonly LocalizedText[];
  categorySlug: CategorySlug;
  pricePoisha: number;
  /** Original price, shown struck through when the product is on sale. */
  comparePricePoisha?: number;
  images: readonly MockProductImage[];
  sizes: readonly string[];
  colours: readonly MockColour[];
  rating: number;
  reviewCount: number;
  tags: readonly ProductTag[];
  availability: Availability;
  /** Placeholder branch names until the real branch list arrives (Phase 7). */
  availableAt: readonly string[];
}

export interface MockReview {
  id: string;
  productSlug: string;
  author: string;
  city: LocalizedText;
  rating: number;
  title: LocalizedText;
  body: LocalizedText;
  date: string;
  verifiedPurchase: boolean;
}

const BRANCHES = ["Gulshan Showroom", "Dhanmondi Showroom", "Chattogram Showroom"] as const;

const SHIRT_SIZES = ["S", "M", "L", "XL", "XXL"] as const;
const JEANS_SIZES = ["30", "32", "34", "36", "38"] as const;

const COLOURS = {
  white: { name: { en: "White", bn: "সাদা" }, hex: "#F7F7F5" },
  skyBlue: { name: { en: "Sky Blue", bn: "আকাশি" }, hex: "#CBD9E6" },
  charcoal: { name: { en: "Charcoal", bn: "চারকোল" }, hex: "#3A3A3A" },
  navy: { name: { en: "Navy", bn: "নেভি" }, hex: "#2A3444" },
  beige: { name: { en: "Beige", bn: "বেইজ" }, hex: "#D9CFBE" },
  olive: { name: { en: "Olive", bn: "অলিভ" }, hex: "#6E7257" },
  black: { name: { en: "Black", bn: "কালো" }, hex: "#1C1C1C" },
  indigo: { name: { en: "Indigo", bn: "ইন্ডিগো" }, hex: "#36476B" },
  stone: { name: { en: "Stone Wash", bn: "স্টোন ওয়াশ" }, hex: "#8A99AC" },
  maroon: { name: { en: "Maroon", bn: "মেরুন" }, hex: "#6B2B33" },
} as const satisfies Record<string, MockColour>;

export const MOCK_CATEGORIES: readonly MockCategory[] = [
  {
    slug: "formal-shirts",
    name: { en: "Formal Shirts", bn: "ফরমাল শার্ট" },
    tagline: { en: "Office-ready tailoring", bn: "অফিসের জন্য পরিপাটি" },
    description: {
      en: "Crisp cotton shirts cut for the boardroom, with collars that hold their shape through a full Dhaka workday.",
      bn: "অফিসের জন্য তৈরি পরিচ্ছন্ন কটন শার্ট — সারাদিন পরেও কলার থাকে ঝরঝরে।",
    },
    image: "/images/categories/formal-shirts.svg",
  },
  {
    slug: "casual-shirts",
    name: { en: "Casual Shirts", bn: "ক্যাজুয়াল শার্ট" },
    tagline: { en: "Easy weekend layers", bn: "ছুটির দিনের আরাম" },
    description: {
      en: "Soft-washed cottons and relaxed fits for weekends, travel and the long way home.",
      bn: "নরম কটন আর আরামদায়ক ফিট — ছুটির দিন, ভ্রমণ কিংবা ঘোরাঘুরির জন্য।",
    },
    image: "/images/categories/casual-shirts.svg",
  },
  {
    slug: "polo-t-shirts",
    name: { en: "Polo T-Shirts", bn: "পোলো টি-শার্ট" },
    tagline: { en: "Smart, breathable knits", bn: "আরামদায়ক নিট" },
    description: {
      en: "Pique knits that breathe in humid weather and still look sharp with chinos.",
      bn: "আদ্র আবহাওয়ার জন্য আরামদায়ক পিকে নিট — চিনোসের সঙ্গে দেখায় স্মার্ট।",
    },
    image: "/images/categories/polo-t-shirts.svg",
  },
  {
    slug: "denim-jeans",
    name: { en: "Denim Jeans", bn: "ডেনিম জিন্স" },
    tagline: { en: "Denim that lasts", bn: "টেকসই ডেনিম" },
    description: {
      en: "Mid-weight denim with a little stretch, finished in washes that age well.",
      bn: "হালকা স্ট্রেচসহ মিড-ওয়েট ডেনিম — ওয়াশ যত পুরোনো হয়, দেখতে তত ভালো।",
    },
    image: "/images/categories/denim-jeans.svg",
  },
];

/** Builds the three gallery images for a product from its category image pool. */
function imagesFor(category: CategorySlug, variant: number, name: LocalizedText) {
  const pool = [variant, (variant % 4) + 1, ((variant + 1) % 4) + 1];
  return pool.map((index, position) => ({
    src: `/images/products/${category}-${index}.svg`,
    alt: {
      en: `${name.en} — placeholder image ${position + 1}`,
      ...(name.bn === undefined ? {} : { bn: `${name.bn} — প্লেসহোল্ডার ছবি ${position + 1}` }),
    },
  }));
}

const CARE_SHIRT: readonly LocalizedText[] = [
  { en: "Machine wash cold with like colours", bn: "ঠান্ডা পানিতে একই রঙের কাপড়ের সঙ্গে ধুবেন" },
  { en: "Do not bleach", bn: "ব্লিচ ব্যবহার করবেন না" },
  { en: "Warm iron on the reverse side", bn: "উল্টো দিক থেকে মাঝারি আঁচে ইস্তিরি করুন" },
  { en: "Dry in shade", bn: "ছায়ায় শুকাবেন" },
];

const CARE_DENIM: readonly LocalizedText[] = [
  { en: "Wash inside out, cold", bn: "ভেতরের দিক বাইরে করে ঠান্ডা পানিতে ধুবেন" },
  { en: "Wash separately for the first few washes", bn: "প্রথম কয়েকবার আলাদা করে ধুবেন" },
  { en: "Tumble dry low or line dry", bn: "কম আঁচে ড্রায়ার বা ছায়ায় শুকাবেন" },
];

type ProductSeed = Omit<MockProduct, "images" | "care" | "availableAt"> & {
  imageVariant: number;
  care?: readonly LocalizedText[];
  availableAt?: readonly string[];
};

/**
 * Sample products: six per category. Bengali copy is missing on a few entries
 * on purpose, to prove the English fallback in review.
 */
const PRODUCT_SEEDS: readonly ProductSeed[] = [
  // ---------------------------------------------------------------- formal
  {
    id: "p-001",
    slug: "classic-white-oxford-shirt",
    sku: "UEH-FS-1001",
    name: { en: "Classic White Oxford Shirt", bn: "ক্লাসিক সাদা অক্সফোর্ড শার্ট" },
    summary: {
      en: "The shirt every wardrobe starts with: structured oxford cotton in clean white.",
      bn: "প্রতিটি ওয়ার্ডরোবের শুরু যেটি দিয়ে — পরিষ্কার সাদা অক্সফোর্ড কটন।",
    },
    description: [
      {
        en: "Woven from long-staple oxford cotton, this shirt holds a pressed line through meetings and keeps its colour through repeated washes.",
        bn: "লং-স্টেপল অক্সফোর্ড কটনে বোনা এই শার্ট মিটিং শেষেও থাকে পরিপাটি, বারবার ধোয়ার পরেও রঙ থাকে অটুট।",
      },
      {
        en: "A semi-spread collar sits well with or without a tie, and the single-button cuff keeps the sleeve neat under a jacket.",
        bn: "সেমি-স্প্রেড কলার টাই সহ বা ছাড়া — দুভাবেই মানায়; সিঙ্গেল-বাটন কাফ জ্যাকেটের নিচে হাতা রাখে পরিচ্ছন্ন।",
      },
    ],
    fabric: { en: "100% cotton oxford, 140 GSM", bn: "100% কটন অক্সফোর্ড, 140 জিএসএম" },
    categorySlug: "formal-shirts",
    pricePoisha: 249_000,
    comparePricePoisha: 299_000,
    sizes: SHIRT_SIZES,
    colours: [COLOURS.white, COLOURS.skyBlue, COLOURS.charcoal],
    rating: 4.8,
    reviewCount: 64,
    tags: ["bestseller", "sale"],
    availability: "in_stock",
    imageVariant: 1,
  },
  {
    id: "p-002",
    slug: "slim-fit-charcoal-formal-shirt",
    sku: "UEH-FS-1002",
    name: { en: "Slim Fit Charcoal Formal Shirt", bn: "স্লিম ফিট চারকোল ফরমাল শার্ট" },
    summary: {
      en: "A quiet charcoal shirt with a close cut through the chest and waist.",
      bn: "বুক ও কোমরে ফিটিং — শান্ত চারকোল রঙের শার্ট।",
    },
    description: [
      {
        en: "Cut slim without pulling at the buttons, in a twill that drapes rather than stiffens.",
        bn: "স্লিম কাট, তবে বাটনে টান পড়ে না; টুইল কাপড় শরীরের সঙ্গে সুন্দরভাবে বসে।",
      },
      {
        en: "Dark enough for evening events, plain enough for a Sunday meeting.",
        bn: "সন্ধ্যার আয়োজনের জন্য যথেষ্ট গাঢ়, আবার অফিস মিটিংয়ের জন্য যথেষ্ট সাদামাটা।",
      },
    ],
    fabric: { en: "Cotton twill blend, 130 GSM", bn: "কটন টুইল ব্লেন্ড, 130 জিএসএম" },
    categorySlug: "formal-shirts",
    pricePoisha: 269_000,
    sizes: SHIRT_SIZES,
    colours: [COLOURS.charcoal, COLOURS.navy, COLOURS.black],
    rating: 4.6,
    reviewCount: 41,
    tags: ["bestseller"],
    availability: "in_stock",
    imageVariant: 2,
  },
  {
    id: "p-003",
    slug: "sky-blue-poplin-shirt",
    sku: "UEH-FS-1003",
    name: { en: "Sky Blue Poplin Shirt", bn: "আকাশি পপলিন শার্ট" },
    summary: {
      en: "Light poplin for humid mornings, with a collar that stays flat.",
      bn: "আদ্র সকালের জন্য হালকা পপলিন, কলার থাকে সমান।",
    },
    description: [
      {
        en: "Poplin is the lightest weave we stock, chosen for Dhaka summers when a shirt has to breathe.",
        bn: "আমাদের সংগ্রহে সবচেয়ে হালকা বুনন পপলিন — ঢাকার গরমে শার্টকে যখন নিঃশ্বাস নিতে হয়।",
      },
    ],
    fabric: { en: "100% cotton poplin, 110 GSM", bn: "100% কটন পপলিন, 110 জিএসএম" },
    categorySlug: "formal-shirts",
    pricePoisha: 229_000,
    sizes: SHIRT_SIZES,
    colours: [COLOURS.skyBlue, COLOURS.white],
    rating: 4.5,
    reviewCount: 28,
    tags: ["new"],
    availability: "in_stock",
    imageVariant: 3,
  },
  {
    id: "p-004",
    slug: "navy-herringbone-dress-shirt",
    sku: "UEH-FS-1004",
    // Bengali copy pending translation - the storefront falls back to English.
    name: { en: "Navy Herringbone Dress Shirt" },
    summary: { en: "Textured herringbone weave in a deep, even navy." },
    description: [
      {
        en: "The herringbone shows only up close, which is the point: texture without pattern.",
      },
      { en: "Mother-of-pearl buttons, reinforced placket, and a slightly longer tail." },
    ],
    fabric: { en: "Cotton herringbone, 150 GSM" },
    categorySlug: "formal-shirts",
    pricePoisha: 319_000,
    sizes: SHIRT_SIZES,
    colours: [COLOURS.navy, COLOURS.charcoal],
    rating: 4.7,
    reviewCount: 19,
    tags: ["new"],
    availability: "low_stock",
    imageVariant: 4,
  },
  {
    id: "p-005",
    slug: "textured-grey-formal-shirt",
    sku: "UEH-FS-1005",
    name: { en: "Textured Grey Formal Shirt", bn: "টেক্সচার্ড গ্রে ফরমাল শার্ট" },
    summary: {
      en: "Mid-grey with a fine dobby texture, easy to pair with navy trousers.",
      bn: "সূক্ষ্ম ডবি টেক্সচারের মিড-গ্রে — নেভি ট্রাউজারের সঙ্গে সহজে মানায়।",
    },
    description: [
      {
        en: "A practical shirt for five-day weeks: the texture hides creases better than a flat weave.",
        bn: "সপ্তাহজুড়ে পরার উপযোগী শার্ট — টেক্সচারের কারণে ভাঁজ কম চোখে পড়ে।",
      },
    ],
    fabric: { en: "Cotton dobby, 135 GSM", bn: "কটন ডবি, 135 জিএসএম" },
    categorySlug: "formal-shirts",
    pricePoisha: 239_000,
    sizes: SHIRT_SIZES,
    colours: [COLOURS.charcoal, COLOURS.white],
    rating: 4.4,
    reviewCount: 23,
    tags: [],
    availability: "in_stock",
    imageVariant: 2,
  },
  {
    id: "p-006",
    slug: "black-satin-evening-shirt",
    sku: "UEH-FS-1006",
    name: { en: "Black Satin Evening Shirt", bn: "ব্ল্যাক সাটিন ইভনিং শার্ট" },
    summary: {
      en: "A low-sheen black shirt for weddings and evening functions.",
      bn: "বিয়ে ও সন্ধ্যার আয়োজনের জন্য হালকা শাইনের কালো শার্ট।",
    },
    description: [
      {
        en: "Enough sheen to read as formal under warm light, never enough to shine in photographs.",
        bn: "উষ্ণ আলোয় যথেষ্ট আভিজাত্য, তবু ছবিতে বেশি চকচক করে না।",
      },
    ],
    fabric: { en: "Cotton-satin blend, 145 GSM", bn: "কটন-সাটিন ব্লেন্ড, 145 জিএসএম" },
    categorySlug: "formal-shirts",
    pricePoisha: 289_000,
    comparePricePoisha: 329_000,
    sizes: SHIRT_SIZES,
    colours: [COLOURS.black, COLOURS.maroon],
    rating: 4.3,
    reviewCount: 12,
    tags: ["sale"],
    availability: "in_stock",
    imageVariant: 1,
  },

  // ---------------------------------------------------------------- casual
  {
    id: "p-007",
    slug: "washed-indigo-casual-shirt",
    sku: "UEH-CS-2001",
    name: { en: "Washed Indigo Casual Shirt", bn: "ওয়াশড ইন্ডিগো ক্যাজুয়াল শার্ট" },
    summary: {
      en: "Soft-washed indigo cotton with a relaxed body and single chest pocket.",
      bn: "নরম ওয়াশের ইন্ডিগো কটন, আরামদায়ক ফিট ও বুকে একটি পকেট।",
    },
    description: [
      {
        en: "Washed twice before it reaches you, so it feels broken in from the first wear.",
        bn: "আপনার হাতে পৌঁছানোর আগেই দুবার ওয়াশ করা — প্রথম দিনেই মনে হবে অনেকদিনের চেনা।",
      },
    ],
    fabric: { en: "Washed cotton, 160 GSM", bn: "ওয়াশড কটন, 160 জিএসএম" },
    categorySlug: "casual-shirts",
    pricePoisha: 215_000,
    sizes: SHIRT_SIZES,
    colours: [COLOURS.indigo, COLOURS.olive],
    rating: 4.6,
    reviewCount: 37,
    tags: ["bestseller"],
    availability: "in_stock",
    imageVariant: 1,
  },
  {
    id: "p-008",
    slug: "olive-linen-blend-shirt",
    sku: "UEH-CS-2002",
    name: { en: "Olive Linen Blend Shirt", bn: "অলিভ লিনেন ব্লেন্ড শার্ট" },
    summary: {
      en: "Linen-cotton in a muted olive — the coolest shirt in the collection.",
      bn: "লিনেন-কটনের মিশ্রণে অলিভ রঙ — সংগ্রহের সবচেয়ে আরামদায়ক শার্ট।",
    },
    description: [
      {
        en: "Linen keeps air moving; the cotton keeps the creasing civil.",
        bn: "লিনেন বাতাস চলাচল রাখে, কটন ভাঁজ রাখে নিয়ন্ত্রণে।",
      },
    ],
    fabric: { en: "55% linen, 45% cotton", bn: "55% লিনেন, 45% কটন" },
    categorySlug: "casual-shirts",
    pricePoisha: 245_000,
    sizes: SHIRT_SIZES,
    colours: [COLOURS.olive, COLOURS.beige],
    rating: 4.7,
    reviewCount: 31,
    tags: ["new"],
    availability: "in_stock",
    imageVariant: 2,
  },
  {
    id: "p-009",
    slug: "beige-corduroy-overshirt",
    sku: "UEH-CS-2003",
    name: { en: "Beige Corduroy Overshirt", bn: "বেইজ কর্ডুরয় ওভারশার্ট" },
    summary: {
      en: "A light overshirt for winter evenings, worn open or buttoned.",
      bn: "শীতের সন্ধ্যার হালকা ওভারশার্ট — খোলা বা বাটন করা, দুভাবেই।",
    },
    description: [
      {
        en: "Fine-wale corduroy with two patch pockets, sized to layer over a tee.",
        bn: "সূক্ষ্ম কর্ডুরয়, দুটি প্যাচ পকেট — টি-শার্টের উপরে পরার মাপে তৈরি।",
      },
    ],
    fabric: { en: "Cotton corduroy, 280 GSM", bn: "কটন কর্ডুরয়, 280 জিএসএম" },
    categorySlug: "casual-shirts",
    pricePoisha: 325_000,
    sizes: SHIRT_SIZES,
    colours: [COLOURS.beige, COLOURS.olive],
    rating: 4.5,
    reviewCount: 14,
    tags: ["new"],
    availability: "low_stock",
    imageVariant: 3,
  },
  {
    id: "p-010",
    slug: "checked-flannel-shirt",
    sku: "UEH-CS-2004",
    name: { en: "Checked Flannel Shirt", bn: "চেকড ফ্ল্যানেল শার্ট" },
    summary: {
      en: "Brushed flannel in a small, dark check.",
      bn: "ছোট গাঢ় চেকের ব্রাশড ফ্ল্যানেল।",
    },
    description: [
      {
        en: "Brushed on both sides, which is why it feels warmer than it looks.",
        bn: "দুপাশেই ব্রাশ করা — তাই দেখতে যতটা, আরামে তার চেয়ে বেশি উষ্ণ।",
      },
    ],
    fabric: { en: "Brushed cotton flannel, 200 GSM", bn: "ব্রাশড কটন ফ্ল্যানেল, 200 জিএসএম" },
    categorySlug: "casual-shirts",
    pricePoisha: 235_000,
    comparePricePoisha: 275_000,
    sizes: SHIRT_SIZES,
    colours: [COLOURS.maroon, COLOURS.navy],
    rating: 4.4,
    reviewCount: 22,
    tags: ["sale"],
    availability: "in_stock",
    imageVariant: 4,
  },
  {
    id: "p-011",
    slug: "white-mandarin-collar-shirt",
    sku: "UEH-CS-2005",
    // Bengali copy pending translation.
    name: { en: "White Mandarin Collar Shirt" },
    summary: { en: "A collarless cotton shirt that works for Eid and for Fridays." },
    description: [{ en: "Cut a little longer, with side vents so it sits well untucked." }],
    fabric: { en: "100% cotton, 140 GSM" },
    categorySlug: "casual-shirts",
    pricePoisha: 199_000,
    sizes: SHIRT_SIZES,
    colours: [COLOURS.white, COLOURS.beige],
    rating: 4.6,
    reviewCount: 26,
    tags: [],
    availability: "in_stock",
    imageVariant: 1,
  },
  {
    id: "p-012",
    slug: "navy-denim-casual-shirt",
    sku: "UEH-CS-2006",
    name: { en: "Navy Denim Casual Shirt", bn: "নেভি ডেনিম ক্যাজুয়াল শার্ট" },
    summary: {
      en: "Lightweight denim shirt, soft enough to wear all day.",
      bn: "হালকা ডেনিম শার্ট — সারাদিন পরার মতো নরম।",
    },
    description: [
      {
        en: "Four-ounce denim, which is half the weight of jeans denim and twice as comfortable in a shirt.",
        bn: "চার-আউন্স ডেনিম — জিন্সের ডেনিমের অর্ধেক ওজন, শার্টে দ্বিগুণ আরাম।",
      },
    ],
    fabric: { en: "Cotton denim, 170 GSM", bn: "কটন ডেনিম, 170 জিএসএম" },
    categorySlug: "casual-shirts",
    pricePoisha: 225_000,
    sizes: SHIRT_SIZES,
    colours: [COLOURS.indigo, COLOURS.stone],
    rating: 4.5,
    reviewCount: 18,
    tags: [],
    availability: "in_stock",
    imageVariant: 2,
  },

  // ------------------------------------------------------------------ polo
  {
    id: "p-013",
    slug: "pique-polo-charcoal",
    sku: "UEH-PL-3001",
    name: { en: "Pique Polo — Charcoal", bn: "পিকে পোলো — চারকোল" },
    summary: {
      en: "Our everyday polo in breathable pique cotton.",
      bn: "প্রতিদিনের পোলো — আরামদায়ক পিকে কটন।",
    },
    description: [
      {
        en: "Ribbed collar and cuffs keep their shape; the pique weave keeps you cooler than jersey.",
        bn: "রিবড কলার ও কাফ আকৃতি ধরে রাখে; পিকে বুনন জার্সির চেয়ে বেশি ঠান্ডা রাখে।",
      },
    ],
    fabric: { en: "100% cotton pique, 200 GSM", bn: "100% কটন পিকে, 200 জিএসএম" },
    categorySlug: "polo-t-shirts",
    pricePoisha: 149_000,
    sizes: SHIRT_SIZES,
    colours: [COLOURS.charcoal, COLOURS.navy, COLOURS.white],
    rating: 4.7,
    reviewCount: 88,
    tags: ["bestseller"],
    availability: "in_stock",
    imageVariant: 1,
  },
  {
    id: "p-014",
    slug: "pique-polo-white",
    sku: "UEH-PL-3002",
    name: { en: "Pique Polo — White", bn: "পিকে পোলো — সাদা" },
    summary: {
      en: "The same everyday polo in clean white.",
      bn: "একই প্রতিদিনের পোলো, পরিষ্কার সাদা রঙে।",
    },
    description: [
      {
        en: "Double-stitched hems so the shape survives the laundry.",
        bn: "ডাবল-স্টিচ হেম — বারবার ধোয়ার পরেও আকৃতি থাকে ঠিক।",
      },
    ],
    fabric: { en: "100% cotton pique, 200 GSM", bn: "100% কটন পিকে, 200 জিএসএম" },
    categorySlug: "polo-t-shirts",
    pricePoisha: 149_000,
    sizes: SHIRT_SIZES,
    colours: [COLOURS.white, COLOURS.skyBlue],
    rating: 4.6,
    reviewCount: 52,
    tags: [],
    availability: "in_stock",
    imageVariant: 2,
  },
  {
    id: "p-015",
    slug: "tipped-collar-polo-navy",
    sku: "UEH-PL-3003",
    name: { en: "Tipped Collar Polo — Navy", bn: "টিপড কলার পোলো — নেভি" },
    summary: {
      en: "Navy polo with a contrast tipped collar and cuff.",
      bn: "কনট্রাস্ট টিপড কলার ও কাফের নেভি পোলো।",
    },
    description: [
      {
        en: "A small detail that lifts a plain polo to smart-casual.",
        bn: "ছোট একটি ডিটেইল সাধারণ পোলোকে করে তোলে স্মার্ট-ক্যাজুয়াল।",
      },
    ],
    fabric: { en: "Cotton pique with elastane, 210 GSM", bn: "ইলাস্টেনসহ কটন পিকে, 210 জিএসএম" },
    categorySlug: "polo-t-shirts",
    pricePoisha: 169_000,
    sizes: SHIRT_SIZES,
    colours: [COLOURS.navy, COLOURS.black],
    rating: 4.5,
    reviewCount: 33,
    tags: ["new"],
    availability: "in_stock",
    imageVariant: 3,
  },
  {
    id: "p-016",
    slug: "long-sleeve-polo-olive",
    sku: "UEH-PL-3004",
    name: { en: "Long Sleeve Polo — Olive", bn: "লং স্লিভ পোলো — অলিভ" },
    summary: {
      en: "A long-sleeve polo for the short Dhaka winter.",
      bn: "ঢাকার ছোট শীতের জন্য লং স্লিভ পোলো।",
    },
    description: [
      {
        en: "Heavier knit, same collar, worn on its own or under an overshirt.",
        bn: "ভারী নিট, একই কলার — একা বা ওভারশার্টের নিচে।",
      },
    ],
    fabric: { en: "Cotton pique, 230 GSM", bn: "কটন পিকে, 230 জিএসএম" },
    categorySlug: "polo-t-shirts",
    pricePoisha: 185_000,
    comparePricePoisha: 215_000,
    sizes: SHIRT_SIZES,
    colours: [COLOURS.olive, COLOURS.charcoal],
    rating: 4.4,
    reviewCount: 17,
    tags: ["sale"],
    availability: "low_stock",
    imageVariant: 4,
  },
  {
    id: "p-017",
    slug: "striped-polo-beige",
    sku: "UEH-PL-3005",
    name: { en: "Striped Polo — Beige", bn: "স্ট্রাইপড পোলো — বেইজ" },
    summary: {
      en: "Fine horizontal stripes in beige and off-white.",
      bn: "বেইজ ও অফ-হোয়াইটের সূক্ষ্ম আড়াআড়ি স্ট্রাইপ।",
    },
    description: [
      {
        en: "Yarn-dyed stripes, so they will not fade into each other.",
        bn: "ইয়ার্ন-ডাইড স্ট্রাইপ — রঙ একটির সঙ্গে অন্যটি মিশে যায় না।",
      },
    ],
    fabric: { en: "100% cotton pique, 200 GSM", bn: "100% কটন পিকে, 200 জিএসএম" },
    categorySlug: "polo-t-shirts",
    pricePoisha: 159_000,
    sizes: SHIRT_SIZES,
    colours: [COLOURS.beige, COLOURS.white],
    rating: 4.3,
    reviewCount: 11,
    tags: [],
    availability: "in_stock",
    imageVariant: 1,
  },
  {
    id: "p-018",
    slug: "performance-polo-black",
    sku: "UEH-PL-3006",
    // Bengali copy pending translation.
    name: { en: "Performance Polo — Black" },
    summary: { en: "A quick-dry polo for travel days and long commutes." },
    description: [{ en: "Cotton-rich blend with a touch of polyester so it dries overnight." }],
    fabric: { en: "70% cotton, 28% polyester, 2% elastane" },
    categorySlug: "polo-t-shirts",
    pricePoisha: 175_000,
    sizes: SHIRT_SIZES,
    colours: [COLOURS.black, COLOURS.charcoal],
    rating: 4.5,
    reviewCount: 24,
    tags: [],
    availability: "in_stock",
    imageVariant: 2,
  },

  // ----------------------------------------------------------------- denim
  {
    id: "p-019",
    slug: "slim-fit-indigo-jeans",
    sku: "UEH-DJ-4001",
    name: { en: "Slim Fit Indigo Jeans", bn: "স্লিম ফিট ইন্ডিগো জিন্স" },
    summary: {
      en: "Dark indigo denim with 2% stretch, cut slim through the leg.",
      bn: "2% স্ট্রেচসহ গাঢ় ইন্ডিগো ডেনিম, পায়ে স্লিম ফিট।",
    },
    description: [
      {
        en: "Mid-weight denim that holds its shape all day and softens over a season.",
        bn: "মিড-ওয়েট ডেনিম — সারাদিন আকৃতি ধরে রাখে, সময়ের সঙ্গে হয় আরও নরম।",
      },
      {
        en: "Five pockets, branded rivets, and a button fly.",
        bn: "পাঁচ পকেট, ব্র্যান্ডেড রিভেট ও বাটন ফ্লাই।",
      },
    ],
    fabric: { en: "98% cotton, 2% elastane — 12 oz", bn: "98% কটন, 2% ইলাস্টেন — 12 আউন্স" },
    care: CARE_DENIM,
    categorySlug: "denim-jeans",
    pricePoisha: 349_000,
    sizes: JEANS_SIZES,
    colours: [COLOURS.indigo, COLOURS.black],
    rating: 4.8,
    reviewCount: 73,
    tags: ["bestseller"],
    availability: "in_stock",
    imageVariant: 1,
  },
  {
    id: "p-020",
    slug: "straight-fit-stone-wash-jeans",
    sku: "UEH-DJ-4002",
    name: { en: "Straight Fit Stone Wash Jeans", bn: "স্ট্রেইট ফিট স্টোন ওয়াশ জিন্স" },
    summary: {
      en: "A straight leg in a lighter stone wash.",
      bn: "হালকা স্টোন ওয়াশে স্ট্রেইট লেগ।",
    },
    description: [
      {
        en: "Roomier at the knee and hem, for anyone who finds slim jeans a negotiation.",
        bn: "হাঁটু ও নিচের দিকে বেশি জায়গা — স্লিম জিন্সে যাদের অস্বস্তি হয়, তাদের জন্য।",
      },
    ],
    fabric: { en: "100% cotton — 13 oz", bn: "100% কটন — 13 আউন্স" },
    care: CARE_DENIM,
    categorySlug: "denim-jeans",
    pricePoisha: 325_000,
    comparePricePoisha: 375_000,
    sizes: JEANS_SIZES,
    colours: [COLOURS.stone, COLOURS.indigo],
    rating: 4.5,
    reviewCount: 46,
    tags: ["sale"],
    availability: "in_stock",
    imageVariant: 2,
  },
  {
    id: "p-021",
    slug: "black-tapered-jeans",
    sku: "UEH-DJ-4003",
    name: { en: "Black Tapered Jeans", bn: "ব্ল্যাক টেপার্ড জিন্স" },
    summary: {
      en: "Clean black denim, tapered below the knee.",
      bn: "পরিচ্ছন্ন কালো ডেনিম, হাঁটুর নিচে টেপার্ড।",
    },
    description: [
      {
        en: "Dyed black rather than washed black, so it stays dark for longer.",
        bn: "ওয়াশ নয়, সরাসরি ডাই করা কালো — তাই রঙ থাকে অনেকদিন।",
      },
    ],
    fabric: { en: "99% cotton, 1% elastane — 12 oz", bn: "99% কটন, 1% ইলাস্টেন — 12 আউন্স" },
    care: CARE_DENIM,
    categorySlug: "denim-jeans",
    pricePoisha: 339_000,
    sizes: JEANS_SIZES,
    colours: [COLOURS.black],
    rating: 4.6,
    reviewCount: 38,
    tags: ["new"],
    availability: "in_stock",
    imageVariant: 3,
  },
  {
    id: "p-022",
    slug: "relaxed-fit-mid-blue-jeans",
    sku: "UEH-DJ-4004",
    name: { en: "Relaxed Fit Mid Blue Jeans", bn: "রিলাক্সড ফিট মিড ব্লু জিন্স" },
    summary: {
      en: "An easy, roomy fit in a classic mid blue.",
      bn: "ক্লাসিক মিড ব্লুতে আরামদায়ক ঢিলেঢালা ফিট।",
    },
    description: [
      {
        en: "The most forgiving cut we make, with a slightly higher rise.",
        bn: "আমাদের সবচেয়ে আরামদায়ক কাট, রাইজ কিছুটা উঁচু।",
      },
    ],
    fabric: { en: "100% cotton — 12.5 oz", bn: "100% কটন — 12.5 আউন্স" },
    care: CARE_DENIM,
    categorySlug: "denim-jeans",
    pricePoisha: 299_000,
    sizes: JEANS_SIZES,
    colours: [COLOURS.indigo, COLOURS.stone],
    rating: 4.4,
    reviewCount: 29,
    tags: [],
    availability: "in_stock",
    imageVariant: 4,
  },
  {
    id: "p-023",
    slug: "selvedge-raw-denim-jeans",
    sku: "UEH-DJ-4005",
    name: { en: "Selvedge Raw Denim Jeans", bn: "সেলভেজ র ডেনিম জিন্স" },
    summary: {
      en: "Unwashed selvedge denim that fades to your own pattern.",
      bn: "আনওয়াশড সেলভেজ ডেনিম — ফেইড হবে আপনার নিজের মতো করে।",
    },
    description: [
      {
        en: "Raw denim is stiff for the first two weeks and then becomes the best pair you own.",
        bn: "র ডেনিম প্রথম দুই সপ্তাহ শক্ত থাকে, তারপর হয়ে যায় আপনার সবচেয়ে প্রিয় জিন্স।",
      },
      {
        en: "Wash as little as the weather allows.",
        bn: "আবহাওয়া যতটা অনুমতি দেয়, তত কম ধোবেন।",
      },
    ],
    fabric: { en: "100% cotton selvedge — 14 oz", bn: "100% কটন সেলভেজ — 14 আউন্স" },
    care: CARE_DENIM,
    categorySlug: "denim-jeans",
    pricePoisha: 419_000,
    sizes: JEANS_SIZES,
    colours: [COLOURS.indigo],
    rating: 4.9,
    reviewCount: 15,
    tags: ["new"],
    availability: "low_stock",
    imageVariant: 1,
  },
  {
    id: "p-024",
    slug: "grey-washed-slim-jeans",
    sku: "UEH-DJ-4006",
    name: { en: "Grey Washed Slim Jeans", bn: "গ্রে ওয়াশড স্লিম জিন্স" },
    summary: {
      en: "A neutral grey wash that sits between blue denim and black trousers.",
      bn: "নিউট্রাল গ্রে ওয়াশ — নীল ডেনিম আর কালো ট্রাউজারের মাঝামাঝি।",
    },
    description: [
      {
        en: "Pairs with almost everything in this catalogue, which is the whole idea.",
        bn: "এই ক্যাটালগের প্রায় সবকিছুর সঙ্গেই মানায় — এটাই এর উদ্দেশ্য।",
      },
    ],
    fabric: { en: "98% cotton, 2% elastane — 12 oz", bn: "98% কটন, 2% ইলাস্টেন — 12 আউন্স" },
    care: CARE_DENIM,
    categorySlug: "denim-jeans",
    pricePoisha: 315_000,
    sizes: JEANS_SIZES,
    colours: [COLOURS.stone, COLOURS.charcoal],
    rating: 4.2,
    reviewCount: 9,
    tags: [],
    availability: "out_of_stock",
    imageVariant: 2,
  },
];

export const MOCK_PRODUCTS: readonly MockProduct[] = PRODUCT_SEEDS.map(
  ({ imageVariant, care, availableAt, ...seed }) => ({
    ...seed,
    images: imagesFor(seed.categorySlug, imageVariant, seed.name),
    care: care ?? CARE_SHIRT,
    availableAt: availableAt ?? BRANCHES.slice(0, 2),
  }),
);

/**
 * SAMPLE REVIEWS — placeholder copy written for layout review only. These are
 * not real customer reviews, and the UI labels the section as sample content.
 */
export const MOCK_REVIEWS: readonly MockReview[] = [
  {
    id: "r-001",
    productSlug: "classic-white-oxford-shirt",
    author: "Tanvir H.",
    city: { en: "Dhaka", bn: "ঢাকা" },
    rating: 5,
    title: { en: "Holds its shape all day", bn: "সারাদিন আকৃতি ঠিক থাকে" },
    body: {
      en: "Wore it through a full day of meetings and it still looked pressed in the evening. Collar is stiffer than I expected, in a good way.",
      bn: "সারাদিন মিটিং শেষেও সন্ধ্যায় দেখতে ইস্তিরি করা মনে হচ্ছিল। কলার প্রত্যাশার চেয়ে শক্ত, ভালো অর্থে।",
    },
    date: "2026-10-18",
    verifiedPurchase: true,
  },
  {
    id: "r-002",
    productSlug: "classic-white-oxford-shirt",
    author: "Mahmudul K.",
    city: { en: "Chattogram", bn: "চট্টগ্রাম" },
    rating: 4,
    title: { en: "Good fabric, size up", bn: "কাপড় ভালো, এক সাইজ বড় নিন" },
    body: {
      en: "The cotton is noticeably better than what I usually buy. Shoulders ran slightly narrow for me, so take one size up if you are between sizes.",
      bn: "কটনের মান সাধারণের চেয়ে স্পষ্টতই ভালো। কাঁধ আমার জন্য একটু আঁটসাঁট, তাই দুই সাইজের মাঝে থাকলে বড়টি নিন।",
    },
    date: "2026-10-02",
    verifiedPurchase: true,
  },
  {
    id: "r-003",
    productSlug: "slim-fit-indigo-jeans",
    author: "Rifat A.",
    city: { en: "Dhaka", bn: "ঢাকা" },
    rating: 5,
    title: { en: "Best fitting jeans I own", bn: "আমার সবচেয়ে ভালো ফিটের জিন্স" },
    body: {
      en: "Slim without being tight, and the stretch means I can sit at a desk all day. Colour has not faded after four washes.",
      bn: "স্লিম, তবে আঁটসাঁট নয়; স্ট্রেচ থাকায় সারাদিন ডেস্কে বসা যায়। চারবার ধোয়ার পরেও রঙ ফেইড হয়নি।",
    },
    date: "2026-09-27",
    verifiedPurchase: true,
  },
  {
    id: "r-004",
    productSlug: "pique-polo-charcoal",
    author: "Shariar I.",
    city: { en: "Sylhet", bn: "সিলেট" },
    rating: 5,
    title: { en: "Cool in humid weather", bn: "আদ্র আবহাওয়ায় আরাম" },
    body: {
      en: "Bought two. The pique really does breathe better than a regular t-shirt, and the collar has not curled.",
      bn: "দুটি কিনেছি। সাধারণ টি-শার্টের চেয়ে পিকে সত্যিই বেশি আরামদায়ক, কলারও বেঁকে যায়নি।",
    },
    date: "2026-09-14",
    verifiedPurchase: true,
  },
  {
    id: "r-005",
    productSlug: "olive-linen-blend-shirt",
    author: "Nazmul F.",
    city: { en: "Dhaka", bn: "ঢাকা" },
    rating: 4,
    title: { en: "Perfect for summer", bn: "গরমের জন্য আদর্শ" },
    body: {
      en: "Light and cool. Linen creases, as linen does, but it looks intentional rather than messy.",
      bn: "হালকা ও ঠান্ডা। লিনেনে ভাঁজ পড়ে, তবে তা অযত্নের মতো নয়, বরং মানানসই দেখায়।",
    },
    date: "2026-08-30",
    verifiedPurchase: false,
  },
  {
    id: "r-006",
    productSlug: "washed-indigo-casual-shirt",
    author: "Arif R.",
    city: { en: "Khulna", bn: "খুলনা" },
    rating: 5,
    title: { en: "Soft from day one", bn: "প্রথম দিন থেকেই নরম" },
    body: {
      en: "No stiffness at all, which is rare for a new shirt. Delivery to Khulna took three days.",
      bn: "নতুন শার্টে সাধারণত যে শক্ত ভাব থাকে, তা একদমই নেই। খুলনায় ডেলিভারি হয়েছে তিন দিনে।",
    },
    date: "2026-08-21",
    verifiedPurchase: true,
  },
];

// ---------------------------------------------------------------------------
// Query functions — the Phase 6 replacement surface.
//
// `catalog.service.ts` will expose the same names with the same arguments, so
// the pages that call these keep working once the database is in place.
// ---------------------------------------------------------------------------

export const SORT_OPTIONS = ["featured", "newest", "price-asc", "price-desc", "rating"] as const;
export type SortOption = (typeof SORT_OPTIONS)[number];

export function isSortOption(value: string | undefined): value is SortOption {
  return value !== undefined && (SORT_OPTIONS as readonly string[]).includes(value);
}

export function isCategorySlug(value: string | undefined): value is CategorySlug {
  return value !== undefined && MOCK_CATEGORIES.some((category) => category.slug === value);
}

export function getCategories(): readonly MockCategory[] {
  return MOCK_CATEGORIES;
}

export function getCategoryBySlug(slug: string): MockCategory | undefined {
  return MOCK_CATEGORIES.find((category) => category.slug === slug);
}

export function countProductsInCategory(slug: CategorySlug): number {
  return MOCK_PRODUCTS.filter((product) => product.categorySlug === slug).length;
}

export interface ProductQuery {
  category?: CategorySlug;
  tag?: ProductTag;
  sizes?: readonly string[];
  /** Inclusive price bounds in poisha. */
  minPricePoisha?: number;
  maxPricePoisha?: number;
  sort?: SortOption;
  limit?: number;
  /** Slug to leave out, used for "you may also like". */
  excludeSlug?: string;
}

function sortProducts(products: MockProduct[], sort: SortOption): MockProduct[] {
  const sorted = [...products];
  switch (sort) {
    case "newest":
      return sorted.sort((a, b) => Number(b.tags.includes("new")) - Number(a.tags.includes("new")));
    case "price-asc":
      return sorted.sort((a, b) => a.pricePoisha - b.pricePoisha);
    case "price-desc":
      return sorted.sort((a, b) => b.pricePoisha - a.pricePoisha);
    case "rating":
      return sorted.sort((a, b) => b.rating - a.rating);
    case "featured":
      return sorted.sort(
        (a, b) => Number(b.tags.includes("bestseller")) - Number(a.tags.includes("bestseller")),
      );
    default:
      return sorted;
  }
}

export function getProducts(query: ProductQuery = {}): readonly MockProduct[] {
  let products = MOCK_PRODUCTS.filter((product) => {
    if (query.category !== undefined && product.categorySlug !== query.category) return false;
    if (query.tag !== undefined && !product.tags.includes(query.tag)) return false;
    if (query.excludeSlug !== undefined && product.slug === query.excludeSlug) return false;
    if (query.minPricePoisha !== undefined && product.pricePoisha < query.minPricePoisha)
      return false;
    if (query.maxPricePoisha !== undefined && product.pricePoisha > query.maxPricePoisha)
      return false;
    if (query.sizes !== undefined && query.sizes.length > 0) {
      const hasSize = query.sizes.some((size) => product.sizes.includes(size));
      if (!hasSize) return false;
    }
    return true;
  });

  products = sortProducts(products, query.sort ?? "featured");

  return query.limit === undefined ? products : products.slice(0, query.limit);
}

export function getProductBySlug(slug: string): MockProduct | undefined {
  return MOCK_PRODUCTS.find((product) => product.slug === slug);
}

export function getNewArrivals(limit = 8): readonly MockProduct[] {
  return getProducts({ tag: "new", limit });
}

export function getBestSellers(limit = 8): readonly MockProduct[] {
  return getProducts({ tag: "bestseller", limit });
}

export function getOnSale(limit = 8): readonly MockProduct[] {
  return getProducts({ tag: "sale", limit });
}

export function getRelatedProducts(product: MockProduct, limit = 4): readonly MockProduct[] {
  return getProducts({ category: product.categorySlug, excludeSlug: product.slug, limit });
}

export function getReviewsForProduct(slug: string): readonly MockReview[] {
  return MOCK_REVIEWS.filter((review) => review.productSlug === slug);
}

export function getFeaturedReviews(limit = 3): readonly MockReview[] {
  return MOCK_REVIEWS.filter((review) => review.rating >= 4).slice(0, limit);
}

/** All sizes offered anywhere in the catalogue, for the listing filters. */
export function getAllSizes(): readonly string[] {
  const sizes = new Set<string>();
  for (const product of MOCK_PRODUCTS) {
    for (const size of product.sizes) sizes.add(size);
  }
  return [...sizes];
}

export interface SizeGuideRow {
  size: string;
  /** Garment measurements in inches. */
  chest: string;
  shoulder: string;
  length: string;
}

/**
 * Garment measurements per category. In Phase 6 this becomes the `SizeChart`
 * table so the admin can attach a chart to each product.
 */
export const SIZE_GUIDES: Record<CategorySlug, readonly SizeGuideRow[]> = {
  "formal-shirts": [
    { size: "S", chest: "38", shoulder: "17", length: "28" },
    { size: "M", chest: "40", shoulder: "17.5", length: "29" },
    { size: "L", chest: "42", shoulder: "18", length: "29.5" },
    { size: "XL", chest: "44", shoulder: "18.5", length: "30" },
    { size: "XXL", chest: "46", shoulder: "19", length: "30.5" },
  ],
  "casual-shirts": [
    { size: "S", chest: "39", shoulder: "17.25", length: "28.5" },
    { size: "M", chest: "41", shoulder: "17.75", length: "29" },
    { size: "L", chest: "43", shoulder: "18.25", length: "29.5" },
    { size: "XL", chest: "45", shoulder: "18.75", length: "30" },
    { size: "XXL", chest: "47", shoulder: "19.25", length: "30.5" },
  ],
  "polo-t-shirts": [
    { size: "S", chest: "37", shoulder: "16.5", length: "27" },
    { size: "M", chest: "39", shoulder: "17", length: "27.5" },
    { size: "L", chest: "41", shoulder: "17.5", length: "28" },
    { size: "XL", chest: "43", shoulder: "18", length: "28.5" },
    { size: "XXL", chest: "45", shoulder: "18.5", length: "29" },
  ],
  // For denim the columns read waist / hip / inseam, labelled in the UI.
  "denim-jeans": [
    { size: "30", chest: "30", shoulder: "38", length: "30" },
    { size: "32", chest: "32", shoulder: "40", length: "30.5" },
    { size: "34", chest: "34", shoulder: "42", length: "31" },
    { size: "36", chest: "36", shoulder: "44", length: "31.5" },
    { size: "38", chest: "38", shoulder: "46", length: "32" },
  ],
};

export function getPriceRangePoisha(): { min: number; max: number } {
  const prices = MOCK_PRODUCTS.map((product) => product.pricePoisha);
  return { min: Math.min(...prices), max: Math.max(...prices) };
}
