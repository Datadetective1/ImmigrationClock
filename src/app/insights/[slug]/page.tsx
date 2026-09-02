// =============================================================================
// /insights/<slug> — one page per data signal
//
// A data signal is a sentence with a number in it that the repository can stand
// behind, computed deterministically from the committed snapshots at build time
// (src/lib/editorial/signals.ts). This page is where a post about it lands:
// the figure, what the data shows, the caveats that must travel with it, the
// source, the provenance label and the period — the same fields the card was
// drawn from, so a reader arriving from a feed finds the figure they were shown
// and the qualifications the feed had no room for.
//
// A signal that today's data cannot support returns null from its builder; it
// gets no page, no card and no sitemap entry, rather than a page that says
// "not enough data".
// =============================================================================

import Link from "next/link";
import { notFound } from "next/navigation";
import { buildMetadata, jsonLd } from "@/lib/seo";
import { SITE } from "@/lib/site";
import { PageHeader } from "@/components/PageHeader";
import { ShareButton } from "@/components/ShareButton";
import { MethodologyNote } from "@/components/MethodologyNote";
import { ProvenanceTag } from "@/components/ProvenanceTag";
import { TrackedLink } from "@/components/TrackedLink";
import { SIGNAL_SLUGS, buildSignal } from "@/lib/editorial/signals";
import { EVENTS } from "@/lib/event-store";
import { matchesChangeSlug, ogImagePath, signalPath } from "@/lib/share";
import { formatDate } from "@/lib/format";
import { SIGNAL_GROUP_LABEL, pathLabel, storyDescription, storyTitle } from "@/lib/stories";

export const dynamicParams = false;

/** The build's date, fixed once: the signals, their cards and the sitemap agree on it. */
const BUILD_DATE = new Date().toISOString().slice(0, 10);

export function generateStaticParams() {
  return SIGNAL_SLUGS.filter((slug) => buildSignal(slug, BUILD_DATE) !== null).map((slug) => ({ slug }));
}

export function generateMetadata({ params }: { params: { slug: string } }) {
  const s = buildSignal(params.slug, BUILD_DATE);
  if (!s) {
    return buildMetadata({
      title: "Data signal not available",
      description: "Today's data cannot support this signal.",
      path: signalPath(params.slug),
      noindex: true,
    });
  }
  return buildMetadata({
    title: s.title,
    description: storyDescription({ summary: `${s.figure} ${s.figureLabel}. ${s.points[0]}` }),
    path: signalPath(s.slug),
    image: ogImagePath("signal", s.slug),
  });
}

/** The change record a related path points at, so the link can carry its title. */
function changeForPath(path: string) {
  const slug = path.split("/").pop() ?? "";
  return EVENTS.find((e) => matchesChangeSlug(e, slug)) ?? null;
}

export default function SignalPage({ params }: { params: { slug: string } }) {
  const s = buildSignal(params.slug, BUILD_DATE);
  if (!s) notFound();

  const path = signalPath(s.slug);
  const canonical = `${SITE.url}${path}`;
  const key = `signal:${s.slug}`;
  const related = s.relatedChangePaths
    .map((p) => ({ path: p, event: changeForPath(p) }))
    .filter((r) => r.event !== null);

  const dataset = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: s.title,
    description: `${s.figure} ${s.figureLabel}`,
    datePublished: BUILD_DATE,
    mainEntityOfPage: { "@type": "WebPage", "@id": canonical },
    image: [`${SITE.url}${ogImagePath("signal", s.slug)}`],
    author: { "@type": "Organization", name: SITE.name, url: SITE.url },
    publisher: {
      "@type": "Organization",
      name: SITE.name,
      url: SITE.url,
      logo: { "@type": "ImageObject", url: `${SITE.url}/og.svg` },
    },
    isBasedOn: s.sourceUrl,
  };

  return (
    <div>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(dataset) }} />

      <PageHeader
        eyebrow={`Data signal · ${SIGNAL_GROUP_LABEL[s.group]}`}
        title={s.title}
        crumbs={[
          { href: "/", label: "Home" },
          { href: "/insights", label: "Insights" },
          { href: path, label: s.title },
        ]}
        share
        shareSurface="signal"
        shareStory={key}
      >
        {/* The figure hero: the number the card led with, its label, and the
            provenance and period beside it rather than in a footnote. */}
        <div className="panel panel-pad">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <ProvenanceTag provenance="reported" />
            <span className="rounded-md border border-white/10 bg-white/5 px-2 py-1 font-mono text-[11px] text-slate-400">
              {s.periodLabel}
            </span>
          </div>
          <p className="mt-3 font-mono text-5xl font-extrabold tabular-nums text-accent sm:text-6xl">{s.figure}</p>
          <p className="mt-2 text-base font-semibold leading-snug text-white sm:text-lg">{s.figureLabel}</p>
        </div>
      </PageHeader>

      <div className="container-page max-w-3xl space-y-8 py-10">
        <section aria-labelledby="shows-heading" className="space-y-3">
          <h2 id="shows-heading" className="text-lg font-semibold text-white">
            What the data shows
          </h2>
          <ul className="space-y-2.5">
            {s.points.map((p, i) => (
              <li key={i} className="flex gap-2 text-sm leading-relaxed text-slate-200">
                <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent/70" />
                <span>{p}</span>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="caveats-heading" className="rounded-xl border border-status-amber/25 bg-white/[0.02] p-4 sm:p-5">
          <h2 id="caveats-heading" className="eyebrow mb-2 text-status-amber">
            Caveats
          </h2>
          <ul className="space-y-2">
            {s.caveats.map((c, i) => (
              <li key={i} className="text-sm leading-relaxed text-slate-300">
                {c}
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="source-heading" className="space-y-2 text-sm">
          <h2 id="source-heading" className="text-lg font-semibold text-white">
            Source and method
          </h2>
          <p className="text-slate-300">
            <a
              href={s.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="link-accent underline-offset-2 hover:underline"
            >
              {s.sourceName}
            </a>
            <span className="ml-2 text-xs text-slate-500">↗</span>
          </p>
          <p className="text-slate-400">
            {s.provenance === "reported"
              ? "Reported: the underlying figures were published by the agency named above. ImmigrationClock computed the figure from that publication and typed nothing in."
              : "Counted from ImmigrationClock's own archive: an exact count of records the site holds, not an estimate of anything outside it."}{" "}
            Period: {s.periodLabel}. Computed on {formatDate(BUILD_DATE)}.
          </p>
        </section>

        <section className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-white/5 bg-white/[0.02] p-4">
          <div>
            <p className="text-sm font-semibold text-white">Explore the data</p>
            <p className="mt-1 text-sm text-slate-400">
              The page this signal was computed from, with every underlying figure.
            </p>
          </div>
          <TrackedLink
            href={s.explorePath}
            surface="signal-explore"
            relation="data"
            className="inline-flex items-center rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-ink-950 shadow-card transition-colors hover:bg-accent-soft"
          >
            {pathLabel(s.explorePath)} →
          </TrackedLink>
        </section>

        {related.length > 0 ? (
          <section aria-labelledby="related-heading" className="space-y-3">
            <h2 id="related-heading" className="text-lg font-semibold text-white">
              Related changes
            </h2>
            <ul className="divide-y divide-white/5 rounded-xl border border-white/5 bg-white/[0.02]">
              {related.map(({ path: p, event }) => (
                <li key={p}>
                  <TrackedLink
                    href={p}
                    surface="signal-changes"
                    relation="signal"
                    className="flex flex-col gap-1 p-4 transition-colors hover:bg-white/[0.03]"
                  >
                    <span className="text-sm font-medium text-slate-100">{storyTitle(event!)}</span>
                    <span className="text-xs text-slate-500">{formatDate(event!.publishedAt)}</span>
                  </TrackedLink>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/5 bg-white/[0.02] p-4">
          <div>
            <p className="text-sm font-semibold text-white">Share this signal</p>
            <p className="mt-1 break-all font-mono text-xs text-slate-500">{canonical}</p>
          </div>
          <ShareButton
            title={s.title}
            text={`${s.figure} ${s.figureLabel} — via ImmigrationClock`}
            path={path}
            surface="signal"
            story={key}
          />
        </div>

        <MethodologyNote>
          Data signals are computed from the same committed snapshots the site renders — never
          typed in, never estimated, never written by a model. Only reported figures and exact
          counts of ImmigrationClock&rsquo;s own archive qualify; nothing projected or modeled
          appears here. Direction and magnitude are stated, never causation. See{" "}
          <Link href="/insights" className="link-accent">
            all insights
          </Link>
          .
        </MethodologyNote>
      </div>
    </div>
  );
}
