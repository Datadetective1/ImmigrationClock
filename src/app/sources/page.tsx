import { buildMetadata } from "@/lib/seo";
import { PageHeader } from "@/components/PageHeader";
import { SOURCES } from "@/lib/sources";
import { UPDATED } from "@/lib/sample-data";
import { formatDate } from "@/lib/format";

export const metadata = buildMetadata({
  title: "Sources",
  description:
    "Every dataset behind ImmigrationClock: USCIS, DOL OFLC, ICE, DHS, CBP, the Department of State, BLS, state WARN portals, and TRAC — with official links.",
  path: "/sources",
});

export default function SourcesPage() {
  return (
    <div>
      <PageHeader
        eyebrow="About the data"
        title="Sources"
        description="Every number on this site comes from a public government dataset or a reputable public clearinghouse. Here is the full list, with official links and update cadence."
        crumbs={[
          { href: "/", label: "Home" },
          { href: "/sources", label: "Sources" },
        ]}
      />

      <div className="container-page space-y-4 py-10">
        {SOURCES.map((s) => (
          <div key={s.key} className="panel panel-pad">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="max-w-2xl">
                <h2 className="text-lg font-semibold text-white">{s.name}</h2>
                <p className="mt-0.5 text-sm text-slate-400">{s.agency}</p>
                <p className="mt-2 text-sm leading-relaxed text-slate-300">{s.description}</p>
              </div>
              <div className="flex flex-col items-end gap-2 text-right">
                <span className="chip capitalize">{s.cadence}</span>
                <span className="text-xs text-slate-500">
                  Last refresh:{" "}
                  {formatDate((UPDATED as Record<string, string>)[s.key] ?? "2026-01-01")}
                </span>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-3">
              <a href={s.homepageUrl} target="_blank" rel="noopener noreferrer" className="text-sm link-accent">
                Agency page →
              </a>
              <a href={s.datasetUrl} target="_blank" rel="noopener noreferrer" className="text-sm link-accent">
                Dataset / disclosure files →
              </a>
            </div>
          </div>
        ))}

        <div className="panel panel-pad text-sm leading-relaxed text-slate-400">
          <span className="font-semibold text-white">A note on attribution: </span>
          Government datasets are in the public domain, but reporting calendars and definitions differ
          between agencies. We preserve the source name, link, and last-updated date on every figure so you
          can verify any number yourself.
        </div>
      </div>
    </div>
  );
}
