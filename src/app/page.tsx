import Link from "next/link";
import { SITE } from "@/lib/site";
import { buildMetadata } from "@/lib/seo";
import { SearchBar } from "@/components/SearchBar";
import { DashboardGrid } from "@/components/DashboardGrid";
import { HookSection } from "@/components/HookSection";
import { InsightCard } from "@/components/InsightCard";
import { ChangeFeed } from "@/components/ChangeFeed";
import { PersonaRelevance } from "@/components/PersonaRelevance";
import { KeyDates } from "@/components/KeyDates";
import { KEY_DATES } from "@/lib/key-dates";
import { ChartCard } from "@/components/ChartCard";
import { AdSlot } from "@/components/AdSlot";
import { MethodologyNote } from "@/components/MethodologyNote";
import { EmployerTable } from "@/components/EmployerTable";
import { TrendLineChart, GroupedBarChart, HorizontalBarChart } from "@/components/charts/Charts";
import { buildMetrics, topSponsors, LAST_COMPLETE_FY, LAST_REFRESHED } from "@/lib/data";
import { buildInsights } from "@/lib/insights";
import { personaSummaries } from "@/lib/relevance";
import { partnersForPersona, type PersonaKey, type ResolvedPartner } from "@/lib/partners";
import { borderChartMarkers } from "@/lib/events";
import {
  enforcementChartData,
  borderYearlyData,
  borderDemographicsData,
  visaChartData,
  visaSeriesDefs,
  layoffsVsH1bData,
} from "@/lib/chart-data";
import { UPDATED } from "@/lib/dataset";
import { fiscalYearLabel, formatDate } from "@/lib/format";

export const metadata = buildMetadata({
  title: SITE.title,
  description: SITE.subtitle,
  path: "/",
});

function SectionHeading({
  eyebrow,
  title,
  href,
  hrefLabel,
}: {
  eyebrow: string;
  title: string;
  href: string;
  hrefLabel: string;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <div className="eyebrow mb-1">{eyebrow}</div>
        <h2 className="section-title">{title}</h2>
      </div>
      <Link href={href} className="text-sm font-semibold text-accent hover:text-accent-soft">
        {hrefLabel} →
      </Link>
    </div>
  );
}

export default function HomePage() {
  const metrics = buildMetrics();
  const featuredInsights = buildInsights().slice(0, 3);
  const sponsors = topSponsors(LAST_COMPLETE_FY);
  const enforcement = enforcementChartData();
  const border = borderYearlyData("southwest");
  const borderDemo = borderDemographicsData("southwest");
  const visa = visaChartData();
  const visaDefs = visaSeriesDefs();
  const layoffData = layoffsVsH1bData();
  const personas = personaSummaries();
  const resourcesByPersona = personas.reduce<Record<string, ResolvedPartner[]>>((acc, p) => {
    acc[p.key] = partnersForPersona(p.key as PersonaKey, 3);
    return acc;
  }, {});

  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden border-b border-white/5">
        <div className="container-page py-12 sm:py-16">
          <div className="mx-auto max-w-3xl text-center">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300">
              <span className="pulse-live" />
              {SITE.tagline}
            </div>
            <h1 className="text-balance text-4xl font-extrabold tracking-tight text-white sm:text-6xl">
              The Immigration{" "}
              <span className="bg-gradient-to-r from-accent via-accent-soft to-status-red bg-clip-text text-transparent">
                Clock
              </span>
            </h1>
            <p className="mx-auto mt-4 max-w-2xl text-balance text-base text-slate-300 sm:text-lg">
              {SITE.subtitle}
            </p>
            <div className="mx-auto mt-7 max-w-xl">
              <SearchBar />
            </div>
            <p className="mx-auto mt-4 max-w-2xl text-xs leading-relaxed text-slate-500">
              {SITE.heroDisclaimer}
            </p>
          </div>
        </div>
      </section>

      <div className="container-page space-y-12 py-10">
        {/* Counter grid */}
        <section>
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <div className="eyebrow mb-1">Latest available · auto-refreshed</div>
              <h2 className="section-title">The latest available numbers</h2>
            </div>
            <p className="max-w-md text-sm text-slate-400">
              Each counter shows the freshest reporting period for its source, labelled{" "}
              <strong className="text-white">Reported</strong>,{" "}
              <strong className="text-white">Projected</strong>, or{" "}
              <strong className="text-white">Estimated</strong> — and complete, YTD, preliminary, or point-in-time.
            </p>
          </div>
          <div className="mb-5 flex flex-col gap-2 rounded-xl border border-accent/15 bg-accent/[0.04] p-3 text-xs leading-relaxed text-slate-300 sm:flex-row sm:items-center sm:justify-between">
            <span>
              Datasets update monthly, quarterly, or annually. This is <strong className="text-white">not a real-time
              feed</strong> — we show the latest available reporting period and never present a projection as an
              official figure. <Link href="/data" className="link-accent">How freshness works →</Link>
            </span>
            <span className="shrink-0 rounded-md border border-white/10 bg-white/5 px-2 py-1 font-mono text-[11px] text-slate-400">
              Last refreshed {formatDate(LAST_REFRESHED)}
            </span>
          </div>
          <DashboardGrid metrics={metrics} />
        </section>

        {/* What does this mean for you? — persona relevance + contextual resources */}
        <PersonaRelevance personas={personas} resourcesByPersona={resourcesByPersona} />

        {/* Key dates — the honest urgency layer, routing to tax/legal partners */}
        <KeyDates dates={KEY_DATES} placement="home" limit={4} />


        {/* What changed this month */}
        <section>
          <SectionHeading
            eyebrow="What changed · auto-generated"
            title="What changed this month"
            href="/pulse"
            hrefLabel="Immigration Pulse"
          />
          <ChangeFeed limit={5} />
        </section>

        {/* Insights */}
        <section>
          <SectionHeading
            eyebrow="Insights · auto-generated"
            title="What the numbers say"
            href="/insights"
            hrefLabel="All insights"
          />
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {featuredInsights.map((insight) => (
              <InsightCard key={insight.key} insight={insight} />
            ))}
          </div>
        </section>

        {/* Hook 1 */}
        <HookSection title="Numbers People Argue About. Sources Everyone Can Check.">
          Immigration is one of America&rsquo;s most emotional debates. This site does not tell you what
          to think. It shows the public numbers behind enforcement, visas, jobs, wages, and workforce
          change &mdash; with a source and date on every figure.
        </HookSection>

        {/* Enforcement Pressure */}
        <section>
          <SectionHeading
            eyebrow="Enforcement Pressure"
            title="Arrests, removals, and detention"
            href="/immigration/enforcement-trends"
            hrefLabel="Full enforcement tracker"
          />
          <div className="grid gap-4 lg:grid-cols-2">
            <ChartCard
              title="ICE arrests &amp; removals by fiscal year"
              tooltip="Administrative arrests and removals reported by ICE. Arrests are not removals — see methodology."
              source={{ sourceName: "ICE Enforcement and Removal Statistics", sourceUrl: "https://www.ice.gov/statistics", sourceUpdatedAt: UPDATED.ice_stats }}
            >
              <TrendLineChart
                data={enforcement}
                xKey="label"
                series={[
                  { key: "Arrests", label: "Arrests", color: "#f43f5e" },
                  { key: "Removals", label: "Removals", color: "#f59e0b" },
                ]}
              />
            </ChartCard>
            <ChartCard
              title="Average daily detention population"
              tooltip="Point-in-time average — not a running fiscal-year total."
              source={{ sourceName: "ICE Enforcement and Removal Statistics", sourceUrl: "https://www.ice.gov/statistics", sourceUpdatedAt: UPDATED.ice_stats }}
            >
              <GroupedBarChart
                data={enforcement}
                xKey="label"
                series={[{ key: "Avg detention", label: "Avg daily detention", color: "#38bdf8" }]}
              />
            </ChartCard>
          </div>
        </section>

        {/* Hook 2 */}
        <HookSection
          title="Enforcement Is Rising. Track the Numbers."
          accent="red"
          cta={{ href: "/immigration/enforcement-trends", label: "Open the enforcement tracker" }}
        >
          Follow arrests, removals, detention trends, and border activity using the latest available
          public datasets. We report direction and magnitude &mdash; not blame.
        </HookSection>

        {/* Border Activity */}
        <section>
          <SectionHeading
            eyebrow="Border Activity"
            title="CBP encounters and who is arriving"
            href="/border/encounters"
            hrefLabel="Full border tracker"
          />
          <div className="grid gap-4 lg:grid-cols-2">
            <ChartCard
              title="Southwest border encounters by fiscal year"
              tooltip="An encounter is an event, not a unique person, and is not a deportation."
              source={{ sourceName: "CBP Nationwide Encounters", sourceUrl: "https://www.cbp.gov/newsroom/stats/nationwide-encounters", sourceUpdatedAt: UPDATED.cbp_encounters }}
            >
              <GroupedBarChart
                data={border}
                xKey="label"
                series={[{ key: "Encounters", label: "Encounters", color: "#38bdf8" }]}
                markers={borderChartMarkers()}
              />
            </ChartCard>
            <ChartCard
              title="Encounters by demographic"
              tooltip="Single adults, family units, and unaccompanied minors as reported by CBP."
              source={{ sourceName: "CBP Nationwide Encounters", sourceUrl: "https://www.cbp.gov/newsroom/stats/nationwide-encounters", sourceUpdatedAt: UPDATED.cbp_encounters }}
            >
              <GroupedBarChart
                data={borderDemo}
                xKey="label"
                series={[
                  { key: "Single adults", label: "Single adults", color: "#38bdf8" },
                  { key: "Family units", label: "Family units", color: "#a78bfa" },
                  { key: "Unaccompanied minors", label: "Minors", color: "#f59e0b" },
                ]}
              />
            </ChartCard>
          </div>
        </section>

        <AdSlot format="in-content" />

        {/* Visa Flow */}
        <section>
          <SectionHeading
            eyebrow="Visa Flow"
            title="Legal immigration and visa issuance"
            href="/visa/f1-student-visas"
            hrefLabel="Visa & student tracker"
          />
          <ChartCard
            title="Visa issuances by class and fiscal year"
            subtitle="H-1B, F-1 students, J-1 exchange, employment-based and family-based immigrant visas."
            tooltip="State Department visa issuances differ from USCIS petition approvals."
            source={{ sourceName: "Department of State Visa Statistics", sourceUrl: "https://travel.state.gov/content/travel/en/legal/visa-law0/visa-statistics.html", sourceUpdatedAt: UPDATED.dos_visa }}
          >
            <TrendLineChart data={visa} xKey="label" series={visaDefs} height={300} />
          </ChartCard>
        </section>

        {/* Hook 3 */}
        <HookSection
          title="Are Workers Being Replaced?"
          accent="amber"
          cta={{ href: "/layoffs-vs-h1b", label: "Compare layoffs and sponsorship" }}
        >
          Search employers, compare layoffs with visa sponsorship, and review public wage records. The
          data can raise questions, but it should not be used to make unsupported claims. Sponsorship and
          layoffs are shown side-by-side &mdash; without asserting causation.
        </HookSection>

        {/* Jobs & Workforce */}
        <section>
          <SectionHeading
            eyebrow="Jobs, Wages, and Sponsorship"
            title={`Top H-1B sponsors · ${fiscalYearLabel(LAST_COMPLETE_FY)}`}
            href="/h1b/top-sponsors"
            hrefLabel="All sponsors & salaries"
          />
          <div className="grid gap-4 lg:grid-cols-5">
            <div className="lg:col-span-3">
              <ChartCard
                title="H-1B approvals vs WARN layoffs"
                tooltip="Side-by-side comparison. High sponsorship and layoffs at the same firm does not prove one caused the other."
                source={{ sourceName: "USCIS + DOL + WARN", sourceUrl: "https://www.uscis.gov/tools/reports-and-studies/h-1b-employer-data-hub", sourceUpdatedAt: UPDATED.uscis_h1b }}
              >
                <GroupedBarChart
                  data={layoffData}
                  xKey="label"
                  series={[
                    { key: "H-1B approvals", label: "H-1B approvals", color: "#38bdf8" },
                    { key: "Layoffs (WARN)", label: "Layoffs (WARN)", color: "#f43f5e" },
                  ]}
                  height={300}
                />
              </ChartCard>
            </div>
            <div className="lg:col-span-2">
              <ChartCard
                title="Top sponsors by approvals"
                source={{ sourceName: "USCIS H-1B Employer Data Hub", sourceUrl: "https://www.uscis.gov/tools/reports-and-studies/h-1b-employer-data-hub", sourceUpdatedAt: UPDATED.uscis_h1b }}
              >
                <HorizontalBarChart
                  data={topSponsors(LAST_COMPLETE_FY).slice(0, 8).map((s) => ({ label: s.name.split(" ")[0], value: s.approvals }))}
                  labelKey="label"
                  valueKey="value"
                  height={300}
                  colorByIndex
                />
              </ChartCard>
            </div>
          </div>

          <div className="mt-4">
            <ChartCard title="Tracked H-1B employers" subtitle="Sortable. Download as CSV.">
              <EmployerTable rows={sponsors} caption={`Approvals, denials, approval rate and average offered wage — ${fiscalYearLabel(LAST_COMPLETE_FY)}.`} />
            </ChartCard>
          </div>

          <div className="mt-4">
            <MethodologyNote variant="warning">
              H-1B sponsorship does not automatically mean a U.S. worker was replaced. LCA filings are not
              approvals, and layoffs at a sponsoring company do not prove causation.
            </MethodologyNote>
          </div>
        </section>

        <AdSlot format="bottom-banner" />
      </div>
    </div>
  );
}
