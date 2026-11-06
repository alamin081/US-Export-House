/**
 * ============================================================================
 * PHASE 3 MOCK CONTENT — NOT REAL DATA
 * ============================================================================
 *
 * Banners, collections, brand copy, FAQ entries and policy pages. In Phase 12
 * this content comes from the `Banner`, `HomeSection` and `Page` tables and is
 * edited by a Content Editor; the shapes here are deliberately close to those
 * tables (including `status: draft | published`).
 *
 * IMPORTANT: the return policy is DRAFT. Per the master spec it must not be
 * presented as approved business policy until the owner signs it off, so the
 * page renders it behind a visible draft notice.
 */
import type { LocalizedText } from "@/lib/content";

export type ContentStatus = "draft" | "published";

export interface MockHero {
  eyebrow: LocalizedText;
  title: LocalizedText;
  subtitle: LocalizedText;
  primaryCta: LocalizedText;
  secondaryCta: LocalizedText;
  primaryHref: string;
  secondaryHref: string;
  image: string;
}

export interface MockPromoBanner {
  id: string;
  eyebrow: LocalizedText;
  title: LocalizedText;
  body: LocalizedText;
  cta: LocalizedText;
  href: string;
  image: string;
  tone: "accent" | "dark";
}

export interface MockCollection {
  id: string;
  title: LocalizedText;
  description: LocalizedText;
  itemCountLabel: LocalizedText;
  href: string;
  image: string;
}

export interface MockShowroom {
  id: string;
  name: LocalizedText;
  address: LocalizedText;
  phone: string;
  hours: LocalizedText;
}

export interface MockFaqItem {
  id: string;
  group: "orders" | "shipping" | "returns" | "products";
  question: LocalizedText;
  answer: LocalizedText;
}

export interface MockPolicySection {
  heading: LocalizedText;
  paragraphs: readonly LocalizedText[];
  bullets?: readonly LocalizedText[];
}

export interface MockPolicyPage {
  slug: string;
  status: ContentStatus;
  title: LocalizedText;
  summary: LocalizedText;
  lastUpdated: string;
  sections: readonly MockPolicySection[];
}

export const MOCK_HERO: MockHero = {
  eyebrow: { en: "New season", bn: "নতুন সিজন" },
  title: {
    en: "Menswear built for Bangladeshi weather",
    bn: "বাংলাদেশের আবহাওয়ার জন্য তৈরি পুরুষদের পোশাক",
  },
  subtitle: {
    en: "Shirts, polos and denim cut from breathable cottons. Online, or at any of our showrooms.",
    bn: "আরামদায়ক কটনে তৈরি শার্ট, পোলো ও ডেনিম। অনলাইনে, কিংবা আমাদের যেকোনো শো-রুমে।",
  },
  primaryCta: { en: "Shop the collection", bn: "কালেকশন দেখুন" },
  secondaryCta: { en: "Find a showroom", bn: "শো-রুম খুঁজুন" },
  primaryHref: "/shop",
  secondaryHref: "/contact",
  image: "/images/editorial/hero.svg",
};

export const MOCK_PROMO_BANNERS: readonly MockPromoBanner[] = [
  {
    id: "promo-01",
    eyebrow: { en: "Free delivery", bn: "ফ্রি ডেলিভারি" },
    title: { en: "Free shipping over ৳2,500", bn: "৳2,500 টাকার বেশি অর্ডারে ফ্রি ডেলিভারি" },
    body: {
      en: "Applies nationwide. Inside Dhaka ৳70, outside Dhaka ৳130 below the threshold.",
      bn: "সারা দেশে প্রযোজ্য। এর নিচে ঢাকার ভেতরে ৳70, ঢাকার বাইরে ৳130।",
    },
    cta: { en: "Start shopping", bn: "কিনতে শুরু করুন" },
    href: "/shop",
    image: "/images/editorial/promo-shipping.svg",
    tone: "accent",
  },
  {
    id: "promo-02",
    eyebrow: { en: "Cash on delivery", bn: "ক্যাশ অন ডেলিভারি" },
    title: { en: "Pay when it arrives", bn: "পণ্য হাতে পেয়ে টাকা দিন" },
    body: {
      en: "Cash on delivery is available across Bangladesh, or pay online if you prefer.",
      bn: "সারা বাংলাদেশে ক্যাশ অন ডেলিভারি, অথবা চাইলে অনলাইনে পেমেন্ট।",
    },
    cta: { en: "How it works", bn: "কীভাবে কাজ করে" },
    href: "/faq",
    image: "/images/editorial/promo-cod.svg",
    tone: "dark",
  },
];

export const MOCK_COLLECTIONS: readonly MockCollection[] = [
  {
    id: "col-office",
    title: { en: "Office Essentials", bn: "অফিস এসেনশিয়ালস" },
    description: {
      en: "Six shirts that cover a working week without repeating a look.",
      bn: "ছয়টি শার্ট — পুরো কর্মসপ্তাহ, একই রকম না দেখিয়ে।",
    },
    itemCountLabel: { en: "6 pieces", bn: "6টি পণ্য" },
    href: "/category/formal-shirts",
    image: "/images/editorial/collection-office.svg",
  },
  {
    id: "col-weekend",
    title: { en: "Weekend Casual", bn: "উইকেন্ড ক্যাজুয়াল" },
    description: {
      en: "Relaxed shirts and polos for the two days that matter most.",
      bn: "আরামদায়ক শার্ট ও পোলো — সপ্তাহের সবচেয়ে প্রিয় দুই দিনের জন্য।",
    },
    itemCountLabel: { en: "12 pieces", bn: "12টি পণ্য" },
    href: "/category/casual-shirts",
    image: "/images/editorial/collection-weekend.svg",
  },
  {
    id: "col-denim",
    title: { en: "The Denim Edit", bn: "ডেনিম এডিট" },
    description: {
      en: "Every fit we make, from slim to relaxed, in one place.",
      bn: "স্লিম থেকে রিলাক্সড — আমাদের সব ফিট একসঙ্গে।",
    },
    itemCountLabel: { en: "6 pieces", bn: "6টি পণ্য" },
    href: "/category/denim-jeans",
    image: "/images/editorial/collection-denim.svg",
  },
];

export const MOCK_BRAND_INTRO = {
  eyebrow: { en: "Since 2009", bn: "2009 সাল থেকে" },
  title: {
    en: "A menswear house, not a marketplace",
    bn: "একটি মেনসওয়্যার হাউস, মার্কেটপ্লেস নয়",
  },
  paragraphs: [
    {
      en: "US Export House began as a single showroom selling export-surplus menswear. We now design and source our own shirts, polos and denim, and sell them in our showrooms and online.",
      bn: "ইউএস এক্সপোর্ট হাউসের শুরু একটি শো-রুম থেকে, যেখানে বিক্রি হতো এক্সপোর্ট-সারপ্লাস পুরুষদের পোশাক। এখন আমরা নিজেরাই শার্ট, পোলো ও ডেনিম ডিজাইন ও সংগ্রহ করি — বিক্রি করি শো-রুমে ও অনলাইনে।",
    },
    {
      en: "Every piece is checked by hand before it reaches a shelf or a courier bag. If a seam is wrong, it does not ship.",
      bn: "প্রতিটি পণ্য শেলফে বা কুরিয়ার ব্যাগে যাওয়ার আগে হাতে পরীক্ষা করা হয়। সেলাইয়ে সমস্যা থাকলে সেটি পাঠানো হয় না।",
    },
  ] satisfies readonly LocalizedText[],
  stats: [
    { value: "3", label: { en: "Showrooms", bn: "শো-রুম" } },
    { value: "500+", label: { en: "Styles a year", bn: "বছরে স্টাইল" } },
    { value: "7", label: { en: "Day returns", bn: "দিনের রিটার্ন" } },
  ],
  image: "/images/editorial/brand.svg",
} as const;

export const MOCK_SHOWROOMS: readonly MockShowroom[] = [
  {
    id: "sr-gulshan",
    name: { en: "Gulshan Showroom", bn: "গুলশান শো-রুম" },
    address: {
      en: "Placeholder address, Gulshan Avenue, Dhaka 1212",
      bn: "প্লেসহোল্ডার ঠিকানা, গুলশান এভিনিউ, ঢাকা 1212",
    },
    phone: "+8801700000001",
    hours: { en: "Sat–Thu, 10:00–20:00", bn: "শনি–বৃহস্পতি, সকাল 10টা–রাত 8টা" },
  },
  {
    id: "sr-dhanmondi",
    name: { en: "Dhanmondi Showroom", bn: "ধানমন্ডি শো-রুম" },
    address: {
      en: "Placeholder address, Satmasjid Road, Dhaka 1209",
      bn: "প্লেসহোল্ডার ঠিকানা, সাতমসজিদ রোড, ঢাকা 1209",
    },
    phone: "+8801700000002",
    hours: { en: "Sat–Thu, 10:00–20:00", bn: "শনি–বৃহস্পতি, সকাল 10টা–রাত 8টা" },
  },
  {
    id: "sr-chattogram",
    name: { en: "Chattogram Showroom", bn: "চট্টগ্রাম শো-রুম" },
    address: {
      en: "Placeholder address, GEC Circle, Chattogram 4000",
      bn: "প্লেসহোল্ডার ঠিকানা, জিইসি মোড়, চট্টগ্রাম 4000",
    },
    phone: "+8801700000003",
    hours: { en: "Sat–Thu, 10:30–20:30", bn: "শনি–বৃহস্পতি, সকাল 10:30–রাত 8:30" },
  },
];

export const MOCK_ABOUT_SECTIONS: readonly MockPolicySection[] = [
  {
    heading: { en: "How we started", bn: "আমাদের শুরু" },
    paragraphs: [
      {
        en: "One showroom, a rail of export-surplus shirts, and a simple idea: sell menswear that fits Bangladeshi men properly and lasts more than a season.",
        bn: "একটি শো-রুম, এক্সপোর্ট-সারপ্লাস শার্টের একটি র‍্যাক, আর সরল একটি ভাবনা: এমন পোশাক বিক্রি করা যা বাংলাদেশি পুরুষের গায়ে ঠিকঠাক বসে এবং এক সিজনের বেশি টেকে।",
      },
    ],
  },
  {
    heading: { en: "How we choose fabric", bn: "কাপড় যেভাবে বাছি" },
    paragraphs: [
      {
        en: "Weight first, then weave, then colour. In this climate a beautiful fabric that does not breathe is the wrong fabric.",
        bn: "প্রথমে ওজন, তারপর বুনন, তারপর রঙ। এই আবহাওয়ায় যে সুন্দর কাপড় বাতাস চলাচল করতে দেয় না, সেটি ভুল কাপড়।",
      },
    ],
    bullets: [
      {
        en: "Cotton-first, with stretch only where it helps",
        bn: "কটন প্রাধান্য, স্ট্রেচ শুধু যেখানে দরকার",
      },
      { en: "Pre-washed where softness matters", bn: "যেখানে কোমলতা দরকার, সেখানে প্রি-ওয়াশড" },
      { en: "Checked by hand before dispatch", bn: "পাঠানোর আগে হাতে পরীক্ষা" },
    ],
  },
  {
    heading: { en: "Online and in person", bn: "অনলাইনে ও সরাসরি" },
    paragraphs: [
      {
        en: "Our showrooms and our website share one stock list, so what you see online is what is actually on the shelf.",
        bn: "আমাদের শো-রুম ও ওয়েবসাইট একই স্টক তালিকা ব্যবহার করে — অনলাইনে যা দেখছেন, শেলফে তাই আছে।",
      },
    ],
  },
];

export const MOCK_FAQ_ITEMS: readonly MockFaqItem[] = [
  {
    id: "faq-order-1",
    group: "orders",
    question: { en: "Do I need an account to order?", bn: "অর্ডার করতে অ্যাকাউন্ট লাগবে কি?" },
    answer: {
      en: "No. You can check out as a guest with just your phone number and delivery address. If you create an account later with the same number, your earlier orders are linked automatically.",
      bn: "না। শুধু ফোন নম্বর ও ডেলিভারি ঠিকানা দিয়ে গেস্ট হিসেবে অর্ডার করতে পারবেন। পরে একই নম্বরে অ্যাকাউন্ট খুললে আগের অর্ডারগুলো স্বয়ংক্রিয়ভাবে যুক্ত হয়ে যাবে।",
    },
  },
  {
    id: "faq-order-2",
    group: "orders",
    question: { en: "How do I log in?", bn: "লগইন কীভাবে করব?" },
    answer: {
      en: "With your mobile number. We send a six-digit code by SMS; there is no password to remember.",
      bn: "মোবাইল নম্বর দিয়ে। আমরা এসএমএসে ছয় অঙ্কের কোড পাঠাই; কোনো পাসওয়ার্ড মনে রাখতে হয় না।",
    },
  },
  {
    id: "faq-order-3",
    group: "orders",
    question: { en: "Can I change or cancel an order?", bn: "অর্ডার বদলানো বা বাতিল করা যাবে?" },
    answer: {
      en: "Yes, until the order is handed to the courier. After that it has to be handled as a return.",
      bn: "হ্যাঁ, কুরিয়ারে দেওয়ার আগ পর্যন্ত। এরপর থেকে বিষয়টি রিটার্ন হিসেবে প্রক্রিয়া করতে হবে।",
    },
  },
  {
    id: "faq-ship-1",
    group: "shipping",
    question: { en: "What does delivery cost?", bn: "ডেলিভারি চার্জ কত?" },
    answer: {
      en: "৳70 inside Dhaka and ৳130 outside Dhaka. Orders above ৳2,500 ship free. The exact charge is always shown at checkout before you confirm.",
      bn: "ঢাকার ভেতরে ৳70, ঢাকার বাইরে ৳130। ৳2,500 টাকার বেশি অর্ডারে ডেলিভারি ফ্রি। চূড়ান্ত চার্জ সবসময় চেকআউটে কনফার্ম করার আগে দেখানো হয়।",
    },
  },
  {
    id: "faq-ship-2",
    group: "shipping",
    question: { en: "How long does delivery take?", bn: "ডেলিভারিতে কত সময় লাগে?" },
    answer: {
      en: "Usually one to two working days inside Dhaka and two to four working days elsewhere in Bangladesh.",
      bn: "সাধারণত ঢাকার ভেতরে 1–2 কর্মদিবস, দেশের অন্য জায়গায় 2–4 কর্মদিবস।",
    },
  },
  {
    id: "faq-ship-3",
    group: "shipping",
    question: { en: "Can I track my parcel?", bn: "পার্সেল ট্র্যাক করা যাবে?" },
    answer: {
      en: "Yes. Enter your order number and phone number on the Track Order page, or open the order from your account.",
      bn: "হ্যাঁ। ট্র্যাক অর্ডার পেজে অর্ডার নম্বর ও ফোন নম্বর দিন, অথবা অ্যাকাউন্ট থেকে অর্ডারটি খুলুন।",
    },
  },
  {
    id: "faq-return-1",
    group: "returns",
    question: { en: "What is the return window?", bn: "রিটার্নের সময়সীমা কত দিন?" },
    answer: {
      en: "Seven days from delivery, for unused items with original tags and packaging. This policy is still being finalised with the business.",
      bn: "ডেলিভারির পর সাত দিন — অব্যবহৃত, অরিজিনাল ট্যাগ ও প্যাকেজিং সহ পণ্যের জন্য। এই নীতি এখনো চূড়ান্ত অনুমোদনের অপেক্ষায়।",
    },
  },
  {
    id: "faq-return-2",
    group: "returns",
    question: { en: "Can I exchange for another size?", bn: "অন্য সাইজে বদলানো যাবে?" },
    answer: {
      en: "Size exchange is planned, subject to stock at the fulfilling location. The exact process is being confirmed.",
      bn: "সাইজ বদলের ব্যবস্থা পরিকল্পনায় আছে, সংশ্লিষ্ট লোকেশনে স্টক থাকা সাপেক্ষে। প্রক্রিয়াটি চূড়ান্ত হচ্ছে।",
    },
  },
  {
    id: "faq-product-1",
    group: "products",
    question: { en: "How do I pick a size?", bn: "সাইজ কীভাবে বাছব?" },
    answer: {
      en: "Every product page has a size guide with chest, shoulder and length measurements in inches. If you are between two sizes, take the larger one.",
      bn: "প্রতিটি প্রোডাক্ট পেজে ইঞ্চিতে বুক, কাঁধ ও লম্বার মাপসহ সাইজ গাইড আছে। দুই সাইজের মাঝে থাকলে বড়টি নিন।",
    },
  },
  {
    id: "faq-product-2",
    group: "products",
    question: { en: "Are the colours accurate?", bn: "রঙ কি ছবির মতোই?" },
    answer: {
      en: "We photograph in daylight without filters, but screens vary. Colour is the one thing worth seeing in a showroom if you can.",
      bn: "আমরা দিনের আলোয়, ফিল্টার ছাড়া ছবি তুলি; তবু স্ক্রিনে রঙ ভিন্ন দেখাতে পারে। সম্ভব হলে রঙটি শো-রুমে দেখে নেওয়াই ভালো।",
    },
  },
];

export const MOCK_PRIVACY_POLICY: MockPolicyPage = {
  slug: "privacy-policy",
  status: "published",
  title: { en: "Privacy Policy", bn: "প্রাইভেসি পলিসি" },
  summary: {
    en: "What we collect, why we collect it, and what we never do with it.",
    bn: "আমরা কী সংগ্রহ করি, কেন করি, এবং কী কখনো করি না।",
  },
  lastUpdated: "2026-11-01",
  sections: [
    {
      heading: { en: "What we collect", bn: "আমরা কী সংগ্রহ করি" },
      paragraphs: [
        {
          en: "To deliver an order we need your name, mobile number and delivery address. If you create an account, we keep those details so you do not have to type them again.",
          bn: "অর্ডার পৌঁছে দিতে আমাদের আপনার নাম, মোবাইল নম্বর ও ডেলিভারি ঠিকানা প্রয়োজন। অ্যাকাউন্ট খুললে এই তথ্য আমরা সংরক্ষণ করি, যাতে বারবার লিখতে না হয়।",
        },
      ],
      bullets: [
        { en: "Name, mobile number, delivery address", bn: "নাম, মোবাইল নম্বর, ডেলিভারি ঠিকানা" },
        { en: "Order and return history", bn: "অর্ডার ও রিটার্নের ইতিহাস" },
        {
          en: "Basic technical data such as browser and device type",
          bn: "ব্রাউজার ও ডিভাইসের মতো প্রাথমিক কারিগরি তথ্য",
        },
      ],
    },
    {
      heading: { en: "Card and payment data", bn: "কার্ড ও পেমেন্ট তথ্য" },
      paragraphs: [
        {
          en: "We never see or store your card number. Online payments are handled by our payment gateway, which sends us only the result of the transaction.",
          bn: "আপনার কার্ড নম্বর আমরা কখনো দেখি না বা সংরক্ষণ করি না। অনলাইন পেমেন্ট পরিচালনা করে আমাদের পেমেন্ট গেটওয়ে, যারা আমাদের কাছে শুধু লেনদেনের ফলাফল পাঠায়।",
        },
      ],
    },
    {
      heading: { en: "Who we share it with", bn: "কার সঙ্গে শেয়ার করি" },
      paragraphs: [
        {
          en: "Only the courier that delivers your parcel, and only the details needed to deliver it. We do not sell customer data.",
          bn: "শুধু আপনার পার্সেল পৌঁছে দেওয়া কুরিয়ারের সঙ্গে, এবং শুধু ডেলিভারির জন্য প্রয়োজনীয় তথ্য। গ্রাহকের তথ্য আমরা বিক্রি করি না।",
        },
      ],
    },
    {
      heading: { en: "Your choices", bn: "আপনার অধিকার" },
      paragraphs: [
        {
          en: "You can ask us to correct or delete your account details at any time by calling any showroom or writing to us from the Contact page.",
          bn: "যেকোনো সময় শো-রুমে ফোন করে বা কন্টাক্ট পেজ থেকে লিখে আপনার অ্যাকাউন্টের তথ্য সংশোধন বা মুছে ফেলার অনুরোধ করতে পারেন।",
        },
      ],
    },
  ],
};

/**
 * DRAFT. The return side of this page is not approved business policy yet
 * (master spec section 3.9 and open question 8), so the UI shows a draft
 * notice and the page is excluded from the sitemap until it is published.
 */
export const MOCK_SHIPPING_RETURN_POLICY: MockPolicyPage = {
  slug: "shipping-returns",
  status: "draft",
  title: { en: "Shipping & Return Policy", bn: "শিপিং ও রিটার্ন পলিসি" },
  summary: {
    en: "Delivery charges, delivery times, and how returns and refunds are handled.",
    bn: "ডেলিভারি চার্জ, সময়, এবং রিটার্ন ও রিফান্ড যেভাবে হয়।",
  },
  lastUpdated: "2026-11-01",
  sections: [
    {
      heading: { en: "Delivery charges", bn: "ডেলিভারি চার্জ" },
      paragraphs: [
        {
          en: "Delivery is ৳70 inside Dhaka and ৳130 outside Dhaka. Orders of ৳2,500 or more ship free anywhere in Bangladesh. The charge is calculated on our server and shown at checkout before you confirm.",
          bn: "ঢাকার ভেতরে ডেলিভারি ৳70, ঢাকার বাইরে ৳130। ৳2,500 বা বেশি টাকার অর্ডারে সারা বাংলাদেশে ডেলিভারি ফ্রি। চার্জ আমাদের সার্ভারে হিসাব হয় এবং কনফার্ম করার আগে চেকআউটে দেখানো হয়।",
        },
      ],
    },
    {
      heading: { en: "Delivery time", bn: "ডেলিভারির সময়" },
      paragraphs: [
        {
          en: "One to two working days inside Dhaka, two to four working days elsewhere. Orders placed after 5pm are packed the next working day.",
          bn: "ঢাকার ভেতরে 1–2 কর্মদিবস, বাইরে 2–4 কর্মদিবস। বিকেল 5টার পরের অর্ডার পরের কর্মদিবসে প্যাক করা হয়।",
        },
      ],
    },
    {
      heading: { en: "Returns (draft)", bn: "রিটার্ন (খসড়া)" },
      paragraphs: [
        {
          en: "Proposed: a return may be requested within seven days of delivery, for items that are unused, unwashed and still carry their original tags and packaging.",
          bn: "প্রস্তাবিত: ডেলিভারির সাত দিনের মধ্যে রিটার্নের অনুরোধ করা যাবে — পণ্য অব্যবহৃত, না-ধোয়া এবং অরিজিনাল ট্যাগ ও প্যাকেজিং সহ থাকতে হবে।",
        },
      ],
      bullets: [
        { en: "Unused and unwashed", bn: "অব্যবহৃত ও না-ধোয়া" },
        { en: "Original tags attached", bn: "অরিজিনাল ট্যাগ যুক্ত" },
        { en: "Original packaging included", bn: "অরিজিনাল প্যাকেজিং সহ" },
      ],
    },
    {
      heading: { en: "Refunds (draft)", bn: "রিফান্ড (খসড়া)" },
      paragraphs: [
        {
          en: "Proposed: refunds go back to the original payment method where possible. For cash-on-delivery orders, a refund is issued by bank transfer or to a bKash/Nagad number, recorded by our staff.",
          bn: "প্রস্তাবিত: সম্ভব হলে রিফান্ড মূল পেমেন্ট মেথডেই ফেরত যাবে। ক্যাশ অন ডেলিভারি অর্ডারের ক্ষেত্রে ব্যাংক ট্রান্সফার বা বিকাশ/নগদ নম্বরে রিফান্ড দেওয়া হবে, যা আমাদের স্টাফ রেকর্ড করবেন।",
        },
      ],
    },
  ],
};

export function getPolicyPage(slug: string): MockPolicyPage | undefined {
  return [MOCK_PRIVACY_POLICY, MOCK_SHIPPING_RETURN_POLICY].find((page) => page.slug === slug);
}

export function getFaqGroups(): readonly MockFaqItem["group"][] {
  return ["orders", "shipping", "returns", "products"];
}

export function getFaqItems(group: MockFaqItem["group"]): readonly MockFaqItem[] {
  return MOCK_FAQ_ITEMS.filter((item) => item.group === group);
}
