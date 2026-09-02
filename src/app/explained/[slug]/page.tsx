// =============================================================================
// /explained/<slug> — one page per editorial explainer
//
// An explainer is a closed fact set (src/lib/editorial/explainers.ts): finished
// sentences a person wrote from a cited government source, with the date they
// were last checked. This page renders that set and nothing more — the facts,
// why the distinction matters, the sources, the ImmigrationClock pages that
// hold the underlying data, and the recent changes the explainer helps read.
// The social copy engine may only restate what is on this page, so the page
// and the post can never disagree about a fact.
// =============================================================================

import Link from "next/link";
import { notFound } from "next/navigation";
import { buildMetadata, jsonLd } from "@/lib/seo";
import { SITE } from "@/lib/site";
import { PageHeader } from "@/components/PageHeader";
import { ShareButton } from "@/components/ShareButton";
import { MethodologyNote } from "@/components/MethodologyNote";
import { TrackedLink } from "@/components/TrackedLink";
import { EXPLAINERS, EXPLAINER_BY_SLUG } from "@/lib/editorial/explainers";
import { EVENTS } from "@/lib/event-store";
import { changePath, explainerPath, ogImagePath } from "@/lib/share";
import { CLASSIFICATION_LABEL } from "@/lib/event-labels";
import { SOURCE_BY_KEY } from "@/lib/sources";
import { formatDate } from "@/lib/format";
import { EXPLAINER_GROUP_LABEL, changesForKeywords, pathLabel, storyTitle } from "@/lib/stories";

export const dynamicParams = false;

export function generateStaticParams() {
  return EXPLAINERS.map((e) => ({ slug: e.slug }));
}

export function generateMetadata({ params }: { params: { slug: string } }) {
  const e = EXPLAINER_BY_SLUG.get(params.slug);
  if (!e) {
    return buildMetadata({
      title: "Explainer not found",
      description: "No explainer has this address.",
      path: explainerPath(params.slug),
      noindex: true,
    });
  }
  return buildMetadata({
    title: e.title,
    description: e.kicker,
    path: explainerPath(e.slug),
    image: ogImagePath("explainer", e.slug),
    keywords: e.keywords,
  });
}

export default function ExplainerPage({ params }: { params: { slug: string } }) {
  const e = EXPLAINER_BY_SLUG.get(params.slug);
  if (!e) notFound();

  const path = explainerPath(e.slug);
  const canonical = `${SITE.url}${path}`;
  const key = `explainer:${e.slug}`;
  const recent = changesForKeywords(e.keywords, EVENTS);

  const article = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: e.title,
    description: e.kicker,
    dateModified: e.verifiedAt,
    mainEntityOfPage: { "@type": "WebPage", "@id": canonical },
    image: [`${SITE.url}${ogImagePath("explainer", e.slug)}`],
    author: { "@type": "Organization", name: SITE.name, url: SITE.url },
    publisher: {
      "@type": "Organization",
      name: SITE.name,
      url: SITE.url,
      logo: { "@type": "ImageObject", url: `${SITE.url}/og.svg` },
    },
    citation: e.sources.map((s) => s.url),
  };

  return (
    <div>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(article) }} />

      <PageHeader
        eyebrow={`ImmigrationClock explains · ${EXPLAINER_GROUP_LABEL[e.group]}`}
        title={e.title}
        description={e.kicker}
        crumbs={[
          { href: "/", label: "Home" },
          { href: "/explained", label: "Explained" },
          { href: path, label: e.title },
        ]}
        share
        shareSurface="explainer"
        shareStory={key}
      />

      <div className="container-page max-w-3xl space-y-8 py-10">
        <section aria-labelledby="facts-heading" className="panel panel-pad">
          <h2 id="facts-heading" className="eyebrow mb-3 text-accent">
            The facts
          </h2>
          <ol className="space-y-3">
            {e.facts.map((fact, i) => (
              <li key={i} className="flex gap-3 text-sm leading-relaxed text-slate-200">
                <span aria-hidden className="mt-0.5 font-mono text-xs text-slate-500">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span>{fact}</span>
              </li>
            ))}
          </ol>
        </section>

        <section aria-labelledby="why-heading" className="rounded-xl border border-white/5 bg-white/[0.02] p-4 sm:p-5">
          <h2 id="why-heading" className="eyebrow mb-2 text-slate-500">
            Why it matters
          </h2>
          <p className="text-sm leading-relaxed text-slate-300">{e.whyItMatters}</p>
        </section>

        <section aria-labelledby="sources-heading" className="space-y-2">
          <h2 id="sources-heading" className="text-lg font-semibold text-white">
            Sources
          </h2>
          <ul className="space-y-1.5">
            {e.sources.map((s) => (
              <li key={s.url} className="text-sm">
                <a
                  href={s.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="link-accent underline-offset-2 hover:underline"
                >
                  {s.name}
                </a>
                <span className="ml-2 text-xs text-slate-500">↗</span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-slate-500">
            Every sentence above was written by a person from these sources and last checked
            against them on {formatDate(e.verifiedAt)}.
          </p>
        </section>

        {e.relatedPaths.length > 0 ? (
          <section aria-labelledby="related-heading" className="space-y-2">
            <h2 id="related-heading" className="text-lg font-semibold text-white">
              Related on ImmigrationClock
            </h2>
            <ul className="flex flex-wrap gap-2">
              {e.relatedPaths.map((p) => (
                <li key={p}>
                  <TrackedLink href={p} surface="explainer-related" relation="data" className="chip hover:border-accent/40 hover:text-accent-soft">
                    {pathLabel(p)}
                  </TrackedLink>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {recent.length > 0 ? (
          <section aria-labelledby="recent-heading" className="space-y-3">
            <h2 id="recent-heading" className="text-lg font-semibold text-white">
              Recent changes this helps read
            </h2>
            <ul className="divide-y divide-white/5 rounded-xl border border-white/5 bg-white/[0.02]">
              {recent.map((r) => (
                <li key={r.id}>
                  <TrackedLink
                    href={changePath(r)}
                    surface="explainer-changes"
                    relation="keyword"
                    className="flex flex-col gap-1 p-4 transition-colors hover:bg-white/[0.03]"
                  >
                    <span className="text-sm font-medium text-slate-100">{storyTitle(r)}</span>
                    <span className="text-xs text-slate-500">
                      {CLASSIFICATION_LABEL[r.classification]} · {formatDate(r.publishedAt)} ·{" "}
                      {SOURCE_BY_KEY[r.sourceKey]?.name ?? r.sourceKey}
                    </span>
                  </TrackedLink>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/5 bg-white/[0.02] p-4">
          <div>
            <p className="text-sm font-semibold text-white">Share this explainer</p>
            <p className="mt-1 break-all font-mono text-xs text-slate-500">{canonical}</p>
          </div>
          <ShareButton title={e.title} text={`${e.title} — ${e.kicker}`} path={path} surface="explainer" story={key} />
        </div>

        <MethodologyNote>
          Explainers describe how the system works. They are not advice about any individual
          case, and they never tell anyone what to do. See{" "}
          <Link href="/explained" className="link-accent">
            all explainers
          </Link>{" "}
          for the rest of the set.
        </MethodologyNote>
      </div>
    </div>
  );
}
