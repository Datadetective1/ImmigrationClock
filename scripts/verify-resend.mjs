#!/usr/bin/env node
/**
 * Verify the Resend API key can actually do what newsletter signup needs.
 *
 * WHY THIS EXISTS
 * ---------------
 * Creating a contact requires a FULL ACCESS key. A sending-only key can deliver
 * the welcome email perfectly well but cannot create the contact — so signup
 * appears to work, subscribers receive mail, and the contact list stays empty.
 * That is a miserable thing to debug from production, and impossible to catch in
 * CI, because the key lives only in the deployment environment.
 *
 * So this is a script the operator runs. It reads RESEND_API_KEY from the
 * environment and never prints it.
 *
 * Usage:
 *   RESEND_API_KEY=re_xxx node scripts/verify-resend.mjs
 *   RESEND_API_KEY=re_xxx node scripts/verify-resend.mjs --send you@example.com
 *
 * By default it performs a READ-ONLY permission probe and creates nothing. Pass
 * --send to also deliver one real welcome email to an address you control.
 */

const KEY = process.env.RESEND_API_KEY;
const BASE = process.env.RESEND_API_BASE || "https://api.resend.com";
const FROM = process.env.RESEND_FROM_EMAIL || "Immigration Clock <noreply@immigrationclock.com>";

const sendIndex = process.argv.indexOf("--send");
const sendTo = sendIndex !== -1 ? process.argv[sendIndex + 1] : null;

const ok = (m) => console.log(`  [32mPASS[0m  ${m}`);
const bad = (m) => console.log(`  [31mFAIL[0m  ${m}`);
const info = (m) => console.log(`        ${m}`);

if (!KEY) {
  console.error("RESEND_API_KEY is not set.\n");
  console.error("  RESEND_API_KEY=re_xxx node scripts/verify-resend.mjs");
  process.exit(1);
}

const auth = { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };

async function main() {
  console.log(`\nVerifying Resend configuration against ${BASE}\n`);
  let failed = false;

  // ---- 1. Is the key valid at all? -----------------------------------------
  // Listing contacts is read-only and touches the same permission scope that
  // creating one needs, so it distinguishes "bad key" from "sending-only key"
  // without writing anything.
  let res;
  try {
    res = await fetch(`${BASE}/contacts`, { headers: auth });
  } catch (err) {
    bad(`Could not reach Resend: ${err.message}`);
    process.exit(1);
  }

  if (res.status === 401) {
    bad("The API key was rejected (401). It is invalid, revoked, or mistyped.");
    failed = true;
  } else if (res.status === 403) {
    bad("The key is valid but lacks permission to read contacts (403).");
    info("Newsletter signup needs a FULL ACCESS key, not a sending-only one.");
    info("Create one at https://resend.com/api-keys and update RESEND_API_KEY.");
    failed = true;
  } else if (res.ok) {
    ok("API key is valid and has contact permission (Full Access).");
    const body = await res.json().catch(() => null);
    const list = body?.data ?? body?.contacts;
    if (Array.isArray(list)) info(`Account currently holds ${list.length} contact(s).`);
  } else {
    const detail = await res.text().catch(() => "");
    bad(`Unexpected response listing contacts: HTTP ${res.status}`);
    info(detail.slice(0, 200));
    failed = true;
  }

  // ---- 2. Sender domain ------------------------------------------------------
  const domain = (FROM.match(/<([^>]+)>/)?.[1] ?? FROM).split("@")[1];
  try {
    const dRes = await fetch(`${BASE}/domains`, { headers: auth });
    if (dRes.ok) {
      const body = await dRes.json().catch(() => null);
      const domains = body?.data ?? [];
      const match = domains.find((d) => d.name === domain);
      if (!match) {
        bad(`Sender domain "${domain}" is not in this Resend account.`);
        info(`RESEND_FROM_EMAIL is ${FROM} — mail from it will be rejected.`);
        failed = true;
      } else if (match.status !== "verified") {
        bad(`Sender domain "${domain}" is present but status is "${match.status}".`);
        failed = true;
      } else {
        ok(`Sender domain "${domain}" is verified.`);
      }
    } else if (dRes.status === 403) {
      info(`Could not check the sender domain (403) — the key cannot read domains.`);
    }
  } catch {
    info("Could not check the sender domain (network).");
  }

  // ---- 3. Optional: send one real welcome email -----------------------------
  if (sendTo) {
    const mRes = await fetch(`${BASE}/emails`, {
      method: "POST",
      headers: auth,
      body: JSON.stringify({
        from: FROM,
        to: [sendTo],
        ...(process.env.NEXT_PUBLIC_CONTACT_EMAIL
          ? { reply_to: process.env.NEXT_PUBLIC_CONTACT_EMAIL }
          : {}),
        subject: "ImmigrationClock — Resend configuration test",
        text: "If you are reading this, the sender domain and API key both work.",
      }),
    });
    if (mRes.ok) ok(`Test email accepted for delivery to ${sendTo}.`);
    else {
      bad(`Test email rejected: HTTP ${mRes.status}`);
      info((await mRes.text().catch(() => "")).slice(0, 200));
      failed = true;
    }
  } else {
    info("Skipping the send test. Add `--send you@example.com` to include it.");
  }

  console.log(
    failed
      ? "\nOne or more checks failed. Newsletter signup will not work correctly.\n"
      : "\nAll checks passed. Newsletter signup should work once deployed.\n"
  );
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(`verify-resend failed: ${err?.stack || err}`);
  process.exit(1);
});
