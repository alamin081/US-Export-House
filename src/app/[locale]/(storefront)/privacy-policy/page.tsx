import { contentPageMetadata, ContentPageView } from "@/components/content/content-page";

/** Written and published in the admin content editor (Phase 12). */
export const generateMetadata = contentPageMetadata("privacy-policy");

export default function Page({ params }: { params: Promise<{ locale: string }> }) {
  return <ContentPageView slug="privacy-policy" params={params} />;
}
