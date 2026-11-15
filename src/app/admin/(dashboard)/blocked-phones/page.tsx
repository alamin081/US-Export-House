import { Badge } from "@/components/ui/badge";
import { requireStaffPage } from "@/modules/access/access.service";
import { listBlockedPhonesForStaff } from "@/modules/checkout-admin/checkout-admin.service";
import { forPage } from "../page-guard";
import { BlockPhoneForm, UnblockButton } from "./blocked-phone-forms";

export const metadata = { title: "Blocked phones" };

function dhaka(date: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Dhaka",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

/**
 * Numbers that may not order online. The customer only sees a general
 * "please call us" message; unblocking keeps the history.
 */
export default async function BlockedPhonesPage() {
  const staff = await requireStaffPage("customer.block");
  const rows = await forPage(listBlockedPhonesForStaff(staff));

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="text-2xl font-semibold tracking-tight">Blocked phones</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        A blocked number cannot place online orders. Every block and unblock is in the audit log.
      </p>

      <BlockPhoneForm />

      <div className="mt-8 overflow-x-auto rounded-lg border border-border bg-background">
        <table className="w-full min-w-[44rem] text-sm" data-testid="blocked-phones-table">
          <thead className="bg-secondary/60 text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-4 py-2.5 font-medium">Number</th>
              <th className="px-4 py-2.5 font-medium">Reason</th>
              <th className="px-4 py-2.5 font-medium">Blocked</th>
              <th className="px-4 py-2.5 font-medium" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-10 text-center text-muted-foreground">
                  No blocked numbers.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} className="border-t border-border">
                  <td className="px-4 py-3 font-medium tabular-nums">
                    {row.phone}
                    {row.unblockedAt === null ? null : (
                      <Badge variant="muted" className="ms-2">
                        Unblocked
                      </Badge>
                    )}
                  </td>
                  <td className="px-4 py-3">{row.reason}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {dhaka(row.createdAt)}
                    {row.blockedBy === null
                      ? ""
                      : ` · ${row.blockedBy.name ?? row.blockedBy.email}`}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {row.unblockedAt === null ? <UnblockButton id={row.id} /> : null}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
