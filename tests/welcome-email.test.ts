// =============================================================================
// WELCOME EMAIL
//
// The first thing a subscriber sees after handing over an address, and the one
// artefact in this project that cannot be hotfixed once sent. The assertions
// below are mostly about EMAIL CLIENTS rather than about content: the ways this
// breaks are silent, arrive only in someone else's inbox, and are invisible in
// every browser we test in.
// =============================================================================

import { describe, it, expect } from "vitest";
import { buildWelcomeEmail, unsubscribeHeader } from "@/lib/welcome-email";

const BASE = "https://immigrationclock.com";
const CONTACT = "hello@immigrationclock.com";
const mail = buildWelcomeEmail(BASE, CONTACT);

describe("email client compatibility", () => {
  it("lays out with tables, not flexbox or grid", () => {
    // Outlook renders through Word's HTML engine and supports neither. A
    // div-based layout collapses to one unstyled column there.
    expect(mail.html).toMatch(/<table[^>]+role="presentation"/);
    expect(mail.html).not.toMatch(/display:\s*flex/i);
    expect(mail.html).not.toMatch(/display:\s*grid/i);
    expect(mail.html).not.toMatch(/position:\s*(absolute|fixed)/i);
  });

  it("carries no <style> block, because Gmail strips it", () => {
    expect(mail.html).not.toMatch(/<style[\s>]/i);
  });

  it("ships no images at all", () => {
    // Most clients block remote images until the reader opts in, so an
    // image-based logo arrives as a broken placeholder on first open.
    expect(mail.html).not.toMatch(/<img[\s>]/i);
    expect(mail.html).not.toMatch(/background-image/i);
  });

  it("constrains the frame to 600px", () => {
    expect(mail.html).toContain("max-width:600px");
  });

  it("declares dark-mode support", () => {
    expect(mail.html).toMatch(/name="color-scheme"/);
    expect(mail.html).toMatch(/name="supported-color-schemes"/);
  });

  it("gives the CTA a table cell background, not padding on an anchor", () => {
    // Outlook ignores padding on <a>, which would render the button as a bare
    // link floating in white space.
    expect(mail.html).toMatch(/bgcolor="#0ea5e9"/);
  });
});

describe("links", () => {
  const hrefs = [...mail.html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);

  it("makes every link absolute or a mailto", () => {
    // A relative URL in an email resolves against the mail client, not the site.
    expect(hrefs.length).toBeGreaterThan(5);
    for (const h of hrefs) {
      expect(h, `relative link: ${h}`).toMatch(/^(https?:\/\/|mailto:)/);
    }
  });

  it("points only at pages that exist", () => {
    const allowed = [
      "", "/what-changed", "/search", "/h1b/employers", "/for-you", "/pulse",
      "/about", "/methodology", "/sources", "/privacy",
    ];
    for (const h of hrefs.filter((x) => x.startsWith(BASE))) {
      const path = h.slice(BASE.length);
      expect(allowed, `unknown path: ${path}`).toContain(path);
    }
  });

  it("offers a working unsubscribe route rather than a dead link", () => {
    // Single opt-in mints no per-recipient token, so a one-click HTTP
    // unsubscribe would be a link that does nothing. A monitored mailbox is
    // honest; a dead button is not.
    expect(mail.html).toMatch(/mailto:hello@immigrationclock\.com\?subject=/);
    expect(unsubscribeHeader(CONTACT)).toBe("<mailto:hello@immigrationclock.com?subject=Unsubscribe>");
    expect(unsubscribeHeader("")).toBeNull();
  });
});

describe("content", () => {
  it("answers what, how often, and how long", () => {
    expect(mail.html).toMatch(/One email every week/i);
    expect(mail.html).toMatch(/under five minutes/i);
    expect(mail.html).toMatch(/original government document/i);
  });

  it("states the privacy promise", () => {
    expect(mail.html).toMatch(/never sell or share/i);
  });

  it("does not claim to be a law firm", () => {
    expect(mail.html).toMatch(/not a law firm/i);
  });

  it("uses no marketing clichés", () => {
    const banned = /game-?changing|industry-leading|revolutionary|cutting-edge|best-in-class|unlock/i;
    expect(mail.html).not.toMatch(banned);
    expect(mail.text).not.toMatch(banned);
  });

  it("has a plain-text alternative that is actually plain", () => {
    // Some clients and most screen readers prefer text/plain. Leaking markup or
    // entities into it is the usual way this part rots unnoticed.
    expect(mail.text.length).toBeGreaterThan(300);
    expect(mail.text).not.toMatch(/<[a-z/][^>]*>/i);
    expect(mail.text).not.toMatch(/&[a-z]+;|&#\d+;/i);
    expect(mail.text).toContain(BASE);
  });

  it("keeps the subject short enough not to truncate on a phone", () => {
    expect(mail.subject.length).toBeLessThanOrEqual(45);
  });

  it("carries a preheader so the inbox preview is not the first heading", () => {
    expect(mail.html).toMatch(/display:none;max-height:0/);
  });
});

describe("configuration", () => {
  it("degrades without a contact address instead of rendering an empty mailto", () => {
    const noContact = buildWelcomeEmail(BASE, "");
    expect(noContact.html).not.toMatch(/mailto:\?/);
    expect(noContact.html).not.toMatch(/mailto:"/);
  });

  it("respects a base URL without a trailing slash duplication", () => {
    const withSlash = buildWelcomeEmail(`${BASE}/`, CONTACT);
    expect(withSlash.html).not.toContain(`${BASE}//`);
  });
});

describe("plain-text formatting", () => {
  it("keeps paragraph breaks", () => {
    // A filter meant to drop the optional contact line once removed every
    // deliberate blank line too, collapsing the text version into one wall of
    // sentences. Nothing in the browser would ever have shown it.
    expect(mail.text).toMatch(/\n\n/);
    const blocks = mail.text.split("\n\n");
    expect(blocks.length).toBeGreaterThan(4);
  });

  it("stays ASCII so older clients cannot mangle it", () => {
    expect(mail.text).not.toMatch(/[—–‘’“”]/);
  });
});
