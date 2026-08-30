// =============================================================================
// CHART DATA — the numbers under the picture
//
// WHAT THIS FIXES
// ---------------
// Measured on the served build: on eight of ten chart routes, 79-95% of the
// values a chart plots existed only inside the RSC flight payload — present in
// the document, invisible to every reader. /border/encounters showed 5 of 92
// datapoints; the ten /country/* pages showed 1 of 11.
//
// Three readers were served badly by that, in different ways:
//
//   • With JavaScript off, the page showed a placeholder that said "Loading
//     chart…" and never resolved — a promise it could not keep.
//   • A screen reader met the chart's own SVG, which carries no role and no
//     label, and read the axis ticks as one unbroken string:
//     "FY21FY22FY23FY24FY25FY26080K160K240K320KH-1B visasF-1 visas".
//   • A crawler saw 3-6 kB of visible text against 36-63 kB of script on the
//     site's own data pages.
//
// WHY IT LIVES HERE AND NOT ON EACH ROUTE
// ---------------------------------------
// The chart already receives the data. Deriving the table from those same props
// means one implementation covers every route, the numbers cannot drift from
// what is plotted, and no call site has to pass its data twice. LazyCharts is a
// client component, but Next still prerenders client components into the static
// HTML — only the `ssr:false` recharts import is excluded — so this markup ships
// in the document.
//
// THE REPRESENTATION FOLLOWS THE DATA
// -----------------------------------
// Every chart on the site today is fed between 6 and 50 rows, so all of them
// land in the first two buckets. The third exists so that stays true if a
// dataset grows: dumping hundreds of rows into every document is the failure
// mode this component is meant to avoid, not an outcome to accept.
// =============================================================================

import { formatNumber } from "@/lib/format";

/** At or below this, the whole table renders. */
const FULL_TABLE_MAX = 24;
/** Above FULL_TABLE_MAX and at or below this, the table renders in a capped scroller. */
const SCROLL_TABLE_MAX = 60;

export interface DataColumn {
  key: string;
  label: string;
  /** Right-aligned, monospaced, and formatted as a figure. */
  numeric?: boolean;
  currency?: boolean;
}

type Row = Record<string, number | string | boolean>;

function cell(v: number | string | boolean | undefined, col: DataColumn): string {
  if (v === undefined || v === null || v === "") return "—";
  if (!col.numeric) return String(v);
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v);
  return col.currency ? `$${formatNumber(n)}` : formatNumber(n);
}

/**
 * One line a reader gets without expanding anything, and a crawler gets without
 * parsing a table: how many rows, over what span, measuring what.
 */
function summarize(rows: Row[], cols: DataColumn[]): string {
  if (rows.length === 0) return "";
  const [labelCol, ...valueCols] = cols;
  const first = String(rows[0][labelCol.key] ?? "");
  const last = String(rows[rows.length - 1][labelCol.key] ?? "");
  const span = first && last && first !== last ? `${first} to ${last}` : first || last;
  const measures = valueCols.map((c) => c.label).join(", ");
  return `${rows.length} row${rows.length === 1 ? "" : "s"}${span ? ` · ${span}` : ""}${
    measures ? ` · ${measures}` : ""
  }`;
}

/** Highest and lowest value of each measure, for the case where the table is too long to render. */
function extremes(rows: Row[], cols: DataColumn[]) {
  const [labelCol, ...valueCols] = cols;
  return valueCols.map((c) => {
    const points = rows
      .map((r) => ({ label: String(r[labelCol.key] ?? ""), n: Number(r[c.key]) }))
      .filter((p) => Number.isFinite(p.n));
    if (points.length === 0) return null;
    const hi = points.reduce((a, b) => (b.n > a.n ? b : a));
    const lo = points.reduce((a, b) => (b.n < a.n ? b : a));
    return { col: c, hi, lo, total: points.reduce((s, p) => s + p.n, 0) };
  });
}

/**
 * The numbers behind a chart, collapsed by default.
 *
 * `<details>` is deliberate: it is native HTML, so it opens without JavaScript,
 * it is keyboard-operable and announced as a disclosure with no ARIA of our own,
 * and search engines index content inside it. Collapsed, it costs one line of
 * page height — the chart stays the thing the reader looks at.
 */
export function ChartData({
  rows,
  columns,
  caption,
}: {
  rows: Row[];
  columns: DataColumn[];
  /** What the figures are, in the page's own words. Read by screen readers. */
  caption?: string;
}) {
  if (rows.length === 0 || columns.length < 2) return null;
  const tooLong = rows.length > SCROLL_TABLE_MAX;
  const scroller = rows.length > FULL_TABLE_MAX;
  const summary = summarize(rows, columns);

  return (
    <details className="mt-3 border-t border-white/5 pt-3">
      <summary className="cursor-pointer list-none text-xs font-semibold text-accent transition-colors hover:text-accent-soft [&::-webkit-details-marker]:hidden">
        <span aria-hidden>▸ </span>
        View the {rows.length} data point{rows.length === 1 ? "" : "s"} behind this chart
      </summary>

      {/* Present whether or not the disclosure is open, and whether or not the
          chart ever renders — this is the sentence that keeps the page useful
          when the picture is missing. */}
      <p className="mt-2 text-xs leading-relaxed text-slate-500">
        {caption ? `${caption}. ` : ""}
        {summary}.
      </p>

      {tooLong ? (
        <div className="mt-2 space-y-1.5">
          {/* Above the scroll-table threshold the honest move is to characterise
              the series rather than paste it. Nothing here is invented: every
              figure is read straight off the rows the chart plots. */}
          {extremes(rows, columns).map((e) =>
            e ? (
              <p key={e.col.key} className="text-xs text-slate-400">
                <span className="font-medium text-slate-300">{e.col.label}</span>: highest{" "}
                <span className="font-mono tabular-nums text-white">{cell(e.hi.n, e.col)}</span> ({e.hi.label}),
                lowest <span className="font-mono tabular-nums text-white">{cell(e.lo.n, e.col)}</span> ({e.lo.label}),
                total <span className="font-mono tabular-nums text-white">{cell(e.total, e.col)}</span>.
              </p>
            ) : null
          )}
        </div>
      ) : (
        <div
          className={`mt-2 overflow-x-auto scroll-thin rounded-xl border border-white/5 ${
            scroller ? "max-h-80 overflow-y-auto" : ""
          }`}
        >
          <table className="w-full text-sm">
            <caption className="sr-only">{caption ?? summary}</caption>
            <thead>
              <tr className="border-b border-white/10 bg-white/[0.03] text-left text-xs uppercase tracking-wider text-slate-400">
                {columns.map((c) => (
                  <th
                    key={c.key}
                    scope="col"
                    className={`px-4 py-2.5 font-medium ${c.numeric ? "text-right" : ""}`}
                  >
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-b border-white/5 last:border-0">
                  {columns.map((c, j) =>
                    // The first column labels its row, so it is a real header
                    // cell. That is what lets a screen reader announce
                    // "FY24 — H-1B visas 283,397" instead of four bare numbers.
                    j === 0 ? (
                      <th
                        key={c.key}
                        scope="row"
                        className="px-4 py-2 text-left font-medium text-white"
                      >
                        {cell(r[c.key], c)}
                      </th>
                    ) : (
                      <td
                        key={c.key}
                        className={`px-4 py-2 ${
                          c.numeric
                            ? "text-right font-mono tabular-nums text-slate-200"
                            : "text-slate-200"
                        }`}
                      >
                        {cell(r[c.key], c)}
                      </td>
                    )
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </details>
  );
}

export type { Row as ChartDataRow };
