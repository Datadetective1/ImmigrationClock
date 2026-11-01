// =============================================================================
// ONE MONTH OF THE VISA BULLETIN
//
// Short on purpose: what moved, a place to check your own date, the full table
// for anyone who wants it, and a way to get next month's without coming back
// to look. Every date on it is the official bulletin's, linked at the bottom.
// =============================================================================

import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { PulseSignup } from "@/components/PulseSignup";
import { FollowChips } from "@/components/FollowChips";
import { VisaBulletinChecker } from "@/components/VisaBulletinChecker";
import { VisaBulletinCharts } from "@/components/VisaBulletinCharts";
import { formatDate } from "@/lib/format";
import {
  BULLETINS,
  CHARGEABILITY,
  CHARGEABILITY_SHORT,
  ROW_LABEL,
  VISA_BULLETIN_PATH,
  bulletinPath,
  changedCells,
  cutoffFor,
  formatCutoff,
  movement,
  previousBulletin,
  rowsFor,
  type Bulletin,
  type Chargeability,
  type Cutoff,
  type Movement,
  type Row,
  type Section,
} from "@/lib/visa-bulletin";

const USCIS_CHART_URL =
  "https://www.uscis.gov/green-card/green-card-processes-and-procedures/visa-availability-priority-dates";

interface MoveGroup {
  section: Section;
  row: Row;
  countries: Chargeability[];
  to: Cutoff;
  move: Movement;
}

/** Cells that moved the same way to the same date, folded into one card. */
export function moveGroups(b: Bulletin): MoveGroup[] {
  const groups: MoveGroup[] = [];
  for (const section of ["employment", "family"] as const) {
    for (const cell of changedCells(b, section)) {
      const key = `${cell.to}|${JSON.stringify(cell.move)}`;
      const g = groups.find((x) => x.section === section && x.row === cell.row && `${x.to}|${JSON.stringify(x.move)}` === key);
      if (g) g.countries.push(cell.country);
      else groups.push({ section, row: cell.row, countries: [cell.country], to: cell.to, move: cell.move });
    }
  }
  return groups;
}

/** Final action cells across both charts: how many moved each way. */
export function moveTally(b: Bulletin) {
  const prev = previousBulletin(b);
  const tally = { ahead: 0, back: 0, same: 0 };
  if (!prev) return null;
  for (const section of ["family", "employment"] as const) {
    for (const row of rowsFor(section)) {
      for (const c of CHARGEABILITY) {
        const m = movement(cutoffFor(prev, section, "finalAction", row, c), cutoffFor(b, section, "finalAction", row, c));
        if (m.kind === "ahead" || m.kind === "now-current") tally.ahead += 1;
        else if (m.kind === "back" || m.kind === "now-unavailable" || m.kind === "now-dated") tally.back += 1;
        else if (m.kind === "same") tally.same += 1;
      }
    }
  }
  return tally;
}

function countriesLabel(cs: Chargeability[]): string {
  if (cs.length === CHARGEABILITY.length) return "All countries";
  return cs.map((c) => CHARGEABILITY_SHORT[c]).join(", ");
}

function MoveCard({ g }: { g: MoveGroup }) {
  const ahead = g.move.kind === "ahead" || g.move.kind === "now-current";
  const gap = g.move.kind === "ahead" || g.move.kind === "back" ? g.move.gap : g.move.kind === "now-current" ? "current" : "";
  return (
    <li className="rounded-xl border border-white/10 bg-white/[0.03] p-3.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-bold text-white">{ROW_LABEL[g.row]}</span>
        <span className={`text-sm font-bold ${ahead ? "text-status-green" : "text-status-red"}`}>
          <span aria-hidden>{ahead ? "▲" : "▼"} </span>
          <span className="sr-only">{ahead ? "ahead " : "back "}</span>
          {gap}
        </span>
      </div>
      <div className="mt-1 text-lg font-semibold tabular-nums text-slate-100">{formatCutoff(g.to)}</div>
      <div className="text-xs text-slate-500">{countriesLabel(g.countries)}</div>
    </li>
  );
}

export function VisaBulletinView({ bulletin, path }: { bulletin: Bulletin; path: string }) {
  const previous = previousBulletin(bulletin);
  const groups = moveGroups(bulletin);
  const tally = moveTally(bulletin);
  const employment = groups.filter((g) => g.section === "employment");
  const family = groups.filter((g) => g.section === "family");
  const others = BULLETINS.filter((b) => b.id !== bulletin.id);

  return (
    <div>
      <PageHeader
        compact
        eyebrow="Visa Bulletin"
        title={`${bulletin.label} Visa Bulletin`}
        description="Green card cut-off dates for the month, what moved, and where your own date stands."
        crumbs={[
          { href: "/", label: "Home" },
          { href: "/key-dates", label: "Key dates" },
          { href: path, label: bulletin.label },
        ]}
        share
        sharePath={path}
      />

      <div className="container-page max-w-4xl space-y-6 py-6 sm:py-8">
        {tally ? (
          <div className="grid grid-cols-3 gap-2 sm:gap-3" aria-label={`Final action dates compared with ${previous?.label}`}>
            {(
              [
                ["Moved ahead", tally.ahead, "text-status-green"],
                ["Moved back", tally.back, tally.back ? "text-status-red" : "text-slate-300"],
                ["No change", tally.same, "text-slate-300"],
              ] as const
            ).map(([label, n, tone]) => (
              <div key={label} className="panel p-3 text-center sm:p-4">
                <div className={`text-2xl font-bold tabular-nums sm:text-3xl ${tone}`}>{n}</div>
                <div className="mt-0.5 text-xs text-slate-400">{label}</div>
              </div>
            ))}
          </div>
        ) : null}

        {groups.length > 0 ? (
          <section aria-labelledby="moved-heading">
            <h2 id="moved-heading" className="text-lg font-bold text-white sm:text-xl">
              What moved since {previous?.label}
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">Final action dates.</p>
            {employment.length > 0 ? (
              <>
                <h3 className="mt-4 text-xs font-semibold uppercase tracking-wide text-slate-400">Employment</h3>
                <ul className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {employment.map((g) => (
                    <MoveCard key={`${g.row}-${g.countries.join()}`} g={g} />
                  ))}
                </ul>
              </>
            ) : null}
            {family.length > 0 ? (
              <>
                <h3 className="mt-4 text-xs font-semibold uppercase tracking-wide text-slate-400">Family</h3>
                <ul className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {family.map((g) => (
                    <MoveCard key={`${g.row}-${g.countries.join()}`} g={g} />
                  ))}
                </ul>
              </>
            ) : null}
          </section>
        ) : null}

        <VisaBulletinChecker bulletin={bulletin} />

        <section aria-labelledby="next-heading" className="panel p-4 sm:p-6">
          <div className="eyebrow mb-1 text-accent">Next month</div>
          <h2 id="next-heading" className="text-lg font-bold text-white sm:text-xl">
            Hear when the new dates are out
          </h2>
          <p className="mt-1 text-sm text-slate-400">
            Follow your category for free. With{" "}
            <Link href="/pricing" className="link-accent">
              Pro
            </Link>
            , we email you when the next bulletin is out, with the dates that moved.
          </p>
          <div className="mt-3">
            <FollowChips
              follows={[
                { id: "topic:visa-bulletin", label: "the Visa Bulletin" },
                { id: "visa:eb-2", label: "EB-2" },
                { id: "visa:eb-3", label: "EB-3" },
                { id: "visa:eb-5", label: "EB-5" },
              ]}
            />
          </div>
          <div className="mt-4">
            <PulseSignup placement="visa-bulletin" />
          </div>
        </section>

        <VisaBulletinCharts bulletin={bulletin} previous={previous} />

        <footer className="space-y-2 text-xs leading-relaxed text-slate-500">
          <p>
            Source:{" "}
            <a href={bulletin.sourceUrl} className="link-accent" target="_blank" rel="noopener noreferrer">
              U.S. Department of State, Visa Bulletin for {bulletin.label} (PDF)
            </a>
            . Every date was checked against it on {formatDate(bulletin.verifiedAt)}.
          </p>
          <p>
            A priority date is reached when it is earlier than the listed date. USCIS says each month which chart
            applicants for adjustment of status may use; see{" "}
            <a href={USCIS_CHART_URL} className="link-accent" target="_blank" rel="noopener noreferrer">
              USCIS: Visa Availability and Priority Dates
            </a>
            . New to this?{" "}
            <Link href="/explained/visa-bulletin-priority-dates" className="link-accent">
              How to read the Visa Bulletin
            </Link>
            . This page is information, not legal advice.
          </p>
          {others.length > 0 ? (
            <p>
              Other months:{" "}
              {others.map((b, i) => (
                <span key={b.id}>
                  {i > 0 ? ", " : null}
                  <Link href={bulletinPath(b)} className="link-accent">
                    {b.label}
                  </Link>
                </span>
              ))}
              {bulletin.id !== BULLETINS[0]?.id ? (
                <>
                  {" "}
                  ·{" "}
                  <Link href={VISA_BULLETIN_PATH} className="link-accent">
                    Latest
                  </Link>
                </>
              ) : null}
            </p>
          ) : null}
        </footer>
      </div>
    </div>
  );
}
