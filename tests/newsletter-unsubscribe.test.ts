// =============================================================================
// THE OPT-OUT GATE
//
// An unsubscribe link is the one part of a newsletter whose absence is both
// illegal and unrecoverable: the mail is already in a hundred thousand inboxes
// by the time anyone notices. So this suite is written the way the gate is —
// it does not check that the code is present, it checks that the code REFUSES.
//
// Two layers are exercised:
//   • preflight/render/validate, in-process, for every locale
//   • scripts/send-newsletter.ts, spawned as a real process against a stub
//     Resend, because "--send does not override the gate" is a claim about the
//     script's control flow and nothing less than running it proves it
// =============================================================================

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawn } from "node:child_process";
import { createServer, type Server } from "node:http";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { LOCALES, RESEND_UNSUBSCRIBE_TOKEN, type Locale, type Segment } from "@/lib/newsletter/types";
import { stringsFor } from "@/lib/newsletter/locales";
import { selectIssue } from "@/lib/newsletter/select";
import { renderIssue, type RenderedEmail } from "@/lib/newsletter/render";
import { validateRendered } from "@/lib/newsletter/validate";
import { preflight, unsubscribeFlags, advisoryFlags, contrastRatio } from "@/lib/newsletter/preflight";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const BASE = "https://immigrationclock.com";
const CONTACT = "hello@immigrationclock.com";
const wide = { windowDays: 900, today: "2026-08-04" };

const seg = (over: Partial<Segment> = {}): Segment => ({
  id: "weekly-en",
  locale: "en",
  cadence: "weekly",
  ...over,
});

const renderFor = (locale: Locale) =>
  renderIssue(selectIssue({ segment: seg({ id: `weekly-${locale}`, locale }), ...wide }), BASE, CONTACT);

const codes = (r: RenderedEmail, locale: Locale) => unsubscribeFlags(r, locale).map((f) => f.code);

// =============================================================================
// 1. Every edition carries a real, localized, legible opt-out
// =============================================================================
describe("every locale ships a working unsubscribe", () => {
  for (const locale of LOCALES) {
    describe(locale, () => {
      const out = renderFor(locale);
      const label = stringsFor(locale).footer.unsubscribe;

      it("uses the Resend Broadcasts token as the link target", () => {
        // Not a site URL. Resend substitutes a per-contact link at send time;
        // nothing else in this codebase can actually unsubscribe a recipient.
        expect(out.html).toContain(`<a href="${RESEND_UNSUBSCRIBE_TOKEN}"`);
      });

      it("labels the link in this language", () => {
        const anchor = new RegExp(
          `<a href="\\{\\{\\{RESEND_UNSUBSCRIBE_URL\\}\\}\\}"[^>]*>${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}</a>`
        );
        expect(out.html).toMatch(anchor);
      });

      it("puts an unsubscribe instruction in the plain-text part too", () => {
        expect(out.text).toContain(RESEND_UNSUBSCRIBE_TOKEN);
        expect(out.text).toContain(label);
      });

      it("never points the reader at the signup page", () => {
        // /pulse is where people SUBSCRIBE. It was the English fallback target.
        expect(out.html).not.toMatch(/href="[^"]*\/pulse[^"]*"[^>]*>[^<]*(?:Unsubscribe|Cancelar|désabonner|إلغاء)/);
        const unsubLine = out.text.split("\n").find((l) => l.startsWith(label));
        expect(unsubLine).toBeTruthy();
        expect(unsubLine).not.toContain("/pulse");
      });

      it("does not fall back to a mailto:, which cannot unsubscribe a contact", () => {
        expect(out.html).not.toMatch(/href="mailto:[^"]*[Uu]nsubscribe/);
      });

      it("renders the link legibly, not hidden or greyed into the background", () => {
        expect(codes(out, locale)).toEqual([]);
      });

      it("passes the full validator with no errors", () => {
        expect(validateRendered(selectIssue({ segment: seg({ locale }), ...wide }), out, BASE).errors).toEqual([]);
      });

      it("declares the direction its script needs", () => {
        expect(out.html).toContain(`dir="${locale === "ar" ? "rtl" : "ltr"}"`);
      });
    });
  }

  it("gives Arabic an RTL footer that the opt-out sits inside", () => {
    const out = renderFor("ar");
    expect(out.html).toMatch(/<html lang="ar" dir="rtl">/);
    expect(out.html).toMatch(/<body[^>]*dir="rtl"/);
    expect(out.html).toContain("إلغاء الاشتراك");

    // The enclosing cell must right-align, or the opt-out renders flush left
    // in an otherwise right-aligned footer.
    const at = out.html.indexOf(`<a href="${RESEND_UNSUBSCRIBE_TOKEN}"`);
    const cell = out.html.lastIndexOf("<td", at);
    const openTag = out.html.slice(cell, out.html.indexOf(">", cell) + 1);
    expect(openTag).toContain('align="right"');
  });

  it("keeps the LTR editions left-aligned", () => {
    for (const locale of LOCALES.filter((l) => l !== "ar")) {
      const out = renderFor(locale);
      const at = out.html.indexOf(`<a href="${RESEND_UNSUBSCRIBE_TOKEN}"`);
      const cell = out.html.lastIndexOf("<td", at);
      expect(out.html.slice(cell, out.html.indexOf(">", cell) + 1), locale).toContain('align="left"');
    }
  });

  it("labels the opt-out differently in each language", () => {
    const labels = LOCALES.map((l) => stringsFor(l).footer.unsubscribe);
    expect(new Set(labels).size).toBe(LOCALES.length);
  });
});

// =============================================================================
// 2. The gate refuses — the half that actually protects anyone
// =============================================================================
describe("preflight blocks an edition whose opt-out is broken", () => {
  const good = renderFor("en");
  const tamper = (fn: (r: RenderedEmail) => RenderedEmail) => fn({ ...good });

  it("blocks when the unsubscribe link is removed entirely", () => {
    const broken = tamper((r) => ({
      ...r,
      html: r.html.replace(new RegExp(`<a href="\\{\\{\\{RESEND_UNSUBSCRIBE_URL\\}\\}\\}"[^>]*>[^<]*</a>`), ""),
      text: r.text.replace(RESEND_UNSUBSCRIBE_TOKEN, ""),
    }));
    const flags = unsubscribeFlags(broken, "en");
    expect(flags.map((f) => f.code)).toContain("unsubscribe-missing");
    expect(flags.every((f) => f.blocking)).toBe(true);
    expect(preflight(broken, "en").safeToSend).toBe(false);
  });

  it("blocks a link back to /pulse — a signup page is not an opt-out", () => {
    const broken = tamper((r) => ({
      ...r,
      html: r.html.replace(RESEND_UNSUBSCRIBE_TOKEN, `${BASE}/pulse`),
      text: r.text.replace(RESEND_UNSUBSCRIBE_TOKEN, `${BASE}/pulse`),
    }));
    const flags = unsubscribeFlags(broken, "en");
    expect(flags.map((f) => f.code)).toContain("unsubscribe-points-at-signup");
    expect(preflight(broken, "en").safeToSend).toBe(false);
  });

  it("blocks the other signup-shaped paths too", () => {
    for (const path of ["/subscribe", "/signup", "/newsletter/subscribe"]) {
      const broken = tamper((r) => ({ ...r, html: r.html.replace(RESEND_UNSUBSCRIBE_TOKEN, `${BASE}${path}`) }));
      expect(unsubscribeFlags(broken, "en").map((f) => f.code), path).toContain("unsubscribe-points-at-signup");
    }
  });

  it("blocks a mailto:, which reaches an inbox rather than the contact record", () => {
    const broken = tamper((r) => ({
      ...r,
      html: r.html.replace(RESEND_UNSUBSCRIBE_TOKEN, "mailto:hello@immigrationclock.com?subject=Unsubscribe"),
    }));
    expect(unsubscribeFlags(broken, "en").map((f) => f.code)).toContain("unsubscribe-placeholder");
  });

  it("blocks every impostor placeholder, including ones from other ESPs", () => {
    const impostors = [
      "#",
      "about:blank",
      "https://example.com/unsubscribe",
      "{{unsubscribe}}",
      "%%unsubscribe%%",
      "[unsubscribe]",
      "https://immigrationclock.com/TODO",
    ];
    for (const href of impostors) {
      const broken = tamper((r) => ({ ...r, html: r.html.replace(RESEND_UNSUBSCRIBE_TOKEN, href) }));
      const blocking = unsubscribeFlags(broken, "en").filter((f) => f.blocking);
      expect(blocking.length, `"${href}" was accepted`).toBeGreaterThan(0);
    }
  });

  it("blocks a token that is present but not inside an <a href>", () => {
    const broken = tamper((r) => ({
      ...r,
      html: r.html.replace(`<a href="${RESEND_UNSUBSCRIBE_TOKEN}"`, `<span data-x="${RESEND_UNSUBSCRIBE_TOKEN}"`),
    }));
    expect(unsubscribeFlags(broken, "en").map((f) => f.code)).toContain("unsubscribe-not-a-link");
  });

  it("blocks a two-brace token, which Resend would HTML-escape into visible text", () => {
    const broken = tamper((r) => ({ ...r, html: r.html.replace(RESEND_UNSUBSCRIBE_TOKEN, "{{RESEND_UNSUBSCRIBE_URL}}") }));
    expect(unsubscribeFlags(broken, "en").filter((f) => f.blocking).length).toBeGreaterThan(0);
  });

  it("blocks an opt-out styled into invisibility", () => {
    for (const style of ["display:none", "visibility:hidden", "opacity:0", "font-size:0"]) {
      const broken = tamper((r) => ({
        ...r,
        html: r.html.replace(
          `<a href="${RESEND_UNSUBSCRIBE_TOKEN}" style="color:#334155;`,
          `<a href="${RESEND_UNSUBSCRIBE_TOKEN}" style="${style};color:#334155;`
        ),
      }));
      expect(unsubscribeFlags(broken, "en").map((f) => f.code), style).toContain("unsubscribe-hidden");
    }
  });

  it("blocks an opt-out greyed to below 4.5:1 against its own background", () => {
    // #cbd5e1 on the #f8fafc footer is ~1.5:1 — technically a link, visually
    // not one.
    const broken = tamper((r) => ({
      ...r,
      html: r.html.replace(`<a href="${RESEND_UNSUBSCRIBE_TOKEN}" style="color:#334155;`, `<a href="${RESEND_UNSUBSCRIBE_TOKEN}" style="color:#cbd5e1;`),
    }));
    expect(unsubscribeFlags(broken, "en").map((f) => f.code)).toContain("unsubscribe-illegible");
  });

  it("blocks an opt-out with no colour of its own, which dark mode may invert away", () => {
    const broken = tamper((r) => ({
      ...r,
      html: r.html.replace(`<a href="${RESEND_UNSUBSCRIBE_TOKEN}" style="color:#334155;text-decoration:underline;font-weight:600;"`, `<a href="${RESEND_UNSUBSCRIBE_TOKEN}"`),
    }));
    expect(unsubscribeFlags(broken, "en").map((f) => f.code)).toContain("unsubscribe-illegible");
  });

  it("blocks an HTML-only opt-out with nothing in the plain-text part", () => {
    const broken = tamper((r) => ({ ...r, text: r.text.replace(RESEND_UNSUBSCRIBE_TOKEN, "") }));
    expect(unsubscribeFlags(broken, "en").map((f) => f.code)).toContain("unsubscribe-text-missing");
  });

  it("blocks an English label left in a translated edition", () => {
    const ar = renderFor("ar");
    const broken = { ...ar, html: ar.html.replace("إلغاء الاشتراك", "Unsubscribe") };
    expect(unsubscribeFlags(broken, "ar").map((f) => f.code)).toContain("unsubscribe-unlocalized");
  });

  it("computes contrast the way WCAG does", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 1);
    expect(contrastRatio("#ffffff", "#ffffff")).toBeCloseTo(1, 5);
    expect(contrastRatio("#334155", "#f8fafc")).toBeGreaterThan(4.5);
    expect(contrastRatio("#cbd5e1", "#f8fafc")).toBeLessThan(4.5);
  });
});

// =============================================================================
// 3. Blocking vs advisory — the distinction the old code got wrong
// =============================================================================
describe("spamFlags are enforced, not merely reported", () => {
  const good = renderFor("en");

  it("marks every unsubscribe finding blocking", () => {
    const broken = { ...good, html: good.html.replace(RESEND_UNSUBSCRIBE_TOKEN, `${BASE}/pulse`) };
    const flags = unsubscribeFlags(broken, "en");
    expect(flags.length).toBeGreaterThan(0);
    for (const f of flags) expect(f.blocking, `${f.code} is not blocking`).toBe(true);
  });

  it("keeps deliverability heuristics advisory, so a long subject cannot stop a send", () => {
    const noisy = { ...good, subject: `ACT NOW!! ${"x".repeat(80)}` };
    const advisory = advisoryFlags(noisy);
    expect(advisory.length).toBeGreaterThan(0);
    for (const f of advisory) expect(f.blocking).toBe(false);
    // Advisory findings alone leave the edition sendable.
    expect(preflight(noisy, "en").safeToSend).toBe(true);
  });

  it("reports both kinds in spamFlags but only blocks on the unsubscribe ones", () => {
    const broken = { ...good, text: good.text.replace(RESEND_UNSUBSCRIBE_TOKEN, "").slice(0, 300) };
    const result = preflight(broken, "en");
    expect(result.spamFlags.length).toBeGreaterThan(1);
    expect(result.blocking.every((f) => f.code.startsWith("unsubscribe"))).toBe(true);
    expect(result.safeToSend).toBe(false);
  });

  it("surfaces a missing opt-out as a validation ERROR, not a warning", () => {
    const issue = selectIssue({ segment: seg(), ...wide });
    const broken = { ...good, html: good.html.replace(RESEND_UNSUBSCRIBE_TOKEN, "#") };
    const result = validateRendered(issue, broken, BASE);
    expect(result.errors.join()).toMatch(/unsubscribe/i);
  });
});

// =============================================================================
// 4. The send script itself, spawned for real
// =============================================================================
describe("scripts/send-newsletter.ts fails closed", () => {
  let server: Server;
  let apiBase = "";
  const received: Array<{ method: string; path: string; body: unknown }> = [];
  /** Anything that creates or fires a broadcast. Reads are allowed in a dry run. */
  const writes = () => received.filter((r) => r.method === "POST");

  beforeAll(async () => {
    server = createServer((req, res) => {
      // Buffers, concatenated — NOT string concatenation. A rendered issue is
      // tens of KB of UTF-8 and arrives in several chunks; appending Buffers to
      // a string decodes each one separately and mangles any multi-byte
      // character that straddles a chunk boundary, which then fails JSON.parse
      // and hangs the client until its abort timer fires.
      const chunks: Buffer[] = [];
      req.on("data", (c: Buffer) => chunks.push(c));
      req.on("end", () => {
        const raw = Buffer.concat(chunks).toString("utf8");
        try {
          received.push({ method: req.method ?? "", path: req.url ?? "", body: raw ? JSON.parse(raw) : {} });
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ id: "bc_test" }));
        } catch (err) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: String(err) }));
        }
      });
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    const addr = server.address();
    apiBase = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;
  });

  afterAll(() => new Promise<void>((r) => server.close(() => r())));

  /**
   * Run the real script and collect its output.
   *
   * ASYNC ON PURPOSE. spawnSync would block this thread's event loop, and the
   * stub Resend above is listening on that same loop — so the child's request
   * would never be answered and every live-send test would "fail" with a 20s
   * abort that has nothing to do with the code under test.
   */
  function exec(args: string[], env: Record<string, string>) {
    return new Promise<{ status: number | null; output: string }>((resolveRun) => {
      const child = spawn("npx", ["tsx", "scripts/send-newsletter.ts", ...args], {
        cwd: ROOT,
        shell: true,
        env: { ...process.env, ...env },
      });
      let output = "";
      child.stdout.on("data", (c) => (output += c));
      child.stderr.on("data", (c) => (output += c));
      child.on("close", (status) => resolveRun({ status, output }));
    });
  }

  /** Write a one-edition manifest into a temp dir and run the real script against it. */
  function run(rendered: RenderedEmail, args: string[], env: Record<string, string> = {}) {
    const dir = mkdtempSync(join(tmpdir(), "pulse-send-"));
    const htmlPath = join(dir, "en.html");
    const textPath = join(dir, "en.txt");
    writeFileSync(htmlPath, rendered.html, "utf8");
    writeFileSync(textPath, rendered.text, "utf8");

    const manifestPath = join(dir, "manifest.json");
    writeFileSync(
      manifestPath,
      JSON.stringify({
        generatedAt: new Date().toISOString(),
        today: "2026-08-04",
        editions: [
          {
            issueId: "weekly-en-2026-08-04",
            segment: "weekly-en",
            locale: "en",
            subject: rendered.subject,
            // Relative to the fixture manifest, which is how the script
            // resolves an overridden manifest's paths.
            htmlPath: "en.html",
            textPath: "en.txt",
            audienceConfigured: true,
            errors: [],
            warnings: [],
          },
        ],
      }),
      "utf8"
    );

    return exec(args, {
      NEWSLETTER_MANIFEST: manifestPath,
      RESEND_API_BASE: apiBase,
      RESEND_API_KEY: "re_test_key",
      RESEND_AUDIENCE_EN: "aud_test_en",
      NEXT_PUBLIC_CONTACT_EMAIL: CONTACT,
      ...env,
    });
  }

  const good = renderFor("en");
  const withoutUnsubscribe: RenderedEmail = {
    ...good,
    html: good.html.replace(new RegExp(`<a href="\\{\\{\\{RESEND_UNSUBSCRIBE_URL\\}\\}\\}"[^>]*>[^<]*</a>`), ""),
    text: good.text.replace(RESEND_UNSUBSCRIBE_TOKEN, ""),
  };

  it("dry-runs a valid edition and prints the exact broadcast payload", async () => {
    const r = await run(good, []);
    expect(r.status, r.output).toBe(0);
    expect(r.output).toContain("unsubscribe gate: 1 edition(s) carry a working opt-out");
    expect(r.output).toContain("would POST /broadcasts");
    expect(r.output).toContain('"audience_id": "aud_test_en"');
    expect(r.output).toContain("unsubscribe token present: true");
    // A dry run MAY read — it counts recipients to print the confirmation
    // block. It must never write: no broadcast created, none fired.
    expect(writes()).toHaveLength(0);
  });

  it("refuses to send an edition with no opt-out", async () => {
    const r = await run(withoutUnsubscribe, []);
    expect(r.status).toBe(1);
    expect(r.output).toContain("UNSUBSCRIBE GATE FAILED");
    expect(r.output).toMatch(/no unsubscribe link/i);
  });

  it("STILL refuses with --send, a live key and a configured audience", async () => {
    // The whole point. A manual dispatch with send=true reaches this same code
    // path and gets the same answer as the Thursday cron.
    const before = writes().length;
    const r = await run(withoutUnsubscribe, ["--send"]);
    expect(r.status).toBe(1);
    expect(r.output).toContain("UNSUBSCRIBE GATE FAILED");
    expect(r.output).toContain("--send does not override this");
    expect(writes().length, "a broadcast was created despite the gate").toBe(before);
  });

  it("refuses an edition the manifest itself marked unsafe", async () => {
    const dir = mkdtempSync(join(tmpdir(), "pulse-unsafe-"));
    const htmlPath = join(dir, "en.html");
    const textPath = join(dir, "en.txt");
    writeFileSync(htmlPath, good.html, "utf8");
    writeFileSync(textPath, good.text, "utf8");
    const manifestPath = join(dir, "manifest.json");
    writeFileSync(
      manifestPath,
      JSON.stringify({
        generatedAt: new Date().toISOString(),
        today: "2026-08-04",
        editions: [
          {
            issueId: "weekly-en-2026-08-04",
            segment: "weekly-en",
            locale: "en",
            subject: good.subject,
            // Relative to the fixture manifest, which is how the script
            // resolves an overridden manifest's paths.
            htmlPath: "en.html",
            textPath: "en.txt",
            audienceConfigured: true,
            errors: [],
            warnings: [],
            safeToSend: false,
            blockingFlags: ["unsubscribe-missing"],
          },
        ],
      }),
      "utf8"
    );
    const r = await exec(["--send"], {
      NEWSLETTER_MANIFEST: manifestPath,
      RESEND_API_BASE: apiBase,
      RESEND_API_KEY: "re_test_key",
      RESEND_AUDIENCE_EN: "aud_test_en",
    });
    expect(r.status).toBe(1);
    expect(r.output).toMatch(/manifest marks this edition unsafe/);
  });

  it("posts a broadcast whose body carries the unsubscribe token in both parts", async () => {
    received.length = 0;
    const r = await run(good, ["--send"]);
    expect(r.status, r.output).toBe(0);

    const create = received.find((x) => x.path === "/broadcasts");
    expect(create, "no POST /broadcasts was made").toBeTruthy();
    const body = create!.body as Record<string, string>;

    expect(body.audience_id).toBe("aud_test_en");
    expect(body.from).toBeTruthy();
    expect(body.subject).toBe(good.subject);
    expect(body.name).toBe("weekly-en-2026-08-04");
    expect(body.html).toContain(`<a href="${RESEND_UNSUBSCRIBE_TOKEN}"`);
    expect(body.text).toContain(RESEND_UNSUBSCRIBE_TOKEN);

    // Broadcasts have no `headers` field. Sending one would be silently dropped
    // at best; fabricating a List-Unsubscribe URL that cannot opt anyone out
    // would be a false one-click claim under RFC 8058.
    expect(body).not.toHaveProperty("headers");
    expect(JSON.stringify(body)).not.toMatch(/List-Unsubscribe/i);

    // And it actually fired the send.
    expect(received.some((x) => x.path === "/broadcasts/bc_test/send")).toBe(true);
  });
});

// =============================================================================
// 5. The archived issue on disk is the thing that gets POSTed
// =============================================================================
describe("the committed archive", () => {
  it("carries the opt-out in every locale, HTML and text", async () => {
    const { readFile } = await import("node:fs/promises");
    const manifest = JSON.parse(
      await readFile(join(ROOT, "src/lib/generated/newsletter-latest.json"), "utf8")
    ) as { editions: Array<{ locale: Locale; htmlPath: string; textPath: string; safeToSend?: boolean }> };

    expect(manifest.editions).toHaveLength(LOCALES.length);
    for (const ed of manifest.editions) {
      const html = await readFile(join(ROOT, ed.htmlPath), "utf8");
      const text = await readFile(join(ROOT, ed.textPath), "utf8");
      expect(html, `${ed.locale} html`).toContain(`<a href="${RESEND_UNSUBSCRIBE_TOKEN}"`);
      expect(text, `${ed.locale} text`).toContain(RESEND_UNSUBSCRIBE_TOKEN);
      expect(html, `${ed.locale} html`).toContain(stringsFor(ed.locale).footer.unsubscribe);
      expect(ed.safeToSend, `${ed.locale} manifest`).toBe(true);
      expect(unsubscribeFlags({ subject: "", html, text }, ed.locale)).toEqual([]);
    }
  });
});
