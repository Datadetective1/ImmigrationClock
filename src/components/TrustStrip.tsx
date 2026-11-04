// =============================================================================
// TRUST STRIP: WHY A READER CAN RELY ON THIS, IN FOUR NUMBERS
//
// There are no customer logos or reviews to show, and inventing either would
// break the one promise the site makes. What it can show is real and checkable:
// how much is recorded, from how many official sources, how many bulletins the
// forecast reads, and when it was last refreshed. Each tile links to the page
// that proves it. Server component; everything is counted at build time.
// =============================================================================

import Link from "next/link";
import { formatDate } from "@/lib/format";
import { trustFacts } from "@/lib/pro-showcase";

/** "Jan 3, 2025" to "Jan 2025". */
function monthYear(iso: string): string {
  return formatDate(iso).replace(/ \d{1,2},/, "");
}

/**
 * `refreshed` shows the refresh date as the fourth tile. The homepage already
 * prints "Last refreshed" under its hero, so there the fourth tile is how far
 * back the archive goes instead.
 */
export function TrustStrip({
  fourth = "refreshed",
  chipsOnPhone = true,
}: {
  fourth?: "refreshed" | "since";
  /** The homepage hides the source names on a phone, where they push the page down. */
  chipsOnPhone?: boolean;
}) {
  const f = trustFacts();
  const tiles = [
    { value: f.changes.toLocaleString(), label: "government changes recorded", href: "/what-changed" },
    { value: String(f.sources + 1), label: "official sources read", href: "/sources" },
    { value: String(f.bulletins), label: "Visa Bulletins in the forecast", href: "/visa-bulletin" },
    fourth === "since" && f.since
      ? { value: monthYear(f.since), label: "archive goes back to", href: "/timeline" }
      : { value: formatDate(f.refreshed).replace(/, \d{4}$/, ""), label: "last refreshed", href: "/data" },
  ];

  return (
    <div data-testid="trust-strip">
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
        {tiles.map((t) => (
          <li key={t.label}>
            <Link
              href={t.href}
              className="block rounded-xl border border-white/10 bg-white/[0.03] px-3 py-3 text-left transition-colors hover:border-accent/40"
            >
              <span className="block font-mono text-xl font-extrabold tabular-nums text-white sm:text-2xl">{t.value}</span>
              <span className="mt-0.5 block text-xs leading-snug text-slate-400">{t.label}</span>
            </Link>
          </li>
        ))}
      </ul>
      <div className={`mt-3 flex-wrap items-center gap-1.5 ${chipsOnPhone ? "flex" : "hidden sm:flex"}`}>
        <span className="mr-1 text-xs text-slate-500">Read from</span>
        {[...f.sourceNames, "U.S. Department of State Visa Bulletin"].map((name) => (
          <span key={name} className="rounded-full border border-white/10 px-2.5 py-1 text-[11px] font-medium text-slate-300">
            {name}
          </span>
        ))}
      </div>
    </div>
  );
}
