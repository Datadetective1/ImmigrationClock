"use client";

// "Add to Chrome": the one link to the extension's Chrome Web Store listing.
//
// The click is counted with a fixed placement name and nothing else, the same
// rule ProCallout follows: no page path, no category, no country. A followed
// category can imply a reader's nationality.

import { track } from "@/lib/analytics";
import { CHROME_EXTENSION_URL } from "@/lib/extension";

const PUZZLE =
  "M10 3a2 2 0 014 0v1h3a1 1 0 011 1v3h1a2 2 0 010 4h-1v4a1 1 0 01-1 1h-3v-1a2 2 0 00-4 0v1H6a1 1 0 01-1-1v-3h1a2 2 0 000-4H5V5a1 1 0 011-1h4V3z";

export function AddToChromeButton({
  placement,
  variant = "button",
  label = "Add to Chrome",
}: {
  /** Where the link sits, for the click count. A fixed name, never a path. */
  placement: string;
  /** "button" is the solid call to action; "pill" matches the homepage's link pills. */
  variant?: "button" | "pill";
  label?: string;
}) {
  const className =
    variant === "pill"
      ? "inline-flex items-center gap-2 rounded-full border border-white/10 px-4 py-2 text-sm font-medium text-white transition-colors hover:border-accent/60"
      : "inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-accent-soft";

  return (
    <a
      href={CHROME_EXTENSION_URL}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
      data-testid="add-to-chrome"
      onClick={() => track("extension_install_click", { placement })}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden>
        <path d={PUZZLE} />
      </svg>
      {label}
    </a>
  );
}

/**
 * The panel form: one line on what the extension does, and the button. Used
 * where a reader has just looked at dates and may want them again next month.
 */
export function ChromeExtensionPanel({ placement, what }: { placement: string; what: string }) {
  return (
    <aside
      aria-label="ImmigrationClock Chrome extension"
      className="flex flex-col gap-3 rounded-xl border border-accent/25 bg-accent/[0.05] p-4 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="min-w-0">
        <p className="text-sm font-semibold text-white">Free Chrome extension</p>
        <p className="mt-0.5 text-sm text-slate-400">{what}</p>
      </div>
      <div className="shrink-0">
        <AddToChromeButton placement={placement} />
      </div>
    </aside>
  );
}
