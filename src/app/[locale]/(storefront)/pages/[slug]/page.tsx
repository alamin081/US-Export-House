import { notFound } from "next/navigation";

import { contentPageMetadata, ContentPageView } from "@/components/content/content-page";
import { PAGE_SLUG, SYSTEM_PAGES } from "@/modules/content/content.schema";

type Params = Promise<{ locale: string; slug: string }>;

/** Pages created in the admin content editor live at /pages/<slug> (Phase 12). */
function validSlug(slug: string): boolean {
  // System pages have their own address; /pages/about would be a duplicate.
  return PAGE_SLUG.test(slug) && !(slug in SYSTEM_PAGES);
}

export async function generateMetadata({ params }: { params: Params }) {
  const { slug, locale } = await params;
  if (!validSlug(slug)) return {};
  return contentPageMetadata(slug)({ params: Promise.resolve({ locale }) });
}

export default async function Page({ params }: { params: Params }) {
  const { slug, locale } = await params;
  if (!validSlug(slug)) notFound();
  return <ContentPageView slug={slug} params={Promise.resolve({ locale })} />;
}
