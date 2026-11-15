import { requireStaffPage } from "@/modules/access/access.service";
import { getTillContext } from "@/modules/pos/pos.service";
import { forPage } from "../page-guard";
import { Till } from "./till";

export const metadata = { title: "Till" };
export const dynamic = "force-dynamic";

/**
 * The shop till. Pick the location and counter (only the ones this staff
 * member may access), open the day if needed, then scan and sell. Works on a
 * tablet or a laptop with a USB barcode scanner.
 */
export default async function TillPage() {
  const staff = await requireStaffPage("pos.sell");
  const context = await forPage(getTillContext(staff));
  return (
    <div className="mx-auto max-w-7xl">
      <Till
        context={{
          ...context,
          locations: context.locations.map((location) => ({
            ...location,
            counters: location.counters.map((counter) => ({
              code: counter.code,
              session:
                counter.session === null
                  ? null
                  : { id: counter.session.id, reference: counter.session.reference },
            })),
          })),
        }}
      />
    </div>
  );
}
