import Link from "next/link";
import { buildMetadata } from "@/lib/seo";
import { PageHeader } from "@/components/PageHeader";
import { DashboardGrid } from "@/components/DashboardGrid";
import { SearchBar } from "@/components/SearchBar";
import { AdSlot } from "@/components/AdSlot";
import { ResourcePanel } from "@/components/ResourcePanel";
import { KeyDates } from "@/components/KeyDates";
import { MethodologyNote } from "@/components/MethodologyNote";
import { buildMetrics } from "@/lib/data";
import { partnersForPersona } from "@/lib/partners";
import { KEY_DATES } from "@/lib/key-dates";

export const metadata = buildMetadata({
  title: "Work & Visas — H-1B Sponsors, Salaries & Visa Data Hub",
  description:
    "Everything on U.S. work visas and the immigrant workforce: top H-1B sponsors, a searchable directory of 2,600+ employers, offered wages, F-1 student visas, and layoffs vs sponsorship — sourced and labelled.",
  path: "/work-visas",
  keywords: [
    "H-1B sponsors",
    "H-1B salaries",
    "visa sponsorship data",
    "F-1 student visas",
    "find visa sponsoring employers",
  ],
});

const CARDS = [
  {
    href: "/h1b/top-sponsors",
    title: "Top H-1B sponsors",
    desc: "The employers filing the most petitions — approvals, denials, approval rates, and offered wages.",
  },
  {
    href: "/h1b/employers",
    title: "Employer directory",
    desc: "Search 2,600+ real USCIS sponsors by name for their reported approvals and denials.",
  },
  {
    href: "/visa/f1-student-visas",
    title: "F-1 student visas",
    desc: "Department of State issuances by class and country, with year-over-year trends.",
  },
  {
    href: "/layoffs-vs-h1b",
    title: "Layoffs vs H-1B",
    desc: "Sponsorship volume and WARN layoff notices shown side by side — without asserting causation.",
  },
];

export default function WorkVisasHubPage() {
  const metrics = buildMetrics().filter((m) => m.group === "visa" || m.group === "workforce");

  return (
    <div>
      <PageHeader
        eyebrow="Section"
        title="Work & Visas"
        description="Visa sponsorship, salaries, students, and the immigrant workforce — the data people use when making real decisions about jobs, hiring, and the H-1B journey. Every figure is sourced and labelled."
        crumbs={[
          { href: "/", label: "Home" },
          { href: "/work-visas", label: "Work & Visas" },
        ]}
        share
      />

      <div className="container-page space-y-8 py-10">
        <section className="panel p-5 sm:p-6">
          <h2 className="text-base font-semibold text-white">Look up an employer</h2>
          <p className="mt-1 text-sm text-slate-400">
            Search any of 2,600+ H-1B sponsors, plus states, countries, visa types, and job titles.
          </p>
          <div className="mt-3">
            <SearchBar />
          </div>
        </section>

        <section>
          <div className="mb-4">
            <div className="eyebrow mb-1">Latest available · auto-refreshed</div>
            <h2 className="section-title">Key visa &amp; workforce numbers</h2>
          </div>
          <DashboardGrid metrics={metrics} />
        </section>

        <section>
          <h2 className="section-title mb-4">Open a tracker</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {CARDS.map((c) => (
              <Link
                key={c.href}
                href={c.href}
                className="group flex h-full flex-col rounded-xl border border-white/10 bg-white/[0.02] p-5 transition-colors hover:border-accent/40 hover:bg-accent/[0.04]"
              >
                <h3 className="text-base font-semibold text-white">{c.title}</h3>
                <p className="mt-1.5 flex-1 text-sm leading-relaxed text-slate-400">{c.desc}</p>
                <span className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-accent transition-colors group-hover:text-accent-soft">
                  Open
                  <span aria-hidden className="transition-transform group-hover:translate-x-0.5">→</span>
                </span>
              </Link>
            ))}
          </div>
        </section>

        <KeyDates
          dates={KEY_DATES}
          placement="work-visas-hub"
          subtitle="H-1B, green-card, tax, and student deadlines — counted down from today."
        />

        <ResourcePanel
          partners={partnersForPersona("h1b-worker", 3)}
          placement="work-visas-hub"
          title="On the H-1B or green-card journey?"
          subtitle="Legal help for petitions and transfers, U.S. tax filing, and moving money across borders."
        />

        <AdSlot format="in-content" />

        <MethodologyNote variant="warning">
          H-1B approvals (USCIS) differ from visa issuances (State Department) and from LCA filings (DOL).
          Sponsorship volume alone does not indicate that any U.S. worker was displaced, and a tracked
          subset of employers is not the full national total.
        </MethodologyNote>
      </div>
    </div>
  );
}
