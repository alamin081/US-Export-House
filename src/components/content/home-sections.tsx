import {
  ArrowRight,
  Banknote,
  PhoneCall,
  RotateCcw,
  ShieldCheck,
  Store,
  Truck,
  type LucideIcon,
} from "lucide-react";

import { MediaImage } from "@/components/shared/media-image";
import { CollectionTile, ProductGrid } from "@/components/shared/product-grid";
import { SectionHeading } from "@/components/shared/section-heading";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { cn } from "@/lib/utils";
import { cachedActiveCategories } from "@/modules/catalog/storefront-catalog.cached";
import { isLive } from "@/modules/content/content-checks";
import type { ContentLink, HomeSection } from "@/modules/content/content.schema";
import { contentParts } from "@/modules/content/content-checks";
import { linkResolver, loadProductRow } from "@/modules/content/content.storefront";
import type { PlaceholderValues } from "@/modules/content/placeholders";
import { ContentBlocks } from "./content-blocks";
import { HeroSlides, type HeroSlideView } from "./hero-slides";
import { filledText, localText } from "./rich-text";

const TRUST_ICON: Record<string, LucideIcon> = {
  cash: Banknote,
  return: RotateCcw,
  truck: Truck,
  shield: ShieldCheck,
  phone: PhoneCall,
  store: Store,
};

const CLOUDINARY_UPLOAD = /^(https:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\/)/;

/** Cloudinary resizes on delivery; other images are used as they are. */
function sized(url: string, width: number): string {
  return url.replace(CLOUDINARY_UPLOAD, `$1c_limit,w_${width}/`);
}

interface Context {
  locale: Locale;
  values: PlaceholderValues;
  now: Date;
  viewAll: string;
  resolve: Awaited<ReturnType<typeof linkResolver>>;
}

async function Section({ section, context }: { section: HomeSection; context: Context }) {
  const { locale, values, resolve } = context;
  const text = (value: Parameters<typeof localText>[0]) => filledText(value, locale, values);

  switch (section.type) {
    case "hero": {
      const slides: HeroSlideView[] = section.slides
        .filter((slide) => isLive(slide.schedule, context.now))
        .map((slide) => ({
          id: slide.id,
          desktop: sized(slide.desktop.url, 1920),
          mobile: slide.mobile === null ? null : sized(slide.mobile.url, 1080),
          alt: localText(slide.desktop.alt, locale),
          eyebrow: text(slide.eyebrow),
          title: text(slide.title),
          subtitle: text(slide.subtitle),
          textTone: slide.textTone,
          buttons: [slide.primary, slide.secondary].flatMap((button, index) => {
            const target = button === null ? null : resolve(button.link);
            return button === null || target === null
              ? []
              : [{ label: text(button.label), href: target.href, primary: index === 0 }];
          }),
        }));
      return slides.length === 0 ? null : <HeroSlides slides={slides} />;
    }

    case "categories": {
      const all = await cachedActiveCategories();
      const chosen =
        section.categoryIds.length === 0
          ? all.filter((category) => category.parentId === null)
          : section.categoryIds.flatMap((id) => all.filter((category) => category.id === id));
      if (chosen.length === 0) return null;
      return (
        <section className="site-container py-16 lg:py-20" data-testid="home-categories">
          {text(section.title) === "" ? null : (
            <SectionHeading
              eyebrow={text(section.eyebrow) || undefined}
              title={text(section.title)}
              description={text(section.description) || undefined}
            />
          )}
          <ul className="mt-10 grid grid-cols-2 gap-x-4 gap-y-8 sm:gap-x-6 lg:grid-cols-4">
            {chosen.map((category) => (
              <li key={category.id}>
                <Link href={`/category/${category.slug}`} className="group block">
                  <MediaImage
                    src={category.imageUrl ?? "/images/categories/formal-shirts.svg"}
                    alt={localText({ en: category.name.en, bn: category.name.bn ?? "" }, locale)}
                    ratio="product"
                    className="rounded-lg"
                    imageClassName="transition-transform duration-500 group-hover:scale-[1.03]"
                    sizes="(max-width: 640px) 50vw, 25vw"
                  />
                  <h3 className="mt-3.5 text-sm font-medium group-hover:underline group-hover:underline-offset-4">
                    {localText({ en: category.name.en, bn: category.name.bn ?? "" }, locale)}
                  </h3>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      );
    }

    case "products": {
      const products = await loadProductRow({
        rule: section.rule,
        tagSlug: section.tagSlug,
        categoryId: section.categoryId,
        productIds: section.productIds,
        limit: section.limit,
      });
      if (products.length === 0) return null;
      const viewAll =
        section.viewAll !== null
          ? resolve(section.viewAll)?.href
          : section.rule === "new"
            ? "/shop?sort=newest"
            : section.rule === "tag" && section.tagSlug !== null
              ? `/shop?tag=${encodeURIComponent(section.tagSlug)}`
              : "/shop";
      return (
        <section
          className="site-container pb-16 lg:pb-20"
          data-testid={`home-products-${section.id}`}
        >
          <SectionHeading
            title={text(section.title)}
            description={text(section.description) || undefined}
            {...(viewAll === undefined
              ? {}
              : { action: { label: context.viewAll, href: viewAll } })}
          />
          <ProductGrid products={products} className="mt-10" />
        </section>
      );
    }

    case "promo": {
      if (!isLive(section.schedule, context.now)) return null;
      const cta = section.cta === null ? null : resolve(section.cta.link);
      const dark = section.tone === "dark";
      return (
        <section className="site-container pb-16 lg:pb-20" data-testid={`home-promo-${section.id}`}>
          <div
            className={cn(
              "grid items-center gap-8 overflow-hidden rounded-lg p-6 sm:p-10 lg:grid-cols-2",
              dark ? "bg-primary text-primary-foreground" : "bg-accent/60",
            )}
          >
            <div>
              {text(section.eyebrow) === "" ? null : (
                <p className="text-xs font-medium tracking-[0.22em] uppercase opacity-80">
                  {text(section.eyebrow)}
                </p>
              )}
              <h2 className="mt-4 text-2xl font-semibold tracking-tight sm:text-3xl">
                {text(section.title)}
              </h2>
              {text(section.body) === "" ? null : (
                <p className="mt-3 max-w-md text-sm leading-relaxed opacity-80">
                  {text(section.body)}
                </p>
              )}
              {cta === null || section.cta === null ? null : (
                <Link
                  href={cta.href}
                  className="mt-6 inline-flex items-center gap-1.5 text-sm font-medium underline underline-offset-4"
                >
                  {text(section.cta.label)}
                  <ArrowRight aria-hidden="true" className="size-4" />
                </Link>
              )}
            </div>
            <MediaImage
              src={section.image.url}
              alt={localText(section.image.alt, locale)}
              ratio="video"
              className="rounded-md"
              sizes="(max-width: 1024px) 100vw, 50vw"
            />
          </div>
        </section>
      );
    }

    case "collections": {
      const items = section.items.flatMap((item) => {
        const target = resolve(item.link);
        return target === null ? [] : [{ item, href: target.href }];
      });
      if (items.length === 0) return null;
      return (
        <section className="site-container pb-16 lg:pb-20">
          <SectionHeading
            eyebrow={text(section.eyebrow) || undefined}
            title={text(section.title)}
            description={text(section.description) || undefined}
          />
          <ul className="mt-10 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {items.map(({ item, href }) => (
              <li key={item.id}>
                <CollectionTile
                  title={text(item.title)}
                  description={text(item.description)}
                  meta=""
                  href={href}
                  image={item.image.url}
                  imageAlt={localText(item.image.alt, locale)}
                />
              </li>
            ))}
          </ul>
        </section>
      );
    }

    case "story": {
      const cta = section.cta === null ? null : resolve(section.cta.link);
      return (
        <section className="border-y border-border bg-secondary/40" data-testid="home-story">
          <div
            className={cn(
              "site-container grid items-center gap-10 py-16 lg:gap-16 lg:py-20",
              section.image !== null && "lg:grid-cols-2",
            )}
          >
            {section.image === null ? null : (
              <MediaImage
                src={section.image.url}
                alt={localText(section.image.alt, locale)}
                ratio="video"
                className="rounded-lg"
                sizes="(max-width: 1024px) 100vw, 50vw"
              />
            )}
            <div>
              {text(section.eyebrow) === "" ? null : (
                <p className="text-xs font-medium tracking-[0.22em] text-muted-foreground uppercase">
                  {text(section.eyebrow)}
                </p>
              )}
              <h2 className="mt-4 text-2xl font-semibold tracking-tight sm:text-3xl">
                {text(section.title)}
              </h2>
              <div className="prose-site mt-4">
                <ContentBlocks blocks={section.blocks} locale={locale} values={values} />
              </div>
              {section.stats.length === 0 ? null : (
                <dl className="mt-8 grid grid-cols-3 gap-6 border-t border-border pt-6">
                  {section.stats.map((stat) => (
                    <div key={stat.id}>
                      <dt className="text-xs tracking-wide text-muted-foreground uppercase">
                        {text(stat.label)}
                      </dt>
                      <dd className="mt-1 text-2xl font-semibold tabular-nums">{stat.value}</dd>
                    </div>
                  ))}
                </dl>
              )}
              {cta === null || section.cta === null ? null : (
                <Link
                  href={cta.href}
                  className="mt-8 inline-flex items-center gap-1.5 text-sm font-medium underline underline-offset-4"
                >
                  {text(section.cta.label)}
                  <ArrowRight aria-hidden="true" className="size-4" />
                </Link>
              )}
            </div>
          </div>
        </section>
      );
    }

    case "trust":
      return (
        <section className="site-container py-12" data-testid="home-trust">
          <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {section.items.map((item) => {
              const Icon = TRUST_ICON[item.icon] ?? ShieldCheck;
              return (
                <li key={item.id} className="flex gap-3">
                  <Icon aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
                  <div>
                    <p className="text-sm font-medium">{text(item.title)}</p>
                    {text(item.text) === "" ? null : (
                      <p className="mt-1 text-xs text-muted-foreground">{text(item.text)}</p>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      );
  }
}

export async function HomeSections({
  sections,
  locale,
  values,
  viewAll,
  now = new Date(),
}: {
  sections: readonly HomeSection[];
  locale: Locale;
  values: PlaceholderValues;
  viewAll: string;
  now?: Date;
}) {
  const enabled = sections.filter((section) => section.enabled);
  const links: ContentLink[] = enabled.flatMap((section) => contentParts(section).links);
  const resolve = await linkResolver(links);
  const context: Context = { locale, values, now, viewAll, resolve };
  return (
    <>
      {enabled.map((section) => (
        <Section key={section.id} section={section} context={context} />
      ))}
    </>
  );
}
