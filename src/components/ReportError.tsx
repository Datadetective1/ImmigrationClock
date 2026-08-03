// =============================================================================
// REPORT AN ERROR — the correction route, made visible
//
// The platform's whole proposition is that every figure is traceable and
// correctable. Until now the contact address appeared only in the prose of
// /about, /privacy, /terms and /disclosure — four pages a reader visits when
// they are already looking for it, and none of them the page where they spot a
// wrong number.
//
// A correction route nobody can find is a correction route that does not exist.
//
// It renders NOTHING when no inbox is configured, rather than a dead mailto.
// Same rule as ContactLink: a link that looks like a contact route and silently
// is not one is worse than no link.
// =============================================================================

import { SITE } from "@/lib/site";

export function ReportError({
  /** What the reader is looking at, pre-filled into the subject line. */
  context,
  className = "",
}: {
  context?: string;
  className?: string;
}) {
  const email = SITE.contactEmail.trim();
  if (!email) return null;

  const subject = context
    ? `Correction: ${context}`
    : "Correction to a figure on ImmigrationClock";
  // A pre-filled body costs the reader nothing and gets us the one thing that
  // makes a report actionable: which page, and what looked wrong.
  const body = [
    "What looked wrong:",
    "",
    "",
    context ? `Page: ${context}` : "Page:",
    "",
    "(If you have the government source that contradicts us, a link to it is the",
    "single most useful thing you can include.)",
  ].join("\n");

  const href = `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

  return (
    <div className={`rounded-xl border border-white/10 bg-white/[0.02] p-4 ${className}`}>
      <h2 className="text-sm font-semibold text-white">Spotted something wrong?</h2>
      <p className="mt-1.5 text-xs leading-relaxed text-slate-400">
        Every figure here should trace back to an official government source. If one does not, or a
        number looks wrong, tell us and we will check it and publish a correction.
      </p>
      <a
        href={href}
        className="mt-3 inline-block rounded-lg border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold text-white transition-colors hover:border-accent/50 hover:bg-accent/10"
      >
        Report an error
      </a>
      <p className="mt-2 text-xs text-slate-500">
        Or email{" "}
        <a href={`mailto:${email}`} className="link-accent">
          {email}
        </a>
        . We are not a law firm and cannot advise on individual cases.
      </p>
    </div>
  );
}
