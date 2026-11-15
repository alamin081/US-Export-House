import type { ReportDefinition, ReportFilters } from "@/modules/reports/reports.service";
import { RANGE_LABELS, RANGE_PRESETS } from "@/modules/reports/report-time";

interface Option {
  id: string;
  label: string;
}

const field =
  "h-9 rounded-md border border-input bg-background px-2.5 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";

/**
 * Filters in one row above the report, as a plain GET form so every view has
 * a shareable URL and works without JavaScript.
 */
export function ReportFiltersForm({
  definition,
  filters,
  locations,
  categories,
  showBucket,
  showDays,
}: {
  definition: ReportDefinition;
  filters: ReportFilters;
  locations: readonly Option[];
  categories: readonly Option[];
  showBucket: boolean;
  showDays: boolean;
}) {
  const range = filters.range;
  return (
    <form
      method="get"
      className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-background p-3 print:hidden"
      aria-label="Report filters"
    >
      {definition.filters.range ? (
        <>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Period
            <select name="range" defaultValue={range.preset} className={field}>
              {RANGE_PRESETS.map((preset) => (
                <option key={preset} value={preset}>
                  {RANGE_LABELS[preset]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            From
            <input type="date" name="from" defaultValue={range.fromKey} className={field} />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            To
            <input type="date" name="to" defaultValue={range.toKey} className={field} />
          </label>
        </>
      ) : null}
      {definition.filters.channel ? (
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Channel
          <select name="channel" defaultValue={filters.channel ?? ""} className={field}>
            <option value="">All</option>
            <option value="ONLINE">Online</option>
            <option value="STORE">In store</option>
          </select>
        </label>
      ) : null}
      {definition.filters.location && locations.length > 1 ? (
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Location
          <select name="location" defaultValue={filters.locationId ?? ""} className={field}>
            <option value="">All my locations</option>
            {locations.map((location) => (
              <option key={location.id} value={location.id}>
                {location.label}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {definition.filters.category ? (
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Category
          <select name="category" defaultValue={filters.categoryId ?? ""} className={field}>
            <option value="">All</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.label}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {showBucket ? (
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Group by
          <select name="group" defaultValue={filters.bucket} className={field}>
            <option value="day">Day</option>
            <option value="week">Week</option>
            <option value="month">Month</option>
          </select>
        </label>
      ) : null}
      {showDays ? (
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          No sale for (days)
          <input
            type="number"
            name="days"
            min={7}
            max={730}
            defaultValue={filters.days}
            className={`${field} w-24`}
          />
        </label>
      ) : null}
      <button
        type="submit"
        className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
      >
        Apply
      </button>
      {definition.filters.range ? (
        <p className="basis-full text-xs text-muted-foreground">
          From/To are used when the period is “Custom”. All times are Bangladesh time.
        </p>
      ) : null}
    </form>
  );
}
