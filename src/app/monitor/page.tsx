// =============================================================================
// /monitor — the professional intelligence inbox
//
// THE JOB THIS PAGE DOES, WHICH NO OTHER PAGE DOES
// ------------------------------------------------
// /what-changed is the archive: everything, newest first. /following lets a
// reader choose what they care about. Neither answers the question a person
// paid to watch immigration actually asks on a Monday morning:
//
//   "Of everything that changed, what touches the work I am responsible for,
//    how soon do I have to care, and can I see why you think so?"
//
// That is this page. It buckets by urgency rather than by date, and every item
// carries its own case — the effective date, the dimensions the evidence
// supports, the quote behind each one, how strong that evidence is, what the
// record does not cover, and whether a person has reviewed it.
//
// IT IS FREE, AND THAT IS DELIBERATE
// ----------------------------------
// The founder rule is that revenue comes from adding value, not from restricting
// public information. This page adds value — it is new — so it could have been
// the paywall. It is not, because a professional cannot evaluate a monitoring
// product they cannot use. What Pro adds is the part that only makes sense once
// someone relies on it: the watchlist synced across devices, and email when
// something lands in "needs attention" instead of having to come and look.
//
// PERSONALIZATION WITHOUT A PROFILE
// ---------------------------------
// The watchlist lives in the reader's browser. The inbox is assembled by
// calling /api/v1/monitor with the follows as query parameters, so nothing about
// what a firm watches is stored on our side. That is the same endpoint a vendor
// integrates against, which keeps the page and the product from drifting apart.
// =============================================================================

import { buildMetadata } from "@/lib/seo";
import { ogImagePath } from "@/lib/share";
import { PageHeader } from "@/components/PageHeader";
import { MonitorInbox } from "@/components/MonitorInbox";
import Link from "next/link";

export const metadata = buildMetadata({
  title: "Monitor — what changed that matters to your work",
  description:
    "A professional inbox for U.S. immigration change: what needs attention, what takes effect soon, and the evidence behind every classification. Free, sourced, and never legal advice.",
  path: "/monitor",
  image: ogImagePath("page", "following"),
  keywords: [
    "immigration change monitoring",
    "USCIS rule tracking",
    "Federal Register immigration alerts",
    "immigration compliance monitoring",
  ],
});

export default function MonitorPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
      <PageHeader
        eyebrow="For professionals"
        title="What changed that matters to your work"
        description="Recorded U.S. immigration changes, sorted by how soon you have to care, with the evidence behind every classification. Built for people whose job includes noticing."
        crumbs={[
          { href: "/", label: "Home" },
          { href: "/what-changed", label: "What changed" },
          { href: "/monitor", label: "Monitor" },
        ]}
      />

      <div className="mt-8">
        <MonitorInbox />
      </div>

      <section className="mt-10 rounded-xl border border-white/5 bg-white/[0.02] p-4">
        <h2 className="text-sm font-semibold text-white">How to read this</h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-400">
          Every classification here was made from the document&rsquo;s own words, and every one
          carries the quote it came from. Where the evidence is a citation or an aside rather than
          the document&rsquo;s subject, the item says so and sits in{" "}
          <span className="text-slate-300">Potentially relevant</span> rather than{" "}
          <span className="text-slate-300">Needs attention</span>.
        </p>
        <p className="mt-3 text-sm leading-relaxed text-slate-400">
          Precision is measured against hand-labelled records and published per dimension at{" "}
          <Link href="/developers" className="link-accent">
            the developer page
          </Link>
          . Recall is not high enough on any dimension for this to be treated as exhaustive, so an
          empty bucket means nothing matched — never that nothing happened. This is workflow
          intelligence about published government material. It is not legal advice, and it makes no
          determination about any person or case.
        </p>
        <p className="mt-3 text-sm leading-relaxed text-slate-400">
          Want this inside your own product?{" "}
          <Link href="/developers" className="link-accent">
            The same inbox is available as an API
          </Link>
          , free and without a key.
        </p>
      </section>
    </div>
  );
}
