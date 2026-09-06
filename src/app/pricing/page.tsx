// =============================================================================
// /pricing — what Pro is, and what it deliberately is not
//
// The page has one editorial job before it has a commercial one: make it
// obvious that nothing was taken away. The free column is not a stub designed
// to look inadequate; it is the whole public platform, listed honestly, because
// that is what it is. The founder directive's rule — "revenue is earned by
// creating additional value, not by restricting essential public information"
// — is a claim this page has to be able to survive a reader checking.
//
// Prerendered like every other page. The only client components are the upgrade
// button (which calls the checkout route) and one analytics ping.
// =============================================================================

import Link from "next/link";
import { buildMetadata } from "@/lib/seo";
import { PageHeader } from "@/components/PageHeader";
import { UpgradeButton } from "@/components/UpgradeButton";
import { PricingAnalytics } from "@/components/PricingAnalytics";
import {
  CAPABILITY_SPECS,
  PLAN_BY_ID,
  STATUS_LABEL,
  annualSavingUsd,
  availableNow,
  capabilitiesAddedBy,
  notYetAvailable,
  roadmap,
} from "@/lib/billing/plans";
import type { CapabilityStatus } from "@/lib/billing/plans";
import { SITE } from "@/lib/site";
import { billingStatus } from "@/lib/billing/config";

export const metadata = buildMetadata({
  title: "Pricing — ImmigrationClock Pro",
  description:
    "The public platform stays free: every recorded change, the employer directory, the layoff feed, the API and the weekly newsletter. Pro adds alerts on what you follow, bulk export and professional search.",
  path: "/pricing",
  keywords: ["immigration data subscription", "immigration monitoring", "H-1B data export"],
});

const free = PLAN_BY_ID.get("free")!;
const pro = PLAN_BY_ID.get("pro")!;
const saving = annualSavingUsd(pro);

function Check({ on }: { on: boolean }) {
  return (
    <span aria-hidden className={on ? "text-status-green" : "text-slate-600"}>
      {on ? "✓" : "—"}
    </span>
  );
}

/**
 * Whether a paid line works yet, stated beside it.
 *
 * Not a footnote and not a colour: the words "In build" next to a feature
 * someone is about to pay for. A subscriber who reads this and buys anyway has
 * bought what they were shown.
 */
function Status({ status }: { status: CapabilityStatus }) {
  if (status === "available") return null;
  return (
    <span className="ml-2 rounded border border-status-amber/40 px-1.5 py-0.5 align-middle text-[10px] font-medium uppercase tracking-wide text-status-amber">
      {STATUS_LABEL[status]}
    </span>
  );
}

export default function PricingPage() {
  const freeFeatures = CAPABILITY_SPECS.filter((c) => c.plan === "free");
  // WHAT PRO SELLS — not every capability tagged "pro". Four of these were
  // listed as things a subscriber gets while none of them existed: alerts.ts
  // was imported by nothing but its own test and no scheduler existed anywhere.
  // They are roadmap now, rendered below under a heading that says so.
  const proFeatures = capabilitiesAddedBy("pro");
  const later = roadmap();
  const pending = notYetAvailable("pro");
  const inBuild = pending.filter((c) => c.status === "building").length;
  const planned = pending.filter((c) => c.status === "planned").length;

  // TWO SEPARATE REASONS A PURCHASE CANNOT HAPPEN, and they are not the same
  // sentence to a reader.
  //
  //   hasSomethingToSell  a Pro capability actually works. Derived from the
  //                       specs rather than a flag someone has to flip.
  //   checkoutReady       billing is switched on and configured.
  //
  // Both must hold. Watchlist sync now works, so the first is true — but
  // BILLING_ENABLED is deliberately unset, and rendering a Subscribe button
  // that answers "subscriptions are not open yet" would be the same
  // contradiction this branch was written to remove, just one click later.
  const hasSomethingToSell = availableNow("pro").length > 0;
  const purchasable = hasSomethingToSell && billingStatus().checkoutReady;

  return (
    <div>
      <PricingAnalytics />
      <PageHeader
        eyebrow="Pricing"
        title="The public platform is free. Pro is for watching it professionally."
        description="Nothing that is free today becomes paid. Pro adds three things the site does not do at all yet: alerts on what you follow, bulk export, and search built for research rather than browsing."
        crumbs={[
          { href: "/", label: "Home" },
          { href: "/pricing", label: "Pricing" },
        ]}
      />

      <div className="container-page max-w-5xl space-y-10 py-10">
        <div className="grid gap-5 md:grid-cols-2">
          {/* FREE */}
          <section className="panel panel-pad" aria-labelledby="plan-free">
            <h2 id="plan-free" className="text-lg font-bold text-white">
              {free.name}
            </h2>
            <p className="mt-1 text-sm text-slate-400">{free.tagline}</p>
            <p className="mt-4 font-mono text-3xl font-extrabold tabular-nums text-white">$0</p>
            <p className="mt-1 text-xs text-slate-500">No account. No card. No limits.</p>

            <ul className="mt-5 space-y-2.5 text-sm">
              {freeFeatures.map((f) => (
                <li key={f.id} className="flex gap-2.5">
                  <Check on />
                  <span>
                    <span className="font-medium text-slate-200">{f.label}</span>
                    <span className="block text-xs text-slate-400">{f.blurb}</span>
                  </span>
                </li>
              ))}
            </ul>

            <p className="mt-5 text-xs text-slate-500">
              This is the whole public platform, and it stays that way.{" "}
              <Link href="/methodology" className="text-accent hover:underline">
                How we source it
              </Link>
              .
            </p>
          </section>

          {/* PRO */}
          <section className="panel panel-pad border-accent/25" aria-labelledby="plan-pro">
            <h2 id="plan-pro" className="text-lg font-bold text-white">
              {pro.name}
            </h2>
            <p className="mt-1 text-sm text-slate-400">{pro.tagline}</p>

            <div className="mt-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="font-mono text-3xl font-extrabold tabular-nums text-accent">
                ${pro.monthlyUsd}
              </span>
              <span className="text-sm text-slate-400">per month</span>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              or ${pro.annualUsd} a year{saving ? ` — two months free` : ""}. Cancel any time, from your
              own billing page.
            </p>

            <ul className="mt-5 space-y-2.5 text-sm">
              {proFeatures.map((f) => (
                <li key={f.id} className="flex gap-2.5">
                  <Check on={f.status === "available"} />
                  <span>
                    <span className="font-medium text-white">{f.label}</span>
                    <Status status={f.status} />
                    <span className="block text-xs text-slate-400">{f.blurb}</span>
                  </span>
                </li>
              ))}
              <li className="flex gap-2.5">
                <Check on />
                <span>
                  <span className="font-medium text-white">Everything in Free</span>
                  <span className="block text-xs text-slate-400">
                    Pro adds to the public platform. It does not unlock any of it.
                  </span>
                </span>
              </li>
            </ul>

            {/* THE ZERO-AVAILABLE STATE IS REACHABLE AND HAS TO READ HONESTLY.
                The paragraph below used to say "subscribe now only if the ones
                marked available are already worth it to you", which pointed at
                an empty set the moment watchlist_sync was corrected from
                "available" to "building" — every Pro row renders a dash, and
                there is no "rest" either. A reader cannot follow an instruction
                about a set with nothing in it, and asking for $19 against a
                column of dashes without saying so plainly is the one thing this
                paragraph exists to prevent. */}
            {/* Three states now, not two: nothing finished, some finished, all
                finished. The first branch stopped being reachable the moment
                watchlist sync shipped, and leaving it as the only "unfinished"
                wording would have called a working capability unfinished. */}
            {pending.length > 0 && pending.length === proFeatures.length ? (
              <p className="mt-5 rounded-lg border border-status-amber/25 bg-status-amber/[0.06] px-3 py-2.5 text-xs leading-relaxed text-slate-300">
                <strong className="text-white">Being straight with you: none of this is
                finished yet.</strong>{" "}
                {/* Counts by status rather than one comma-joined list. The old
                    sentence called all five "in build" when two are only
                    planned — wrong in the flattering direction, in the one
                    paragraph whose whole job is precision — and joining the
                    labels with commas made "Your watchlist, everywhere" read as
                    two separate capabilities. The badge on each line already
                    says which is which. */}
                Of the {proFeatures.length} capabilities above,{" "}
                {inBuild > 0 ? `${inBuild} ${inBuild === 1 ? "is" : "are"} in build` : null}
                {inBuild > 0 && planned > 0 ? " and " : null}
                {planned > 0 ? `${planned} ${planned === 1 ? "is" : "are"} planned` : null}; the
                badge on each line says which. There is nothing here to buy today that you do not
                already get free. Everything on the free plan stays free and stays complete.
              </p>
            ) : pending.length > 0 ? (
              <p className="mt-5 rounded-lg border border-status-amber/25 bg-status-amber/[0.06] px-3 py-2.5 text-xs leading-relaxed text-slate-300">
                <strong className="text-white">Being straight with you:</strong>{" "}
                {pending.length} of the {proFeatures.length} capabilities above{" "}
                {pending.length === 1 ? "is" : "are"} not finished yet. Subscribe now only if the
                ones marked available are already worth it to you. The rest arrive at no extra cost.
                {/* A real list, not a comma-joined sentence: one capability is
                    literally called "Your watchlist, everywhere". */}
                <span className="mt-1.5 block">
                  {pending.map((f) => (
                    <span key={f.id} className="block">
                      {"\u00b7 "}
                      {f.label}{" "}
                      <span className="text-slate-500">({STATUS_LABEL[f.status].toLowerCase()})</span>
                    </span>
                  ))}
                </span>
              </p>
            ) : null}

            {later.length > 0 ? (
              <div className="mt-5 rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2.5">
                <p className="text-xs font-semibold text-slate-300">Not included — what we are building next</p>
                {/* THESE ARE NOT SOLD, AND THE HEADING HAS TO SAY SO. They were
                    listed as Pro capabilities with "in build" and "planned"
                    badges, which reads as "included, arriving shortly" — and a
                    $190 annual subscriber was buying one working capability and
                    four intentions. Removing the promise must not become hiding
                    the plan, so they stay on the page, outside the offer. */}
                <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
                  Not part of Pro today and not paid for by subscribing. If they ship, they arrive at
                  no extra cost.
                </p>
                <span className="mt-1.5 block text-[11px] text-slate-400">
                  {later.map((f) => (
                    <span key={f.id} className="block">
                      {"· "}
                      {f.label}{" "}
                      <span className="text-slate-600">({STATUS_LABEL[f.status].toLowerCase()})</span>
                    </span>
                  ))}
                </span>
              </div>
            ) : null}

            {/* THE PRICE STAYS, THE PURCHASE DOES NOT.
                Two live Subscribe buttons sat directly beneath a paragraph
                saying there is nothing to buy — the reader was told not to
                subscribe and invited to in the same breath. The prices are the
                intended ones and stay on the page; what is withheld is the
                ability to pay for a product that cannot yet do anything.
                Nothing about the Stripe wiring changes, and this branch
                disappears by itself the moment a Pro capability is available. */}
            {purchasable ? (
              <div className="mt-6 space-y-3">
                <UpgradeButton interval="monthly" placement="pricing_page" label={`Subscribe — $${pro.monthlyUsd}/month`} />
                <UpgradeButton
                  interval="annual"
                  placement="pricing_page"
                  label={`Subscribe yearly — $${pro.annualUsd}`}
                  className="[&>button]:bg-transparent [&>button]:text-slate-200 [&>button]:ring-1 [&>button]:ring-white/15 [&>button]:hover:bg-white/5"
                />
                {/* A TEST DEPLOYMENT MUST NOT LOOK LIKE A LIVE ONE.
                    /account already says this; /pricing is where somebody
                    actually clicks Subscribe, and it is the page the activation
                    walkthrough opens first. Driven by whether the configured
                    Stripe key is a test key, so it cannot be left on by
                    accident when real keys arrive. */}
                {billingStatus().testMode ? (
                  <p className="rounded-md border border-status-amber/30 bg-status-amber/[0.06] px-3 py-2 text-center text-[11px] text-status-amber">
                    Test mode. No real card is charged, and any subscription
                    created here is not a real one.
                  </p>
                ) : null}
                <p className="text-center text-[11px] text-slate-500">
                  Payment is handled by Stripe. {SITE.name} never sees your card.
                </p>
              </div>
            ) : (
              <div className="mt-6 space-y-3">
                <div
                  data-testid="pro-not-for-sale"
                  className="rounded-lg border border-dashed border-white/15 bg-white/[0.02] px-4 py-3 text-center"
                >
                  <p className="text-sm font-semibold text-slate-200">Not for sale yet</p>
                  {hasSomethingToSell ? (
                    <p className="mt-1 text-xs leading-relaxed text-slate-400">
                      Pro will be ${pro.monthlyUsd} a month, or ${pro.annualUsd} a year.{" "}
                      {availableNow("pro")[0].label} works today; subscriptions are not open yet,
                      so there is nothing to pay for while we finish the rest.
                    </p>
                  ) : (
                    <p className="mt-1 text-xs leading-relaxed text-slate-400">
                      Pro will be ${pro.monthlyUsd} a month, or ${pro.annualUsd} a year. You cannot
                      subscribe today, because none of it works yet and we are not taking money for
                      something that does not.
                    </p>
                  )}
                </div>
                <p className="text-center text-[11px] text-slate-500">
                  The{" "}
                  <Link href="/pulse" className="link-accent">
                    weekly email
                  </Link>{" "}
                  says when it opens, and stays free either way.
                </p>
              </div>
            )}
          </section>
        </div>

        {/* WHAT PRO IS NOT — the credibility section. */}
        <section aria-labelledby="not-heading" className="panel panel-pad">
          <h2 id="not-heading" className="section-title">
            What Pro is not
          </h2>
          <ul className="mt-3 space-y-2 text-sm text-slate-300">
            <li>
              <strong className="text-white">It is not a paywall on public information.</strong> Every
              recorded change, every employer page, the layoff feed, the API and the weekly newsletter
              stay free and open to search engines. If that ever changes, this line goes with it.
            </li>
            <li>
              <strong className="text-white">It is not legal advice</strong>, and a subscription does not
              make it any. The disclaimers on every page apply identically.
            </li>
            <li>
              <strong className="text-white">It does not change what we publish.</strong> No subscriber
              influences which changes are recorded or how they are described.{" "}
              <Link href="/methodology" className="text-accent hover:underline">
                How we decide what to record
              </Link>
              .
            </li>
          </ul>
        </section>

        <section aria-labelledby="faq-heading" className="space-y-4">
          <h2 id="faq-heading" className="section-title">
            Questions
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="panel panel-pad">
              <h3 className="text-sm font-semibold text-white">Do I need an account to read the site?</h3>
              <p className="mt-1.5 text-sm text-slate-400">
                No. There are no accounts on the public platform and no plans for any. A Pro
                subscription is a billing relationship with Stripe, not a login for reading.
              </p>
            </div>
            <div className="panel panel-pad">
              <h3 className="text-sm font-semibold text-white">What happens to my follows?</h3>
              <p className="mt-1.5 text-sm text-slate-400">
                They stay in your browser exactly as they are now. Pro is what lets you receive email
                when something changes for them, and keep them across devices.
              </p>
            </div>
            <div className="panel panel-pad">
              <h3 className="text-sm font-semibold text-white">Can I cancel?</h3>
              <p className="mt-1.5 text-sm text-slate-400">
                Yes, from your billing page, at any time. It runs to the end of the period you paid
                for and does not renew.
              </p>
            </div>
            <div className="panel panel-pad">
              <h3 className="text-sm font-semibold text-white">Who is this for?</h3>
              <p className="mt-1.5 text-sm text-slate-400">
                People who track immigration policy as part of their work: legal and mobility teams,
                HR, recruiters, researchers and journalists. If you are reading about your own case,
                the free platform is the product.
              </p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
