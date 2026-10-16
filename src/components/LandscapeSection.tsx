// =============================================================================
// "Your landscape" on /briefing — one compact card per follow
//
// Closed, each card answers "where does this stand?" at a glance: the next
// stated date, open proposals, what took effect, and how recent the newest
// record is. Open, it shows at most three entries per list, with the full
// archive one tap away. Server-rendered <details>, so it costs no client
// JavaScript.
// =============================================================================

import Link from "next/link";
import type { FollowLandscape, Landscape, LandscapeEntry } from "@/lib/pro/landscape";
import { PER_LIST } from "@/lib/pro/landscape";

function formatDate(iso: string): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
}

function plural(n: number, one: string, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}

type Chip = { text: string; tone: "date" | "plain" | "muted" };

const CHIP_TONE: Record<Chip["tone"], string> = {
  date: "border-accent/30 text-accent",
  plain: "border-white/15 text-slate-300",
  muted: "border-white/10 text-slate-500",
};

/** The closed card: only counts and dates the lists below already hold. */
function chips(l: FollowLandscape): Chip[] {
  if (l.totalCount === 0) return [{ text: "No matching records in our archive", tone: "muted" }];
  const out: Chip[] = [];
  if (l.comingUp.length) {
    const more = l.comingUp.length - 1;
    out.push({ text: `Next date ${formatDate(l.comingUp[0].date)}${more > 0 ? ` · +${more}` : ""}`, tone: "date" });
  }
  if (l.proposals.length) out.push({ text: plural(l.proposals.length, "open proposal"), tone: "plain" });
  if (l.tookEffect.length) out.push({ text: `${l.tookEffect.length} took effect`, tone: "plain" });
  if (l.undatedFinalCount) out.push({ text: `${l.undatedFinalCount} undated`, tone: "muted" });
  if (l.recentCount) out.push({ text: `${l.recentCount} in last 30 days`, tone: "plain" });
  if (l.latestRecord) out.push({ text: `Newest ${formatDate(l.latestRecord)}`, tone: "muted" });
  return out;
}

function EntryList({ title, hint, entries }: { title: string; hint?: string; entries: LandscapeEntry[] }) {
  if (entries.length === 0) return null;
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wide text-slate-500">
        {title}
        {hint ? <span className="normal-case tracking-normal"> · {hint}</span> : null}
      </p>
      <ul className="mt-1 space-y-1.5">
        {entries.slice(0, PER_LIST).map((e) => (
          <li key={e.recordId} className="text-[13px] leading-snug">
            <Link href={e.path} className="text-slate-200 hover:underline">
              {e.title}
            </Link>
            <span className="block text-xs text-slate-500">
              {e.status.replace(/\d{4}-\d{2}-\d{2}/g, (d) => formatDate(d))} ·{" "}
              <a href={e.sourceUrl} rel="noopener noreferrer" className="underline decoration-dotted hover:text-white">
                {e.sourceName}
              </a>
            </span>
          </li>
        ))}
        {entries.length > PER_LIST ? <li className="text-xs text-slate-500">+ {entries.length - PER_LIST} more</li> : null}
      </ul>
    </div>
  );
}

function FollowCard({ l }: { l: FollowLandscape }) {
  return (
    <li className="rounded-xl border border-white/5 bg-white/[0.02]">
      <details>
        <summary className="block cursor-pointer select-none list-none p-3">
          <span className="flex items-baseline justify-between gap-3">
            <span className="text-sm font-semibold text-white">{l.label}</span>
            <span className="text-xs text-slate-500">Details</span>
          </span>
          <span className="mt-1.5 flex flex-wrap gap-1.5 text-[11px]">
            {chips(l).map((c) => (
              <span key={c.text} className={`rounded-full border px-2 py-0.5 ${CHIP_TONE[c.tone]}`}>
                {c.text}
              </span>
            ))}
          </span>
        </summary>
        <div className="space-y-3 border-t border-white/5 p-3">
          <EntryList title="Coming up" hint="stated effective dates" entries={l.comingUp} />
          <EntryList title="Took effect" hint="stated date passed — check it still applies" entries={l.tookEffect} />
          <EntryList title="Proposals" hint="no final rule in our archive" entries={l.proposals} />
          {l.undatedFinalCount > 0 ? (
            <p className="text-xs text-slate-500">
              Undated: {plural(l.undatedFinalCount, "final rule")} with no stated effective date — not dated here.
            </p>
          ) : null}
          <p className="text-xs text-slate-400">
            {l.totalCount === 0
              ? "Nothing in our archive names this in a title or summary. That is not evidence that nothing changed."
              : `${plural(l.recentCount, "record")} in the last 30 days · newest ${l.latestRecord ? formatDate(l.latestRecord) : "—"}.`}{" "}
            {l.totalCount > 0 ? (
              <Link href={l.archivePath} className="underline decoration-dotted hover:text-white">
                All {l.totalCount} records
              </Link>
            ) : null}
          </p>
        </div>
      </details>
    </li>
  );
}

export function LandscapeSection({ landscape }: { landscape: Landscape }) {
  const { coverage } = landscape;
  return (
    <section className="panel panel-pad" aria-labelledby="landscape-heading">
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="landscape-heading" className="section-title">Your landscape</h2>
        <Link href="/following" className="text-xs text-slate-400 underline decoration-dotted hover:text-white">
          Edit follows
        </Link>
      </div>
      <p className="mt-1 text-xs text-slate-400">What the record shows for each thing you follow. Tap one to open it.</p>
      <ul className="mt-3 space-y-2">
        {landscape.follows.map((l) => (
          <FollowCard key={l.follow} l={l} />
        ))}
      </ul>
      <details className="mt-3 text-xs text-slate-500">
        <summary className="cursor-pointer select-none text-slate-400 hover:text-white">What this covers</summary>
        <div className="mt-2 space-y-1.5">
          <p>
            Sources in the latest refresh ({formatDate(coverage.lastRefresh)}): {coverage.checked.join(", ")}.
          </p>
          {coverage.quietOrFailed.length > 0 ? <p>Returned nothing or failed: {coverage.quietOrFailed.join(", ")}.</p> : null}
          {coverage.notCovered.length > 0 ? <p>Not covered: {coverage.notCovered.join(", ")}.</p> : null}
          {landscape.limitations.map((l) => (
            <p key={l}>{l}</p>
          ))}
        </div>
      </details>
    </section>
  );
}
