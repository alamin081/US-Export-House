# Phase 12 — পরিকল্পনা

ড্যাশবোর্ড, রিপোর্ট, কনটেন্ট ম্যানেজমেন্ট, Settings, রোল এডিট, audit log ও প্রোডাক্ট আমদানি।

- **অবস্থা:** মালিকের অনুমোদিত (২০২৬-১১-১৫), খোলা প্রশ্নের উত্তরসহ (অংশ ০)।
- **তারিখ:** 2026-11-15
- **ভিত্তি:** `main` @ `58b4f07`

**ফেজের ক্রম:** Phase 12 → Phase 9.5 (staging deploy) → Phase 10 (SSLCOMMERZ) → Phase 11 (Steadfast)। SMS এখনো বাদ।

**কাজের ধাপ:**

- খ-১: ড্যাশবোর্ড ও রিপোর্ট
- খ-২: কনটেন্ট
- খ-৩: Settings, রোল, audit
- খ-৪: প্রোডাক্ট আমদানি/রপ্তানি

প্রতিটি ধাপ শেষে `main`-এ push, CI সবুজ, `inventory:verify` আর সংক্ষিপ্ত অগ্রগতি জানানো হবে।

---

## সূচি

0. অনুমোদিত সিদ্ধান্ত (২০২৬-১১-১৫)
1. অংশ ০ — শুরুর যাচাই
2. ক-১ Schema ও migration
3. ক-২ রিপোর্টের সংজ্ঞা
4. ক-৩ Query কৌশল ও গতি
5. ক-৪ কনটেন্ট ম্যানেজমেন্ট (মডেল, প্রতিটি স্ক্রিন, preview, publish, সংস্করণ, cache)
6. ক-৫ স্টোরফ্রন্ট পরিষ্কার (অ্যাকাউন্ট, ফর্ম, নিউজলেটার)
7. ক-৬ ড্যাশবোর্ড
8. ক-৭ প্রোডাক্ট CSV/Excel আমদানি, রপ্তানি ও ছবির বাল্ক আপলোড
9. ক-৮ Settings পেজ
10. ক-৯ রোল ও অনুমতি এডিট
11. ক-১০ Audit log viewer ও অপরিবর্তনীয়তা
12. ক-১১ স্থির লেবেল এডিটের প্রস্তাব
13. ক-১২ নতুন package
14. ক-১৩ Permission, রোল বণ্টন ও SQL
15. ক-১৪ পেজের তালিকা
16. ক-১৫ টেস্ট পরিকল্পনা
17. ক-১৬ ঝুঁকি
18. ক-১৭ ধাপভিত্তিক কাজের ক্রম
19. খোলা প্রশ্ন

---

## 0. অনুমোদিত সিদ্ধান্ত (২০২৬-১১-১৫)

| বিষয়                                  | সিদ্ধান্ত                                                    |
| -------------------------------------- | ------------------------------------------------------------ |
| অংশ ০, ক-১, ক-২, ক-৩, ক-৪-এর প্রথম অংশ | অনুমোদিত                                                     |
| সপ্তাহের শুরু                          | `reports.weekStartsOn` = শনিবার                              |
| `soldAt` backfill                      | অনুমতি দেওয়া হয়েছে: ৩টা নমুনা অর্ডার, audit-সহ             |
| `unitCostPoisha` backfill              | হবে না; পুরনো অর্ডার "ক্রয়মূল্য অজানা"                      |
| পেজ এডিটর                              | block এডিটর, নতুন package নেই, HTML সংরক্ষণ নয়              |
| `content:import-legacy`                | অনুমতি দেওয়া হয়েছে (create-only, আগে dry-run), শর্ত ১ মেনে |

### খোলা প্রশ্নের উত্তর (মালিক, ২০২৬-১১-১৫ — পরিকল্পনা সম্পূর্ণ অনুমোদিত)

| #   | উত্তর                                                                                                                                                                                    |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `read-excel-file` অনুমোদিত: exact version pin, শুধু সার্ভারে, ব্রাউজার bundle-এ নয় (`check-client-bundle`-এ যাচাই), ইনস্টলের পর `npm audit --omit=dev`-এর ফল জানানো। CSV আমদানিও থাকবে। |
| 2   | `catalog.import.atomicMaxRows` = ১,০০০; `catalog.import.allowPartial` = false                                                                                                            |
| 3   | `dashboard.staleShipmentDays` = ৫; `dashboard.codOverdueDays` = ৭                                                                                                                        |
| 4   | Store Manager পুরো `settings.write` পাবে না                                                                                                                                              |
| 5   | বিদ্যমান key-র নাম থাকবে; `report.cost`-এর বদলে `inventory.cost.read`; `dashboard.view` নয়                                                                                              |
| 6   | "দোকানের তথ্য" (VAT ছাড়া) আর "SEO ও সোশ্যাল" `content.write` দিয়েও এডিটযোগ্য; Location শুধু `location.manage`                                                                          |
| 7   | এক্সচেঞ্জ credit আর RETURNED_TO_WAREHOUSE net থেকে বিয়োগের সংজ্ঞা অনুমোদিত                                                                                                              |
| 8   | স্থির লেবেল এডিট এই ফেজেই, খ-৩-এর শেষে (allowlist, সেভ মানেই লাইভ, `content.publish`); migration 7 অনুমোদিত                                                                              |
| 9   | Branch Manager নিজের শাখার `report.export` পাবে                                                                                                                                          |
| 10  | Inventory Staff `report.view` রাখবে (স্টক ও movement, cost ছাড়া)                                                                                                                        |
| 11  | নতুন পেজ `/pages/<slug>`                                                                                                                                                                 |
| 12  | ফুটার ও Contact-এ শুধু BRANCH                                                                                                                                                            |
| 13  | `footer.paymentMethods` ডিফল্ট শুধু `["COD"]`; কার্ড/bKash/Nagad দেখাবে না যতক্ষণ না Phase 10-এ অনলাইন পেমেন্ট চালু হয়; লোগো পরে আসবে, ততক্ষণ নাম লেখা                                  |
| 14  | বেশি বিক্রি: ৩০ দিন, ৬ ঘণ্টার cache                                                                                                                                                      |
| 15  | dev-এ নমুনা ডকুমেন্ট প্রথম সংস্করণ হিসেবে publish; production-এ শুধু draft                                                                                                               |
| 16  | হোম publish না থাকলে কোডের স্থির কাঠামো                                                                                                                                                  |
| 17  | `/admin/returns/policy` নতুন এডিটরে redirect                                                                                                                                             |
| 18  | অ্যাডমিন UI ইংরেজিতে, প্রতিটি ঘরের নিচে ছোট বাংলা সাহায্যের লেখা                                                                                                                         |

ডেটার অনুমতি: `soldAt` backfill, `roles_phase12` SQL, `audit_immutable` trigger। `content:import-legacy`-এর dry-run-এর ফল মালিককে দেখিয়ে তারপর `--apply`।

**মূল লক্ষ্য:** Phase 12 শেষে স্টোরফ্রন্টের কোনো কনটেন্ট কোডে বা mock ফাইলে থাকবে না। হোম, ঘোষণা বার, মেনু, ফুটার, সব পেজ, শাখা আর দোকানের তথ্য অ্যাডমিন থেকে দুই ভাষায় এডিট করা যাবে। UI-র স্থির লেবেল `messages/*.json`-এ থাকবে; সেগুলো এডিটের প্রস্তাব ক-১১-এ।

**মালিকের চার শর্ত:**

1. **বানানো তথ্য নয়।**
   - "Since 2009", "3 showrooms", "500+", বানানো ঠিকানা, ফোন বা শোরুম নতুন ডকুমেন্টে যাবে না। তার জায়গায় `[এখানে আপনার ব্র্যান্ডের গল্প লিখুন]` ধরনের placeholder থাকবে।
   - শোরুমের তথ্য আসবে শুধু Location টেবিলের active শাখা থেকে।
   - "নমুনা" চিহ্নওয়ালা ডকুমেন্ট `APP_ENV=production`-এ publish করা যাবে না। এটা service-এ আটকানো থাকবে, টেস্টসহ।
   - কেউ এডিট করে সেভ করলে "নমুনা" চিহ্ন উঠে যাবে।
2. **কাস্টমার অ্যাকাউন্ট লুকানো।**
   - হেডারের অ্যাকাউন্ট আইকন আর `/account` পেজ Phase 12.5 পর্যন্ত লুকানো থাকবে।
   - `/account`-এ সরাসরি গেলে `/track-order`-এ redirect হবে।
   - Mock অর্ডার, ঠিকানা ও কাস্টমার ডেটা সরিয়ে দেওয়া হবে।
3. **কাজ না করা ফর্ম নয়।**
   - Contact ফর্মের জায়গায় থাকবে ফোন, WhatsApp লিংক আর শাখার তালিকা।
   - নিউজলেটার বন্ধ।
4. **Audit trigger-এ টেস্টের ব্যতিক্রম।**
   - টেস্ট DB খালি করার জন্য একটা নিয়ন্ত্রিত ব্যতিক্রম থাকবে। trigger সেটা মানবে শুধু তখন, যখন `current_database()` `_test` দিয়ে শেষ হয়।
   - Dev ও production-এ কোনো ব্যতিক্রম চলবে না, এবং টেস্টে প্রমাণ করা হবে।

---

## 1. অংশ ০ — শুরুর যাচাই (সম্পন্ন)

### ১.১ অবস্থা

| যাচাই              | ফল                                                   |
| ------------------ | ---------------------------------------------------- |
| `main`             | পরিষ্কার, `58b4f07`                                  |
| CI (`58b4f07`)     | success                                              |
| `migrate status`   | ২০টা migration, "Database schema is up to date"      |
| `migrate diff`     | খালি                                                 |
| `inventory:verify` | 980 stock row, 944 movement — সব ledger-এর সাথে মেলে |

### ১.২ শুরুর রেকর্ড গণনা (০-এর বেশি এমন টেবিল)

Address 2 · AuditLog 39 · AuthThrottle 2 · Banner 3 · Brand 1 · Cart 1 · CartItem 1 · Category 5 · Coupon 2 · CouponRedemption 1 · GeoDivision 8 · GeoDistrict 64 · GeoUpazila 545 · HomeSection 9 · InventoryLevel 980 · InventoryMovement 944 · Location 4 · MenuItem 11 · OptionPreset 35 · OptionValue 169 · Order 3 · OrderItem 4 · OrderStatusHistory 8 · Page 4 · Payment 3 · Product 25 · ProductImage 72 · ProductOption 48 · ProductVariant 245 · ProductVariantOption 490 · Review 6 · Role 7 · Session 1 · Setting 48 · Shipment 2 · ShipmentEvent 3 · ShippingZone 3 · ShippingZoneArea 58 · SizeChart 4 · StaffLocationAccess 4 · User 3।

বাকি সব টেবিল ০।

### ১.৩ যা এখনো mock বা হার্ডকোডেড

| জায়গা                                          | উৎস                                                                                  | ফাইল                                                                             |
| ----------------------------------------------- | ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| হোম: Hero, প্রমো ১-২, কালেকশন, ব্র্যান্ডের গল্প | `MOCK_HERO`, `MOCK_PROMO_BANNERS`, `MOCK_COLLECTIONS`, `MOCK_BRAND_INTRO`            | `src/app/[locale]/(storefront)/page.tsx` ← `src/modules/content/content.mock.ts` |
| হোম: সেকশনের ক্রম ও শিরোনাম                     | কোডে স্থির + `Home.*` messages                                                       | `page.tsx`                                                                       |
| হোম: ক্যাটাগরি টাইল, নতুন ও featured সারি       | ✅ DB থেকে                                                                           | `src/modules/catalog/storefront-catalog.cached.ts`                               |
| ঘোষণা বার                                       | `Common.announcement` (৳2,500 হাতে লেখা)                                             | `src/components/shared/site-header.tsx`                                          |
| হেডার ও মোবাইল মেনু                             | `MAIN_NAV`                                                                           | `src/components/shared/navigation.ts`, `site-header.tsx`, `mobile-nav.tsx`       |
| ফুটার: লিংক                                     | `SHOP_NAV`, `HELP_NAV`                                                               | `src/components/shared/site-footer.tsx`                                          |
| ফুটার: শোরুম                                    | `MOCK_SHOWROOMS`                                                                     | `site-footer.tsx`                                                                |
| ফুটার: ব্র্যান্ডের লেখা, পেমেন্টের লেখা         | `Footer.brandBlurb`, `Footer.paymentMethods`                                         | messages                                                                         |
| About                                           | `MOCK_ABOUT_SECTIONS`, `MOCK_BRAND_INTRO`, `MOCK_SHOWROOMS`, `About.intro`/`ctaBody` | `about/page.tsx`                                                                 |
| Contact                                         | `MOCK_SHOWROOMS`, `Contact.mapPlaceholder`; ফর্মটা কোথাও পাঠায় না                   | `contact/page.tsx`, `contact-form.tsx`                                           |
| FAQ                                             | `MOCK_FAQ_ITEMS`                                                                     | `faq/page.tsx`                                                                   |
| Privacy                                         | `MOCK_PRIVACY_POLICY`                                                                | `privacy-policy/page.tsx`, `components/shared/policy-page.tsx`                   |
| Shipping & Returns                              | `MOCK_SHIPPING_RETURN_POLICY` (শুধু publish অবস্থা DB থেকে)                          | `shipping-returns/page.tsx`                                                      |
| নিউজলেটার                                       | কোথাও পাঠায় না                                                                      | `components/shared/newsletter-form.tsx`                                          |
| কাস্টমার অ্যাকাউন্ট                             | `MOCK_ORDERS/ADDRESSES/CUSTOMER`                                                     | `account/page.tsx`, `account-tabs.tsx`, `modules/orders/orders.mock.ts`          |
| অ্যাডমিন ড্যাশবোর্ড                             | `MOCK_ORDERS`                                                                        | `src/app/admin/(dashboard)/page.tsx`                                             |
| রিপোর্ট / কনটেন্ট / Settings                    | placeholder পেজ                                                                      | `admin/(dashboard)/{reports,content,settings}/page.tsx`                          |
| Audit log                                       | শেষ ১০০টা, ফিল্টার নেই                                                               | `admin/(dashboard)/audit/page.tsx`                                               |
| Sitemap                                         | স্ট্যাটিক পেজ নেই                                                                    | `src/app/sitemap.ts`                                                             |
| পুরনো mock (কেউ import করে না)                  | `catalog.mock.ts`                                                                    | শুধু `tests/unit/catalog-content.test.ts`                                        |

**লক্ষণীয়:** DB-তে `Banner`(3), `HomeSection`(9), `MenuItem`(11), `Page`(4) টেবিলে Phase 4-এর seed আছে। storefront এগুলো পড়ে না; `Page` শুধু রিটার্ন পলিসির publish অবস্থার জন্য ব্যবহার হয়।

### ১.৪ বিক্রির সময় ক্রয়মূল্যের snapshot

**রাখা হয় না।**

- `OrderItem`-এ cost কলাম নেই।
- `InventoryMovement.unitCostPoisha` শুধু OPENING/PURCHASE_RECEIVE-এ লেখা হয়। DB-তে SALE_ONLINE ৩টা ও SALE_STORE ১টা movement-এর cost খালি।
- weighted average আছে শুধু `ProductVariant.costPoisha`-তে (২৪৫/২৪৫), আর সেটা প্রতিটি রিসিভে বদলায়।

---

## 2. ক-১ — Schema ও migration (সব additive)

| #   | Migration                        | বিষয়বস্তু                                                                                                                                                                                               | ধাপ |
| --- | -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- |
| 1   | `20261117100000_reports_phase12` | `Order.soldAt DateTime?`, `OrderItem.unitCostPoisha Int?`; index: `Order(soldAt)`, `Order(channel, locationId, soldAt)`, `Refund(status, processedAt)`, `InventoryMovement(type, locationId, createdAt)` | খ-১ |
| 2   | `20261117101000_reports_data`    | `soldAt` backfill (৩টা অর্ডার) + AuditLog before/after                                                                                                                                                   | খ-১ |
| 3   | `20261117110000_content_enums`   | নতুন enum `ContentDocumentKind` (`HOME`, `ANNOUNCEMENTS`, `MENU`, `FOOTER`, `PAGE`)                                                                                                                      | খ-২ |
| 4   | `20261117111000_content_phase12` | `ContentDocument`, `ContentVersion`; `Location.mapUrl String?`                                                                                                                                           | খ-২ |
| 5   | `20261117120000_audit_immutable` | trigger function ও trigger (ক-১০)                                                                                                                                                                        | খ-৩ |
| 6   | `20261117121000_roles_phase12`   | নতুন permission system role-এ দেওয়া (ক-১৩) + AuditLog                                                                                                                                                   | খ-৩ |
| 7   | `20261117122000_ui_labels`       | `UiLabelOverride` — **শুধু ক-১১ অনুমোদিত হলে**                                                                                                                                                           | খ-৩ |
| 8   | `20261117130000_product_import`  | `ProductImport`, `ProductImportRow`                                                                                                                                                                      | খ-৪ |

**Backfill SQL (migration 2):**

**read-only যাচাইয়ের ফল (২০২৬-১১-১৫):** তিনটা নমুনা অর্ডারের কোনোটার ইনভয়েস নেই (Phase 9-এর আগের seed)।

| অর্ডার       | চ্যানেল | অবস্থা    | placedAt         | shippedAt        |
| ------------ | ------- | --------- | ---------------- | ---------------- |
| UEH-2026-001 | ONLINE  | SHIPPED   | 2026-11-02 04:24 | 2026-11-02 04:24 |
| UEH-2026-002 | ONLINE  | DELIVERED | 2026-10-21 12:02 | 2026-10-21 12:02 |
| UEH-2026-003 | STORE   | DELIVERED | 2026-09-30 06:48 | —                |

তাই উৎসের ক্রম হবে: অনলাইনে ইনভয়েস v1-এর `issuedAt`, না থাকলে `shippedAt`; দোকানে `placedAt`। এখনকার ৩টা অর্ডারে ফল: 001 → 2026-11-02 04:24, 002 → 2026-10-21 12:02, 003 → 2026-09-30 06:48 (সব UTC)।

```sql
-- soldAt source: online = first invoice (issued with the sale at SHIPPED),
-- falling back to shippedAt for seed orders that predate invoices; store = placedAt.
WITH src AS (
  SELECT o."id",
         CASE WHEN o."channel" = 'STORE' THEN o."placedAt"
              ELSE COALESCE(i."issuedAt", o."shippedAt") END AS sold_at
    FROM "Order" o
    LEFT JOIN "Invoice" i ON i."orderId" = o."id" AND i."version" = 1
   WHERE o."soldAt" IS NULL
     AND o."status" IN ('SHIPPED','DELIVERED','DELIVERY_FAILED','RETURNED_TO_WAREHOUSE')
)
INSERT INTO "AuditLog" ("id","userId","action","entityType","entityId","before","after","createdAt")
SELECT 'mig12_soldat_' || "id", NULL, 'order.soldAt.backfill', 'Order', "id",
       jsonb_build_object('soldAt', NULL), jsonb_build_object('soldAt', sold_at), now()
  FROM src WHERE sold_at IS NOT NULL;

UPDATE "Order" o SET "soldAt" = CASE WHEN o."channel" = 'STORE' THEN o."placedAt"
                                     ELSE COALESCE(i."issuedAt", o."shippedAt") END
  FROM "Order" o2
  LEFT JOIN "Invoice" i ON i."orderId" = o2."id" AND i."version" = 1
 WHERE o."id" = o2."id" AND o."soldAt" IS NULL
   AND o."status" IN ('SHIPPED','DELIVERED','DELIVERY_FAILED','RETURNED_TO_WAREHOUSE');
```

- অবস্থার শর্ত বাতিল ও অপেক্ষমাণ অর্ডারকে বাদ রাখে। অন্য কোনো ডাটাবেসে, যেমন staging-এ, এই migration চললেও শুধু যোগ্য row ছোঁবে।
- migration-এর আগে আর পরে একই read-only query চালিয়ে ফল মিলিয়ে দেখাব।

**নতুন মডেল (সংক্ষেপে):**

```prisma
model ContentDocument {
  id                 String              @id @default(cuid())
  key                String              @unique   // "home", "announcements", "menu.header", "footer", "page.about"
  kind               ContentDocumentKind
  slug               String?             @unique   // PAGE only
  draft              Json
  draftRevision      Int                 @default(0)  // optimistic lock
  draftUpdatedAt     DateTime            @default(now())
  draftUpdatedById   String?
  isSample           Boolean             @default(false)
  isSystem           Boolean             @default(false)  // cannot be deleted (About, Privacy ...)
  /// Permission needed to publish besides content.publish (e.g. return.policy.publish).
  publishPermission  String?
  publishedVersionId String?             @unique
  unpublishedAt      DateTime?
  createdAt          DateTime            @default(now())
  updatedAt          DateTime            @updatedAt
}

model ContentVersion {
  id            String   @id @default(cuid())
  documentId    String
  number        Int
  data          Json
  note          String?
  publishedAt   DateTime @default(now())
  publishedById String?
  @@unique([documentId, number])
}

model ProductImport {
  id String @id @default(cuid())
  fileName String
  fileSha256 String
  mode String          // ALL_OR_NOTHING | GOOD_ONLY
  status String        // VALIDATED | APPLYING | DONE | FAILED | CANCELLED
  rowCount Int
  createCount Int
  updateCount Int
  errorCount Int
  appliedCount Int @default(0)
  skippedCount Int @default(0)
  includeCost Boolean
  createdById String
  createdAt DateTime @default(now())
  finishedAt DateTime?
  @@index([fileSha256])
}

model ProductImportRow {
  id String @id @default(cuid())
  importId String
  productCode String
  rowNumbers Int[]
  action String        // CREATE | UPDATE | ERROR | SKIP
  payload Json
  diff Json?
  errors Json?
  expectedUpdatedAt DateTime?
  outcome String?
  @@index([importId, productCode])
}
```

`ProductImport.status`/`mode` এবং `ProductImportRow.action` আসলে enum হবে। বাস্তবায়নের সময় সেগুলো আলাদা enum migration-এ যাবে, আগের ফেজগুলোর নিয়মে।

পুরনো `Banner`, `HomeSection`, `MenuItem`, `Page` টেবিল **মোছা হবে না**। কোড আর এগুলো পড়বে না। schema-তে deprecated মন্তব্য যোগ হবে।

---

## 3. ক-২ — রিপোর্টের সংজ্ঞা

### ৩.১ সময়

- সব হিসাব Asia/Dhaka-তে (UTC+6, DST নেই)। দিনের শুরু ঢাকার 00:00, অর্থাৎ আগের দিন UTC 18:00।
- পরিসর সবসময় `[start, end)`।
- সপ্তাহ শুরু শনিবার (`reports.weekStartsOn`)।
- পরিসরের বিকল্প: আজ, গতকাল, এই সপ্তাহ, এই মাস, গত মাস, নিজে বাছাই।
- নিজে বাছাই করা পরিসর সর্বোচ্চ ৩৬৬ দিন।

### ৩.২ কোন অর্ডার "বিক্রি"

- `soldAt` পরিসরে পড়লে বিক্রি।
- অনলাইন: প্রথম SHIPPED-এর মুহূর্ত, ইনভয়েসের সাথে একই transaction।
- দোকান: বিক্রির মুহূর্ত।
- বাতিল অর্ডার কখনো `soldAt` পায় না।
- DELIVERY_FAILED-এর পর আবার পাঠালে `soldAt` বদলায় না।

### ৩.৩ Gross → Net

| লাইন                            | সূত্র                                                                               | তারিখ                       |
| ------------------------------- | ----------------------------------------------------------------------------------- | --------------------------- |
| Gross                           | Σ `subtotalPoisha`                                                                  | `soldAt`                    |
| − ছাড়                          | Σ `discountPoisha` (কুপন + দোকানের হাতে দেওয়া ছাড়)                                | `soldAt`                    |
| = পণ্য বিক্রি                   | Gross − ছাড়                                                                        |                             |
| − রিটার্ন (রিফান্ড)             | COMPLETED Refund: `amountPoisha − shippingRefundPoisha`, শুধু বিক্রি হওয়া অর্ডারের | `processedAt`               |
| − এক্সচেঞ্জে ফেরত মাল           | এক্সচেঞ্জ অর্ডারের `EXCHANGE_CREDIT` payment                                        | এক্সচেঞ্জ অর্ডারের `soldAt` |
| − ফেরত আসা ডেলিভারি             | RETURNED_TO_WAREHOUSE অর্ডারের (subtotal − discount)                                | `returnedToWarehouseAt`     |
| = **Net বিক্রি**                |                                                                                     |                             |
| ডেলিভারি চার্জ আয় (আলাদা লাইন) | Σ `shippingPoisha` − shipping রিফান্ড − ফেরত আসা অর্ডারের চার্জ                     |                             |

- **অর্ডার সংখ্যা** = বিক্রি হওয়া অর্ডার।
- **গড় অর্ডার মূল্য** = পণ্য বিক্রি ÷ অর্ডার সংখ্যা।

**উদাহরণ:** ৳3,000-এর অর্ডার, ৳300 কুপন, ৳70 ডেলিভারি; ১০ তারিখে SHIPPED। ১৪ তারিখে ৳900-এর শার্ট ফেরত এল, ৳810 রিফান্ড হলো।

- ১০ তারিখ: Gross 3,000, ছাড় 300, পণ্য বিক্রি 2,700, ডেলিভারি আয় 70।
- ১৪ তারিখ: রিটার্ন −810।
- মাসে Net 1,890।

**এক্সচেঞ্জের যুক্তি:** নতুন অর্ডারটা পুরো দামে বিক্রি হিসেবে গোনা হয়, আর ফেরত মালের credit বিয়োগ হয়। ফলে net-এ থাকে শুধু দামের পার্থক্য।

### ৩.৪ Z-report-এর সাথে মিল

- Z-report-এর `grossPoisha`, `discountPoisha` আর `netSalesPoisha` হলো দোকানের ওই দিনের Gross, ছাড় আর পণ্য বিক্রি।
- `refundsPoisha` হলো till থেকে দেওয়া রিফান্ড।
- till-এর বাইরে দেওয়া রিফান্ড রিপোর্টে "till-এর বাইরে রিফান্ড" নামে আলাদা লাইনে দেখাবে।
- ড্যাশবোর্ড, রিপোর্ট আর Z-report একই `reports.service` ফাংশন ব্যবহার করবে।

### ৩.৫ লাভ ও ক্রয়মূল্য

- **Snapshot কখন:** প্রথম SHIPPED-এর transaction-এ (`fulfilment.service`) আর POS বিক্রির transaction-এ (`pos.service`)। মান `ProductVariant.costPoisha`, একই transaction-এ পড়া। SALE movement-এর `unitCostPoisha`-তেও একই মান লেখা হবে।
- লাইনের লাভ = (lineTotal − discount) − unitCost × qty।
- রিটার্নে ফেরত আসা ইউনিটের cost একই snapshot থেকে ফেরত যোগ হবে।
- snapshot খালি হলে লাইনটা "ক্রয়মূল্য অজানা" সারিতে যাবে: বিক্রির অঙ্ক দেখাবে, লাভ "—"। কোনো অনুমান হবে না।
- মার্জিন % = লাভ ÷ জানা-cost-এর বিক্রি।
- দেখার অনুমতি: শুধু `inventory.cost.read`। অনুমতি না থাকলে সার্ভার cost-এর ঘরই তৈরি করে না; শুধু UI-তে লুকানো নয়।

### ৩.৬ রিপোর্টের তালিকা

| রিপোর্ট            | উৎস ও সূত্র                                                                                                                                                          | চার্ট                         |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| বিক্রির সারাংশ     | ৩.৩; দিন/সপ্তাহ/মাস অনুযায়ী bucket; চ্যানেল ও শাখা অনুযায়ী ভাগ                                                                                                     | কলাম (net), চ্যানেলের stacked |
| প্রোডাক্ট          | OrderItem qty ও (lineTotal − discount); product, variant, মূল ক্যাটাগরি; সাইজ ও রঙ snapshot লেবেল থেকে                                                               | অনুভূমিক bar (টপ ১০)          |
| লাভ ও মার্জিন      | ৩.৫; product, ক্যাটাগরি, শাখা, চ্যানেল                                                                                                                               | bar                           |
| স্টকের মূল্য       | onHand × cost আর × price, লোকেশন অনুযায়ী; DISPATCHED ট্রান্সফার আলাদা; cost না থাকলে "অজানা"                                                                        | —                             |
| ধীরগতির মাল        | onHand > 0, অথচ X দিনে ওই লোকেশনে SALE_* নেই (X ফিল্টার, ডিফল্ট ৯০)                                                                                                  | —                             |
| COD আদায়          | DELIVERED + COD + `paidPoisha < totalPoisha`; বয়স ০–৭ / ৮–১৫ / ১৫+ (`deliveredAt` থেকে); কুরিয়ার অনুযায়ী; আদায়ে পার্থক্য = CodSettlementItem expected − received | stacked bar                   |
| কুপন               | CouponRedemption × বিক্রি হওয়া অর্ডার: ব্যবহার, ছাড়, পণ্য বিক্রি                                                                                                   | —                             |
| রিটার্ন/এক্সচেঞ্জ  | ReturnItem × reasonCode, প্রোডাক্ট অনুযায়ী (SIZE_MISMATCH আলাদা); রিফান্ড method অনুযায়ী                                                                           | bar                           |
| ব্যর্থ ও বাতিল     | cancelReason (FAKE_ORDER = ভুয়া), DELIVERY_FAILED-এর কারণ, জেলা আর জোন snapshot; গচ্চা যাওয়া চার্জ = ফেরত আসা অর্ডারের `shippingPoisha`                            | bar                           |
| POS                | PosSession তালিকা (Z-report JSON), নগদের পার্থক্য, payment method, `soldByUserId`, `discountApprovedByUserId`                                                        | —                             |
| ইনভেন্টরি movement | ADJUSTMENT_IN/OUT, DAMAGE, COUNT_CORRECTION, TRANSFER_DISCREPANCY × reasonCode × স্টাফ; অনুমতি থাকলে cost-মূল্য                                                      | —                             |

**সাধারণ নিয়ম:**

- **ফিল্টার:** তারিখ, চ্যানেল, লোকেশন (শুধু অ্যাক্সেস থাকা), ক্যাটাগরি।
- **ড্রিল-ডাউন:** প্রতিটি মোট সংখ্যায় ক্লিক করলে `/admin/orders?soldFrom&soldTo&...` (অর্ডার তালিকায় নতুন ফিল্টার) অথবা movement-এর তালিকা।
- **প্রিন্ট:** A4 print stylesheet, ফিল্টারের সারাংশ আর তৈরির সময়সহ।

**পরে যোগ হবে, এখন কোনো ফাঁকা কলাম নয়:** প্রতিটি রিপোর্টের কলাম একটা definition তালিকা থেকে আসবে। Phase 10-এ payment provider আর gateway fee, Phase 11-এ কুরিয়ার API-র delivery fee শুধু তালিকায় লাইন যোগ করেই আসবে।

### ৩.৭ CSV রপ্তানি

- UTF-8 BOM থাকবে।
- টাকা দুই দশমিকে, তারিখ ঢাকা সময়ে `YYYY-MM-DD HH:mm`।
- cost-এর কলাম শুধু অনুমতি থাকলে।
- প্রতিটি রপ্তানি audit-এ যাবে (`report.export`: কোন রিপোর্ট, কোন ফিল্টার, কয় সারি)।
- Route Handler-এ `ReadableStream`, keyset pagination-এ ১,০০০ সারির পাতা।
- CSV injection থেকে রক্ষা: `= + - @` দিয়ে শুরু হওয়া ঘরের আগে `'` বসবে।

---

## 4. ক-৩ — Query কৌশল ও গতি

- সব query থাকবে `src/modules/reports/reports.repository.ts`-এ। সাধারণ মোটে Prisma `aggregate`/`groupBy`। bucket আর বয়সের ভাগে parameterised `$queryRaw` (`date_trunc('day', "soldAt" AT TIME ZONE 'Asia/Dhaka')`)।
- লোকেশন স্কোপ সবসময় SQL-এর `WHERE "locationId" = ANY($ids)`-এ। `allLocations` রোলে শর্ত নেই।
- ক-১-এর index গুলোই যথেষ্ট। **দৈনিক summary টেবিল এখন নয়।** test DB-তে ১ লাখ বানানো অর্ডারে benchmark চালাব; কোনো রিপোর্ট p95 > ১ সেকেন্ড হলে summary টেবিলের প্রস্তাব দেব।
- ড্যাশবোর্ড আর রিপোর্ট cache হবে না (`dynamic`)।
- storefront-এর "বেশি বিক্রি" সারি `unstable_cache`-এ থাকবে, revalidate ৬ ঘণ্টা, tag `reports:best-sellers`। হিসাব গত ৩০ দিনের পরিমাণ দিয়ে, শুধু published প্রোডাক্ট।

---

## 5. ক-৪ — কনটেন্ট ম্যানেজমেন্ট

### ৫.১ মূল ধারণা

প্রতিটি এডিটযোগ্য জিনিস একটা **ডকুমেন্ট**:

| key             | kind          | কী                             |
| --------------- | ------------- | ------------------------------ |
| `home`          | HOME          | হোমের সেকশনের তালিকা           |
| `announcements` | ANNOUNCEMENTS | ঘোষণা বারের বার্তা             |
| `menu.header`   | MENU          | হেডার ও মোবাইল মেনু            |
| `footer`        | FOOTER        | ফুটারের কলাম, ব্র্যান্ডের লেখা |
| `page.<slug>`   | PAGE          | প্রতিটি পেজ                    |

- **draft:** একটাই, এডিট করলে সেভ হয়। `draftRevision` দিয়ে optimistic lock, যাতে দুজন একসাথে এডিট করলে একজনের কাজ চুপচাপ মুছে না যায়।
- **সংস্করণ:** প্রতিবার publish করলে `ContentVersion` (অপরিবর্তনীয়)। সাইট দেখায় `publishedVersionId`।
- **ফিরে যাওয়া:** পুরনো সংস্করণ draft-এ কপি হয়, তারপর publish-এ নতুন সংস্করণ। ইতিহাস কখনো মোছে না। UI-তে শেষ ২০টা দেখাবে (≥১০ শর্ত পূরণ)।
- **Unpublish:** শুধু PAGE-এ। `publishedVersionId` খালি হয়, পেজ 404 দেয়, মেনু আর ফুটার থেকে লিংক নিজে থেকে লুকায়। `isSystem` পেজ (About, Privacy …) unpublish করা যায়, কিন্তু মোছা যায় না।
- **মোছা:** শুধু নিজে তৈরি করা পেজ, আর শুধু যদি কখনো publish না হয়ে থাকে। publish হয়ে থাকলে unpublish করতে হবে।
- **গঠন:** প্রতিটি kind-এর JSON-এর গঠন Zod schema-তে (`src/modules/content/content.schema.ts`)। সেভ আর publish দুই সময়েই সার্ভারে যাচাই হবে।

### ৫.২ দুই ভাষা

- প্রতিটি লেখার ঘর `{ en: string, bn?: string }`।
- ইংরেজি বাধ্যতামূলক (আগের নিয়ম), বাংলা ঐচ্ছিক; বাংলা না থাকলে ইংরেজি দেখাবে।
- অ্যাডমিনে প্রতিটি বাংলা ঘর খালি থাকলে হলুদ "বাংলা অনুবাদ নেই" চিহ্ন দেখাবে। ডকুমেন্টের তালিকায় "৩টা ঘরে বাংলা নেই" ধরনের সারাংশ থাকবে।
- Publish-এ বাধা নয়, শুধু সতর্কতা।

### ৫.৩ Placeholder

- নির্দিষ্ট তালিকা: `{freeShippingThreshold}`, `{returnWindowDays}`, `{storePhone}`, `{codMaxTotal}`।
- টাকার মান locale অনুযায়ী `৳2,500` আকারে বসবে।
- render-এর সময় setting থেকে আসবে, তাই setting বদলালে লেখাও বদলায়।
- এডিটরের প্রতিটি লেখার ঘরের নিচে "সংখ্যা বসান" ড্রপডাউন থাকবে, যা placeholder ঢুকিয়ে দেয়।
- অজানা `{...}` থাকলে সেভ চলবে, কিন্তু লাল সতর্কতা দেখাবে আর **publish আটকে যাবে**।
- `[`…`]` দিয়ে লেখা placeholder (যেমন `[এখানে আপনার ব্র্যান্ডের গল্প লিখুন]`) কোনো ডকুমেন্টে থাকলে production-এ publish আটকাবে। dev ও staging-এ শুধু সতর্কতা।

### ৫.৪ Block এডিটর (পেজের মূল লেখা, ব্র্যান্ডের গল্প)

| Block                 | ঘর                                                                             |
| --------------------- | ------------------------------------------------------------------------------ |
| শিরোনাম               | স্তর (H2/H3), লেখা                                                             |
| অনুচ্ছেদ              | লেখা (inline formatting সহ)                                                    |
| তালিকা                | ধরন (• / ১.), আইটেম                                                            |
| ছবি                   | Cloudinary ছবি, alt (বাধ্যতামূলক), caption                                     |
| টেবিল                 | শিরোনাম সারি, সারিগুলো (প্রতিটি ঘর লেখা, inline সহ); সর্বোচ্চ ৮ কলাম × ৫০ সারি |
| FAQ                   | প্রশ্ন, উত্তর (অনুচ্ছেদ); শুধু FAQ-ধরনের পেজে                                  |
| সতর্কবার্তা (callout) | লেখা (যেমন "অফারটি সীমিত সময়ের")                                              |

- **Inline formatting:** `**মোটা**`, `*বাঁকা*`, `[লেখা](লিংক)`। আমাদের নিজের ছোট parser (`src/modules/content/inline.ts`) এগুলো React element-এ রূপান্তর করে।
- **HTML কখনো সংরক্ষণ বা render হয় না।** সব লেখা React text হিসেবে বসে, তাই `<script>` বা `<img onerror=…>` লিখলে শুধু অক্ষর হিসেবে দেখাবে। `dangerouslySetInnerHTML` কোথাও ব্যবহার হবে না; একটা lint নিয়ম যোগ হবে যা এর ব্যবহার আটকায় (JSON-LD-এর একটা নির্দিষ্ট ব্যতিক্রম ছাড়া, যেখানে `JSON.stringify` + `<` escape)।
- **লিংক:** শুধু `https:`, `http:`, `mailto:`, `tel:` আর `/` দিয়ে শুরু পথ (কিন্তু `//` নয়)। স্কিম যাচাইয়ের আগে লিংক trim, lower-case আর control/whitespace অক্ষর মুক্ত করা হয়, তাই `JaVaScRiPt:` বা `java\tscript:`-ও আটকায়। বাইরের লিংকে `rel="noopener noreferrer"`।
- **আকারের সীমা:** প্রতিটি লেখা ≤ ৫,০০০ অক্ষর, পেজে ≤ ২০০ block, ডকুমেন্টের JSON ≤ ২৫৬ KB।
- **এডিটরের UI:**
  - বাঁ পাশে block-এর তালিকা। প্রতিটির উপরে ছোট টুলবার: ↑ ↓ (ক্রম), কপি, মুছুন।
  - শেষে "+ block যোগ করুন" মেনু।
  - প্রতিটি লেখার ঘরে ইংরেজি/বাংলা ট্যাব।
  - ডান পাশে (বড় স্ক্রিনে) লাইভ প্রিভিউ, storefront-এর একই কম্পোনেন্ট দিয়ে।
  - মোবাইলে প্রিভিউ নিচে।
  - formatting-এর নিয়ম ঘরের নিচে ছোট লেখায়: "**মোটা** · _বাঁকা_ · [লেখা](https://…)"।

### ৫.৫ ছবি (সব কনটেন্টে)

- Phase 6-এর পথ: ব্রাউজারে resize (≤2400px), signed direct upload, সার্ভারে যাচাই, Cloudinary ফোল্ডার `ueh/<env>/content`।
- প্রতিটি ছবির ঘরের পাশে মাপের নির্দেশনা:

| ব্যবহার          | অনুপাত | ন্যূনতম মাপ  |
| ---------------- | ------ | ------------ |
| Hero ডেস্কটপ     | 16:7   | 1920×840     |
| Hero মোবাইল      | 4:5    | 1080×1350    |
| প্রমো            | 16:9   | 1600×900     |
| কালেকশন          | 4:5    | 900×1125     |
| ব্র্যান্ডের গল্প | 16:9   | 1600×900     |
| OG               | 1.91:1 | 1200×630     |
| পেজের ভেতরের ছবি | যেকোনো | প্রস্থ ≥ 800 |

- মাপ ছোট হলে হলুদ সতর্কতা (আপলোড আটকায় না)।
- alt text বাধ্যতামূলক (ইংরেজি, বাংলা ঐচ্ছিক)।
- পুরনো সংস্করণ ছবি ব্যবহার করতে পারে, তাই কনটেন্টের ছবি বদলালে **Cloudinary থেকে মোছা হয় না**। অব্যবহৃত ছবি পরিষ্কারের স্ক্রিপ্ট পরে (Phase 13)।

### ৫.৬ প্রতিটি স্ক্রিন

**`/admin/content` — তালিকা**

- কার্ডের গ্রিড: হোমপেজ, ঘোষণা বার, হেডার মেনু, ফুটার, তারপর পেজের টেবিল।
- প্রতিটিতে দেখাবে: অবস্থা (Published / Draft-এ অপ্রকাশিত পরিবর্তন আছে / কখনো publish হয়নি / নমুনা), শেষ এডিট (কে, কখন), শেষ publish, বাংলা অনুবাদ বাকি থাকা ঘরের সংখ্যা।
- "নতুন পেজ" বাটন।

**সব এডিটরের সাধারণ কাঠামো**

- উপরে sticky বার: শিরোনাম, অবস্থার badge, "সেভ (draft)", "Preview", "Publish" (`content.publish` না থাকলে বাটন নিষ্ক্রিয় + লেখা "Publish-এর অনুমতি নেই — একজন ম্যানেজারকে বলুন"), "ইতিহাস"।
- সেভ না করে পেজ ছাড়তে গেলে সতর্কতা (Phase 6-এর `use-unsaved-changes`)।
- প্রতিটি ঘরের পাশে (i) সাহায্যের লেখা, অ্যাডমিনে ইংরেজিতে। অ্যাডমিন UI এখন ইংরেজিতেই, কারণ আগের ফেজগুলো সেভাবে বানানো।
- "নমুনা" ডকুমেন্টে উপরে হলুদ পট্টি: "এটা নমুনা লেখা। নিজের লেখা দিয়ে বদলান। নমুনা অবস্থায় লাইভ সাইটে publish করা যাবে না।"

**হোমপেজ এডিটর (`/admin/content/home`)**

- সেকশনের তালিকা। প্রতিটি সারিতে: ধরনের আইকন, নাম, সারাংশ (যেমন "৩টা স্লাইড, ১টা নির্ধারিত সময়ে"), চালু/বন্ধ সুইচ, ↑ ↓, এডিট, মুছুন।
- "+ সেকশন যোগ করুন" থেকে ধরন বাছাই।
- এডিট করলে ডান পাশে একটা drawer খোলে।
- সেকশনের ধরন ও ঘর:

| ধরন            | ঘর                                                                                                                                                                                                                                       |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| HERO_SLIDES    | স্লাইড (১–৬টা): ডেস্কটপ ছবি, মোবাইল ছবি (না দিলে ডেস্কটপেরটা crop), ছোট লেখা (eyebrow), শিরোনাম, উপশিরোনাম, বাটন ১ ও ২ (লেখা + লিংক), alt, শুরু, শেষ, লেখার রঙ (হালকা/গাঢ়)। স্লাইড ঘোরে ৬ সেকেন্ডে, `prefers-reduced-motion`-এ ঘোরে না। |
| CATEGORY_TILES | শিরোনাম/বর্ণনা (ঐচ্ছিক), ক্যাটাগরির তালিকা (বাছাই + ক্রম); কোনো ক্যাটাগরি বন্ধ হলে টাইলটা লুকায়                                                                                                                                         |
| PRODUCT_ROW    | শিরোনাম, বর্ণনা, নিয়ম: NEW / FEATURED / TAG (ট্যাগ বাছাই) / CATEGORY (ক্যাটাগরি বাছাই) / BEST_SELLING (গত ৩০ দিন) / MANUAL (প্রোডাক্ট খুঁজে বাছাই + ক্রম); সর্বোচ্চ সংখ্যা (৪–২৪); "সব দেখুন" লিংক (নিয়ম থেকে নিজে থেকে, বা হাতে)      |
| PROMO_BANNER   | ছবি, eyebrow, শিরোনাম, লেখা, বাটন, লিংক, রঙের ধরন (accent/dark), শুরু, শেষ                                                                                                                                                               |
| COLLECTIONS    | শিরোনাম, বর্ণনা, আইটেম (ছবি, শিরোনাম, বর্ণনা, লিংক বাছাই), ২–৬টা                                                                                                                                                                         |
| BRAND_STORY    | ছবি, eyebrow, শিরোনাম, block এডিটর (অনুচ্ছেদ/তালিকা), ঐচ্ছিক সংখ্যার তালিকা (মান + লেবেল; নমুনায় খালি), "আরও পড়ুন" লিংক                                                                                                                |
| TRUST_BADGES   | আইটেম (২–৬টা): আইকন (নির্দিষ্ট তালিকা: cash, return, truck, shield, phone, store), শিরোনাম, ছোট লেখা — placeholder সহ                                                                                                                    |

- **লিংক বাছাই:** একটা কম্পোনেন্ট দিয়ে সব জায়গায়। ধরন: ক্যাটাগরি / পেজ / কালেকশন (ট্যাগ) / প্রোডাক্ট / বাইরের লিংক। আইডি দিয়ে সংরক্ষণ হয়, render-এর সময় slug বের হয়, তাই slug বদলালে লিংক ভাঙে না।
- হোম ডকুমেন্ট publish না হলে স্টোরফ্রন্ট দেখাবে কোডের একটা স্থির কাঠামো, যেখানে শুধু ক্যাটাগরি টাইল আর নতুন প্রোডাক্টের সারি থাকে। এতে কোনো কনটেন্ট লেখা নেই, শুধু `messages`-এর লেবেল। production-এর প্রথম দিনেও সাইট ফাঁকা দেখাবে না।

**ঘোষণা বার (`/admin/content/announcements`)**

- বার্তার তালিকা (০–৫টা)।
- প্রতিটির ঘর: লেখা (দুই ভাষা, ≤ ১২০ অক্ষর, placeholder সহ), ঐচ্ছিক লিংক, রঙ (`primary` / `accent` / `neutral` — ব্র্যান্ডের নির্দিষ্ট রঙ), শুরু, শেষ, চালু/বন্ধ।
- একাধিক থাকলে ৬ সেকেন্ডে ঘোরে; reduced-motion-এ প্রথমটা স্থির থাকে।
- কোনো বার্তা না থাকলে বারটাই দেখাবে না।
- "ট্র্যাক অর্ডার" লিংক আর ভাষা বদলের বাটন বারের ডান পাশে থাকবে; এগুলো স্থির UI।

**হেডার মেনু (`/admin/content/menu.header`)**

- গাছের মতো তালিকা, ২ স্তর।
- প্রতিটি আইটেম: লেবেল (দুই ভাষা; ক্যাটাগরি বা পেজ হলে খালি রাখলে তার নিজের নাম বসে), লিংক বাছাই, চালু/বন্ধ, ↑ ↓, "ভেতরে নিন / বাইরে আনুন"।
- ২-এর বেশি স্তর হতে পারে না; সার্ভারেও যাচাই হয়।
- ডেস্কটপে প্রথম স্তর অনুভূমিক, দ্বিতীয় স্তর ড্রপডাউন। মোবাইলে drawer-এ accordion। ডেটা একই।
- সর্বোচ্চ ৮টা প্রথম-স্তর আইটেম, প্রতিটির নিচে ১২টা।

**ফুটার (`/admin/content/footer`)**

- ব্র্যান্ডের লেখা (দুই ভাষা)।
- লিংকের কলাম (১–৪টা): শিরোনাম + লিংক (লিংক বাছাই দিয়ে)।
- "শাখার তালিকা দেখাও" সুইচ।
- পেমেন্ট লোগোর সারি চালু/বন্ধ।
- ফুটারে বাকি যা দেখায়, কিন্তু এখানে এডিট হয় না:
  - দোকানের ঠিকানা/ফোন/WhatsApp/লোগো → Settings ▸ দোকানের তথ্য
  - সোশ্যাল লিংক → Settings ▸ SEO ও সোশ্যাল
  - শাখা → Locations
  - এই স্ক্রিনে সেগুলোর লিংক দেওয়া থাকবে, যাতে কোথায় এডিট করতে হয় তা পরিষ্কার থাকে।
- পেমেন্ট লোগো: `footer.paymentMethods` setting-এ থাকবে চালু থাকা পদ্ধতির তালিকা (COD, bKash, Nagad, Visa, Mastercard)। লোগোর ছবি `public/payment/*.svg`-এ, কারণ এগুলো কনটেন্ট নয়, স্থির সম্পদ। ছবিগুলো আপনি দেবেন; না দিলে লোগোর বদলে নাম লেখা দেখাবে।

**পেজ (`/admin/content/page.<slug>`)**

- উপরে মেটা:
  - শিরোনাম (দুই ভাষা)
  - slug (ইংরেজি, ছোট হাতের অক্ষর আর হাইফেন; system পেজে লক)
  - সারাংশ
  - SEO title (≤ ৬০, দুই ভাষা; গণনা দেখাবে)
  - SEO description (≤ ১৬০)
  - OG ছবি
  - পেজের ধরন: সাধারণ / FAQ / Contact
- নিচে block এডিটর।
- **FAQ ধরনের পেজ:** প্রশ্ন-উত্তরের গ্রুপ (গ্রুপের নাম + আইটেম)। স্টোরফ্রন্টে accordion আর JSON-LD `FAQPage`।
- **Contact ধরনের পেজ:** উপরে block এডিটর (ভূমিকা লেখা); নিচে স্টোরফ্রন্ট নিজে থেকে বসায়:
  - দোকানের ফোন (`tel:`)
  - WhatsApp বাটন (`https://wa.me/<digits>`, setting থেকে)
  - শাখার কার্ড: নাম, ঠিকানা, ফোন, খোলার সময়, "ম্যাপে দেখুন" (`mapUrl`)
  - এগুলো খালি থাকলে সেই অংশ দেখাবে না।
- **রিটার্ন পলিসি (`page.shipping-returns`):** `publishPermission = return.policy.publish` (বিস্তারিত ৫.৮)।
- **System পেজ** (প্রথমে তৈরি হবে): about, contact, privacy-policy, terms, shipping-returns, shipping-info, size-guide, faq।
  - এখনকার URL বজায় থাকবে: `/about`, `/contact`, `/faq`, `/privacy-policy`, `/shipping-returns`।
  - নতুনগুলো: `/terms`, `/shipping-info`, `/size-guide`।
  - নিজে তৈরি করা পেজ: `/pages/<slug>` (একটা dynamic route)।
- Sitemap-এ publish হওয়া সব পেজ, দুই ভাষায়, `lastModified` = publish-এর সময়।

**Locations (Phase 7-এর বিদ্যমান স্ক্রিন)**

- ফর্মে নতুন ঘর "Google Maps লিংক" (`https://maps.google.com/…`, `https://maps.app.goo.gl/…` বা `https://www.google.com/maps/…` — শুধু এই host গুলো গ্রহণযোগ্য)।
- নাম, ঠিকানা, ফোন, খোলার সময় আগেই দুই ভাষায় আছে।
- কোনো Location সেভ হলে `updateTag('content:branches')`।
- স্টোরফ্রন্ট দেখাবে শুধু: `type=BRANCH`, `isActive`, `deletedAt IS NULL` এবং `isSample=false`।

### ৫.৬ক Location এডিট — permission

- Location এডিট করতে আগের মতোই `location.manage` লাগবে (Super Admin, Store Manager)।
- Content Editor শাখার তথ্য বদলাতে পারবে না। কারণ Location-এ অনলাইন ফুলফিলমেন্টের মতো operational ঘরও আছে (খোলা প্রশ্ন ৬)।

### ৫.৭ Preview

1. এডিটরের "Preview" চাপলে `GET /api/admin/preview?doc=<key>&locale=bn|en` চলে। এটা স্টাফ সেশন আর `content.write` যাচাই করে, `draftMode().enable()` করে, তারপর storefront-এর সংশ্লিষ্ট পথে redirect করে। লিংক শুধু আপেক্ষিক পথ, তাই open redirect সম্ভব নয়।
2. storefront draft দেখাবে কেবল তখন, যখন **draft cookie আছে এবং বৈধ স্টাফ সেশন + `content.write` আছে।** শুধু cookie থাকলে published লেখাই দেখাবে।
3. draft পড়া হয় cache ছাড়া। Next-এর নিয়ম অনুযায়ী draft mode-এ cache বাইপাস হয়, আর আমাদের loader-ও তখন সরাসরি DB পড়বে।
4. Preview-এ উপরে লাল পট্টি: "DRAFT PREVIEW · <ডকুমেন্টের নাম> · বন্ধ করুন"। বন্ধ করলে `/api/admin/preview/exit` চলে, যা `disable()` করে।
5. অ্যাডমিনে `/admin/content/<key>/preview` পেজে iframe থাকবে, মাপ বদলানো যাবে: মোবাইল 390×844, ট্যাবলেট 768, ডেস্কটপ 1280। ভাষা বদলানো যাবে। "এই সময়ে দেখাও" ঘরে একটা ভবিষ্যৎ তারিখ দিলে নির্ধারিত সময়ের ব্যানার কেমন দেখাবে তা দেখা যাবে। এটা শুধু preview-এর query param, সাইটে কোনো প্রভাব নেই।
6. Preview পেজ `noindex`, আর response-এ `Cache-Control: private, no-store`।

### ৫.৮ Publish, সংস্করণ, রিটার্ন পলিসি

- **Publish:** `content.publish` লাগবে, আর ডকুমেন্টের `publishPermission` থাকলে সেটাও।
- **Publish-এর আগের যাচাই:** Zod, অজানা placeholder, ভাঙা লিংক (মুছে ফেলা ক্যাটাগরি বা পেজ), alt ছাড়া ছবি, production-এ `isSample` বা `[…]` placeholder।
- **Publish dialog:** draft আর চলতি সংস্করণের পার্থক্য (কোন সেকশন বা ঘর বদলেছে) দেখাবে, আর একটা ঐচ্ছিক নোট নেবে।
- **ইতিহাস:** সংস্করণের তালিকা (নম্বর, কে, কখন, নোট)। প্রতিটির জন্য "দেখুন" (read-only preview) আর "draft-এ ফিরিয়ে আনুন"।
- **Audit actions:** `content.draft.save` (শুধু প্রথম সেভ আর প্রতি ১৫ মিনিটে একবার, যাতে audit ভরে না যায়), `content.publish`, `content.unpublish`, `content.restore`, `content.create`, `content.delete`।
- **রিটার্ন পলিসি:**
  - Publish করতে লাগবে `content.publish` **এবং** `return.policy.publish`।
  - নতুন সংস্করণ publish হলে একই transaction-এ `returns.policyApproved=true`।
  - draft বদলালে সাইটে আগের অনুমোদিত সংস্করণই থাকে; নতুন লেখা অনুমোদন (publish) ছাড়া live হয় না।
  - Unpublish করলে `policyApproved=false`, আর চেকআউট ও ট্র্যাকিং থেকে লিংক সরে যায় (Phase 9-এর নিয়ম বহাল)।
  - Phase 9-এর `/admin/returns/policy` স্ক্রিন এই এডিটরে redirect করবে।
  - `returns.conditionsEn/Bn` setting আগের মতো রিটার্ন ফর্মে ব্যবহার হবে।

### ৫.৯ Cache ও সময়সীমা

| কী বদলাল    | কোন tag                                                           |
| ----------- | ----------------------------------------------------------------- |
| হোম publish | `content:home`                                                    |
| ঘোষণা       | `content:announcements`                                           |
| মেনু        | `content:menu.header`                                             |
| ফুটার       | `content:footer`                                                  |
| পেজ         | `content:page.<slug>` + `content:pages` (sitemap, মেনুর পেজ-লিংক) |
| Location    | `content:branches`                                                |
| Setting     | `settings` (placeholder, ফুটারের দোকানের তথ্য)                    |

- Server Action-এ `updateTag(...)`, যা Next 16-এ read-your-writes দেয়। অন্য পথ, যেমন import স্ক্রিপ্ট, `revalidateTag(tag, 'max')` ব্যবহার করবে।
- loader: `unstable_cache(fn, [key], { tags, revalidate: 300 })`। Phase 6-এর মতোই আগের caching model; Cache Components আসবে Phase 13-এ।
- **সময়সীমা:**
  - cache-এ সব স্লাইড আর বার্তা শুরু/শেষ সময়সহ থাকে। দেখাবে কি না তা ঠিক হয় render-এর সময় `now` দিয়ে।
  - storefront layout ও হোমের revalidate ৩০০ সেকেন্ড, তাই নির্ধারিত সময়ের সর্বোচ্চ ৫ মিনিটের মধ্যে চালু বা বন্ধ হয়।
  - cron লাগে না। Vercel Hobby-তে দিনে একবারের বেশি cron চলে না, তাই এই পথটাই নিরাপদ।
  - অ্যাডমিনে প্রতিটি নির্ধারিত আইটেমের পাশে লেখা থাকবে "সাইটে দেখাবে: ১৪ এপ্রিল ০০:০০ – ২০ এপ্রিল ২৩:৫৯ (ঢাকা সময়)"।

### ৫.১০ পুরনো কনটেন্ট আমদানি (`npm run content:import-legacy`)

- create-only: যে ডকুমেন্ট আগে থেকে আছে, সেটা ছোঁয় না।
- ডিফল্ট dry-run; `--apply` দিলে লেখে।
- dry-run প্রতিটি ডকুমেন্ট, প্রতিটি ঘর আর কোন বানানো তথ্য placeholder দিয়ে বদলানো হলো তার তালিকা ছাপায়।
- তৈরি সব ডকুমেন্টে `isSample=true`। dev-এ প্রথম সংস্করণ publish হবে, যাতে সাইট এখনকার মতো দেখায়। `APP_ENV=production`-এ স্ক্রিপ্ট শুধু draft বানায়, publish করে না।
- উৎস: পুরনো `Banner`/`HomeSection`/`MenuItem`/`Page` row আর `content.mock.ts`। স্ক্রিপ্টে একবার কপি হবে, তারপর mock ফাইল মোছা হবে।

**কী বদলাবে (শর্ত ১):**

| পুরনো                                                              | নতুন ডকুমেন্টে                                                                                   |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| "Since 2009", "3 showrooms", "500+ styles", "7 day returns" সংখ্যা | সংখ্যার তালিকা খালি; ফেরতের দিন থাকলে `{returnWindowDays}`                                       |
| ব্র্যান্ডের গল্প, About-এর অনুচ্ছেদ                                | `[এখানে আপনার ব্র্যান্ডের গল্প লিখুন]` / `[Write your brand story here]`                         |
| `MOCK_SHOWROOMS` (নাম, ঠিকানা, ফোন)                                | বাদ; শাখা আসবে Location থেকে                                                                     |
| ঘোষণা "৳2,500"                                                     | `{freeShippingThreshold}`                                                                        |
| প্রমো "Free shipping over ৳2,500"                                  | `{freeShippingThreshold}`; COD প্রমোর লেখা থাকবে (তথ্যগতভাবে সত্য)                               |
| Hero, কালেকশনের লেখা ও ছবি (`/images/editorial/*.svg`)             | শিরোনাম রাখা হবে (বিপণনের সাধারণ লেখা, কোনো দাবি নেই), কিন্তু চিহ্নিত নমুনা; ছবি placeholder SVG |
| FAQ-এর উত্তরে নির্দিষ্ট সময়, দাম বা দিন                           | placeholder দিয়ে বদলানো, বা `[…]`                                                               |
| Privacy-এর লেখা                                                    | রাখা হবে, নমুনা চিহ্নসহ, আর শুরুতে `[আইনি পরামর্শ নিয়ে যাচাই করুন]` callout                     |
| Shipping & Returns                                                 | রাখা হবে, নমুনা চিহ্নসহ; publish শুধু `return.policy.publish` দিয়ে                              |
| Terms, Shipping info, Size guide                                   | নতুন, খালি draft (শুধু শিরোনাম + `[…]`), unpublished                                             |
| মেনু ও ফুটারের লিংক                                                | এখনকার লিংকগুলোই (ক্যাটাগরি id আর পেজ key দিয়ে)                                                 |

- কোন ঘর বদলানো হলো তার পূর্ণ তালিকা dry-run-এ আসবে, আর আমি সেটা আপনাকে দেখাব।
- এডিট করে সেভ করলে `isSample=false` হয়। production-এ সব ঘর থেকে `[…]` সরালে তবেই publish হবে।

---

## 6. ক-৫ — স্টোরফ্রন্ট পরিষ্কার (শর্ত ২ ও ৩)

| বিষয়                                                 | কাজ                                                                                                                                                                                                                             |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| হেডারের অ্যাকাউন্ট আইকন                               | সরানো (`site-header.tsx`); মোবাইল মেনু থেকেও `ACCOUNT_NAV` সরানো                                                                                                                                                                |
| `/account`                                            | পেজটা শুধু `redirect('/track-order')` (locale বজায় রেখে, 307)। `account-tabs.tsx` আর `orders.mock.ts` মোছা হবে (git ইতিহাসে থাকবে)। `orders.mock.ts`-এর কোনো type আর কেউ ব্যবহার করলে সেটা আসল ফাইলে সরানো হবে।                |
| Sitemap/robots                                        | `/account` বাদ                                                                                                                                                                                                                  |
| Contact ফর্ম                                          | `contact-form.tsx` মোছা; জায়গায় ফোন, WhatsApp বাটন আর শাখার কার্ড (৫.৬)। `Contact.success`/`mapPlaceholder` লেবেল সরানো।                                                                                                      |
| নিউজলেটার                                             | ফুটার আর হোম থেকে সরানো; `newsletter-form.tsx` মোছা। হোম এডিটরে NEWSLETTER সেকশনের ধরন নেই।                                                                                                                                     |
| `content.mock.ts`, `catalog.mock.ts`, `navigation.ts` | মোছা; `tests/unit/catalog-content.test.ts` নতুন কোডে লেখা                                                                                                                                                                       |
| `sample-content-note.tsx`                             | ব্যবহার না থাকলে মোছা                                                                                                                                                                                                           |
| messages-এর কনটেন্ট লেবেল                             | `Common.announcement`, `Footer.brandBlurb`, `Footer.paymentMethods`, `About.intro/ctaBody/...`, `Contact.description`, `Home.*Description` (সেকশনের বর্ণনা এখন ডকুমেন্টে) — যেগুলো কনটেন্ট, সেগুলো সরানো। স্থির UI লেবেল থাকবে। |
| স্থায়ী রক্ষা                                         | একটা unit টেস্ট `src/`-এ `MOCK_`/`.mock` import খুঁজবে আর পেলে ব্যর্থ হবে                                                                                                                                                       |

---

## 7. ক-৬ — ড্যাশবোর্ড (`/admin`)

**উইজেট আর কে দেখবে:**

| উইজেট               | শর্ত                           | বিষয়বস্তু                                                                                          |
| ------------------- | ------------------------------ | --------------------------------------------------------------------------------------------------- |
| বিক্রির KPI         | `report.view` + `order.read`   | আজ ও এই মাস: net বিক্রি, অর্ডার, গড় অর্ডার মূল্য, অনলাইন বনাম দোকান (গতকাল বা গত মাসের সাথে তুলনা) |
| লাভ                 | + `inventory.cost.read`        | এই মাসের লাভ ও মার্জিন, "অজানা cost" অংশসহ                                                          |
| কাজের তালিকা        | `order.read`                   | নিচে                                                                                                |
| রিফান্ড অনুমোদন     | `refund.approve`               | অপেক্ষায় থাকা সংখ্যা → `/admin/refunds?status=awaiting`                                            |
| খোলা রিটার্ন        | `return.manage`                | → `/admin/returns?status=open`                                                                      |
| লো-স্টক             | `inventory.read`               | Phase 7-এর উইজেট                                                                                    |
| পথে থাকা ট্রান্সফার | `inventory.read`               | → `/admin/transfers?status=DISPATCHED`                                                              |
| খোলা POS দিন        | `pos.day.manage` বা `pos.sell` | শাখা অনুযায়ী, কতক্ষণ খোলা (১৮ ঘণ্টার বেশি হলে লাল)                                                 |
| ৩০ দিনের চার্ট      | `report.view` + `order.read`   | দৈনিক net, চ্যানেল অনুযায়ী (SVG কলাম চার্ট)                                                        |
| শাখার তুলনা         | একাধিক লোকেশনে অ্যাক্সেস       | এই মাসের net, শাখা অনুযায়ী (অনুভূমিক bar)                                                          |

**কাজের তালিকা** (প্রতিটি সারি ক্লিক করলে ফিল্টার করা তালিকা খোলে):

- কনফার্মের অপেক্ষায়: Review (`reviewReasons` ≠ [])
- কনফার্মের অপেক্ষায়: Unreachable (`unreachableAt`)
- কনফার্মের অপেক্ষায়: বাকি
- প্যাকিংয়ের অপেক্ষায় (CONFIRMED/PROCESSING)
- পাঠানো কিন্তু ডেলিভারি হয়নি > X দিন — `dashboard.staleShipmentDays`, ডিফল্ট ৫
- ডেলিভারড কিন্তু COD আদায় হয়নি > Y দিন — `dashboard.codOverdueDays`, ডিফল্ট ৭

অর্ডার তালিকার পেজে দরকারি নতুন ফিল্টার যোগ হবে: `review`, `unreachable`, `shippedBefore`, `codOverdue`, `soldFrom/To`।

**আরও নিয়ম:**

- সব সংখ্যা লোকেশন-স্কোপে।
- Branch Manager নিজের শাখার সংখ্যা দেখবে। Order Staff দেখবে শুধু কাজের তালিকা আর ট্র্যাকিং, কারণ তাদের `report.view` নেই।
- `MOCK_ORDERS` ও "sample" লেবেল সম্পূর্ণ সরানো।
- চার্ট বানানোর আগে `dataviz` নির্দেশনা মানব। চার্ট হবে নিজেদের SVG, সার্ভারে render, কোনো package নয়। প্রতিটি চার্টের নিচে একই ডেটার টেবিল থাকবে (accessibility ও প্রিন্টের জন্য)।

---

## 8. ক-৭ — প্রোডাক্ট CSV/Excel আমদানি, রপ্তানি ও ছবির বাল্ক আপলোড

### ৮.১ ফাইল

- **CSV:** বাধ্যতামূলক।
  - UTF-8, BOM থাকুক বা না থাকুক।
  - delimiter `,`, `;` বা tab, নিজে থেকে চেনা হবে (Phase 7-এর `detectDelimiter`/`readCsvRecords` আবার ব্যবহার)।
  - সর্বোচ্চ ২ MB আর ৫,০০০ সারি, দুটোই setting: `catalog.import.maxBytes`, `catalog.import.maxRows`।
- **.xlsx:** শুধু `read-excel-file` অনুমোদিত হলে (ক-১২)।
  - শুধু প্রথম sheet পড়া হবে। সব ঘর লেখা হিসেবে পড়ে একই পার্সারে যাবে।
  - সূত্রের ঘরের শুধু হিসাব করা মান নেওয়া হবে।
- **অনুমোদন না পেলে:** আমদানির পেজে বাংলা নির্দেশনা থাকবে: "Excel-এ File → Save As → ধরন: _CSV UTF-8 (Comma delimited)_ → Save।" Google Sheets-এর জন্যও একই ধরনের নির্দেশনা।
- **টেমপ্লেট ডাউনলোড:** `product-import-template.csv` (BOM সহ)। এতে থাকবে কলামের শিরোনাম আর দুটো উদাহরণ প্রোডাক্ট:
  - একটা ২ রঙ × ৩ সাইজের শার্ট, বাংলা নামসহ
  - একটা ১ রঙ × ৪ সাইজের প্যান্ট
  - উদাহরণের কোড `EXAMPLE-` দিয়ে শুরু; ভুল করে আমদানি না হয়, তাই এই prefix-এর সারি পার্সার প্রত্যাখ্যান করবে।
- **কলামের ব্যাখ্যার পেজ** `/admin/products/import/help`: প্রতিটি কলামের বাংলা ও ইংরেজি ব্যাখ্যা, বাধ্যতামূলক কি না, উদাহরণ মান, আর এখনকার সাইজ/রঙ/ক্যাটাগরি/ফিট কোডের লাইভ তালিকা।

### ৮.২ কলাম (চূড়ান্ত প্রস্তাব)

| কলাম                                       | স্তর         | নিয়ম                                                                                                                                        |
| ------------------------------------------ | ------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `product_code`                             | প্রোডাক্ট    | নতুন প্রোডাক্টে ফাঁকা রাখা যায় → Phase 6-এর `buildProductCode` দিয়ে তৈরি। ফাঁকা কোডের সারিগুলো `name_en` + `category_code` দিয়ে দল বাঁধে। |
| `name_en`*                                 | প্রোডাক্ট    | ≤ ১৫০                                                                                                                                        |
| `name_bn`                                  | প্রোডাক্ট    | ≤ ১৫০                                                                                                                                        |
| `description_en`, `description_bn`         | প্রোডাক্ট    | সাধারণ লেখা; ফাঁকা লাইন = নতুন অনুচ্ছেদ; HTML ট্যাগ প্রত্যাখ্যাত                                                                             |
| `category_code`*                           | প্রোডাক্ট    | বিদ্যমান ক্যাটাগরির কোড (মূল ক্যাটাগরি)                                                                                                      |
| `extra_category_codes`                     | প্রোডাক্ট    | `;` দিয়ে আলাদা                                                                                                                              |
| `brand`                                    | প্রোডাক্ট    | ব্র্যান্ডের নাম বা slug; না মিললে ত্রুটি (নতুন ব্র্যান্ড তৈরি হয় না)                                                                        |
| `fabric_en`, `fabric_bn`                   | প্রোডাক্ট    |                                                                                                                                              |
| `fit`                                      | প্রোডাক্ট    | `catalog.fits`-এর key বা দুই ভাষার নাম                                                                                                       |
| `care_en`, `care_bn`                       | প্রোডাক্ট    |                                                                                                                                              |
| `tags`                                     | প্রোডাক্ট    | `;` দিয়ে আলাদা; অজানা ট্যাগ তৈরি হবে (প্রিভিউতে "নতুন ট্যাগ")                                                                               |
| `size_chart`                               | প্রোডাক্ট    | size chart-এর নাম। নতুন কলাম, কারণ প্রোডাক্টে ঘরটা আছে।                                                                                      |
| `seo_title_en/bn`, `seo_description_en/bn` | প্রোডাক্ট    | ≤ ৭০ / ≤ ১৬০                                                                                                                                 |
| `status`                                   | প্রোডাক্ট    | `DRAFT` (ডিফল্ট) / `PUBLISHED`; ৮.৩ দেখুন                                                                                                    |
| `size`                                     | ভ্যারিয়েন্ট | preset-এর কোড বা দুই ভাষার নাম (ছোট-বড় অক্ষর উপেক্ষা করে)                                                                                   |
| `colour`                                   | ভ্যারিয়েন্ট | একই                                                                                                                                          |
| `sku`                                      | ভ্যারিয়েন্ট | ফাঁকা → `catalog.skuPattern` থেকে তৈরি                                                                                                       |
| `barcode`                                  | ভ্যারিয়েন্ট | ফাঁকা → EAN-13 (prefix 29), Phase 9-এর নিয়ম; দিলে checksum যাচাই আর অনন্য                                                                   |
| `price_tk`*                                | ভ্যারিয়েন্ট | Phase 7-এর টাকার নিয়ম (`"1,250.50"`, বাংলা অঙ্ক `১২৫০`)                                                                                     |
| `compare_at_tk`                            | ভ্যারিয়েন্ট | থাকলে > price                                                                                                                                |
| `weight_g`                                 | ভ্যারিয়েন্ট | পূর্ণসংখ্যা                                                                                                                                  |
| `cost_tk`                                  | ভ্যারিয়েন্ট | শুধু `inventory.cost.read` থাকলে গ্রহণ; না থাকলে পুরো কলাম উপেক্ষিত, প্রিভিউতে সতর্কতা                                                       |

(* নতুন প্রোডাক্টে বাধ্যতামূলক)

**প্রোডাক্ট-স্তরের ঘর:**

- প্রথম সারি থেকে নেওয়া হবে।
- পরের সারিতে **ভিন্ন** মান থাকলে ত্রুটি।
- ফাঁকা থাকলে চলবে, অর্থাৎ শুধু প্রথম সারিতে লিখলেই যথেষ্ট।

**অন্যান্য নিয়ম:**

- একই প্রোডাক্টে একই (size, colour) দুবার থাকলে ত্রুটি।
- কলামের ক্রম যেকোনো হতে পারে। অজানা কলাম সতর্কতাসহ উপেক্ষিত।
- **সাইজ/রঙ না মিললে:** ত্রুটি। `catalog.import.createMissingOptions` (ডিফল্ট `false`) চালু থাকলে প্রিভিউতে লেখা থাকবে "নতুন preset তৈরি হবে: রঙ `MAROON`", আর প্রয়োগের সময় তৈরি হবে। নতুন রঙের hex খালি থাকবে।
- **cost:** নতুন ভ্যারিয়েন্টে `costPoisha`-এর প্রাথমিক মান বসবে। বিদ্যমান ভ্যারিয়েন্টে cost বদলাবে শুধু যদি তার কোনো স্টক movement না থাকে। movement থাকলে weighted average-ই সঠিক, তাই ঘরটা উপেক্ষিত হবে, সতর্কতাসহ।
- **স্টক:** এই আমদানিতে নেই (Phase 7-এর স্টক CSV আলাদা)।

### ৮.৩ মোড ও নিয়ম

**তৈরি** (নতুন `product_code`):

- নতুন প্রোডাক্ট, options (size/colour) আর ভ্যারিয়েন্ট তৈরি হবে।
- slug আসবে `name_en` থেকে (Phase 6-এর নিয়ম, দরকারে `-2`)।

**আপডেট** (বিদ্যমান `product_code`, বা কোড ফাঁকা কিন্তু `sku` বিদ্যমান):

- শুধু ফাইলে থাকা কলাম বদলাবে। ফাঁকা ঘর মানে "বদলাবে না"।
- কোনো ঐচ্ছিক লেখার ঘর মুছতে চাইলে বিশেষ মান `[clear]` লিখতে হবে (শুধু ঐচ্ছিক লেখার ঘরে চলবে)।
- নতুন ভ্যারিয়েন্ট যোগ হতে পারে। বিদ্যমান ভ্যারিয়েন্ট কখনো সরবে না বা নিষ্ক্রিয় হবে না।
- **audit:** দাম বদল `catalog.price.import` (আগে-পরে); প্রতিটি প্রোডাক্টে `catalog.product.import`।
- **permission** (যে কাজের অনুমতি নেই, সেই সারি ত্রুটি হবে, কারণসহ):
  - লেখা/SEO বদলাতে `catalog.write` বা `catalog.content`
  - দাম বদলাতে `catalog.price.write`
  - প্রোডাক্ট বা ভ্যারিয়েন্ট তৈরিতে `catalog.write`
  - publish করতে `catalog.publish`

**মোছা কখনো নয়।**

**`status=PUBLISHED`:**

- Phase 6-এর `missingForPublish` যাচাই হবে।
- আমদানিতে ছবি থাকে না, তাই নতুন প্রোডাক্ট সাধারণত **draft থাকবে**। প্রিভিউতে কারণ দেখাবে: "ছবি নেই — ছবি আপলোডের পর publish করা যাবে"।
- আমদানি "publish চাওয়া হয়েছিল" তালিকাটা মনে রাখে। ছবির বাল্ক আপলোডের শেষে সেই তালিকা থেকে publish করা যাবে (৮.৬)।

**Optimistic lock:**

- dry-run-এর সময় প্রতিটি প্রোডাক্টের `updatedAt` রাখা হয়।
- প্রয়োগের সময় না মিললে সেই প্রোডাক্ট বাদ যাবে, কারণসহ: "আমদানি তৈরির পর <নাম> এডিট করেছেন — নতুন করে আমদানি চালান"।

**একই ফাইল দুবার:** sha256 আগের কোনো সম্পন্ন আমদানির সাথে মিললে সতর্কতা দেখাবে: "এই ফাইল <তারিখে> <কেউ> আমদানি করেছেন"। নিশ্চিত না করলে প্রয়োগ শুরু হবে না।

### ৮.৪ Dry-run প্রিভিউ (বাধ্যতামূলক)

- আপলোডের পর সার্ভার পুরো ফাইল যাচাই করে ফল রাখে `ProductImport`/`ProductImportRow`-এ। প্রোডাক্টে কিছু লেখা হয় না।
- **সারাংশের কার্ড:** তৈরি N, আপডেট M, অপরিবর্তিত K, ত্রুটি E, সতর্কতা W।
- **ট্যাব:**
  - তৈরি
  - আপডেট: প্রতিটি প্রোডাক্টে বদলানো ঘরের আগে → পরে, দাম রঙ দিয়ে চিহ্নিত
  - ত্রুটি: সারি নম্বর, কলাম আর বাংলায় কারণ, যেমন "সারি ১৪: রঙ 'মেরুন' কোনো preset-এর সাথে মেলেনি"
  - সতর্কতা
- **"ত্রুটির তালিকা CSV":** মূল সারি + `error` কলাম, যাতে Excel-এ ঠিক করে আবার আপলোড করা যায়।
- dry-run ২৪ ঘণ্টা বৈধ।

### ৮.৫ প্রয়োগ ও Vercel-এর সময়সীমা

**সব-অথবা-কিছুই-না (ডিফল্ট):**

- ত্রুটি ০ হলে তবেই শুরু হয়।
- পুরো কাজ এক transaction-এ, তাই একটা ত্রুটিতে কিছুই সেভ হয় না।
- এক request-এ শেষ করার জন্য এই মোডের সীমা `catalog.import.atomicMaxRows` (ডিফল্ট ১,০০০ সারি)। এর বড় ফাইলে প্রিভিউ বলবে: "ফাইল ভাগ করুন, অথবা 'শুধু ভালোগুলো' মোড ব্যবহার করুন"।

**শুধু ভালো প্রোডাক্ট** (`catalog.import.allowPartial`, ডিফল্ট `false`; চালু থাকলে প্রিভিউতে মোড বাছাই করা যায়):

- প্রতিটি প্রোডাক্ট আলাদা transaction-এ।
- ব্রাউজার বারবার `applyNextChunk(importId)` ডাকে; প্রতিবার ২৫টা প্রোডাক্ট বা ~৮ সেকেন্ড।
- অগ্রগতির বার আর "থামান" বাটন থাকবে।
- পেজ বন্ধ হলে ইতিহাস থেকে "আবার চালান" চাপলে যেখানে থেমেছিল সেখান থেকে চলবে।

**প্রয়োগ শেষে:**

- ক্যাটালগের cache tag-এ `updateTag`।
- ফলের সারাংশ।
- audit `catalog.import.apply` (মোট, ফাইলের নাম, hash)।

**আমদানির ইতিহাস** `/admin/products/import`: কে, কখন, ফাইল, মোড, তৈরি/আপডেট/বাদ/ত্রুটি, অবস্থা; প্রতিটির বিস্তারিত পেজ।

### ৮.৬ ছবির বাল্ক আপলোড (`/admin/products/images`)

1. **বাছাই:** "ফোল্ডার বাছুন" (`webkitdirectory`) অথবা "ছবি বাছুন" (একাধিক)। শুধু jpg/jpeg/png/webp।
2. **নাম মেলানো** (ব্রাউজারে, ছোট-বড় অক্ষর উপেক্ষা করে):
   - `{product_code}_{n}` → প্রোডাক্টের ছবি (n = ক্রম, ১ = মূল)
   - `{product_code}_{COLOUR}_{n}` → সেই রঙের ছবি (COLOUR = preset-এর ৩ অক্ষরের কোড)
   - product_code-এর ভেতরেই `-` থাকে, তাই বিভাজক `_`। সবচেয়ে লম্বা মিলে যাওয়া কোড আগে খোঁজা হয়।
   - প্রোডাক্ট কোড আর রঙের তালিকা একবার সার্ভার থেকে আনা হয়।
3. **প্রিভিউ টেবিল:** থাম্বনেইল, ফাইল, → প্রোডাক্ট, রঙ, ক্রম, বিদ্যমান ছবির সংখ্যা।
   - না মেলা ফাইল আলাদা তালিকায়, কারণসহ: "কোড পাওয়া যায়নি", "রঙ এই প্রোডাক্টে নেই", "নামের ধরন ভুল"।
   - একই জায়গায় দুটো ফাইল হলে সংঘাত দেখায়।
4. **বিদ্যমান ছবি:** প্রতিটি প্রোডাক্টে বা সবার জন্য একসাথে "যোগ করুন" (শেষে) অথবা "বদলান"।
5. **আপলোড:**
   - Phase 6-এর পথ: ব্রাউজারে ≤2400px, signed ticket, Cloudinary-তে সরাসরি, সার্ভারে যাচাই, DB-তে যুক্ত।
   - একসাথে ৩টা (`media.bulkConcurrency`)।
   - প্রতিটি ফাইলের অবস্থা: অপেক্ষায় / চলছে / সম্পন্ন / ব্যর্থ। ব্যর্থগুলোর জন্য "আবার চেষ্টা"।
   - নেটওয়ার্ক ছিন্ন হলে থামে; আবার চালালে সম্পন্নগুলো বাদ দিয়ে চলে।
6. **"বদলান":** পুরনো ছবি DB থেকে সরে নতুন ছবি যুক্ত হওয়ার একই transaction-এ। Cloudinary থেকে মোছা হয় commit-এর পরে (`deleteStoredFiles`)। মোছা ব্যর্থ হলে log-এ যায়, কাজ আটকায় না।
7. **শেষে:** "ছবি পাওয়া draft প্রোডাক্টগুলো publish করুন" (`catalog.publish`)। publish শর্ত পূরণ করা প্রোডাক্টের তালিকা দেখায়, নিশ্চিত করলে publish হয়।
8. **audit:** প্রোডাক্ট প্রতি `catalog.images.bulk`।
9. টেস্ট/CI-তে mock storage; dev, staging ও production-এ Cloudinary।

### ৮.৭ রপ্তানি

- `/admin/products/export`: প্রোডাক্ট তালিকার ফিল্টার (ক্যাটাগরি, অবস্থা, ব্র্যান্ড, খোঁজ) সহ।
- একই কলাম ও ক্রম, যাতে Excel-এ বদলে আবার আমদানি করা যায় (round-trip টেস্ট থাকবে)।
- `cost_tk` শুধু অনুমতি থাকলে।
- BOM, stream করা।
- `catalog.export` permission, audit `catalog.export`।

---

## 9. ক-৮ — Settings পেজ (`/admin/settings`)

### ৯.১ Registry

`src/modules/settings/settings.registry.ts` হবে সব setting-এর একমাত্র উৎস। প্রতিটির থাকবে:

| ঘর               | অর্থ                                                                                                |
| ---------------- | --------------------------------------------------------------------------------------------------- |
| `key`            | যেমন `shipping.freeThresholdPoisha`                                                                 |
| `group`          | কোন গ্রুপে                                                                                          |
| `type`           | `money` / `percent` / `int` / `bool` / `text` / `textBilingual` / `list` / `phone` / `url` / `enum` |
| `schema`         | সার্ভারে যাচাইয়ের Zod                                                                              |
| `defaultValue`   | ডিফল্ট মান                                                                                          |
| `label` / `help` | দুই ভাষায়                                                                                          |
| `unit`           | একক (দিন, ইউনিট …)                                                                                  |
| `permission`     | সাধারণত `settings.write`                                                                            |
| `revalidateTags` | কোন cache বাতিল হবে                                                                                 |
| `deprecated`     | থাকলে পেজে লুকানো                                                                                   |

- বিদ্যমান `*-settings.ts` parser গুলো registry থেকে key, ডিফল্ট আর schema নেবে, তাই এক জায়গায় বদলালেই সব জায়গায় বদলায়।
- একটা unit টেস্ট যাচাই করবে যে কোডে ব্যবহৃত প্রতিটি setting key registry-তে আছে।

### ৯.২ গ্রুপ ও স্ক্রিন

**গ্রুপগুলো (বাঁ পাশের ট্যাব):**

| গ্রুপ                 | বিষয়                                                                       |
| --------------------- | --------------------------------------------------------------------------- |
| দোকানের তথ্য          | নাম, ঠিকানা, ফোন, **নতুন `store.whatsapp`**, লোগো, VAT                      |
| চেকআউট ও ভুয়া অর্ডার |                                                                             |
| ডেলিভারি              | ফ্রি ডেলিভারির সীমা; জোনের চার্জ আগের Shipping স্ক্রিনে, এখানে তার লিংক     |
| অর্ডার ও কল           |                                                                             |
| রিটার্ন ও রিফান্ড     |                                                                             |
| POS                   |                                                                             |
| লেবেল ও প্রিন্ট       |                                                                             |
| ইনভেন্টরি             |                                                                             |
| ক্যাটালগ ও আমদানি     |                                                                             |
| স্টোরফ্রন্ট           |                                                                             |
| ড্যাশবোর্ড ও রিপোর্ট  |                                                                             |
| SEO ও সোশ্যাল         | ডিফল্ট OG ছবি; Facebook/Instagram/YouTube/TikTok লিংক; ফুটারের পেমেন্ট লোগো |
| সংযোগের অবস্থা        | read-only                                                                   |

**প্রতিটি সারি:**

- লেবেল (ইংরেজি, নিচে বাংলা) আর সাহায্যের লেখা।
- ধরন অনুযায়ী ইনপুট:

| ধরন      | ইনপুট                                  |
| -------- | -------------------------------------- |
| টাকা     | ৳ prefix, দুই দশমিক, poisha-য় সংরক্ষণ |
| শতাংশ    | % suffix                               |
| হ্যাঁ/না | সুইচ                                   |
| তালিকা   | chip                                   |
| enum     | drop-down                              |

- "ডিফল্ট: ৳2,500" লেখা থাকে। মান ডিফল্ট থেকে আলাদা হলে "ডিফল্টে ফেরত" বাটন দেখায়; এটা ডিফল্ট মান **সেভ** করে, row মোছে না।
- গ্রুপ প্রতি "সেভ" বাটন, শুধু বদলানো ঘর যায়। কোনো ঘরে ভুল থাকলে কিছুই সেভ হয় না, আর ঘরের নিচে ত্রুটি দেখায়।
- **audit:** `setting.update`, key প্রতি before/after।
- **cache:** registry-র tag-এ `updateTag`।

**সংযোগের অবস্থা:**

- দেখায়: Cloudinary (সংযুক্ত/অসংযুক্ত), Database, SMS (Mock/বন্ধ), পেমেন্ট (Mock), কুরিয়ার (হাতে), APP_ENV।
- **কোনো মান, key বা URL দেখাবে না।**

**এখানে দেখাবে না:**

- `fulfillment.defaultLocationCode`, `orders.numberPadding`, `shipping.insideDhakaPoisha`, `shipping.outsideDhakaPoisha` (deprecated)।
- `returns.policyApproved` (কনটেন্টের publish থেকে চলে)।
- অন্য স্ক্রিনে আগে থেকে এডিট হয় এমন কোনো setting দুই জায়গায় এডিটযোগ্য হবে না।

**permission:**

- পুরো পেজে `settings.write`।
- প্রস্তাবিত ব্যতিক্রম (প্রশ্ন ৬): "দোকানের তথ্য" আর "SEO ও সোশ্যাল" গ্রুপ `content.write` দিয়েও এডিট করা যাবে। এতে Content Editor আর Store Manager লোগো, WhatsApp আর সোশ্যাল লিংক বদলাতে পারবে, অথচ চেকআউট বা রিফান্ডের নিয়ম ছুঁতে পারবে না। VAT-এর ঘর এই ব্যতিক্রমে নেই, `settings.write` লাগবে।

**secret:** কোনো secret বা credential এখানে নয়। registry-তে `secret` ধরন নেই, আর key-র নামে `secret|token|password|apikey` থাকলে unit টেস্ট ব্যর্থ হয়।

---

## 10. ক-৯ — রোল ও অনুমতি এডিট (`/admin/roles`)

### ১০.১ স্ক্রিন

- **রোলের তালিকা:** নাম, ধরন (System/Custom), স্টাফের সংখ্যা, সব লোকেশন কি না, শেষ পরিবর্তন।
- **ম্যাট্রিক্স:** সারিতে permission, কলামে রোল; গ্রুপ অনুযায়ী ভাঁজ করা যায়।
  - প্রতিটি permission-এর পাশে বাংলা ও ইংরেজি বর্ণনা। কোডে `PERMISSION_DESCRIPTIONS` হিসেবে থাকবে।
  - Super Admin-এর কলাম সবসময় ✓ আর লক।
  - সংবেদনশীল permission-এ লাল চিহ্ন: `inventory.cost.read`, `refund.approve`, `staff.manage`, `role.manage`, `settings.write`, `audit.export`।
- **রোল এডিট:** নাম, বর্ণনা, "সব লোকেশন" সুইচ, গ্রুপ অনুযায়ী checkbox।
  - সেভের আগে পার্থক্য দেখাবে: "+ যোগ: …, − বাদ: …, প্রভাবিত স্টাফ: ৪ জন"।
- **নতুন রোল:** খালি থেকে, অথবা যেকোনো রোল "কপি করুন"।
- **মোছা:** শুধু custom রোল, আর শুধু যদি কোনো স্টাফ (নিষ্ক্রিয়সহ) না থাকে। soft delete।

### ১০.২ নিরাপত্তার নিয়ম (service-এ, UI-তে নয়)

1. সব রোল-ক্রিয়ায় দুটো আলাদা যাচাই: `role.manage` **এবং** কর্তা Super Admin।
2. Super Admin রোলের row এডিট করা যায় না। runtime-এ Super Admin কোড থেকে সব permission পায়।
3. নিজের রোল এডিট করা যায় না, আর স্টাফ পেজে নিজের রোল বদলানো যায় না।
4. অন্তত একজন active Super Admin সবসময় থাকতে হবে।
5. শুধু কোডের `PERMISSIONS`-এর key সংরক্ষণ হয়। অজানা key থাকলে পুরো অনুরোধ প্রত্যাখ্যাত।
6. System রোলের নাম বদলানো বা মোছা যায় না, তবে permission এডিট করা যায় (Super Admin ছাড়া)।
7. `role.manage` Super Admin ছাড়া অন্য রোলে দেওয়া যায় না।
8. **audit:** `role.create`, `role.update` (before/after), `role.copy`, `role.delete`।
9. permission প্রতি request-এ DB থেকে লোড হয় (যাচাই করেছি), তাই পরের request থেকেই কার্যকর।

### ১০.৩ কোডে নতুন permission এলে (প্রস্তাব)

- সেই ফেজের migration-এ পর্যালোচনাযোগ্য SQL থাকবে, যা নির্দিষ্ট system রোলে যোগ করে, AuditLog-সহ। এটাই এখনকার নিয়ম।
- Super Admin-এর জন্য কিছু লাগে না।
- **Custom রোলে কখনো নিজে থেকে কিছু যোগ হবে না।**
- `npm run roles:check` (read-only) দেখাবে: কোডের ডিফল্ট আর DB-র system রোলের পার্থক্য, আর অজানা key। deploy-এর পর হাতে চালানোর তালিকায় থাকবে।
- রোল পেজে "এই আপডেটে নতুন permission" ব্যানার: তালিকা আসবে কোডের `PERMISSION_ADDED_IN` থেকে, যাতে Super Admin ঠিক করতে পারেন কোন custom রোলে দেবেন।

---

## 11. ক-১০ — Audit log viewer ও অপরিবর্তনীয়তা

### ১১.১ Viewer (`/admin/audit`)

- **কলাম:** সময় (ঢাকা), স্টাফ, কাজ, রেকর্ড (লিংকসহ), লোকেশন, IP।
- **ফিল্টার:** তারিখ, স্টাফ, কাজের ধরন (গ্রুপ অনুযায়ী: `auth.*`, `order.*` …), রেকর্ডের ধরন, রেকর্ডের id।
- **pagination:** ৫০টা করে, keyset।
- **বিস্তারিত পেজ:** before/after পাশাপাশি। বদলানো ঘর হলুদ, যোগ সবুজ, বাদ লাল। user agent দেখাবে।
- **Sensitive মান:** লেখার সময়ই `[REDACTED]` (আগের নিয়ম)।
- **ফোন mask:** বাংলাদেশি ফোনের ধরন দেখানোর সময় mask → `017•••••789`, key-এর নাম যাই হোক। স্ক্রিন আর CSV দুই জায়গাতেই।
- **CSV:** `audit.export` লাগবে; ফিল্টার করা অংশ, stream, BOM; রপ্তানি নিজেও audit-এ।
- **UI-তে মোছা বা বদলানোর কোনো ব্যবস্থা নেই।**

### ১১.২ DB trigger (শর্ত ৪)

```sql
CREATE OR REPLACE FUNCTION audit_log_purge_allowed(db_name text) RETURNS boolean
LANGUAGE sql IMMUTABLE AS 'SELECT right(db_name, 5) = ''_test''';

CREATE OR REPLACE FUNCTION audit_log_immutable() RETURNS trigger
LANGUAGE plpgsql AS $fn$
BEGIN
  -- Only exception: emptying a *test* database, asked for explicitly
  -- with SET LOCAL app.audit_purge = 'on' in the same transaction.
  IF audit_log_purge_allowed(current_database())
     AND current_setting('app.audit_purge', true) = 'on' THEN
    RETURN COALESCE(OLD, NEW);
  END IF;
  RAISE EXCEPTION 'AuditLog is append-only (% blocked)', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$fn$;

CREATE TRIGGER "AuditLog_no_update_delete"
  BEFORE UPDATE OR DELETE ON "AuditLog"
  FOR EACH ROW EXECUTE FUNCTION audit_log_immutable();

CREATE TRIGGER "AuditLog_no_truncate"
  BEFORE TRUNCATE ON "AuditLog"
  FOR EACH STATEMENT EXECUTE FUNCTION audit_log_immutable();
```

- **ব্যতিক্রমের দুই শর্ত, দুটোই লাগবে:** DB-র নাম `_test` দিয়ে শেষ **এবং** `SET LOCAL app.audit_purge = 'on'`। dev-এর নাম `us_export_house`, আর production Neon DB-র নাম `_test`-এ শেষ হবে না।
- **টেস্টে প্রমাণ:**
  - `audit_log_purge_allowed('us_export_house')` = false, `('neondb')` = false, `('x_test_backup')` = false, `('us_export_house_test')` = true।
  - `_test` DB-তে: flag ছাড়া UPDATE, DELETE আর TRUNCATE প্রত্যাখ্যাত; flag দিলে DELETE সফল (rollback-এ)।
  - dev DB-তে: `prisma/verify.ts`-এর বিদ্যমান "rolled-back rejection" ধারায় flag দিয়েও DELETE প্রত্যাখ্যাত। ব্যর্থ হয় আর rollback হয়, তাই dev DB-তে কিছু লেখা হয় না।
- **এখনকার টেস্টে বিরোধ নেই:** কোনো টেস্ট AuditLog মোছে না বা User hard-delete করে না (যাচাই করেছি)। ব্যতিক্রমটা ভবিষ্যতের test-DB reset-এর জন্য।
- **`AuditLog.userId`-এর `onDelete: SetNull`:** User hard-delete হলে trigger আটকাবে। কোডে User hard-delete হয় না; এখন DB-ও সেটা জোর করে মানাবে।
- **সীমাবদ্ধতা:** DB owner trigger বন্ধ করতে পারে। Phase 9.5-এ Neon-এ app-এর জন্য আলাদা কম-ক্ষমতার DB role প্রস্তাব করব।

---

## 12. ক-১১ — স্থির লেবেল এডিটের প্রস্তাব (মালিকের সিদ্ধান্তের অপেক্ষায়)

### ১২.১ এখনকার অবস্থা

- `src/i18n/messages/bn.json` আর `en.json`-এ ২৫টা namespace, প্রতি ভাষায় ~৪৩০টা লেবেল।
- `src/i18n/request.ts`-এর `getRequestConfig` প্রতি request-এ এগুলো লোড করে।

### ১২.২ পদ্ধতি: override, কোড ডিফল্টই আসল

```prisma
model UiLabelOverride {
  id          String   @id @default(cuid())
  locale      String              // "bn" | "en"
  key         String              // "Home.newArrivalsTitle"
  value       String
  updatedById String?
  updatedAt   DateTime @updatedAt
  @@unique([locale, key])
}
```

- `getRequestConfig` প্রথমে কোডের messages লোড করে। তারপর cache থেকে override (`unstable_cache`, tag `ui-labels`, revalidate ৩৬০০) এনে শুধু **অনুমোদিত তালিকার** key-তে বসায়।
- override খালি রাখলে বা মুছে দিলে কোডের ডিফল্ট লেখাই দেখায়। "মুছে ফেলা" মানে override row সরানো, audit-সহ।
- কোড আপডেটে কোনো key-র নাম বদলালে বা key সরে গেলে পুরনো override এমনিতেই উপেক্ষিত হয়। অ্যাডমিনে সেগুলো "অপ্রচলিত" হিসেবে দেখাবে।
- **স্ক্রিন** (`/admin/content/labels`):
  - namespace অনুযায়ী তালিকা: key-র সহজ নাম, কোডের ডিফল্ট (দুই ভাষা), override-এর ঘর।
  - ব্যবহারের জায়গার বিবরণ, যেমন "হোমপেজ ▸ নতুন প্রোডাক্টের শিরোনাম"।
  - খোঁজার ঘর।
  - বাংলা override নেই আর বাংলা ডিফল্টও নেই, এমন ঘরে সতর্কতা।
- **permission:** `content.write`; লাইভে যেতে `content.publish`। লেবেলের আলাদা draft থাকবে না, সেভ মানেই লাইভ। তাই সেভ বাটন শুধু `content.publish` থাকলে কাজ করবে। Content Editor প্রস্তাব রাখতে পারবে না; সেটা জটিলতা বাড়ায়, এই ফেজে নয়।

### ১২.৩ কোনটা এডিটযোগ্য, কোনটা নয়

| Namespace                                                                                                                                                                                                                  | এডিটযোগ্য?                                                                  | কারণ                                                                                                       |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `Home` (সেকশনের ডিফল্ট শিরোনাম), `Nav`, `Footer` (কলামের শিরোনাম), `Shop`, `Category`, `Product` (বাটন, ট্যাবের নাম), `Faq`, `Contact`, `TrackOrder` (শিরোনাম ও সাহায্যের লেখা), `Metadata` (ডিফল্ট SEO title/description) | ✅ হ্যাঁ, allowlist ধরে                                                     | ব্র্যান্ডের ভাষা ও বিপণনের লেখা; ভুল হলে ক্ষতি কম                                                          |
| `Common`                                                                                                                                                                                                                   | আংশিক: `brandName`, `brandShort`, `brandTagline`, `viewAll`, `menu` ইত্যাদি | —                                                                                                          |
| `Cart`                                                                                                                                                                                                                     | আংশিক: শিরোনাম, খালি কার্টের লেখা                                           | পরিমাণ, মূল্য ও স্টকের বার্তা নয়                                                                          |
| `Checkout`, `CartErrors`, `errors`                                                                                                                                                                                         | ❌ না                                                                       | চেকআউট, COD-এর শর্ত, ভুয়া অর্ডারের বার্তা, দামের হিসাব; ভুল লেখা আইনি বা আর্থিক বিভ্রান্তি তৈরি করতে পারে |
| `OrderView`, `ReturnRequest`, `Policy`                                                                                                                                                                                     | ❌ না                                                                       | অর্ডারের অবস্থা, রিটার্নের শর্ত, পলিসির লিংক; রিটার্ন পলিসির অনুমোদন-ব্যবস্থা এড়ানো যাবে না               |
| `Account`, `LocaleSwitcher`, `Settings`, `Placeholder`, `Newsletter`                                                                                                                                                       | ❌ না                                                                       | লুকানো বা কারিগরি                                                                                          |

- allowlist কোডে থাকবে: `src/i18n/editable-labels.ts`, key ধরে, wildcard নয়। কোডের নতুন key নিজে থেকে এডিটযোগ্য হয় না।
- **সার্ভারে যাচাই:**
  - ICU placeholder (`{count}`, `{brand}` …) override-এ হুবহু একই সেট থাকতে হবে।
  - plural/select-এর গঠন অক্ষত থাকতে হবে। next-intl-এর formatter দিয়ে নমুনা মানে একবার format করে দেখা হয়; ব্যর্থ হলে সেভ হয় না।
  - দৈর্ঘ্য ≤ max(ডিফল্টের ২ গুণ, ৪০) অক্ষর।
  - HTML বা `<`/`>` চলবে না।
  - শুধু ফাঁকা স্থান দিয়ে লেখা নিষিদ্ধ। "খালি" মানে override সরানো।

### ১২.৪ Cache ও গতি

- override একটা ছোট query (≤ কয়েকশো row), `unstable_cache`-এ থাকে, আর সেভ করলে `updateTag('ui-labels')`।
- storefront-এর পেজ এমনিতেই ৩০০ সেকেন্ডে revalidate হয়। লেবেল সেভের পর পরের request-এ, Server Action-এর পরে সাথে সাথে।
- প্রতি request-এ অতিরিক্ত কাজ শুধু একটা in-memory object merge (~৪৩০ key), যা মাইক্রোসেকেন্ডের ব্যাপার।
- client component-এ লেবেল যায় `NextIntlClientProvider` দিয়ে, যেমন এখন যায়। bundle-এর আকার বদলায় না।
- **ঝুঁকি:** cache বা DB ব্যর্থ হলে কোডের ডিফল্ট দেখাবে (try/catch)। তাই সাইট কখনো লেবেলহীন হয় না।

### ১২.৫ সুপারিশ

- এই ফেজে **খ-৩-এর শেষে ছোট আকারে** করা: allowlist-এর ~১২০টা লেবেল, আলাদা draft ছাড়া।
- কাজ আনুমানিক এক দিনের। প্রশ্ন ৮-এ আপনার সিদ্ধান্ত চাই।
- না চাইলে migration 7 আর এই অংশ বাদ যাবে; পরে যোগ করতে কোনো বাধা নেই।

---

## 13. ক-১২ — নতুন package

| Package                          | কেন                                                          | আকার                                                                  | লাইসেন্স | সুপারিশ                                         |
| -------------------------------- | ------------------------------------------------------------ | --------------------------------------------------------------------- | -------- | ----------------------------------------------- |
| `read-excel-file` 9.3.x          | .xlsx সরাসরি পড়া। শুধু সার্ভারে, ব্রাউজার bundle-এ যাবে না। | unpacked ~2.5 MB; deps: `fflate`, `saxen`, `unzipper-esm`, `worker-f` | MIT      | ✅ **একমাত্র যেটার অনুমতি চাই** (ঐচ্ছিক)        |
| `exceljs` 4.4                    | একই কাজ                                                      | ~21.8 MB, ৯টা dependency (archiver, jszip …)                          | MIT      | ❌ ভারী                                         |
| `xlsx` (SheetJS, npm রেজিস্ট্রি) | একই কাজ                                                      | —                                                                     | —        | ❌ npm-এর সংস্করণ পুরনো, জানা দুর্বলতা আছে      |
| Tiptap / অন্য rich text          | —                                                            | বড়                                                                   | MIT      | ❌ block এডিটর নিজেরা বানাব (অনুমোদিত)          |
| `sanitize-html` / DOMPurify      | —                                                            | —                                                                     | —        | ❌ লাগবে না, কারণ HTML সংরক্ষণ বা render হয় না |
| Recharts / Chart.js              | —                                                            | —                                                                     | —        | ❌ সার্ভারে নিজেদের SVG চার্ট                   |
| CSV লাইব্রেরি                    | —                                                            | —                                                                     | —        | ❌ Phase 7-এর পার্সার আর নিজেদের stream লেখক    |

- `read-excel-file` অনুমোদিত হলে ইনস্টলের আগে exact version pin করব, `npm audit --omit=dev` চালাব, আর ফল জানাব।
- অনুমোদন না পেলে শুধু CSV (৮.১)। **বাকি কোনো কাজে নতুন package লাগবে না।**

---

## 14. ক-১৩ — Permission, রোল বণ্টন ও SQL

### ১৪.১ Key (বিদ্যমান নাম অপরিবর্তিত, নতুন ৬টা)

| প্রস্তাবিত নাম    | বাস্তবায়ন                                                                          |
| ----------------- | ----------------------------------------------------------------------------------- |
| `dashboard.view`  | যোগ হবে না। সব স্টাফ ড্যাশবোর্ড পায়, উইজেট নিজের permission দেখে।                  |
| `report.view`     | বিদ্যমান। বিক্রির রিপোর্টে সাথে `order.read`, স্টক রিপোর্টে `inventory.read` লাগবে। |
| `report.export`   | **নতুন**                                                                            |
| `report.cost`     | বিদ্যমান `inventory.cost.read`                                                      |
| `content.manage`  | বিদ্যমান `content.write`                                                            |
| `content.publish` | **নতুন**                                                                            |
| `settings.manage` | বিদ্যমান `settings.write`                                                           |
| `role.manage`     | **নতুন** (শুধু Super Admin)                                                         |
| `audit.read`      | বিদ্যমান `audit.view`                                                               |
| `audit.export`    | **নতুন**                                                                            |
| `catalog.import`  | **নতুন**                                                                            |
| `catalog.export`  | **নতুন**                                                                            |

বিদ্যমান key-র নাম বদলালে DB-র row-এ data migration লাগত, তাই নাম রাখা হলো।

### ১৪.২ রোল বণ্টন (পরিবর্তনের পরে)

| রোল                | নতুন যা পাবে                                                                           | মন্তব্য                                                                 |
| ------------------ | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Super Admin        | সব (কোড থেকে)                                                                          | DB-র তালিকাও মিলিয়ে রাখা হবে                                           |
| Store Manager      | `report.export`, `content.publish`, `audit.export`, `catalog.import`, `catalog.export` | `role.manage`, `settings.write` আর `staff.manage` পাবে না (প্রশ্ন ৪, ৬) |
| Branch Manager     | `report.export`                                                                        | নিজের শাখার; cost নয়                                                   |
| Inventory Staff    | —                                                                                      | `report.view` আগেই আছে; শুধু স্টক রিপোর্ট পাবে, cost ছাড়া              |
| Order Staff        | —                                                                                      | ড্যাশবোর্ডে কাজের তালিকা (`order.read`)                                 |
| Branch Sales Staff | —                                                                                      |                                                                         |
| Content Editor     | —                                                                                      | `content.write` আছে; publish নয়                                        |

### ১৪.৩ SQL (`roles_phase12`)

```sql
-- Additive only: no permission is removed and custom roles are untouched.
-- Before/after rows go to AuditLog in the same migration (Phase 6 pattern).
CREATE TEMP TABLE role_before AS
  SELECT "id", "name", "permissions" FROM "Role"
   WHERE "isSystem" AND "name" IN ('Super Admin','Store Manager','Branch Manager');

UPDATE "Role" SET "permissions" = ARRAY(SELECT DISTINCT unnest("permissions" || ARRAY[
    'report.export','content.publish','role.manage','audit.export','catalog.import','catalog.export'
  ]::text[]) ORDER BY 1), "updatedAt" = now()
 WHERE "isSystem" AND "name" = 'Super Admin';

UPDATE "Role" SET "permissions" = ARRAY(SELECT DISTINCT unnest("permissions" || ARRAY[
    'report.export','content.publish','audit.export','catalog.import','catalog.export'
  ]::text[]) ORDER BY 1), "updatedAt" = now()
 WHERE "isSystem" AND "name" = 'Store Manager';

UPDATE "Role" SET "permissions" = ARRAY(SELECT DISTINCT unnest("permissions" || ARRAY[
    'report.export'
  ]::text[]) ORDER BY 1), "updatedAt" = now()
 WHERE "isSystem" AND "name" = 'Branch Manager';

INSERT INTO "AuditLog" ("id","userId","action","entityType","entityId","before","after","createdAt")
SELECT 'mig12_role_' || r."id", NULL, 'role.permissions.migrate', 'Role', r."id",
       jsonb_build_object('permissions', to_jsonb(b."permissions")),
       jsonb_build_object('permissions', to_jsonb(r."permissions")), now()
  FROM "Role" r JOIN role_before b ON b."id" = r."id"
 WHERE r."permissions" IS DISTINCT FROM b."permissions";
```

- একই সাথে কোডের `SYSTEM_ROLES` আর `PERMISSION_GROUPS` আপডেট হবে, আর `access-roles` unit টেস্ট সেগুলো মিলিয়ে দেখবে।
- migration-এর আগে আর পরে এই তিন রোলের permission তালিকা read-only query দিয়ে আপনাকে দেখাব।

---

## 15. ক-১৪ — পেজের তালিকা

| পথ                                                                                                                                 | permission                                            | ধাপ |
| ---------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | --- |
| `/admin`                                                                                                                           | সবাই (উইজেট আলাদা)                                    | খ-১ |
| `/admin/reports` (সূচি) + `/admin/reports/{sales,products,profit,stock-value,slow-stock,cod,coupons,returns,failed,pos,movements}` | `report.view` (+ রিপোর্ট অনুযায়ী)                    | খ-১ |
| `/api/admin/reports/[report]/csv`                                                                                                  | `report.export`                                       | খ-১ |
| `/admin/content`, `/admin/content/[key]`, `/admin/content/[key]/history`, `/admin/content/[key]/preview`, `/admin/content/new`     | `content.write` (publish: `content.publish`)          | খ-২ |
| `/api/admin/preview`, `/api/admin/preview/exit`                                                                                    | `content.write`                                       | খ-২ |
| storefront: `/terms`, `/shipping-info`, `/size-guide`, `/pages/[slug]`; `/account` → redirect                                      | —                                                     | খ-২ |
| `/admin/settings` (`?group=`)                                                                                                      | `settings.write` (+ প্রশ্ন ৬)                         | খ-৩ |
| `/admin/roles`, `/admin/roles/matrix`, `/admin/roles/[id]`, `/admin/roles/new`                                                     | `role.manage` + Super Admin                           | খ-৩ |
| `/admin/audit`, `/admin/audit/[id]`, `/api/admin/audit/csv`                                                                        | `audit.view` / `audit.export`                         | খ-৩ |
| `/admin/content/labels`                                                                                                            | `content.write`/`content.publish` (ক-১১ অনুমোদিত হলে) | খ-৩ |
| `/admin/products/import`, `/import/[id]`, `/import/help`, `/admin/products/images`, `/admin/products/export`                       | `catalog.import` / `catalog.write` / `catalog.export` | খ-৪ |

অ্যাডমিনের বাঁ পাশের মেনু (`admin-nav.ts`) আপডেট হবে: Reports, Content, Settings, Roles, Audit, আর Products-এর নিচে Import/Images/Export।

---

## 16. ক-১৫ — টেস্ট পরিকল্পনা

### Unit (Vitest)

- **রিপোর্টের সূত্র:** gross/discount/returns/exchange/RTW/net, ডেলিভারি আয়, গড়, মার্জিন, অজানা cost-এর ভাগ, COD বয়সের ভাগ।
- **ঢাকার দিনের সীমানা:** UTC 17:59:59 আর 18:00:00; মাসের শেষ; শনিবার-শুরু সপ্তাহ; "গত মাস" জানুয়ারিতে।
- **CSV লেখক:** BOM, বাংলা, কমা আর উদ্ধৃতিচিহ্নের escape, CSV injection-এর `'`, টাকার দুই দশমিক, ঢাকা সময়।
- **আমদানির পার্সার:** প্রতিটি কলামের নিয়ম, delimiter, BOM, বাংলা অঙ্ক, `"1,250"`, প্রোডাক্ট-স্তরে অমিল, একই সাইজ-রঙ দুবার, `[clear]`, `EXAMPLE-`, cost অনুমতি ছাড়া।
- **ছবির নাম মেলানো:** দুই ধরন, ছোট-বড় অক্ষর, কোডের ভেতরে `-`, অজানা কোড বা রঙ, সংঘাত।
- **Placeholder:** জানা, অজানা, `[…]`, টাকার format দুই ভাষায়।
- **Block এডিটরের নিরাপত্তা:**
  - `<script>`, `<img onerror=…>` text হিসেবেই থাকে
  - `javascript:`, `JaVaScRiPt:`, `java\tscript:`, `data:`, `//evil.com` লিংক প্রত্যাখ্যাত
  - অজানা block প্রত্যাখ্যাত
  - আকারের সীমা
- **Settings registry:** সব key আছে, ডিফল্ট নিজের schema পাস করে, secret-এর মতো নাম নেই।
- **Permission:** `SYSTEM_ROLES` ↔ নতুন key; `role.manage` শুধু Super Admin-এ।
- **লেবেল override** (যদি অনুমোদিত হয়): placeholder-এর মিল, allowlist।
- **রক্ষা:** `src/`-এ কোনো `.mock` import নেই।

### Integration (`us_export_house_test`)

- ড্যাশবোর্ড = বিক্রির রিপোর্ট = Z-report, একই দিন আর শাখায় (দোকান: gross, discount, net, till রিফান্ড)।
- রিটার্ন net থেকে বিয়োগ হয়; এক্সচেঞ্জে শুধু পার্থক্য থাকে; RTW বিয়োগ হয়।
- cost snapshot SHIPPED ও POS-এ বসে; পরের রিসিভে বদলায় না; পুরনো অর্ডার "অজানা"।
- Branch Manager অন্য শাখার ডেটা পায় না (রিপোর্ট, CSV, ড্যাশবোর্ড — service স্তরে)।
- cost অনুমতি ছাড়া কোনো response-এ (রিপোর্ট, CSV, ড্যাশবোর্ড, রপ্তানি) `cost`/`profit` key নেই।
- আমদানি:
  - একটা ত্রুটিতে কিছুই সেভ হয় না
  - আপডেটে ফাঁকা ঘর কিছু মোছে না
  - মাঝে এডিট হলে সেই প্রোডাক্ট বাদ যায়
  - একই hash-এ সতর্কতা
  - partial মোডে ভালোগুলো সেভ হয়
- রোল এডিট:
  - Super Admin রোল বদলানো যায় না
  - নিজের রোল বদলানো যায় না
  - শেষ Super Admin থাকে
  - অজানা key প্রত্যাখ্যাত
  - পরিবর্তন পরের request-এ কার্যকর
- Audit trigger:
  - UPDATE, DELETE, TRUNCATE প্রত্যাখ্যাত
  - `_test`-এ flag দিলে চলে
  - `audit_log_purge_allowed` dev ও prod নামে false
- কনটেন্ট:
  - Content Editor-এর publish সার্ভারে প্রত্যাখ্যাত
  - `APP_ENV=production`-এ `isSample` বা `[…]` publish প্রত্যাখ্যাত, এডিট-সেভে `isSample` উঠে যায়
  - রিটার্ন পলিসি `return.policy.publish` ছাড়া live হয় না
  - draftRevision সংঘাত ধরা পড়ে
  - rollback নতুন সংস্করণ বানায়
- Settings: ভুল মান প্রত্যাখ্যাত, audit-এ before/after, ডিফল্টে ফেরত।

### E2E (Playwright, Chromium)

1. হোমে নতুন hero স্লাইড → preview (মোবাইল ও ডেস্কটপ) → publish → সাইটে দেখা যায়, বাংলা ও ইংরেজি দুই ভাষায়।
2. মেনু বদল (আইটেম যোগ, ক্রম বদল) → হেডার আর মোবাইল drawer-এ দেখা যায়।
3. About এডিট → publish → সাইটে দেখা যায়; ইতিহাস থেকে আগের সংস্করণে ফেরা।
4. CSV আমদানি: dry-run → প্রয়োগ → প্রোডাক্ট তৈরি → বাল্ক ছবি (mock storage) → publish → storefront-এ দেখা যায়।
5. বিক্রির রিপোর্ট খোলা → CSV নামানো (BOM আর বাংলা যাচাই)।
6. Content Editor-এর Publish বাটন নিষ্ক্রিয়, আর সরাসরি action ডাকলেও প্রত্যাখ্যাত।
7. `/account` → `/track-order`; হেডারে অ্যাকাউন্ট আইকন নেই; Contact-এ কোনো ফর্ম নেই।

### অন্যান্য

- typecheck, lint, format, build, `npm audit --omit=dev`।
- **Bundle-এ গোপন তথ্য নেই:** নতুন script `scripts/check-client-bundle.ts` build-এর পরে `.next/static`-এ `costPoisha`, `unitCostPoisha`, `CLOUDINARY_API_SECRET`, `AUTH_SECRET`-এর মান খুঁজবে; পেলে CI ব্যর্থ হবে।
- প্রতিটি ধাপ শেষে `inventory:verify`, `migrate status`, `migrate diff` (খালি) আর রেকর্ড গণনা।
- Benchmark (শুধু test DB, CI-তে নয়): ১ লাখ অর্ডারে প্রতিটি রিপোর্টের সময়।

---

## 17. ক-১৬ — ঝুঁকি

| ঝুঁকি                                       | প্রভাব               | প্রতিকার                                                            |
| ------------------------------------------- | -------------------- | ------------------------------------------------------------------- |
| `soldAt` backfill ভুল                       | শুধু রিপোর্টের তারিখ | আগে-পরে read-only query; audit row; ৩টা row                         |
| Audit trigger কেউ owner হিসেবে বন্ধ করে     | audit বদলানো সম্ভব   | Phase 9.5-এ কম-ক্ষমতার DB role                                      |
| নির্ধারিত ব্যানার ≤ ৫ মিনিট দেরিতে          | সামান্য              | অ্যাডমিনে লেখা থাকবে; দরকারে revalidate কমানো যায়                  |
| কনটেন্টের JSON বড় হয়ে storefront ধীর      | পেজের গতি            | আকারের সীমা; cache; ছবি Cloudinary-র transform দিয়ে                |
| বড় আমদানি সময়সীমা পার হয়                 | আধা-সম্পন্ন আমদানি   | atomic মোডে ১,০০০ সারির সীমা; partial মোডে resume                   |
| বাল্ক ছবি মোবাইল ডেটায় ব্যর্থ              | অসম্পূর্ণ ছবি        | ৩টা করে, retry, resume                                              |
| পুরনো কনটেন্ট টেবিল ও নতুন মডেলে বিভ্রান্তি | ভুল জায়গায় এডিট    | কোড পুরনো টেবিল আর পড়বে না; schema-তে deprecated মন্তব্য           |
| রোল এডিটে কেউ ভুল করে বেশি অনুমতি দেয়      | নিরাপত্তা            | শুধু Super Admin; সেভের আগে পার্থক্য; audit; সংবেদনশীল key-তে চিহ্ন |
| ফেজ বড়                                     | দেরি                 | চার ধাপে push, প্রতিটি নিজে কাজের অবস্থায়                          |
| লেবেল override ICU ভাঙে                     | পেজে ত্রুটি          | সেভের সময় format যাচাই; runtime-এ ব্যর্থ হলে ডিফল্ট                |

---

## 18. ক-১৭ — ধাপভিত্তিক কাজের ক্রম

**খ-১ — ড্যাশবোর্ড ও রিপোর্ট**

1. Migration 1–2।
2. SHIPPED আর POS-এ cost snapshot।
3. `reports` module (service, repository, সময়ের helper, CSV লেখক)।
4. ড্যাশবোর্ড।
5. ১১টা রিপোর্ট, প্রিন্ট আর CSV।
6. অর্ডার তালিকায় নতুন ফিল্টার।
7. টেস্ট।

**খ-২ — কনটেন্ট**

1. Migration 3–4।
2. `content` module (schema, inline parser, placeholder, service, cache)।
3. `content:import-legacy` (dry-run দেখিয়ে আপনার অনুমতি নিয়ে `--apply`)।
4. Storefront কম্পোনেন্ট।
5. অ্যাডমিন এডিটর।
6. Preview, ইতিহাস।
7. Location-এর `mapUrl`।
8. অ্যাকাউন্ট আর ফর্ম পরিষ্কার; mock ফাইল মোছা।
9. Sitemap।
10. টেস্ট।

**খ-৩ — Settings, রোল, audit**

1. Settings registry ও পেজ।
2. Migration 5–6 (৭ যদি অনুমোদিত হয়)।
3. রোল স্ক্রিন।
4. Audit viewer ও CSV।
5. লেবেল override (যদি অনুমোদিত হয়)।
6. টেস্ট।

**খ-৪ — প্রোডাক্ট আমদানি/রপ্তানি**

1. Migration 8।
2. পার্সার, dry-run, প্রয়োগ।
3. ইতিহাস।
4. বাল্ক ছবি।
5. রপ্তানি।
6. টেমপ্লেট ও সাহায্যের পেজ।
7. E2E।
8. পূর্ণ রিপোর্ট দিয়ে থামা।

প্রতিটি ধাপে: লোকালে সব টেস্ট → push → CI সবুজ → `inventory:verify` → রেকর্ড গণনা → সংক্ষিপ্ত অগ্রগতি জানানো।

---

## 19. খোলা প্রশ্ন

| #   | প্রশ্ন                                                                                                                                                                          | প্রস্তাবিত ডিফল্ট                                                                      |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| 1   | `read-excel-file` (MIT, ~2.5 MB, শুধু সার্ভারে) যোগ করব, যাতে .xlsx সরাসরি আমদানি হয়?                                                                                          | **না** — অনুমতি না পাওয়া পর্যন্ত শুধু CSV + বাংলা নির্দেশনা                           |
| 2   | সব-অথবা-কিছুই-না আমদানি সর্বোচ্চ ১,০০০ সারি (`catalog.import.atomicMaxRows`); "শুধু ভালোগুলো" মোড ডিফল্ট বন্ধ (`catalog.import.allowPartial=false`) — ঠিক আছে?                  | হ্যাঁ, ১,০০০ আর বন্ধ                                                                   |
| 3   | ড্যাশবোর্ড: "পাঠানো কিন্তু ডেলিভারি হয়নি" কত দিনের বেশি, আর "ডেলিভারড কিন্তু COD আদায় হয়নি" কত দিনের বেশি?                                                                   | ৫ দিন আর ৭ দিন (setting)                                                               |
| 4   | Store Manager কি পুরো Settings পেজ (`settings.write`) পাবে?                                                                                                                     | না (আগের মতো); প্রশ্ন ৬-এর গ্রুপ দুটো ছাড়া                                            |
| 5   | বিদ্যমান key-র নাম রাখা (`content.write`, `settings.write`, `audit.view`), `report.cost`-এর বদলে `inventory.cost.read`, আর `dashboard.view` না রাখা — রাজি?                     | হ্যাঁ                                                                                  |
| 6   | Settings-এর "দোকানের তথ্য" (VAT ছাড়া) আর "SEO ও সোশ্যাল" গ্রুপ `content.write` দিয়েও এডিট করা যাবে, আর শাখার তথ্য আগের মতো শুধু `location.manage` দিয়ে (Content Editor নয়)? | হ্যাঁ                                                                                  |
| 7   | এক্সচেঞ্জের credit আর ফেরত আসা ডেলিভারি (RETURNED_TO_WAREHOUSE) net থেকে বিয়োগের সংজ্ঞা (৩.৩) — রাজি?                                                                          | হ্যাঁ                                                                                  |
| 8   | স্থির লেবেল এডিট (ক-১১) এই ফেজে করব?                                                                                                                                            | হ্যাঁ, খ-৩-এর শেষে, allowlist-এর ~১২০টা লেবেল, সেভ মানেই লাইভ, `content.publish` দিয়ে |
| 9   | Branch Manager নিজের শাখার রিপোর্ট CSV (`report.export`) পাবে?                                                                                                                  | হ্যাঁ                                                                                  |
| 10  | Inventory Staff `report.view` রাখবে (শুধু স্টক ও movement রিপোর্ট, cost ছাড়া)?                                                                                                 | হ্যাঁ                                                                                  |
| 11  | নিজে তৈরি করা নতুন পেজের URL `/pages/<slug>`? (system পেজের এখনকার URL অপরিবর্তিত)                                                                                              | হ্যাঁ, `/pages/<slug>`                                                                 |
| 12  | ফুটার আর Contact-এ শুধু `BRANCH` ধরনের লোকেশন দেখাবে, গুদাম (WAREHOUSE) নয়?                                                                                                    | হ্যাঁ, শুধু BRANCH                                                                     |
| 13  | পেমেন্ট লোগোর ছবি (COD, bKash, Nagad, Visa, Mastercard) আপনি দেবেন? না দিলে নাম লেখা দেখাবে।                                                                                    | নাম লেখা, যতক্ষণ না ছবি আসে                                                            |
| 14  | "বেশি বিক্রি" সারি গত কত দিনের হিসাবে?                                                                                                                                          | ৩০ দিন, দিনে ৪ বার হিসাব (৬ ঘণ্টার cache)                                              |
| 15  | dev-এ `content:import-legacy`-এর পর নমুনা ডকুমেন্টগুলো প্রথম সংস্করণ হিসেবে publish হবে (production-এ শুধু draft) — ঠিক আছে?                                                    | হ্যাঁ                                                                                  |
| 16  | হোম ডকুমেন্ট publish না থাকলে কোডের স্থির কাঠামো (ক্যাটাগরি টাইল + নতুন প্রোডাক্ট, কোনো কনটেন্ট লেখা ছাড়া) দেখাবে — ঠিক আছে?                                                   | হ্যাঁ                                                                                  |
| 17  | Phase 9-এর `/admin/returns/policy` স্ক্রিন নতুন পেজ এডিটরে redirect হবে (অনুমোদনের নিয়ম একই থাকবে)?                                                                            | হ্যাঁ                                                                                  |
| 18  | অ্যাডমিন UI ইংরেজিতে, প্রতিটি ঘরের নিচে ছোট বাংলা সাহায্যের লেখা — এভাবে চলবে? (পুরো অ্যাডমিন দুই ভাষায় করা বড় কাজ, এই ফেজে নয়)                                              | হ্যাঁ                                                                                  |
