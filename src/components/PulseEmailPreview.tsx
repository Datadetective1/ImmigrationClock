"use client";

import { useState } from "react";

type Tab = "preview" | "html" | "text" | "markdown";

const TABS: { key: Tab; label: string }[] = [
  { key: "preview", label: "Preview" },
  { key: "html", label: "HTML" },
  { key: "text", label: "Plain text" },
  { key: "markdown", label: "Markdown" },
];

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1600);
        } catch {
          /* clipboard blocked */
        }
      }}
      className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-slate-200 transition-colors hover:border-accent/40 hover:text-accent-soft"
    >
      {copied ? "✓ Copied" : label}
    </button>
  );
}

/**
 * Operator tool: preview the auto-generated weekly Pulse email and copy the
 * subject / HTML / plain-text / markdown for a one-paste send in any provider.
 */
export function PulseEmailPreview({
  subject,
  html,
  text,
  markdown,
  generatedAt,
}: {
  subject: string;
  html: string;
  text: string;
  markdown: string;
  generatedAt: string;
}) {
  const [tab, setTab] = useState<Tab>("preview");
  const body = tab === "html" ? html : tab === "text" ? text : tab === "markdown" ? markdown : "";

  return (
    <div className="space-y-4">
      <div className="panel panel-pad">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="eyebrow text-slate-500">Subject line</div>
            <div className="mt-1 text-sm font-semibold text-white">{subject}</div>
          </div>
          <CopyButton value={subject} label="Copy subject" />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex rounded-lg border border-white/10 bg-white/5 p-0.5">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                tab === t.key ? "bg-accent text-ink-950" : "text-slate-300 hover:text-white"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        {tab !== "preview" ? <CopyButton value={body} label={`Copy ${tab}`} /> : <CopyButton value={html} label="Copy HTML" />}
      </div>

      {tab === "preview" ? (
        <div className="overflow-hidden rounded-xl border border-white/10 bg-white">
          <iframe title="Pulse email preview" srcDoc={html} sandbox="" className="h-[680px] w-full" />
        </div>
      ) : (
        <pre className="scroll-thin max-h-[680px] overflow-auto rounded-xl border border-white/10 bg-ink-950/60 p-4 text-[12px] leading-relaxed text-slate-300">
          {body}
        </pre>
      )}

      <p className="text-[11px] text-slate-500">
        Auto-generated from the current change feed on each build · {new Date(generatedAt).toUTCString()}. Paste
        the HTML into your provider&rsquo;s HTML email, or use the plain-text / markdown version.
      </p>
    </div>
  );
}
