import "server-only";

import type { Locale } from "@/i18n/routing";
import { PAYMENT_METHOD_LABELS } from "@/modules/settings/site-settings";
import { isLive } from "./content-checks";
import type { ContentLink, Localized, MenuItem } from "./content.schema";
import { fillPlaceholders } from "./placeholders";
import { plainText } from "./inline";
import {
  cachedBranches,
  cachedContentSettings,
  contentNow,
  linkResolver,
  loadContent,
  pick,
  type LinkResolver,
} from "./content.storefront";

/**
 * Header and footer data for the storefront, already resolved for one
 * language: plain strings and hrefs, nothing that points at hidden content.
 */

export interface NavLinkView {
  id: string;
  label: string;
  href: string;
}

export interface NavItemView extends NavLinkView {
  children: NavLinkView[];
}

function navLink(
  item: { id: string; enabled: boolean; label: Localized; link: ContentLink },
  resolve: LinkResolver,
  locale: Locale,
): NavLinkView | null {
  if (!item.enabled) return null;
  const target = resolve(item.link);
  if (target === null) return null;
  const label = pick(item.label, locale) || pick(target.name, locale);
  return label === "" ? null : { id: item.id, label, href: target.href };
}

export async function loadHeader(locale: Locale) {
  const [announcements, menu, settings, now] = await Promise.all([
    loadContent("announcements", "ANNOUNCEMENTS"),
    loadContent("menu.header", "MENU"),
    cachedContentSettings(),
    contentNow(),
  ]);
  const links: ContentLink[] = [
    ...(announcements?.messages.flatMap((message) =>
      message.link === null ? [] : [message.link],
    ) ?? []),
    ...(menu?.items.flatMap((item) => [item.link, ...item.children.map((child) => child.link)]) ??
      []),
  ];
  const resolve = await linkResolver(links);
  const messages = (announcements?.messages ?? [])
    .filter((message) => message.enabled && isLive(message.schedule, now))
    .map((message) => ({
      id: message.id,
      text: plainText(fillPlaceholders(pick(message.text, locale), settings.placeholders, locale)),
      href: resolve(message.link)?.href ?? null,
      tone: message.tone,
    }));
  const items: NavItemView[] = (menu?.items ?? []).flatMap((item: MenuItem) => {
    const top = navLink(item, resolve, locale);
    if (top === null) return [];
    const children = item.children.flatMap((child) => {
      const view = navLink(child, resolve, locale);
      return view === null ? [] : [view];
    });
    return [{ ...top, children }];
  });
  return { messages, items, hasMenu: menu !== null };
}

export async function loadFooter(locale: Locale) {
  const [footer, settings, branches] = await Promise.all([
    loadContent("footer", "FOOTER"),
    cachedContentSettings(),
    cachedBranches(),
  ]);
  const resolve = await linkResolver(
    footer?.columns.flatMap((column) => column.links.map((link) => link.link)) ?? [],
  );
  const { store, site, placeholders } = settings;
  const columns = (footer?.columns ?? [])
    .map((column) => ({
      id: column.id,
      title: pick(column.title, locale),
      links: column.links.flatMap((link) => {
        const view = navLink(link, resolve, locale);
        return view === null ? [] : [view];
      }),
    }))
    .filter((column) => column.links.length > 0);
  const social = [
    { key: "facebook", label: "Facebook", href: site.facebookUrl },
    { key: "instagram", label: "Instagram", href: site.instagramUrl },
    { key: "youtube", label: "YouTube", href: site.youtubeUrl },
    { key: "tiktok", label: "TikTok", href: site.tiktokUrl },
    {
      key: "whatsapp",
      label: "WhatsApp",
      href: store.whatsapp === "" ? "" : `https://wa.me/${store.whatsapp.replace(/\D/g, "")}`,
    },
  ].filter((entry) => entry.href !== "");
  return {
    blurb:
      footer === null ? "" : fillPlaceholders(pick(footer.blurb, locale), placeholders, locale),
    columns,
    branches:
      footer === null || footer.showBranches
        ? branches.map((branch) => ({
            id: branch.id,
            name: locale === "bn" && branch.nameBn ? branch.nameBn : branch.nameEn,
            address:
              (locale === "bn" && branch.addressBn ? branch.addressBn : branch.addressEn) ?? "",
            phone: branch.phone ?? "",
            hours: (locale === "bn" && branch.hoursBn ? branch.hoursBn : branch.hoursEn) ?? "",
            mapUrl: branch.mapUrl ?? "",
          }))
        : [],
    paymentMethods:
      footer !== null && !footer.showPaymentMethods
        ? []
        : site.footerPaymentMethods.map((key) => ({
            key,
            label: PAYMENT_METHOD_LABELS[key][locale],
          })),
    social,
    store: {
      name: locale === "bn" && store.nameBn ? store.nameBn : store.nameEn,
      address: locale === "bn" && store.addressBn ? store.addressBn : store.addressEn,
      phone: placeholders.storePhone,
      whatsapp: store.whatsapp,
      logoUrl: store.logoUrl,
    },
  };
}

export type FooterView = Awaited<ReturnType<typeof loadFooter>>;
