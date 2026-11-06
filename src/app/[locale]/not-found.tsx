import { getTranslations } from "next-intl/server";

import { Link } from "@/i18n/navigation";

export default async function LocaleNotFound() {
  const t = await getTranslations("errors");

  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="text-sm font-medium text-muted-foreground">404</p>
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{t("notFoundTitle")}</h1>
      <p className="text-muted-foreground">{t("notFoundBody")}</p>
      <Link
        href="/"
        className="mt-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
      >
        {t("backToHome")}
      </Link>
    </main>
  );
}
