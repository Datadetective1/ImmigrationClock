import Link from "next/link";
import { buildMetadata } from "@/lib/seo";
import { ogImagePath } from "@/lib/share";
import { PageHeader } from "@/components/PageHeader";
import { Stat, StatRow } from "@/components/Stat";
import { MethodologyNote } from "@/components/MethodologyNote";
import { WARN_META, WARN_STATES } from "@/lib/warn";
import { formatNumber } from "@/lib/format";

export const metadata = buildMetadata({
  title: "Free WARN Layoff API & Data",
  description:
    "A free, no-key, machine-readable feed of real WARN Act layoff notices — JSON and CSV, refreshed each build, licensed for open use.",
  path: "/developers",
  image: ogImagePath("page", "developers"),
  keywords: ["WARN API", "layoff data API", "WARN notices JSON", "WARN notices CSV", "free layoff dataset"],
});

function Code({ children }: { children: React.ReactNode }) {
  return (
    <pre className="overflow-x-auto scroll-thin rounded-xl border border-white/5 bg-black/30 p-4 text-xs leading-relaxed text-slate-200">
      <code>{children}</code>
    </pre>
  );
}

const FIELDS: [string, string][] = [
  ["employer", "Employer name as filed with the state"],
  ["normalized", "Standardized name used to join across datasets (H-1B, LCA)"],
  ["city", "Worksite city, where published"],
  ["county", "County/parish, where published"],
  ["state", "Two-letter USPS state code"],
  ["noticeDate", "ISO date the state received the notice"],
  ["effectiveDate", "ISO date the layoff takes effect, where published"],
  ["employees", "Employees affected (0 when not disclosed)"],
  ["layoffType", "Layoff / closure / relocation type, where published"],
  ["sourceUrl", "Link to the government portal the notice came from"],
];

export default function DevelopersPage() {
  return (
    <div>
      <PageHeader
        eyebrow="Open data"
        title="Free WARN layoff API"
        description="A machine-readable feed of real WARN Act layoff notices — no key, no signup, no paywall. JSON and CSV, refreshed on every build, with a link back to the government source on every row."
        crumbs={[
          { href: "/", label: "Home" },
          { href: "/developers", label: "Developers" },
        ]}
      >
        <StatRow>
          <Stat label="Notices" value={formatNumber(WARN_META.noticeCount)} />
          <Stat label="Employers" value={formatNumber(WARN_META.employerCount)} />
          <Stat label="Employees" value={formatNumber(WARN_META.employeesTotal)} />
          <Stat label="States" value={String(WARN_META.stateCount)} sub="Structured feeds" />
        </StatRow>
      </PageHeader>

      <div className="container-page max-w-3xl space-y-8 py-10">
        <section className="panel panel-pad">
          <h2 className="text-base font-semibold text-white">Endpoints</h2>
          <p className="mt-1 text-sm text-slate-400">Stable URLs. Fetch them from anywhere — server, notebook, or spreadsheet.</p>
          <div className="mt-4 space-y-3">
            <div className="flex flex-col gap-1 rounded-xl border border-white/5 bg-white/[0.02] p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="font-mono text-sm text-accent-soft">GET /api/warn.json</div>
                <div className="text-xs text-slate-500">Full feed: notices, per-employer aggregates, per-state summaries.</div>
              </div>
              <a href="/api/warn.json" className="link-accent whitespace-nowrap text-xs font-semibold">Open JSON →</a>
            </div>
            <div className="flex flex-col gap-1 rounded-xl border border-white/5 bg-white/[0.02] p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="font-mono text-sm text-accent-soft">GET /api/warn.csv</div>
                <div className="text-xs text-slate-500">Every notice as a flat CSV — one row per notice.</div>
              </div>
              <a href="/api/warn.csv" className="link-accent whitespace-nowrap text-xs font-semibold">Download CSV →</a>
            </div>
          </div>
        </section>

        <section className="panel panel-pad">
          <h2 className="mb-1 text-base font-semibold text-white">Intelligence API (v1)</h2>
          <p className="mb-4 text-sm text-slate-400">
            The change archive and employer signals as data. Read-only, free, no key. Versioned from
            the first release, and every response carries its source and a schema version so you can
            pin against it.
          </p>
          <div className="space-y-3">
            <div className="flex flex-col gap-1 rounded-xl border border-white/5 bg-white/[0.02] p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="font-mono text-sm text-accent-soft">GET /api/v1/changes</div>
                <div className="text-xs text-slate-500">
                  Recorded changes, newest first. Filter by <code>visa</code>, <code>form</code>,{" "}
                  <code>process</code>, <code>country</code>, <code>agency</code>,{" "}
                  <code>classification</code>, <code>status</code>, <code>since</code>,{" "}
                  <code>until</code>.
                </div>
              </div>
              <a href="/api/v1/changes?limit=3" className="link-accent whitespace-nowrap text-xs font-semibold">
                Open JSON →
              </a>
            </div>
            <div className="flex flex-col gap-1 rounded-xl border border-white/5 bg-white/[0.02] p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="font-mono text-sm text-accent-soft">GET /api/v1/monitor</div>
                <div className="text-xs text-slate-500">
                  The intelligence inbox. Pass the visas, countries, forms, processes, agencies or
                  topics a customer follows and get back what needs attention, what takes effect
                  soon, and the evidence behind each classification. The watchlist travels in the
                  query string and is never stored.
                </div>
              </div>
              <a
                href="/api/v1/monitor?follow=visa:h-1b&follow=form:i-129&limit=3"
                className="link-accent whitespace-nowrap text-xs font-semibold"
              >
                Open JSON →
              </a>
            </div>
            <div className="flex flex-col gap-1 rounded-xl border border-white/5 bg-white/[0.02] p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="font-mono text-sm text-accent-soft">GET /api/v1/changes/&#123;id&#125;</div>
                <div className="text-xs text-slate-500">
                  One change. The id is the six characters that end a /what-changed/ URL.
                </div>
              </div>
            </div>
            <div className="flex flex-col gap-1 rounded-xl border border-white/5 bg-white/[0.02] p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="font-mono text-sm text-accent-soft">
                  GET /api/v1/employers/&#123;slug&#125;/signals
                </div>
                <div className="text-xs text-slate-500">
                  H-1B sponsorship, WARN layoff filings, and the overlap between them — each signal
                  with its source fact, how the join was made, and the caveat that goes with it.
                </div>
              </div>
            </div>
            <div className="flex flex-col gap-1 rounded-xl border border-white/5 bg-white/[0.02] p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="font-mono text-sm text-accent-soft">GET /api/v1</div>
                <div className="text-xs text-slate-500">Endpoints, coverage counts and the boundary.</div>
              </div>
              <a href="/api/v1" className="link-accent whitespace-nowrap text-xs font-semibold">
                Open JSON →
              </a>
            </div>
          </div>

          <p className="mb-2 mt-5 text-xs font-semibold uppercase tracking-wide text-slate-500">Example</p>
          <Code>{`curl -s "https://immigrationclock.com/api/v1/changes?visa=h-1b&since=2026-01-01&limit=3" | jq '.data[] | {title, status, effectiveDate, source: .source.url}'`}</Code>

          <p className="mb-2 mt-5 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Three ways to integrate
          </p>
          <p className="text-sm text-slate-400">
            <strong className="text-white">1. Pull.</strong> Call{" "}
            <code>/api/v1/monitor</code> on a schedule with the dimensions your customer follows.
            Available today, free, no key.
          </p>
          <p className="mt-3 text-sm text-slate-400">
            <strong className="text-white">2. Embedded intelligence.</strong> Render our change
            records inside your own workflow. Every record carries its source URL, its effective
            date, its evidence quotes and its limitations, so it can be shown without you having to
            vouch for anything we have not measured.
          </p>
          <p className="mt-3 text-sm text-slate-400">
            <strong className="text-white">3. Push.</strong> Not offered. A webhook implies we will
            tell you about everything, and no dimension&rsquo;s measured recall supports that claim
            yet. When one does, it will say so here with the number beside it.
          </p>

          <p className="mb-2 mt-5 text-xs font-semibold uppercase tracking-wide text-slate-500">
            How good is the classification?
          </p>
          <p className="text-sm text-slate-400">
            Measured against hand-labelled records rather than asserted, and published per
            dimension. Filtering <code>visa=h-1b</code> scores 100% precision and 100% recall
            against 21 records labelled by hand. Country, form and process filters are not yet
            benchmarked and should not be assumed to match.
          </p>
          <p className="mt-3 text-sm text-slate-400">
            Every classification carries the verbatim quote it came from and the{" "}
            <code>method</code> that established it — whether the value appeared in the
            document&rsquo;s title, its summary, or only in a citation. Responses return the strong
            methods by default. Add <code>include=weak</code> to also receive matches drawn from
            footnotes and historical asides, each labelled as such.
          </p>
          <p className="mt-3 text-sm text-slate-400">
            Coverage is a separate question and is deliberately partial: a record is classified only
            where its own text names the value. An empty list therefore means the document did not
            name one — never that we judged it irrelevant. Read{" "}
            <code>classificationState</code> to tell that apart from a record nobody has examined.
          </p>

          <p className="mt-5 text-sm text-slate-400">
            <strong className="text-white">What it will not do.</strong> It describes published
            government material. It is not legal advice, it makes no determination about any
            individual or case, and it returns no personal data because it holds none. An absent
            field means the source did not state it — nothing is inferred to fill a gap.
          </p>
        </section>

        <section className="panel panel-pad">
          <h2 className="mb-3 text-base font-semibold text-white">Quick start</h2>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">curl</p>
          <Code>{`curl -s https://immigrationclock.com/api/warn.json | jq '.notices[0]'`}</Code>
          <p className="mb-2 mt-4 text-xs font-semibold uppercase tracking-wide text-slate-500">JavaScript</p>
          <Code>{`const res = await fetch("https://immigrationclock.com/api/warn.json");
const { notices } = await res.json();
// most recent first
console.log(notices.slice(0, 5));`}</Code>
          <p className="mb-2 mt-4 text-xs font-semibold uppercase tracking-wide text-slate-500">Python (pandas)</p>
          <Code>{`import pandas as pd
df = pd.read_csv("https://immigrationclock.com/api/warn.csv")
df.groupby("state")["employees"].sum().sort_values(ascending=False)`}</Code>
        </section>

        <section className="panel panel-pad">
          <h2 className="mb-3 text-base font-semibold text-white">Notice schema</h2>
          <div className="overflow-x-auto scroll-thin rounded-xl border border-white/5">
            <table className="w-full min-w-[420px] text-sm">
              <thead>
                <tr className="border-b border-white/10 bg-white/[0.03] text-left text-xs uppercase tracking-wider text-slate-400">
                  <th className="px-4 py-2.5 font-medium">Field</th>
                  <th className="px-4 py-2.5 font-medium">Description</th>
                </tr>
              </thead>
              <tbody>
                {FIELDS.map(([f, d]) => (
                  <tr key={f} className="border-b border-white/5 last:border-0">
                    <td className="px-4 py-2.5 font-mono text-xs text-accent-soft">{f}</td>
                    <td className="px-4 py-2.5 text-slate-300">{d}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-slate-500">
            The JSON payload also carries <span className="font-mono">byEmployer</span> (per-employer totals with the
            same <span className="font-mono">normalized</span> key) and <span className="font-mono">states</span>{" "}
            (per-state counts + the source portal), plus <span className="font-mono">generatedAt</span> and coverage metadata.
          </p>
        </section>

        <section className="panel panel-pad">
          <h2 className="mb-2 text-base font-semibold text-white">Coverage &amp; cadence</h2>
          <p className="text-sm leading-relaxed text-slate-300">
            There is no national WARN feed. This covers the states that publish a structured, machine-readable
            feed — currently {WARN_STATES.map((s) => s.code).join(", ")} — and grows as more states do. The data
            refreshes on every site build. For wider (PDF/HTML) state coverage, see the
            {" "}
            <Link href="/layoffs-vs-h1b" className="link-accent">layoffs vs H-1B</Link> analysis and the
            {" "}
            <Link href="/layoffs" className="link-accent">live feed</Link>.
          </p>
        </section>

        <MethodologyNote>
          Notices are public records filed by employers with state workforce agencies. The <span className="font-mono">normalized</span>{" "}
          field is a best-effort standardization for joining employers across datasets; verify against{" "}
          <span className="font-mono">sourceUrl</span> for anything consequential. WARN reports planned layoffs and
          does not indicate whether or how roles relate to visa sponsorship.
        </MethodologyNote>
      </div>
    </div>
  );
}
