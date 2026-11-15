import { redirect } from "@/i18n/navigation";

/**
 * Customer accounts arrive in Phase 12.5. Until then this address sends
 * visitors to order tracking, which works without an account.
 */
export default async function AccountPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  redirect({ href: "/track-order", locale });
}
