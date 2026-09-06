# PROPOSED subscription terms — for review, not published

**Status: DRAFT. Not live anywhere on the site. Not legal advice.**

This is product copy written to fill a gap the pre-live audit found: `src/app/terms/page.tsx` contains **no billing language at all** — grep it for `refund`, `cancel`, `subscription`, `recurring`, `billing` or `charge` and you get zero matches. That is the document a merchant relies on when a cardholder disputes a recurring charge, and it is silent on the charge existing.

**I am not a lawyer and this has not been reviewed by one.** Consumer-subscription rules are jurisdiction-specific and several of them carry statutory penalties. Before any of this is published, have a qualified lawyer check it against at least:

- **US state auto-renewal laws** (California ARL, and the equivalents in NY, OR, CO and others) — these govern *how* consent to auto-renewal is obtained and how cancellation must be offered, not just what the terms say.
- **The FTC's negative-option / "click to cancel" rulemaking**, whose status and effective dates you should confirm rather than take from me.
- **UK/EU consumer rights** if you sell there — statutory cancellation ("cooling off") rights for digital services, and what happens when a customer starts using the service immediately.
- **Whether a business-use subscription changes any of the above** for your customer mix.

Nothing below should be treated as compliant with any of those until someone qualified says so.

---

## A structural point that has to be settled first

ImmigrationClock's checkout runs through **Stripe Managed Payments**, which is Stripe's merchant-of-record product. Per Stripe's documentation, when it is enabled Stripe handles indirect tax compliance in more than 80 countries, fraud prevention, dispute management and transaction-level customer support, and for digital sellers tax liability transfers to Stripe.

**That materially changes who the customer's contract is with, and therefore who the refund obligation sits with.** These terms are written as though ImmigrationClock is the seller and the counterparty. If Stripe is the merchant of record, some of this belongs in Stripe's terms instead, and duplicating or contradicting them here could be worse than saying nothing.

**This is the one question to resolve before publishing any of it**, and it is a question for your lawyer and for Stripe's Managed Payments documentation, not for me. The rest of this file assumes the answer is "ImmigrationClock is the seller"; if it isn't, the copy needs reworking rather than editing.

---

## Proposed copy

### Subscription and billing

ImmigrationClock Pro is a paid subscription. The price is shown on the pricing page before you buy, and the amount you will be charged is shown again on Stripe's checkout page before you enter any payment details.

Payment is processed by Stripe. ImmigrationClock never receives or stores your card number.

### Automatic renewal

**Pro subscriptions renew automatically.** A monthly subscription renews every month, and an annual subscription renews every twelve months, at the same price, until you cancel. Your card is charged at the start of each new period.

We will tell you the date your current period ends on your account page at all times.

> **Open question for review:** whether you send an advance renewal reminder email, and how many days before. Some jurisdictions require one for annual terms. **The code does not send one today** — there is no scheduler in this repository — so this sentence must not be published until it is either true or removed.

### Cancelling

You can cancel at any time from your account page, which opens Stripe's billing portal. Cancellation takes effect at the end of the period you have already paid for.

**Cancelling does not end your access immediately.** You keep Pro until the end of the period you paid for, and are not charged again after that.

You do not need to contact us, explain why, or wait for anyone to action it.

### Refunds

*This section states a policy you have not yet chosen. Pick one before publishing.*

**Option A — no routine refunds, cancellation only.** Because you can cancel at any time and keep access through the period you paid for, we do not routinely refund part-used periods. Where a refund is required by the law that applies to you, that law takes precedence over this paragraph.

**Option B — a stated window.** If you are unhappy within N days of your first payment, contact us at `<support address>` and we will refund that payment in full. After that, cancellation applies as above.

Either way, the following should be said plainly:

- If we refund a payment, your Pro access ends when the refund is issued. *(This is what the code now does: `charge.refunded` revokes access immediately.)*
- If you dispute a charge with your bank, your Pro access ends when the dispute is opened. *(Also what the code now does.)*

> **Recommendation:** Option B, with a short window. It is easier to defend in a dispute than "no refunds", and it is cheap at this price point. But this is a business decision, not a technical one, and it is yours.

### Failed payments

If a renewal payment fails, Stripe will retry it. Your access continues until the end of the period you have already paid for. If payment is not recovered by then, Pro access ends and your account reverts to the free platform. Nothing is deleted.

### What you are paying for

Pro adds capabilities to the free platform. It does not restrict anything that is currently free, and we do not intend to move an existing free capability behind payment.

> **This sentence must match `src/lib/billing/plans.ts` at all times.** Pro currently sells exactly one capability: watchlist sync. Do not restore the four roadmap items to this document, or to the pricing page, until they actually work.

### Price changes

> **Open question for review.** There is no price-change mechanism in the code and no notification path. Either write a clause committing to advance notice, or leave the section out — but do not publish a clause the system cannot honour.

### If we stop offering Pro

If we discontinue Pro, we will stop taking new subscriptions, let existing subscriptions run to the end of their current period, and not renew them. The free platform is unaffected.

---

## Before this goes live — checklist

- [ ] Lawyer review, against the jurisdictions above
- [ ] Settle the merchant-of-record question with Stripe Managed Payments
- [ ] Choose refund Option A or B, and put a real support address in it
- [ ] Delete the renewal-reminder sentence, or build the reminder
- [ ] Delete the price-change section, or build the notification
- [ ] Decide where this lives: extending `/terms`, or a separate `/billing-terms` page linked from the pricing page and from Stripe checkout
- [ ] Confirm the pricing page links to it *before* the Subscribe button, not only after
