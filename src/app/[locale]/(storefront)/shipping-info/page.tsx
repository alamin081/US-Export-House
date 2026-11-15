import { contentPageMetadata, ContentPageView } from "@/components/content/content-page";

/** Written and published in the admin content editor (Phase 12). */
export const generateMetadata = contentPageMetadata("shipping-info");

export default function Page({ params }: { params: Promise<{ locale: string }> }) {
  return <ContentPageView slug="shipping-info" params={params} />;
}
