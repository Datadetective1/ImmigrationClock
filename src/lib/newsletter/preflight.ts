// =============================================================================
// PREFLIGHT — the deliverability gate, and the one check that fails closed
//
// Two kinds of finding live here:
//
//   • ADVISORY spam heuristics — a thin text part, a promotional subject, a
//     high link count. An operator should look at them. They do not stop a send.
//
//   • THE UNSUBSCRIBE GATE — blocking, always, with no override. An edition
//     without a working opt-out is not a newsletter that needs a warning label;
//     it is mail we must not send. CAN-SPAM and GDPR both require a functioning
//     opt-out, Gmail and Yahoo's bulk-sender rules require one-click, and the
//     reputational cost of getting it wrong is charged to every future issue.
//
// WHY A TOKEN AND NOT A URL
// -------------------------
// Resend Broadcasts substitute a per-contact opt-out link for the literal
// string `{{{RESEND_UNSUBSCRIBE_URL}}}` at send time, and record the resulting
// unsubscribe against the contact. That is the only value in this codebase that
// can actually unsubscribe a recipient.
//
// Everything else that has ever looked like an unsubscribe link here cannot:
//   • /pulse is the SIGNUP page. Sending an opt-out to a sign-up form is worse
//     than no link, because it reads as a dark pattern.
//   • a mailto: reaches a human inbox, not the contact record. Nobody is
//     promising to process it within the 48 hours the rules require, and it
//     does not satisfy one-click at all.
//
// So the gate does not ask "is there something labelled unsubscribe". It asks
// whether the one string that works is present, in an anchor, legible, in the
// text part too — and that nothing is impersonating it.
//
// Source: Resend, "Do you need to add an unsubscribe link…" and the Create
// Broadcast API reference, both of which document `{{{RESEND_UNSUBSCRIBE_URL}}}`
// as the substituted token. Confirmed against the live docs, not assumed.
// =============================================================================

import type { Locale } from "./types";
import { RESEND_UNSUBSCRIBE_TOKEN } from "./types";
import { stringsFor } from "./locales";
import type { RenderedEmail } from "./render";

export { RESEND_UNSUBSCRIBE_TOKEN };

/**
 * Paths that are NOT an opt-out, however the link is labelled.
 *
 * /pulse is the newsletter signup page. It was the English edition's
 * unsubscribe target, which is the failure this module exists to make
 * unrepeatable.
 */
const SIGNUP_PATHS = ["/pulse", "/subscribe", "/signup", "/newsletter/subscribe"];

/** Values that look like an unsubscribe link and unsubscribe nobody. */
const IMPOSTOR_PATTERNS: Array<{ re: RegExp; what: string }> = [
  { re: /^#/, what: "an anchor to nowhere" },
  { re: /^javascript:/i, what: "a javascript: URL" },
  { re: /^about:blank/i, what: "about:blank" },
  { re: /^mailto:/i, what: "a mailto: address, which cannot unsubscribe a contact" },
  { re: /example\.(com|org|net)/i, what: "an example.com placeholder" },
  { re: /\{\{\s*unsubscribe\s*\}\}/i, what: "a two-brace token Resend will HTML-escape" },
  { re: /%%\s*unsubscribe\w*\s*%%/i, what: "a Mailchimp-style merge tag Resend does not substitute" },
  { re: /\[unsubscribe\]/i, what: "a bracketed placeholder" },
  { re: /\bTODO\b|\bFIXME\b|\bXXX\b/, what: "an unfinished placeholder" },
];

export interface PreflightFlag {
  /** Stable identifier, safe to assert on in a test. */
  code: string;
  message: string;
  /** Blocking flags stop the send. No flag in this file is overridable. */
  blocking: boolean;
}

export interface PreflightResult {
  flags: PreflightFlag[];
  /** Blocking subset — non-empty means "do not send". */
  blocking: PreflightFlag[];
  /** Advisory messages, for the operator dashboard. */
  spamFlags: string[];
  /** Fail-closed answer. There is no argument that flips this to true. */
  safeToSend: boolean;
}

// ---------------------------------------------------------------------------
// Contrast — because "there is a link" and "a reader can see it" differ
// ---------------------------------------------------------------------------

function channel(v: number): number {
  const s = v / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

function luminance(hex: string): number {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG 2.1 contrast ratio. 4.5:1 is the AA threshold for body-sized text. */
export function contrastRatio(fg: string, bg: string): number {
  const a = luminance(fg);
  const b = luminance(bg);
  const [hi, lo] = a > b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * The background the anchor actually sits on.
 *
 * Our template paints an explicit background on every cell — a deliberate
 * defence against dark-mode auto-inversion — so the nearest `background:#hex`
 * before the anchor is the one behind it. White is the safe default if the
 * template ever stops doing that.
 */
function backgroundBehind(html: string, at: number): string {
  const before = html.slice(0, at);
  const matches = [...before.matchAll(/background:\s*(#[0-9a-fA-F]{3,6})/g)];
  return matches.length ? matches[matches.length - 1][1] : "#ffffff";
}

/** Font size in px from either a `font:` shorthand or `font-size:`. */
function fontSizePx(style: string): number | null {
  const explicit = /font-size:\s*(\d+(?:\.\d+)?)px/.exec(style);
  if (explicit) return Number(explicit[1]);
  const shorthand = /font:[^;"]*?(\d+(?:\.\d+)?)px/.exec(style);
  return shorthand ? Number(shorthand[1]) : null;
}

// ---------------------------------------------------------------------------
// The gate
// ---------------------------------------------------------------------------

interface Anchor {
  index: number;
  tag: string;
  style: string;
  inner: string;
}

function findAnchors(html: string): Anchor[] {
  const out: Anchor[] = [];
  for (const m of html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)) {
    out.push({
      index: m.index ?? 0,
      tag: m[0],
      style: /style="([^"]*)"/.exec(m[1])?.[1] ?? "",
      inner: m[2],
    });
  }
  return out;
}

function hrefOf(tag: string): string {
  return /href="([^"]*)"/.exec(tag)?.[1] ?? "";
}

/**
 * Does this edition have a real, visible, localized opt-out?
 *
 * Runs on rendered bytes, not on the Issue, so it is equally usable at build
 * time and again at send time against the archived file that is actually POSTed
 * — the second check is what makes a tampered or stale archive unsendable.
 */
export function unsubscribeFlags(rendered: RenderedEmail, locale: Locale): PreflightFlag[] {
  const flags: PreflightFlag[] = [];
  const block = (code: string, message: string) => flags.push({ code, message, blocking: true });
  const { html, text } = rendered;
  const label = stringsFor(locale).footer.unsubscribe;

  const anchors = findAnchors(html);
  const unsubAnchors = anchors.filter((a) => hrefOf(a.tag) === RESEND_UNSUBSCRIBE_TOKEN);

  // 1. The token must be present, in an href. A bare token in body copy is not
  //    a link a reader can click.
  if (!html.includes(RESEND_UNSUBSCRIBE_TOKEN)) {
    block("unsubscribe-missing", `no unsubscribe link — ${RESEND_UNSUBSCRIBE_TOKEN} is absent from the HTML`);
  } else if (unsubAnchors.length === 0) {
    block(
      "unsubscribe-not-a-link",
      `${RESEND_UNSUBSCRIBE_TOKEN} appears in the HTML but not as an <a href>, so there is nothing to click`
    );
  }

  // 2. Nothing may impersonate it. Any OTHER anchor whose visible text is the
  //    unsubscribe label, or whose target is the signup page, is a false
  //    opt-out — the exact defect this module was written for.
  for (const a of anchors) {
    const href = hrefOf(a.tag);
    if (href === RESEND_UNSUBSCRIBE_TOKEN) continue;

    const looksLikeUnsub =
      a.inner.includes(label) || /unsubscrib|désabonn|desabonn|cancelar suscri|إلغاء الاشتراك/i.test(a.inner);
    if (!looksLikeUnsub) continue;

    const path = href.replace(/^https?:\/\/[^/]+/, "").split("?")[0].replace(/\/$/, "");
    if (SIGNUP_PATHS.includes(path || "/")) {
      block(
        "unsubscribe-points-at-signup",
        `unsubscribe link points at the signup page "${href}" — a signup form cannot opt anyone out`
      );
      continue;
    }
    const impostor = IMPOSTOR_PATTERNS.find((p) => p.re.test(href));
    if (impostor) {
      block("unsubscribe-placeholder", `unsubscribe link is ${impostor.what}: "${href}"`);
      continue;
    }
    block(
      "unsubscribe-unrecognised-target",
      `a link labelled as unsubscribe points at "${href}", which is not the Resend token and cannot unsubscribe a contact`
    );
  }

  // 3. Localized label. An Arabic reader hunting for the English word
  //    "Unsubscribe" is, in practice, a reader who cannot opt out.
  for (const a of unsubAnchors) {
    if (!a.inner.includes(label)) {
      block(
        "unsubscribe-unlocalized",
        `unsubscribe link is not labelled "${label}" in ${locale} (found "${a.inner.replace(/<[^>]*>/g, "").trim().slice(0, 40)}")`
      );
    }
  }

  // 4. Visible. A link styled into invisibility satisfies a regex and no human.
  const preheaderEnd = html.indexOf("</div>");
  for (const a of unsubAnchors) {
    if (/display:\s*none|visibility:\s*hidden|opacity:\s*0(?!\.)|font-size:\s*0/i.test(a.style)) {
      block("unsubscribe-hidden", "unsubscribe link is styled to be invisible");
      continue;
    }
    if (preheaderEnd > -1 && a.index < preheaderEnd) {
      block("unsubscribe-hidden", "unsubscribe link sits inside the hidden preheader block");
      continue;
    }

    const size = fontSizePx(a.style);
    if (size !== null && size < 11) {
      block("unsubscribe-illegible", `unsubscribe link is ${size}px, below a legible size`);
    }

    const fg = /color:\s*(#[0-9a-fA-F]{3,6})/.exec(a.style)?.[1];
    if (!fg) {
      block(
        "unsubscribe-illegible",
        "unsubscribe link declares no colour, so a client's dark-mode inversion decides whether it is readable"
      );
      continue;
    }
    const ratio = contrastRatio(fg, backgroundBehind(html, a.index));
    if (ratio < 4.5) {
      block(
        "unsubscribe-illegible",
        `unsubscribe link contrast is ${ratio.toFixed(2)}:1 against its background, below the 4.5:1 minimum`
      );
    }
  }

  // 5. The plain-text part. Several clients and most screen readers render this
  //    instead of the HTML, and Resend substitutes the token in both parts.
  if (!text.includes(RESEND_UNSUBSCRIBE_TOKEN)) {
    block("unsubscribe-text-missing", `plain-text part carries no unsubscribe instruction (${RESEND_UNSUBSCRIBE_TOKEN})`);
  } else if (!text.includes(label)) {
    block("unsubscribe-text-unlocalized", `plain-text unsubscribe line is not labelled "${label}" in ${locale}`);
  }
  for (const line of text.split("\n")) {
    if (!/unsubscrib|désabonn|desabonn|cancelar suscri|إلغاء الاشتراك/i.test(line)) continue;
    for (const p of SIGNUP_PATHS) {
      if (line.includes(p)) {
        block("unsubscribe-points-at-signup", `plain-text unsubscribe line points at the signup page "${p}"`);
      }
    }
  }

  // De-duplicate: one message per distinct problem is what an operator can act
  // on; four copies of the same line is what they scroll past.
  const seen = new Set<string>();
  return flags.filter((f) => {
    const key = `${f.code}|${f.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Advisory deliverability heuristics.
 *
 * Estimates, labelled as such wherever they are shown, and never a reason on
 * their own to stop a send.
 */
export function advisoryFlags(rendered: RenderedEmail): PreflightFlag[] {
  const flags: PreflightFlag[] = [];
  const advise = (code: string, message: string) => flags.push({ code, message, blocking: false });

  if (rendered.text.trim().length < 500) advise("thin-text", "thin plain-text part");
  if (/!{2,}|FREE|ACT NOW|CLICK HERE/i.test(rendered.subject)) advise("promo-subject", "subject reads promotional");
  if (rendered.subject.length > 60) advise("long-subject", "subject may truncate");
  if ((rendered.html.match(/href="/g) ?? []).length > 40) advise("link-count", "high link count");
  return flags;
}

/**
 * Everything preflight knows about one rendered edition.
 *
 * `safeToSend` is derived, never passed in. There is deliberately no options
 * argument and no force parameter: a manual `send=true` reaches the same
 * function and gets the same answer as the Thursday cron.
 */
export function preflight(rendered: RenderedEmail, locale: Locale): PreflightResult {
  const flags = [...unsubscribeFlags(rendered, locale), ...advisoryFlags(rendered)];
  const blocking = flags.filter((f) => f.blocking);
  return {
    flags,
    blocking,
    spamFlags: flags.map((f) => f.message),
    safeToSend: blocking.length === 0,
  };
}
