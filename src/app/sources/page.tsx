import { buildMetadata } from "@/lib/seo";
import { PageHeader } from "@/components/PageHeader";
import { SOURCES } from "@/lib/sources";
import { sourceReadState, type SourceReadState } from "@/lib/refresh";
import { formatDate } from "@/lib/format";

export const metadata = buildMetadata({
  title: "Sources",
  description:
    "Every dataset behind ImmigrationClock: USCIS, DOL OFLC, ICE, DHS, CBP, the Department of State, BLS, state WARN portals, and TRAC, with official links.",
  path: "/sources",
});

/**
 * How this source reaches the site, in one line. Every date is one the pipeline
 * recorded or the agency's own; a source with none shows none.
 */
function readLine({ kind, at, checked }: SourceReadState): string {
  const on = at ? ` ${formatDate(at)}` : "";
  switch (kind) {
    case "fetched":
      return `Read automatically · last fetched${on}`;
    case "not-reading":
      return "Not being read right now";
    case "manual":
      if (!at) return "Entered by hand";
      return checked ? `Entered by hand · last checked${on}` : `Entered by hand · source dated${on}`;
    default:
      return "Listed for reference · not read yet";
  }
}

export default function SourcesPage() {
  return (
    <div>
      <PageHeader
        eyebrow="About the data"
        title="Sources"
        description="Every number on this site comes from a public government dataset or a reputable public clearinghouse. Here is the full list, with official links, how often each agency publishes, and whether we read it automatically, enter it by hand, or only list it for now."
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
                <span className="text-xs text-slate-500">{readLine(sourceReadState(s.key))}</span>
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
