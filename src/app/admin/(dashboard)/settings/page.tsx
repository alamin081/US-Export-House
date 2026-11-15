import Link from "next/link";
import { redirect } from "next/navigation";

import { cn } from "@/lib/utils";
import { requireStaffPage } from "@/modules/access/access.service";
import { canOpenSettings, getSettingsPage } from "@/modules/settings/settings-admin.service";
import { forPage } from "../page-guard";
import { SettingsForm } from "./settings-form";

export const metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

/**
 * Every business rule the system deliberately does not hard-code, in one
 * place (Phase 12). Secrets are not settings: they live in the environment,
 * and only whether each integration is connected is shown here.
 */
export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ group?: string }>;
}) {
  const staff = await requireStaffPage();
  if (!canOpenSettings(staff)) redirect("/admin/forbidden?need=settings.write");
  const [{ group: wanted }, page] = await Promise.all([
    searchParams,
    forPage(getSettingsPage(staff)),
  ]);
  const current = page.groups.find((group) => group.key === wanted) ?? page.groups[0];

  return (
    <div className="mx-auto max-w-6xl">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Changes apply straight away and are recorded in the audit log.{" "}
          <span lang="bn">পরিবর্তন সাথে সাথে কার্যকর হয় এবং audit log-এ থাকে।</span>
        </p>
      </header>
      <div className="mt-8 grid gap-6 lg:grid-cols-[14rem_1fr]">
        <nav aria-label="Setting groups" className="flex flex-col gap-1">
          {page.groups.map((group) => (
            <Link
              key={group.key}
              href={`/admin/settings?group=${group.key}`}
              aria-current={group.key === current?.key ? "page" : undefined}
              className={cn(
                "rounded-md px-3 py-2 text-sm",
                group.key === current?.key
                  ? "bg-secondary font-medium"
                  : "text-muted-foreground hover:bg-secondary/60",
              )}
              data-testid={`settings-group-${group.key}`}
            >
              {group.label}
              <span lang="bn" className="block text-xs text-muted-foreground">
                {group.bn}
              </span>
            </Link>
          ))}
          <section
            className="mt-6 rounded-lg border border-border bg-background p-3 text-xs"
            aria-labelledby="status-title"
          >
            <h2 id="status-title" className="font-semibold">
              Connections
            </h2>
            <p className="mt-1 text-muted-foreground">Keys and passwords are never shown here.</p>
            <ul className="mt-2 flex flex-col gap-1.5" data-testid="integration-status">
              {page.status.map((row) => (
                <li key={row.name} className="flex justify-between gap-2">
                  <span>{row.name}</span>
                  <span
                    className={
                      row.ok ? "text-emerald-700 dark:text-emerald-400" : "text-muted-foreground"
                    }
                  >
                    {row.value}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </nav>
        {current === undefined ? (
          <p className="text-sm text-muted-foreground">No settings for your role.</p>
        ) : (
          <SettingsForm
            key={current.key}
            group={current.key}
            title={current.label}
            settings={current.settings}
          />
        )}
      </div>
    </div>
  );
}
