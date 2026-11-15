import type { ReportChart as ChartSpec } from "@/modules/reports/reports.service";
import { compact, count, money } from "./format";

/**
 * Report charts, rendered on the server as SVG (no chart library).
 *
 * Follows the data-viz rules: one axis, thin marks (columns/bars ≤ 24px with a
 * 4px rounded data end, square at the baseline), a 2px surface gap between
 * stacked segments, hairline recessive grid, colours from the validated
 * categorical slots (--viz-1, --viz-2), a legend for two or more series, text
 * in text colours only. Every mark has a hit area the full band wide with a
 * native tooltip; the table under each chart carries the same numbers.
 */

const SERIES_VARS = ["var(--viz-1)", "var(--viz-2)"];

function niceMax(value: number): number {
  if (value <= 0) return 1;
  const exponent = 10 ** Math.floor(Math.log10(value));
  const fraction = value / exponent;
  const step =
    fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 2.5 ? 2.5 : fraction <= 5 ? 5 : 10;
  return step * exponent;
}

/** Top-rounded rectangle (rounded data end, square at the baseline). */
function columnPath(x: number, y: number, width: number, height: number, round: boolean): string {
  const r = round ? Math.min(4, width / 2, height) : 0;
  return [
    `M${x},${y + height}`,
    `V${y + r}`,
    r > 0 ? `Q${x},${y} ${x + r},${y}` : "",
    `H${x + width - r}`,
    r > 0 ? `Q${x + width},${y} ${x + width},${y + r}` : "",
    `V${y + height}`,
    "Z",
  ].join(" ");
}

/** Right-rounded rectangle for horizontal bars. */
function barPath(x: number, y: number, width: number, height: number): string {
  const r = Math.min(4, height / 2, width);
  return [
    `M${x},${y}`,
    `H${x + width - r}`,
    r > 0 ? `Q${x + width},${y} ${x + width},${y + r}` : "",
    `V${y + height - r}`,
    r > 0 ? `Q${x + width},${y + height} ${x + width - r},${y + height}` : "",
    `H${x}`,
    "Z",
  ].join(" ");
}

function Legend({ chart }: { chart: ChartSpec }) {
  if (chart.series.length < 2) return null;
  return (
    <ul className="flex flex-wrap gap-4 text-xs text-muted-foreground" aria-label="Legend">
      {chart.series.map((series, index) => (
        <li key={series.key} className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="inline-block size-2.5 rounded-sm"
            style={{ background: SERIES_VARS[index % SERIES_VARS.length] }}
          />
          {series.label}
        </li>
      ))}
    </ul>
  );
}

function ColumnChart({ chart }: { chart: ChartSpec }) {
  const width = 760;
  const height = 240;
  const left = 56;
  const bottom = 28;
  const top = 12;
  const plotW = width - left - 8;
  const plotH = height - top - bottom;
  const totals = chart.points.map((point) =>
    point.values.reduce((sum, value) => sum + Math.max(0, value), 0),
  );
  const max = niceMax(Math.max(0, ...totals));
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((fraction) => fraction * max);
  const band = plotW / Math.max(1, chart.points.length);
  const barW = Math.max(2, Math.min(24, band * 0.6));
  const labelEvery = Math.max(1, Math.ceil(chart.points.length / 10));
  const fmt = (value: number) => (chart.valueKind === "money" ? money(value) : count(value));
  const hasNegative = chart.points.some((point) => point.values.some((value) => value < 0));

  return (
    <>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-auto w-full"
        role="img"
        aria-label={chart.title}
      >
        {ticks.map((tick) => {
          const y = top + plotH - (tick / max) * plotH;
          return (
            <g key={tick}>
              <line x1={left} x2={width - 8} y1={y} y2={y} stroke="var(--border)" strokeWidth={1} />
              <text
                x={left - 8}
                y={y}
                textAnchor="end"
                dominantBaseline="middle"
                className="fill-muted-foreground text-[10px]"
              >
                {compact(tick, chart.valueKind)}
              </text>
            </g>
          );
        })}
        {chart.points.map((point, index) => {
          const x = left + index * band + (band - barW) / 2;
          let y = top + plotH;
          const positive = point.values.map((value) => Math.max(0, value));
          const lastIndex = positive.reduce((last, value, i) => (value > 0 ? i : last), -1);
          const tooltip = [
            point.label,
            ...chart.series.map((series, i) => `${series.label}: ${fmt(point.values[i] ?? 0)}`),
          ].join("\n");
          return (
            <g key={`${point.label}-${index}`} className="group">
              <title>{tooltip}</title>
              <rect
                x={left + index * band}
                y={top}
                width={band}
                height={plotH}
                fill="transparent"
                className="group-hover:fill-[color-mix(in_oklab,var(--muted)_70%,transparent)]"
              />
              {positive.map((value, i) => {
                if (value <= 0) return null;
                const h = (value / max) * plotH;
                y -= h;
                // A 2px surface gap separates a segment from the one below it.
                const segmentH = Math.max(0, h - (i > 0 ? 2 : 0));
                const path = columnPath(x, y + (i > 0 ? 2 : 0), barW, segmentH, i === lastIndex);
                return (
                  <path
                    key={chart.series[i]?.key ?? i}
                    d={path}
                    fill={SERIES_VARS[i % SERIES_VARS.length]}
                  />
                );
              })}
              {index % labelEvery === 0 ? (
                <text
                  x={left + index * band + band / 2}
                  y={height - 8}
                  textAnchor="middle"
                  className="fill-muted-foreground text-[10px]"
                >
                  {point.label.length > 10 ? point.label.slice(5, 10) : point.label}
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>
      {hasNegative ? (
        <p className="mt-1 text-xs text-muted-foreground">
          Days with a negative total are drawn at zero; the table shows the exact figures.
        </p>
      ) : null}
    </>
  );
}

function BarChart({ chart }: { chart: ChartSpec }) {
  const rowH = 30;
  const barH = Math.min(18, rowH - 10);
  const labelW = 200;
  const valueW = 96;
  const width = 760;
  const height = Math.max(rowH, chart.points.length * rowH);
  const plotW = width - labelW - valueW;
  const max = Math.max(1, ...chart.points.map((point) => Math.max(0, point.values[0] ?? 0)));
  const fmt = (value: number) => (chart.valueKind === "money" ? money(value) : count(value));

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="h-auto w-full"
      role="img"
      aria-label={chart.title}
    >
      <line x1={labelW} x2={labelW} y1={0} y2={height} stroke="var(--border)" strokeWidth={1} />
      {chart.points.map((point, index) => {
        const value = point.values[0] ?? 0;
        const y = index * rowH;
        const w = (Math.max(0, value) / max) * plotW;
        const label = point.label.length > 30 ? `${point.label.slice(0, 29)}…` : point.label;
        return (
          <g key={`${point.label}-${index}`} className="group">
            <title>{`${point.label}: ${fmt(value)}`}</title>
            <rect
              x={0}
              y={y}
              width={width}
              height={rowH}
              fill="transparent"
              className="group-hover:fill-[color-mix(in_oklab,var(--muted)_70%,transparent)]"
            />
            <text
              x={labelW - 8}
              y={y + rowH / 2}
              textAnchor="end"
              dominantBaseline="middle"
              className="fill-foreground text-[11px]"
            >
              {label}
            </text>
            {w > 0 ? (
              <path d={barPath(labelW, y + (rowH - barH) / 2, w, barH)} fill="var(--viz-1)" />
            ) : null}
            <text
              x={labelW + w + 6}
              y={y + rowH / 2}
              dominantBaseline="middle"
              className="fill-muted-foreground text-[11px] tabular-nums"
            >
              {fmt(value)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export function ReportChartView({ chart }: { chart: ChartSpec }) {
  if (chart.points.length === 0) return null;
  const allZero = chart.points.every((point) => point.values.every((value) => value === 0));
  return (
    <figure className="rounded-lg border border-border bg-background p-5 print:break-inside-avoid">
      <figcaption className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <span className="text-sm font-semibold">{chart.title}</span>
        <Legend chart={chart} />
      </figcaption>
      {allZero ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          Nothing to show for this period.
        </p>
      ) : chart.kind === "columns" ? (
        <ColumnChart chart={chart} />
      ) : (
        <BarChart chart={chart} />
      )}
    </figure>
  );
}
