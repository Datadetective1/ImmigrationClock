// =============================================================================
// /what-changed/<slug> — one page per recorded change
//
// WHY EVERY CHANGE GETS A PAGE
// ----------------------------
// Until now a recorded change lived only inside the feed, and the only way to
// point at one was /what-changed?q=<words> — the same page, the same Open Graph
// card, and a search that a title correction could break. A social post about
// a court order unfurled as the homepage. A reader who wanted to send one
// change to someone had to send them a search.
//
// So each record has an address of its own (src/lib/share.ts), resolved by the
// hash at the end of the slug rather than by the words — an older slug for the
// same record redirects to the current one — and this page is what lives there: the full record, its source, its dates, its status, who the
// document says is affected, the explainers that help read it, and the other
// records it is related to. Nothing is generated for the page; everything on it
// is a field the pipeline already validated, rendered by the same EventCard the
// feed uses, so the two can never disagree.
//
// ROUTINE NOTICES ARE SHAREABLE, NOT INDEXABLE
// --------------------------------------------
// Paperwork notices are real documents and someone may want to link one, so
// they get a page too. They are marked noindex: three hundred near-identical
// "Agency Information Collection Activities" pages are exactly the thin
// content a search engine penalises a whole site for, and the feed already
// keeps them behind a disclosure for the same editorial reason.
// =============================================================================

import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { buildMetadata, jsonLd } from "@/lib/seo";
import { SITE } from "@/lib/site";
import { PageHeader } from "@/components/PageHeader";
import { EventCard } from "@/components/EventCard";
import { ShareButton } from "@/components/ShareButton";
import { StoryAnalytics } from "@/components/StoryAnalytics";
import { MethodologyNote } from "@/components/MethodologyNote";
import { TrackedLink } from "@/components/TrackedLink";
import { EVENTS } from "@/lib/event-store";
import { changePath, changeSlug, explainerPath, matchesChangeSlug, ogImagePath } from "@/lib/share";
import { explainersFor } from "@/lib/editorial/explainers";
import { CLASSIFICATION_LABEL, SEVERITY_LABEL, isNotInForce } from "@/lib/event-labels";
import { SOURCE_BY_KEY } from "@/lib/sources";
import { formatDate } from "@/lib/format";
import { isScheduled, type ImmigrationEvent } from "@/domains/graph/events";
import { relatedChanges, relationTo, storyDescription, storyKey, storyTitle } from "@/lib/stories";

// Every record is prerendered. A slug the build did not see is still answered
// on request, because the readable part of a slug can change when a title is
// corrected upstream and a link shared before the correction must keep
// working: the hash at its end still names the record, and the page sends the
// reader on to the canonical address with a permanent redirect. A slug whose
// hash names nothing is a 404. Both are rendered once and cached, so the
// on-demand path costs one render per address, not one per visit.
export const dynamicParams = true;

export function generateStaticParams() {
  return EVENTS.map((e) => ({ slug: changeSlug(e) }));
}

/**
 * The exact slug first; otherwise by hash, so a link minted before a title
 * correction still resolves — but only when the hash names exactly one
 * record. Two records sharing a six-character hash is a build error the
 * share tests refuse; if it ever slipped through, the answer is a 404, not
 * a permanent redirect to the wrong record.
 */
function resolve(slug: string): ImmigrationEvent | null {
  const exact = EVENTS.find((e) => changeSlug(e) === slug);
  if (exact) return exact;
  const byHash = EVENTS.filter((e) => matchesChangeSlug(e, slug));
  return byHash.length === 1 ? byHash[0] : null;
}

/** An old slug for a record that still exists goes to the record's current address. */
function canonicalise(event: ImmigrationEvent, slug: string): void {
  if (slug !== changeSlug(event)) permanentRedirect(changePath(event));
}

export function generateMetadata({ params }: { params: { slug: string } }) {
  const event = resolve(params.slug);
  if (!event) {
    return buildMetadata({
      title: "Change not found",
      description: "No recorded change has this address.",
      path: `/what-changed/${params.slug}`,
      noindex: true,
    });
  }
  const source = SOURCE_BY_KEY[event.sourceKey];
  return buildMetadata({
    title: storyTitle(event),
    description: storyDescription(event),
    // The canonical slug, even when the request arrived on an older one.
    path: changePath(event),
    image: ogImagePath("change", changeSlug(event)),
    keywords: [CLASSIFICATION_LABEL[event.classification], source?.name ?? event.sourceKey],
    noindex: event.severity === "routine",
  });
}

function Fact({ label, value, emphasis = false }: { label: string; value: string; emphasis?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-[11px] uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className={`text-sm ${emphasis ? "font-semibold text-status-amber" : "text-slate-200"}`}>{value}</dd>
    </div>
  );
}

export default function ChangePage({ params }: { params: { slug: string } }) {
  const event = resolve(params.slug);
  if (!event) notFound();
  canonicalise(event, params.slug);

  const source = SOURCE_BY_KEY[event.sourceKey];
  const sourceName = source?.name ?? event.sourceKey;
  const title = storyTitle(event);
  const description = storyDescription(event);
  const path = changePath(event);
  const canonical = `${SITE.url}${path}`;
  const key = storyKey(event);
  const scheduled = isScheduled(event);
  const context = explainersFor(`${event.title} ${event.summary}`);
  const related = relatedChanges(event, EVENTS);

  const article = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: title,
    description,
    datePublished: event.publishedAt,
    dateModified: event.lastVerifiedAt,
    mainEntityOfPage: { "@type": "WebPage", "@id": canonical },
    image: [`${SITE.url}${ogImagePath("change", changeSlug(event))}`],
    author: { "@type": "Organization", name: SITE.name, url: SITE.url },
    publisher: {
      "@type": "Organization",
      name: SITE.name,
      url: SITE.url,
      logo: { "@type": "ImageObject", url: `${SITE.url}/og.svg` },
    },
    // The government document this record is a reading of.
    isBasedOn: event.sourceUrl,
  };

  return (
    <div>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(article) }} />
      <StoryAnalytics story={key} category={event.classification} />

      <PageHeader
        eyebrow={`${CLASSIFICATION_LABEL[event.classification]} · ${sourceName}`}
        title={title}
        description={`Recorded by ImmigrationClock from ${sourceName}, ${
          scheduled ? "scheduled for publication on" : "published"
        } ${formatDate(event.publishedAt)}${event.effectiveAt ? `, effective ${formatDate(event.effectiveAt)}` : ""}.`}
        crumbs={[
          { href: "/", label: "Home" },
          { href: "/what-changed", label: "What changed" },
          { href: path, label: title },
        ]}
        share
        shareSurface="change"
        shareStory={key}
        sharePath={path}
      >
        {/* The status strip: the five facts a reader checks before reading a
            word of the summary. Severity is a typographic weight, never a
            colour — the platform reports whether something changed, not
            whether the change is welcome. Amber is reserved for "not in force". */}
        <dl className="flex flex-wrap gap-x-8 gap-y-3 rounded-xl border border-white/5 bg-white/[0.02] px-4 py-3">
          <Fact label="Severity" value={SEVERITY_LABEL[event.severity]} />
          <Fact
            label="Classification"
            value={CLASSIFICATION_LABEL[event.classification]}
            emphasis={isNotInForce(event.classification)}
          />
          <Fact label={scheduled ? "Scheduled for publication" : "Published"} value={formatDate(event.publishedAt)} />
          <Fact label="Effective" value={event.effectiveAt ? formatDate(event.effectiveAt) : "None stated"} />
          <Fact label="Source checked" value={formatDate(event.lastVerifiedAt)} />
        </dl>
      </PageHeader>

      <div className="container-page max-w-3xl space-y-8 py-10">
        {/* The record itself — the same component the feed renders, so the
            proposal banner, the derived explanation, who-is-affected, the
            limitations and the source link are identical on both surfaces. */}
        <EventCard event={event} />

        {context.length > 0 ? (
          <section aria-labelledby="context-heading" className="space-y-3">
            <h2 id="context-heading" className="text-lg font-semibold text-white">
              Context
            </h2>
            <p className="text-sm text-slate-400">
              Source-backed explainers of the distinctions this kind of document turns on.
            </p>
            <ul className="space-y-2">
              {context.map((x) => (
                <li key={x.slug}>
                  <TrackedLink
                    href={explainerPath(x.slug)}
                    surface="story-context"
                    relation="keyword"
                    className="block rounded-xl border border-white/5 bg-white/[0.02] p-4 transition-colors hover:border-accent/40"
                  >
                    <span className="block text-sm font-semibold text-white">{x.title}</span>
                    <span className="mt-1 block text-sm text-slate-400">{x.kicker}</span>
                  </TrackedLink>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {related.length > 0 ? (
          <section aria-labelledby="related-heading" className="space-y-3">
            <h2 id="related-heading" className="text-lg font-semibold text-white">
              Related changes
            </h2>
            <p className="text-sm text-slate-400">
              Other recorded changes on the same rule, or naming the same visa, country or Policy
              Manual section. Newest first.
            </p>
            <ul className="divide-y divide-white/5 rounded-xl border border-white/5 bg-white/[0.02]">
              {related.map((r) => (
                <li key={r.id}>
                  <TrackedLink
                    href={changePath(r)}
                    surface="related-changes"
                    relation={relationTo(event, r)}
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

        <section
          aria-labelledby="follow-heading"
          className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-white/5 bg-white/[0.02] p-4"
        >
          <div className="max-w-md">
            <h2 id="follow-heading" className="text-sm font-semibold text-white">
              Follow this
            </h2>
            <p className="mt-1 text-sm text-slate-400">
              Choose the countries, visas, agencies and topics this change touches, and
              ImmigrationClock will organise future changes around them — in your browser, never on
              our servers.
            </p>
          </div>
          <Link
            href="/following"
            className="inline-flex items-center rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-ink-950 shadow-card transition-colors hover:bg-accent-soft"
          >
            Follow what matters →
          </Link>
        </section>

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/5 bg-white/[0.02] p-4">
          <div>
            <p className="text-sm font-semibold text-white">Share this record</p>
            <p className="mt-1 break-all font-mono text-xs text-slate-500">{canonical}</p>
          </div>
          <ShareButton title={title} text={`${title} — via ImmigrationClock`} path={path} surface="change" story={key} />
        </div>

        <MethodologyNote>
          This record was built from the linked government document by explicit, published rules
          per source — never by a language model, and never by how much attention an item might
          attract. Where the document states who is affected, it is quoted; where ImmigrationClock
          inferred something, it is labelled as an inference. The source was last checked on{" "}
          {formatDate(event.lastVerifiedAt)}. Nothing here is legal advice about anyone&rsquo;s case.
        </MethodologyNote>
      </div>
    </div>
  );
}
