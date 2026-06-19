import Link from "next/link";
import { buildMetadata } from "@/lib/seo";
import { PageHeader } from "@/components/PageHeader";
import { DashboardGrid } from "@/components/DashboardGrid";
import { AdSlot } from "@/components/AdSlot";
import { MethodologyNote } from "@/components/MethodologyNote";
import { buildMetrics } from "@/lib/data";

export const metadata = buildMetadata({
  title: "Enforcement & Border — ICE, Detention & CBP Data Hub",
  description:
    "The U.S. immigration enforcement and border picture at a glance: ICE arrests, removals, and detention, CBP encounters and demographics, and a policy timeline — every figure sourced and labelled.",
  path: "/enforcement",
  keywords: [
    "immigration enforcement data",
    "ICE arrests removals detention",
    "CBP border encounters",
    "deportation statistics",
  ],
});

const CARDS = [
  {
    href: "/immigration/enforcement-trends",
    title: "Enforcement trends",
    desc: "ICE administrative arrests, removals, and average daily detention by fiscal year.",
  },
  {
    href: "/border/encounters",
    title: "Border encounters",
    desc: "CBP nationwide encounters, demographics, and who is arriving.",
  },
  {
    href: "/timeline",
    title: "Policy timeline",
    desc: "Major immigration policy events overlaid on the data.",
  },
];

export default function EnforcementHubPage() {
  const metrics = buildMetrics().filter((m) => m.group === "enforcement" || m.group === "border");

  return (
    <div>
      <PageHeader
        eyebrow="Section"
        title="Enforcement & Border"
        description="Arrests, removals, detention, and border activity — the public numbers behind the enforcement debate, each with a source and a freshness label. We report direction and magnitude, never blame."
        crumbs={[
          { href: "/", label: "Home" },
          { href: "/enforcement", label: "Enforcement & Border" },
        ]}
        share
      />

      <div className="container-page space-y-8 py-10">
        <section>
          <div className="mb-4">
            <div className="eyebrow mb-1">Latest available · auto-refreshed</div>
            <h2 className="section-title">Key enforcement &amp; border numbers</h2>
          </div>
          <DashboardGrid metrics={metrics} />
        </section>

        <section>
          <h2 className="section-title mb-4">Open a tracker</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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

        <AdSlot format="in-content" />

        <MethodologyNote variant="warning">
          Enforcement and border datasets use different definitions and reporting calendars. An encounter is
          an event, not a unique person, and is not a deportation; arrests are not removals. Figures should
          not be combined to imply causation — see the methodology for each metric.
        </MethodologyNote>
      </div>
    </div>
  );
}
