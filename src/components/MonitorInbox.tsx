"use client";

// =============================================================================
// THE INTELLIGENCE INBOX, for a person
//
// WHY IT FETCHES INSTEAD OF PRERENDERING
// --------------------------------------
// The inbox is personal: it depends on what this reader follows, and follows
// live in their browser and nowhere else. Prerendering would mean either
// shipping every record's brief to every visitor — hundreds of kilobytes for a
// list they will filter to ten items — or sending the watchlist to a server
// that has promised not to keep one.
//
// So it calls /api/v1/monitor with the follows as query parameters. Same
// endpoint a vendor integrates against, which means the page cannot drift from
// the product: if the inbox looks wrong here, it is wrong for them too.
//
// WHAT EVERY ITEM MUST SHOW
// -------------------------
// A professional deciding in thirty seconds needs all of it at once: what
// changed, why it may matter, when it takes effect, where it came from, the
// quote behind each classification, how strong that evidence is, what the
// record does not cover, and whether a person has checked it. Anything hidden
// behind a click is a thing they will not read, and a monitoring product whose
// evidence is one click away is one a professional will stop trusting the first
// time it is wrong.
// =============================================================================

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useFollows } from "@/hooks/useFollows";

interface BriefEvidence {
  dimension: string;
  value: string;
  method: string;
  quote: string;
}

interface Brief {
  id: string;
  change: string;
  potentialRelevance: string | null;
  effective: string;
  source: { name: string; url: string };
  affectedDimensions: { label: string; value: string }[];
  evidence: BriefEvidence[];
  suggestedProfessionalAction: string;
  limitations: string[];
  reviewStatus: string;
}

interface Item {
  bucket: string;
  because: string;
  matched: string[];
  daysUntilEffective: number | null;
  brief: Brief;
  change: { url: string; publishedDate: string; classification: string; severity: string };
}

interface Payload {
  data: {
    follows: string[];
    counts: Record<string, number>;
    buckets: { bucket: string; label: string; meaning: string; count: number }[];
    items: Item[];
  };
  limitations: string[];
}

const METHOD_LABEL: Record<string, string> = {
  explicit_source: "named in the title",
  structured_source: "from a structured field",
  derived_high_confidence: "named in the summary or an operative passage",
  derived_weak: "a citation or an aside",
};

function Pill({ children, tone = "quiet" }: { children: React.ReactNode; tone?: "quiet" | "warn" }) {
  return (
    <span
      className={
        tone === "warn"
          ? "rounded-full border border-amber-400/30 bg-amber-400/10 px-2 py-0.5 text-[11px] font-medium text-amber-200"
          : "rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] text-slate-300"
      }
    >
      {children}
    </span>
  );
}

function ItemCard({ item }: { item: Item }) {
  const [showEvidence, setShowEvidence] = useState(false);
  const b = item.brief;

  return (
    <article className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
      <div className="flex flex-wrap items-center gap-2">
        {item.daysUntilEffective !== null && item.daysUntilEffective >= 0 ? (
          <Pill tone={item.daysUntilEffective <= 30 ? "warn" : "quiet"}>
            Effective in {item.daysUntilEffective} day{item.daysUntilEffective === 1 ? "" : "s"}
          </Pill>
        ) : null}
        <Pill>{item.change.classification.replace(/_/g, " ")}</Pill>
        {b.reviewStatus === "approved" ? <Pill>Reviewed by a person</Pill> : <Pill>Not yet reviewed</Pill>}
      </div>

      <h3 className="mt-3 text-base font-semibold leading-snug text-white">
        <Link href={item.change.url} className="hover:underline">
          {b.change}
        </Link>
      </h3>

      <p className="mt-1 text-xs text-slate-500">{item.because}</p>

      {b.potentialRelevance ? (
        <p className="mt-3 text-sm text-slate-300">{b.potentialRelevance}</p>
      ) : null}

      <dl className="mt-3 grid gap-1 text-sm sm:grid-cols-[10rem_1fr]">
        <dt className="text-slate-500">Effective</dt>
        <dd className="text-slate-300">{b.effective}</dd>
        {b.affectedDimensions.map((d) => (
          <div key={d.label} className="contents">
            <dt className="text-slate-500">{d.label}</dt>
            <dd className="text-slate-300">{d.value}</dd>
          </div>
        ))}
        <dt className="text-slate-500">Source</dt>
        <dd>
          <a href={b.source.url} className="link-accent" rel="noreferrer noopener" target="_blank">
            {b.source.name}
          </a>
        </dd>
      </dl>

      <p className="mt-3 text-sm text-slate-400">
        <span className="font-medium text-slate-300">Suggested next step. </span>
        {b.suggestedProfessionalAction}
      </p>

      {b.evidence.length > 0 ? (
        <div className="mt-3">
          <button
            type="button"
            onClick={() => setShowEvidence((v) => !v)}
            className="text-xs font-semibold text-accent-soft hover:underline"
            aria-expanded={showEvidence}
          >
            {showEvidence ? "Hide" : "Show"} the {b.evidence.length} evidence quote
            {b.evidence.length === 1 ? "" : "s"}
          </button>
          {showEvidence ? (
            <ul className="mt-2 space-y-2">
              {b.evidence.map((e, i) => (
                <li key={`${e.dimension}-${e.value}-${i}`} className="rounded-lg bg-black/20 p-3">
                  <p className="text-[11px] uppercase tracking-wide text-slate-500">
                    {e.dimension} · {e.value} · {METHOD_LABEL[e.method] ?? e.method}
                  </p>
                  <blockquote className="mt-1 text-xs leading-relaxed text-slate-300">
                    “{e.quote}”
                  </blockquote>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {b.limitations.length > 0 ? (
        <ul className="mt-3 space-y-1 border-t border-white/5 pt-3">
          {b.limitations.map((l) => (
            <li key={l} className="text-xs leading-relaxed text-slate-500">
              {l}
            </li>
          ))}
        </ul>
      ) : null}
    </article>
  );
}

export function MonitorInbox() {
  const { follows, hydrated } = useFollows();
  const [payload, setPayload] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const query = useMemo(
    () => follows.map((f) => `follow=${encodeURIComponent(f)}`).join("&"),
    [follows]
  );

  useEffect(() => {
    if (!hydrated) return;
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(`/api/v1/monitor?${query}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((json: Payload) => {
        if (!cancelled) setPayload(json);
      })
      .catch(() => {
        if (!cancelled) setError("Could not load the inbox. Reload the page to try again.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [hydrated, query]);

  if (!hydrated || loading) {
    return <p className="text-sm text-slate-500">Reading the archive…</p>;
  }
  if (error) {
    return <p className="text-sm text-amber-200">{error}</p>;
  }
  if (!payload) return null;

  const { buckets, items, counts } = payload.data;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap gap-2">
        {buckets.map((b) => (
          <a
            key={b.bucket}
            href={`#${b.bucket}`}
            className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300 hover:border-white/20"
          >
            {b.label} <span className="text-slate-500">{b.count}</span>
          </a>
        ))}
      </div>

      {follows.length === 0 ? (
        <p className="rounded-xl border border-white/5 bg-white/[0.02] p-4 text-sm text-slate-400">
          You are following nothing yet, so this shows what is coming up for everyone. Choose the
          visas, countries, forms, processes and agencies you are responsible for on{" "}
          <Link href="/following" className="link-accent">
            the following page
          </Link>{" "}
          and this becomes your inbox. Follows are stored in your browser and never sent to us.
        </p>
      ) : null}

      {items.length === 0 ? (
        <p className="rounded-xl border border-white/5 bg-white/[0.02] p-4 text-sm text-slate-400">
          Nothing matched. That means nothing in the archive touched what you follow inside the
          window — not that nothing happened. Widen the horizon or follow more dimensions.
        </p>
      ) : null}

      {buckets.map((bucket) => (
        <section key={bucket.bucket} id={bucket.bucket} className="scroll-mt-24">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
            {bucket.label}{" "}
            <span className="ml-1 font-normal normal-case text-slate-500">
              {counts[bucket.bucket]}
            </span>
          </h2>
          <p className="mt-1 text-xs text-slate-500">{bucket.meaning}</p>
          <div className="mt-3 space-y-3">
            {items
              .filter((i) => i.bucket === bucket.bucket)
              .map((i) => (
                <ItemCard key={`${i.bucket}-${i.brief.id}`} item={i} />
              ))}
          </div>
        </section>
      ))}

      <section className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
        <h2 className="text-sm font-semibold text-white">What this inbox cannot tell you</h2>
        <ul className="mt-2 space-y-2">
          {payload.limitations.map((l) => (
            <li key={l} className="text-xs leading-relaxed text-slate-400">
              {l}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
