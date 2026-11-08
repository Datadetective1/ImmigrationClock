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
import { TrustStrip } from "@/components/TrustStrip";
import { AlertExampleCard, ForecastExampleCard } from "@/components/ProShowcase";
import { alertExample, forecastExample } from "@/lib/pro-showcase";

export const metadata = buildMetadata({
  title: "Pricing: ImmigrationClock Pro",
  description:
    "Pro gives you the month your priority date may be reached and an email the day a new Visa Bulletin or rule touches what you follow. $19 a month. The public site stays free.",
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

/** "USCIS case status alerts" stays "USCIS"; "Bulk export" becomes "bulk export". */
function inSentence(label: string): string {
  return /^[A-Z]{2}/.test(label) ? label : label.charAt(0).toLowerCase() + label.slice(1);
}

export default function PricingPage() {
  const freeFeatures = CAPABILITY_SPECS.filter((c) => c.plan === "free");
  // WHAT PRO SELLS: only sold capabilities. Unsold ones are roadmap and appear
  // in the FAQ under a heading that says so, never as a tick in the Pro card.
  const proFeatures = capabilitiesAddedBy("pro");
  const later = roadmap();
  const pending = notYetAvailable("pro");
  const caseAlerts = later.find((f) => f.id === "case_alerts");

  // TWO SEPARATE REASONS A PURCHASE CANNOT HAPPEN.
  //   hasSomethingToSell  a Pro capability actually works (from the specs).
  //   checkoutReady       billing is switched on and configured.
  // This page is static, so the value below is the FIRST PAINT only;
  // PurchasePanel re-asks the dynamic route on mount and decides.
  const hasSomethingToSell = availableNow("pro").length > 0;
  const builtReady = billingStatus().checkoutReady;
  const purchasable = hasSomethingToSell && builtReady;

  // PRODUCT SHOTS, NOT TESTIMONIALS. Built from the latest official bulletin
  // by the same code a subscriber gets. Either can be null; then it is left out.
  const forecastEx = forecastExample();
  const alertEx = alertExample();

  return (
    <div>
      <PricingAnalytics />
      <PageHeader
        eyebrow="ImmigrationClock Pro"
        title="Know when your date moves."
        description="Pro adds email alerts on what you follow, your Briefing and the forecast by month. Everything public stays free."
        crumbs={[
          { href: "/", label: "Home" },
          { href: "/pricing", label: "Pricing" },
        ]}
      />

      <div className="container-page max-w-5xl space-y-12 py-10">
        <div className="grid gap-5 md:grid-cols-[1fr_1.25fr]">
          {/* FREE. On a phone Pro comes first, so the price and the buy
              button are not a long scroll down. From md up: Free, then Pro. */}
          <section className="panel panel-pad order-2 md:order-1" aria-labelledby="plan-free">
            <h2 id="plan-free" className="text-lg font-bold text-white">
              {free.name}
            </h2>
            <p className="mt-1 text-sm text-slate-400">{free.tagline}</p>
            <p className="mt-4 font-mono text-3xl font-extrabold tabular-nums text-white">$0</p>

            <ul className="mt-5 space-y-2 text-sm">
              {freeFeatures.map((f) => (
                <li key={f.id} className="flex gap-2.5">
                  <Check on />
                  <span className="text-slate-300">{f.label}</span>
                </li>
              ))}
            </ul>

            <p className="mt-5 text-xs text-slate-500">
              The whole public platform, and it stays that way.{" "}
              <Link href="/methodology" className="text-accent hover:underline">
                How we source it
              </Link>
              .
            </p>
          </section>

          {/* PRO */}
          <section className="panel panel-pad order-1 border-accent/40 ring-1 ring-accent/20 md:order-2" aria-labelledby="plan-pro">
            <div className="flex items-center justify-between gap-3">
              <h2 id="plan-pro" className="text-lg font-bold text-white">
                {pro.name}
              </h2>
              <span className="rounded-full bg-accent/10 px-2.5 py-0.5 text-[11px] font-semibold text-accent">
                Cancel any time
              </span>
            </div>
            <p className="mt-1 text-sm text-slate-400">{pro.tagline}</p>

            <div className="mt-4 flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <span className="font-mono text-4xl font-extrabold tabular-nums text-accent">${pro.monthlyUsd}</span>
              <span className="text-sm text-slate-400">a month</span>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              or ${pro.annualUsd} a year
              {saving ? (
                <span className="ml-1.5 rounded bg-status-green/10 px-1.5 py-0.5 font-semibold text-status-green">
                  save ${saving}
                </span>
              ) : null}
            </p>

            <ul className="mt-5 grid gap-2 text-sm sm:grid-cols-2">
              {proFeatures.map((f) => (
                <li key={f.id} className="flex gap-2.5">
                  <Check on={f.status === "available"} />
                  <span className="font-medium text-white">
                    {f.label}
                    <Status status={f.status} />
                  </span>
                </li>
              ))}
              <li className="flex gap-2.5">
                <Check on />
                <span className="font-medium text-white">Everything in Free</span>
              </li>
              {caseAlerts ? (
                <li className="flex gap-2.5">
                  <Check on={false} />
                  <span className="text-slate-400">
                    {caseAlerts.label}
                    <span className="ml-2 rounded border border-status-amber/40 px-1.5 py-0.5 align-middle text-[10px] font-medium uppercase tracking-wide text-status-amber">
                      Coming soon
                    </span>
                  </span>
                </li>
              ) : null}
            </ul>

            {/* Unfinished Pro capabilities, if any ever return to the plan.
                Each is named on its own line with its own status, never
                comma-joined: one label is "Your watchlist, everywhere". */}
            {pending.length > 0 ? (
              <p className="mt-5 rounded-lg border border-status-amber/25 bg-status-amber/[0.06] px-3 py-2.5 text-xs leading-relaxed text-slate-300">
                <strong className="text-white">Not finished yet:</strong>
                {pending.map((f) => (
                  <span key={f.id} className="block">
                    {"· "}
                    {f.label} <span className="text-slate-500">({STATUS_LABEL[f.status].toLowerCase()})</span>
                  </span>
                ))}
                Subscribe now only if the rest is already worth it to you.
              </p>
            ) : null}

            <PurchasePanel
              initialReady={purchasable}
              initialTestMode={billingStatus().testMode}
              forSale={
                <>
                  <Link
                    href="/trial"
                    data-testid="pricing-trial-link"
                    className="mt-6 block rounded-lg border border-sky-400/30 bg-sky-400/10 px-4 py-3 text-center text-sm font-semibold text-sky-200 hover:bg-sky-400/15"
                  >
                    New to Pro? Try it free for 30 days
                  </Link>
                  <NewsletterOptInGroup>
                    <UpgradeButton interval="monthly" placement="pricing_page" label={`Subscribe: $${pro.monthlyUsd} a month`} />
                    <UpgradeButton
                      interval="annual"
                      placement="pricing_page"
                      label={`Subscribe yearly: $${pro.annualUsd}`}
                      className="[&>button]:bg-transparent [&>button]:text-slate-200 [&>button]:ring-1 [&>button]:ring-white/15 [&>button]:hover:bg-white/5"
                    />
                  </NewsletterOptInGroup>
                  {/* Renewal and tax are said here because a buyer must see
                      them before paying; the rest is in the billing terms. */}
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

        {/* WHAT PRO DOES, SHOWN RATHER THAN DESCRIBED. */}
        <section aria-labelledby="show-heading" className="space-y-4">
          <div>
            <h2 id="show-heading" className="section-title">
              What you get
            </h2>
            <p className="mt-1 text-sm text-slate-400">Real output, built from this month&apos;s official data.</p>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {forecastEx ? <ForecastExampleCard ex={forecastEx} /> : null}
            {alertEx ? <AlertExampleCard ex={alertEx} /> : null}
            <article className="panel panel-pad flex flex-col" aria-labelledby="show-briefing">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-accent">Your Briefing</p>
              <h3 id="show-briefing" className="mt-1 text-base font-bold text-white">
                One page for your watchlist
              </h3>
              <ul className="mt-4 space-y-2.5 text-sm text-slate-300">
                {[
                  "Changes that touch what you follow",
                  "Effective dates coming up",
                  "Anything you saved",
                  "Print it or add dates to your calendar",
                  "Your follows on every device",
                ].map((t) => (
                  <li key={t} className="flex gap-2.5">
                    <Check on />
                    <span>{t}</span>
                  </li>
                ))}
              </ul>
              <Link href="/briefing/example" className="link-accent mt-auto pt-4 text-sm font-medium">
                See an example Briefing &rarr;
              </Link>
            </article>
          </div>
        </section>

        {/* TRUST WITHOUT TESTIMONIALS: what the data is and where it comes from. */}
        <section aria-labelledby="trust-heading" className="space-y-4">
          <div>
            <h2 id="trust-heading" className="section-title">
              Official sources only
            </h2>
            <p className="mt-1 text-sm text-slate-400">
              Every change links to the government document it came from.
            </p>
          </div>
          <TrustStrip />
        </section>

        <section aria-labelledby="faq-heading" className="space-y-4">
          <h2 id="faq-heading" className="section-title">
            Questions
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="panel panel-pad">
              <h3 className="text-sm font-semibold text-white">Do I need an account to read the site?</h3>
              <p className="mt-1.5 text-sm text-slate-400">
                No. For Pro you sign in with a link we email you. There is no password.
              </p>
            </div>
            <div className="panel panel-pad">
              <h3 className="text-sm font-semibold text-white">What happens to my follows?</h3>
              <p className="mt-1.5 text-sm text-slate-400">
                They come with you, on every device. Pro also emails you when a recorded change touches something on that list, or a new Visa Bulletin is out for it, at most once a day.
              </p>
            </div>
            <div className="panel panel-pad">
              <h3 className="text-sm font-semibold text-white">Can I cancel?</h3>
              <p className="mt-1.5 text-sm text-slate-400">
                Yes, any time, from your account. Pro keeps working until the end of the period you paid for.
              </p>
            </div>
            <div className="panel panel-pad">
              <h3 className="text-sm font-semibold text-white">Who is this for?</h3>
              <p className="mt-1.5 text-sm text-slate-400">
                Anyone waiting on a green card, and people who track immigration for work: legal and mobility teams, HR, recruiters and researchers.
              </p>
            </div>
            {later.length > 0 ? (
              <div className="panel panel-pad">
                {/* THE ROADMAP, OUTSIDE THE OFFER. Not part of Pro today. */}
                <h3 className="text-sm font-semibold text-white">Is more coming?</h3>
                <p className="mt-1.5 text-sm text-slate-400">
                  We are working on{" "}
                  {new Intl.ListFormat("en", { type: "conjunction" }).format(later.map((f) => inSentence(f.label)))}
                  . They are not part of Pro today. If they ship, subscribers get them at no extra cost.
                </p>
              </div>
            ) : null}
            <div className="panel panel-pad">
              <h3 className="text-sm font-semibold text-white">Is this legal advice?</h3>
              <p className="mt-1.5 text-sm text-slate-400">
                No. A forecast is an estimate from past bulletins, and a new law or a surge in demand can change it.
              </p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
