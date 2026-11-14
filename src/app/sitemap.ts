import type { MetadataRoute } from "next";

import { clientEnv } from "@/config/env";
import { cachedSitemapEntries } from "@/modules/catalog/storefront-catalog.cached";

/**
 * sitemap.xml: home, shop, every active category and every published product,
 * each in Bengali (no prefix, the default) and English (/en), with hreflang
 * alternates. Refreshed with the catalogue cache tags.
 */
export const revalidate = 3600;

function entry(path: string, lastModified?: string): MetadataRoute.Sitemap[number] {
  const base = clientEnv.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  const bn = `${base}${path === "/" ? "" : path}` || base;
  const en = `${base}/en${path === "/" ? "" : path}`;
  return {
    url: bn,
    ...(lastModified === undefined ? {} : { lastModified }),
    alternates: { languages: { "bn-BD": bn, "en-BD": en, "x-default": bn } },
  };
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const { products, categories } = await cachedSitemapEntries();
  const paths = [
    entry("/"),
    entry("/shop"),
    ...categories.map((category) => entry(`/category/${category.slug}`, category.updatedAt)),
    ...products.map((product) => entry(`/product/${product.slug}`, product.updatedAt)),
  ];
  // One <url> per language, each listing both alternates.
  return paths.flatMap((item) => {
    const english = item.alternates?.languages?.["en-BD"];
    return english === undefined ? [item] : [item, { ...item, url: String(english) }];
  });
}
