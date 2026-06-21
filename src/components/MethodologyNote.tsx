import Link from "next/link";

/**
 * Neutral caveat callout. Collapsed by default (native <details>) so it doesn't
 * shout on every page — the rigor stays, one tap away. Keeps the site honest
 * without the visual weight of an always-open box.
 */
export function MethodologyNote({
  children,
  variant = "info",
}: {
  children: React.ReactNode;
  variant?: "info" | "warning";
}) {
  const tone = variant === "warning" ? "border-status-amber/25" : "border-white/10";
  const summary = variant === "warning" ? "How to read this responsibly" : "Methodology & sources";

  return (
    <details className={`group rounded-xl border ${tone} bg-white/[0.02] text-sm`}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-400 marker:content-['']">
        <span className="flex items-center gap-1.5">
          <span aria-hidden>ⓘ</span> {summary}
        </span>
        <span
          aria-hidden
          className="text-base font-normal leading-none text-slate-500 transition-transform group-open:rotate-45"
        >
          +
        </span>
      </summary>
      <div className="px-4 pb-4 leading-relaxed text-slate-400">
        {children}{" "}
        <Link href="/methodology" className="link-accent whitespace-nowrap">
          Read the full methodology →
        </Link>
      </div>
    </details>
  );
}
