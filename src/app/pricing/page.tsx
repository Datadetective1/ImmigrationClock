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
import { NewsletterOptInGroup, UpgradeButton } from "@/components/UpgradeButton";
import { PurchasePanel } from "@/components/PurchasePanel";
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
import { billingStatus } from "@/lib/billing/config";

export const metadata = buildMetadata({
  title: "Pricing: ImmigrationClock Pro",
  description:
    "The public platform stays free: every recorded change, the employer directory, the layoff feed, the API and the weekly newsletter. Pro keeps your watchlist on every device.",
  path: "/pricing",
  // No export keyword: that capability is roadmap, not a product.
  keywords: ["immigration data subscription", "immigration monitoring", "immigration watchlist"],
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
  //
  // THIS PAGE IS STATIC, SO THIS RUNS AT BUILD TIME AND ONLY THEN. That was a
  // silent way to be unbuyable: switch billing on in production and the page
  // kept saying "Not for sale yet" until somebody redeployed. The value below
  // is now the FIRST PAINT only — PurchasePanel re-asks the dynamic route on
  // mount and is the one that decides. See src/components/PurchasePanel.tsx.
  const hasSomethingToSell = availableNow("pro").length > 0;
  const builtReady = billingStatus().checkoutReady;
  const purchasable = hasSomethingToSell && builtReady;

  return (
    <div>
      <PricingAnalytics />
      <PageHeader
        eyebrow="Pricing"
        title="The public platform is free. Pro is for watching it professionally."
        description="Nothing that is free today becomes paid. Pro adds email alerts on what you follow, your Briefing, and the same watchlist on every device."
        crumbs={[
          { href: "/", label: "Home" },
          { href: "/pricing", label: "Pricing" },
        ]}
      />

      <div className="container-page max-w-5xl space-y-10 py-10">
        <div className="grid gap-5 md:grid-cols-2">
          {/* FREE */}
          {/* ON A PHONE, PRO COMES FIRST. People open /pricing to see what Pro
              costs; stacking the free list above it put the price and the buy
              button a long scroll down. From md up the two sit side by side
              in the usual Free, Pro order. */}
          <section className="panel panel-pad order-2 md:order-1" aria-labelledby="plan-free">
            <h2 id="plan-free" className="text-lg font-bold text-white">
              {free.name}
            </h2>
            <p className="mt-1 text-sm text-slate-400">{free.tagline}</p>
            <p className="mt-4 font-mono text-3xl font-extrabold tabular-nums text-white">$0</p>

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
          <section className="panel panel-pad order-1 border-accent/25 md:order-2" aria-labelledby="plan-pro">
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
              or ${pro.annualUsd} a year{saving ? `, which is two months free` : ""}. Cancel any time.
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


            {/* THE PRICE STAYS, THE PURCHASE DOES NOT.
                Two live Subscribe buttons sat directly beneath a paragraph
                saying there is nothing to buy — the reader was told not to
                subscribe and invited to in the same breath. The prices are the
                intended ones and stay on the page; what is withheld is the
                ability to pay for a product that cannot yet do anything.
                Nothing about the Stripe wiring changes, and this branch
                disappears by itself the moment a Pro capability is available. */}
            {/* THE PRICE STAYS, THE PURCHASE DOES NOT.
                Two live Subscribe buttons sat directly beneath a paragraph
                saying there is nothing to buy — the reader was told not to
                subscribe and invited to in the same breath. The prices are the
                intended ones and stay on the page; what is withheld is the
                ability to pay for a product that cannot yet do anything.

                WHICH OF THE TWO IS SHOWN IS DECIDED AT REQUEST TIME. This page
                is prerendered, so reading billingStatus() here answered once,
                at build time, and froze the buy button into the HTML — which
                meant switching billing on in production changed nothing until
                the next deploy. `builtReady` is the first paint; PurchasePanel
                confirms it against the live route. */}
            <PurchasePanel
              initialReady={purchasable}
              initialTestMode={billingStatus().testMode}
              forSale={
                <>
                  <NewsletterOptInGroup>
                    <UpgradeButton interval="monthly" placement="pricing_page" label={`Subscribe: $${pro.monthlyUsd} a month`} />
                    <UpgradeButton
                      interval="annual"
                      placement="pricing_page"
                      label={`Subscribe yearly: $${pro.annualUsd}`}
                      className="[&>button]:bg-transparent [&>button]:text-slate-200 [&>button]:ring-1 [&>button]:ring-white/15 [&>button]:hover:bg-white/5"
                    />
                  </NewsletterOptInGroup>
                  {/* ONE LINE OF SMALL PRINT. Renewal and tax are said here because
                      a buyer must see them before paying; the rest lives in the
                      billing terms it links to. */}
                  <p className="text-center text-[11px] leading-relaxed text-slate-500">
                    Secure checkout by Stripe. Renews automatically until you cancel, and you can
                    cancel any time from your account. Any sales tax is shown before you pay.{" "}
                    <Link href="/terms" className="link-accent">
                      Billing terms
                    </Link>
                  </p>
                </>
              }
              notForSale={
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
              }
            />
          </section>
        </div>

        <section aria-labelledby="faq-heading" className="space-y-4">
          <h2 id="faq-heading" className="section-title">
            Questions
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="panel panel-pad">
              <h3 className="text-sm font-semibold text-white">Do I need an account to read the site?</h3>
              <p className="mt-1.5 text-sm text-slate-400">
                No. Everything public stays open with no sign-in. For Pro you sign in with a link
                we email you. There is no password.
              </p>
            </div>
            <div className="panel panel-pad">
              <h3 className="text-sm font-semibold text-white">What happens to my follows?</h3>
              <p className="mt-1.5 text-sm text-slate-400">
                They come with you. Pro keeps the same list on every device. Pro also emails you
                when a recorded change touches something on that list, at most once a day.
              </p>
            </div>
            <div className="panel panel-pad">
              <h3 className="text-sm font-semibold text-white">Can I cancel?</h3>
              <p className="mt-1.5 text-sm text-slate-400">
                Yes, any time, from your account. Pro keeps working until the end of the period you
                paid for.
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
            {later.length > 0 ? (
              <div className="panel panel-pad">
                {/* THE ROADMAP, OUTSIDE THE OFFER. It sat inside the Pro card,
                    between the price and the buy button, where it read as a
                    list of things missing. It is not part of Pro and is not
                    paid for, and this answer says so. */}
                <h3 className="text-sm font-semibold text-white">Is more coming?</h3>
                <p className="mt-1.5 text-sm text-slate-400">
                  We are working on{" "}
                  {new Intl.ListFormat("en", { type: "conjunction" }).format(
                    later.map((f) => f.label.toLowerCase())
                  )}
                  . They are not part of Pro today. If they ship, subscribers get them at no extra cost.
                </p>
              </div>
            ) : null}
          </div>
        </section>
      </div>
    </div>
  );
}
