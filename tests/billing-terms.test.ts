// =============================================================================
// THE TERMS A CUSTOMER IS SOLD UNDER
//
// /terms carried NO billing language while the site was selling a subscription:
// grep it for "refund", "cancel", "renew" or "charge" and every one returned
// nothing. That is the document a merchant relies on when a cardholder disputes
// a recurring charge, and it was silent on the charge existing.
//
// WHAT THESE TESTS ARE FOR, AND WHAT THEY ARE NOT
// -----------------------------------------------
// They are NOT a legal review, and passing them does not make the copy
// compliant anywhere. What they do is stop the page and the system drifting
// apart — every assertion below ties a sentence a customer is shown to the
// code or configuration that has to keep making it true.
//
// That coupling is the point. A promise on a terms page is a claim about
// behaviour, and the expensive kind of failure is the one where somebody
// changes the behaviour and nobody changes the promise.
// =============================================================================

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { PLAN_BY_ID } from "@/lib/billing/plans";

const src = (rel: string) => readFileSync(fileURLToPath(new URL("../" + rel, import.meta.url)), "utf8");
const TERMS = src("src/app/terms/page.tsx");
/** Whitespace collapsed: JSX wraps a sentence at whatever column it likes. */
const PROSE = TERMS.replace(/\s+/g, " ");

describe("/terms says the things a paid subscription has to say", () => {
  it("has a billing section at all", () => {
    // The regression this whole file exists to prevent.
    expect(PROSE).toMatch(/Pro subscriptions &amp; billing|Pro subscriptions & billing/);
    for (const word of ["refund", "cancel", "renew", "charge"]) {
      expect(PROSE.toLowerCase(), `/terms never mentions "${word}"`).toContain(word);
    }
  });

  it("states automatic renewal explicitly, not by implication", () => {
    // Several US state auto-renewal statutes turn on whether this was
    // disclosed. "Subscription" alone is not a disclosure.
    expect(PROSE).toMatch(/renews? automatically/i);
    expect(PROSE).toMatch(/until you cancel/i);
  });

  it("says cancellation takes effect at the END of the paid period", () => {
    // This must match the Stripe billing portal configuration, whose
    // subscription_cancel mode is "at_period_end". If someone switches the
    // portal to cancel immediately, this sentence becomes a false promise.
    expect(PROSE).toMatch(/end of the period you have already paid for/i);
    expect(PROSE).toMatch(/keep Pro until that date/i);
  });

  it("warns that the charge is MORE than the advertised price", () => {
    // Verified against a real test-mode invoice: $19.00 + $1.69 New York sales
    // tax = $20.69, tax-exclusive, liability on Stripe. A page that says $19
    // and charges $20.69 without saying so is the kind of surprise that
    // produces a dispute rather than a support email.
    expect(PROSE).toMatch(/exclude sales tax or VAT/i);
    expect(PROSE).toMatch(/more than the price shown/i);
  });

  it("names who actually takes the money", () => {
    // Stripe Managed Payments is enabled, so Stripe is merchant of record.
    // Saying so is also what makes the statement-descriptor mismatch
    // survivable if a cardholder goes looking.
    expect(PROSE).toMatch(/merchant of record/i);
    expect(PROSE).toMatch(/never receives or stores your card/i);
  });

  it("states the refund policy that was actually chosen", () => {
    // Cancellation-only, with the statutory carve-out. Silence here is what
    // a chargeback argument is lost on.
    expect(PROSE).toMatch(/do not routinely refund part-used periods/i);
    expect(PROSE).toMatch(/law that applies to you requires a refund/i);
  });

  it("describes failed payment the way the webhook actually behaves", () => {
    // invoice.payment_failed marks the record past_due and deliberately does
    // NOT shorten the paid period — the customer keeps what they bought while
    // Stripe retries. The copy has to match that, not describe an instant cut-off.
    expect(PROSE).toMatch(/access continues/i);
    expect(PROSE).toMatch(/retry your card/i);
  });

  it("says what losing Pro does NOT destroy", () => {
    // Matches the verified behaviour: revocation stops syncing and deletes
    // nothing. Proven in the sandbox lifecycle — three follows survived a
    // refund, a sign-out and a re-authentication.
    expect(PROSE).toMatch(/follows saved in your browser are unaffected/i);
  });

  it("quotes the prices the code and Stripe actually charge", () => {
    // Pinned to plans.ts rather than to a number typed twice. If the plan
    // price changes and the terms do not, this fails.
    const pro = PLAN_BY_ID.get("pro")!;
    expect(PROSE).toContain(`$${pro.monthlyUsd} per month`);
    expect(PROSE).toContain(`$${pro.annualUsd} per year`);
  });

  it("points the reader at where they actually cancel", () => {
    expect(TERMS).toMatch(/href="\/account"/);
  });
});

describe("the purchase surface links to the terms it sells under", () => {
  it("/pricing links to /terms next to the Subscribe buttons", () => {
    // A buyer should not have to hunt the footer for the auto-renewal terms
    // they are about to accept.
    expect(src("src/app/pricing/page.tsx")).toMatch(/href="\/terms"/);
  });
});
