// =============================================================================
// THE PRO WELCOME EMAIL — subscription confirmation, not a payment receipt
//
// WHAT THIS IS, AND WHAT STRIPE ALREADY SENDS
// -------------------------------------------
// Stripe issues the PAYMENT RECEIPT: the amount charged, the card, the invoice
// and the VAT treatment. It is the financial document, it is the one a customer
// forwards to an accountant, and duplicating it here would produce two
// documents claiming to be the same receipt — with ours the one more likely to
// be wrong, because it is a copy of a fact Stripe owns.
//
// So this is the ACCOUNT message: your subscription is on, here is what it does
// today, here is where you manage it, here is who to ask. It states the amount
// only as context for what was set up, and says plainly that Stripe handled the
// payment and holds the receipt.
//
// EVERY VALUE COMES FROM AUTHORITATIVE STATE. The address is the VERIFIED
// identity from our own magic-link flow, never the string a buyer typed at
// Stripe Checkout — that distinction is the whole of blocker 1. The amount,
// interval and period end come from the Stripe subscription the webhook
// carried, not from anything the browser said.
//
// IT ADVERTISES ONLY WHAT WORKS. The capability list is availableNow("pro"),
// the same function the pricing page and the account page read. Four Pro
// capabilities were once listed as included while none of them existed; a
// welcome email is the worst possible place to repeat that, because it arrives
// at the moment somebody has just paid.
//
// NOTHING SECRET GOES IN. No session token, no store key, no Stripe secret, no
// customer id, no subscription id. A welcome email is forwarded, screenshotted
// and left in inboxes for years.
// =============================================================================

import { PLAN_BY_ID, availableNow } from "./plans";
import { SITE } from "@/lib/site";

export interface WelcomeEmailInput {
  /** The VERIFIED identity address. Never a buyer-typed Stripe email. */
  email: string;
  /** "month" or "year", from the Stripe price's own recurring interval. */
  interval: "month" | "year";
  /** Minor units from Stripe (1900 = $19.00), or null when unreadable. */
  amountMinor: number | null;
  /** ISO-4217, lowercase as Stripe sends it. */
  currency: string | null;
  /** Unix seconds: the paid-through date from the subscription. */
  periodEnd: number;
  /** The site origin, for the account link. */
  origin: string;
  /** True when the deployment is running against Stripe test keys. */
  testMode: boolean;
  /** Where a reply should go. Empty when unset. */
  supportEmail?: string;
}

export interface WelcomeEmail {
  subject: string;
  text: string;
  html: string;
}

function formatDate(seconds: number): string {
  return new Date(seconds * 1000).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

/**
 * The amount, as Stripe stated it.
 *
 * Returns null rather than guessing. A welcome email that invents a price is
 * worse than one that omits it: the customer has a real receipt from Stripe to
 * compare it against, and a mismatch reads as a billing error.
 */
export function formatAmount(amountMinor: number | null, currency: string | null): string | null {
  if (amountMinor === null || !Number.isFinite(amountMinor)) return null;
  const code = (currency || "usd").toUpperCase();
  const value = (amountMinor / 100).toFixed(2);
  return code === "USD" ? `$${value}` : `${value} ${code}`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function buildProWelcomeEmail(input: WelcomeEmailInput): WelcomeEmail {
  const pro = PLAN_BY_ID.get("pro")!;
  const cadence = input.interval === "year" ? "yearly" : "monthly";
  const amount = formatAmount(input.amountMinor, input.currency);
  const accountUrl = `${input.origin.replace(/\/$/, "")}/account`;

  // ONLY WHAT WORKS TODAY. Same source as /pricing and /account.
  const capabilities = availableNow("pro");

  const testBanner = input.testMode
    ? "TEST MODE — this deployment is running against Stripe test keys. No real card was charged and this is not a real subscription."
    : "";

  const subject = input.testMode
    ? `[TEST] Welcome to ${SITE.name} ${pro.name}`
    : `Welcome to ${SITE.name} ${pro.name}`;

  const lines: string[] = [];
  if (testBanner) lines.push(testBanner, "");
  lines.push(
    `Welcome to ${SITE.name} ${pro.name}.`,
    "",
    `Your subscription is active. This is your account confirmation — Stripe has`,
    `sent the payment receipt separately, and holds the invoice.`,
    "",
    `Account:       ${input.email}`,
    `Plan:          ${pro.name}, billed ${cadence}`
  );
  if (amount) lines.push(`Amount:        ${amount} per ${input.interval}`);
  lines.push(
    `Paid through:  ${formatDate(input.periodEnd)}`,
    "",
    "What your subscription does today:",
    ...capabilities.map((c) => `  - ${c.label}: ${c.blurb}`),
    "",
    `Manage or cancel your billing: ${accountUrl}`,
    "Cancelling keeps Pro until the paid-through date above and does not renew.",
    "",
    "Payment is processed by Stripe. We never see or store your card details.",
  );
  if (input.supportEmail) lines.push("", `Questions: ${input.supportEmail}`);
  lines.push("", `${SITE.name} — ${SITE.tagline}`);

  const text = lines.join("\n");

  const capabilityHtml = capabilities
    .map(
      (c) =>
        `<li style="margin:0 0 8px"><strong style="color:#0f172a">${escapeHtml(c.label)}</strong>` +
        `<br><span style="color:#475569">${escapeHtml(c.blurb)}</span></li>`
    )
    .join("");

  const html = `<!-- ${SITE.name} subscription confirmation -->
<div style="margin:0;padding:24px;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden">
    ${
      input.testMode
        ? `<div style="background:#fef3c7;border-bottom:1px solid #fde68a;padding:12px 24px;color:#92400e;font-size:13px;line-height:1.5">
      <strong>Test mode.</strong> This deployment runs against Stripe test keys. No real card was charged and this is not a real subscription.
    </div>`
        : ""
    }
    <div style="padding:28px 24px 8px">
      <p style="margin:0 0 4px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#64748b">${escapeHtml(SITE.name)}</p>
      <h1 style="margin:0 0 12px;font-size:22px;line-height:1.3;color:#0f172a">Welcome to ${escapeHtml(pro.name)}</h1>
      <p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#334155">
        Your subscription is active. This is your account confirmation — Stripe has sent the payment
        receipt separately and holds the invoice.
      </p>

      <table style="width:100%;border-collapse:collapse;font-size:14px;color:#334155;margin:0 0 22px">
        <tr><td style="padding:6px 0;color:#64748b;width:120px">Account</td><td style="padding:6px 0;color:#0f172a">${escapeHtml(input.email)}</td></tr>
        <tr><td style="padding:6px 0;color:#64748b">Plan</td><td style="padding:6px 0;color:#0f172a">${escapeHtml(pro.name)}, billed ${cadence}</td></tr>
        ${amount ? `<tr><td style="padding:6px 0;color:#64748b">Amount</td><td style="padding:6px 0;color:#0f172a">${escapeHtml(amount)} per ${input.interval}</td></tr>` : ""}
        <tr><td style="padding:6px 0;color:#64748b">Paid through</td><td style="padding:6px 0;color:#0f172a">${formatDate(input.periodEnd)}</td></tr>
      </table>

      <h2 style="margin:0 0 8px;font-size:14px;color:#0f172a">What your subscription does today</h2>
      <ul style="margin:0 0 22px;padding-left:18px;font-size:14px;line-height:1.55">${capabilityHtml}</ul>

      <a href="${escapeHtml(accountUrl)}" style="display:inline-block;background:#0f172a;color:#ffffff;text-decoration:none;padding:11px 18px;border-radius:8px;font-size:14px;font-weight:600">Manage billing</a>
      <p style="margin:12px 0 0;font-size:13px;line-height:1.6;color:#64748b">
        Cancel, change your card or download invoices from your account page. Cancelling keeps Pro
        until ${formatDate(input.periodEnd)} and does not renew.
      </p>
    </div>

    <div style="padding:16px 24px 24px;border-top:1px solid #e2e8f0;margin-top:20px">
      <p style="margin:0 0 6px;font-size:12px;line-height:1.6;color:#64748b">
        Payment is processed by Stripe. We never see or store your card details.
      </p>
      ${
        input.supportEmail
          ? `<p style="margin:0 0 6px;font-size:12px;line-height:1.6;color:#64748b">Questions? <a href="mailto:${escapeHtml(input.supportEmail)}" style="color:#0f172a">${escapeHtml(input.supportEmail)}</a></p>`
          : ""
      }
      <p style="margin:0;font-size:12px;color:#94a3b8">${escapeHtml(SITE.name)} — ${escapeHtml(SITE.tagline)}</p>
    </div>
  </div>
</div>`;

  return { subject, text, html };
}
