// =============================================================================
// DUPLICATE-SEND PREVENTION
//
// The invariant: one edition + one language = at most one successful send to a
// given destination.
//
// What this replaces claimed to be idempotent and was not. send-newsletter.ts
// set `name: <issueId>` on every broadcast and asserted "a retry cannot deliver
// the same issue twice". Resend documents `name` as "only used for internal
// reference", and its actual Idempotency-Key feature covers POST /emails and
// /emails/batch — not /broadcasts. The workflow retries sends twice, so a run
// where English delivered and Spanish failed mailed English's subscribers the
// issue a second time.
//
// The scripted tests below spawn the real script against a stub Resend, because
// every claim here is about control flow under partial failure, and nothing
// less than running it proves that.
// =============================================================================

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawn } from "node:child_process";
import { createServer, type Server } from "node:http";
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  alreadySent,
  parseLedger,
  recordSend,
  sendKey,
  serializeLedger,
  EMPTY_LEDGER,
  type SendLedger,
} from "@/lib/newsletter/send-ledger";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

const rec = (over: Partial<Parameters<typeof recordSend>[1]> = {}) => ({
  issueId: "weekly-en-2026-08-08",
  locale: "en",
  audienceId: "aud_prod_en",
  broadcastId: "bc_1",
  sentAt: "2026-08-08T14:00:00.000Z",
  ...over,
});

// =============================================================================
// The ledger itself
// =============================================================================
describe("the ledger", () => {
  it("recognises an edition it has already recorded", () => {
    const l = recordSend(EMPTY_LEDGER, rec());
    expect(alreadySent(l, "weekly-en-2026-08-08", "en", "aud_prod_en")).toBeTruthy();
  });

  it("does not confuse two languages of the same issue", () => {
    const l = recordSend(EMPTY_LEDGER, rec());
    expect(alreadySent(l, "weekly-es-2026-08-08", "es", "aud_prod_es")).toBeNull();
  });

  it("does not confuse two issues in the same language", () => {
    const l = recordSend(EMPTY_LEDGER, rec());
    expect(alreadySent(l, "weekly-en-2026-08-15", "en", "aud_prod_en")).toBeNull();
  });

  it("treats a different destination as a different send", () => {
    // This is what keeps a one-recipient smoke test from eating the real
    // newsletter: the smoke send targets a throwaway segment, so production
    // remains unsent.
    const l = recordSend(EMPTY_LEDGER, rec({ audienceId: "seg_smoke_test" }));
    expect(alreadySent(l, "weekly-en-2026-08-08", "en", "seg_smoke_test")).toBeTruthy();
    expect(alreadySent(l, "weekly-en-2026-08-08", "en", "aud_prod_en")).toBeNull();
  });

  it("never mutates the ledger it is given", () => {
    const before = recordSend(EMPTY_LEDGER, rec());
    const snapshot = JSON.stringify(before);
    recordSend(before, rec({ locale: "es", issueId: "weekly-es-2026-08-08" }));
    expect(JSON.stringify(before)).toBe(snapshot);
  });

  it("round-trips through disk without changing meaning", () => {
    const l = recordSend(recordSend(EMPTY_LEDGER, rec()), rec({ locale: "fr", issueId: "weekly-fr-2026-08-08" }));
    const reparsed = parseLedger(serializeLedger(l))!;
    expect(reparsed.sends).toHaveLength(2);
    expect(alreadySent(reparsed, "weekly-fr-2026-08-08", "fr", "aud_prod_en")).toBeTruthy();
  });

  it("serialises deterministically, so a rebuild produces no spurious diff", () => {
    const a = recordSend(recordSend(EMPTY_LEDGER, rec({ locale: "es" })), rec({ locale: "ar" }));
    const b = recordSend(recordSend(EMPTY_LEDGER, rec({ locale: "ar" })), rec({ locale: "es" }));
    expect(serializeLedger(a)).toBe(serializeLedger(b));
  });

  it("treats a missing file as empty — the state before the first send", () => {
    expect(parseLedger(null)).toEqual(EMPTY_LEDGER);
    expect(parseLedger("")).toEqual(EMPTY_LEDGER);
  });

  it("REFUSES to treat a corrupt ledger as empty", () => {
    // Returning EMPTY_LEDGER here would silently unlock every edition the file
    // exists to protect — the same shape of failure as the `name`-based
    // idempotency it replaces.
    for (const bad of ["{", "null", "[]", '{"version":2,"sends":[]}', '{"version":1}', '{"version":1,"sends":[{"locale":"en"}]}']) {
      expect(parseLedger(bad), bad).toBeNull();
    }
  });

  it("keys on all three of issue, locale and destination", () => {
    expect(sendKey("i", "en", "a")).not.toBe(sendKey("i", "es", "a"));
    expect(sendKey("i", "en", "a")).not.toBe(sendKey("i", "en", "b"));
    expect(sendKey("i", "en", "a")).toBe(sendKey("i", "en", "a"));
  });
});

// =============================================================================
// The script, spawned, against a stub Resend
// =============================================================================
describe("send-newsletter.ts under retry and partial failure", () => {
  let server: Server;
  let apiBase = "";
  let posts: Array<{ path: string; body: Record<string, unknown> }> = [];
  /** Locales the stub should fail on, set per test. */
  let failLocales = new Set<string>();

  beforeAll(async () => {
    server = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on("data", (c: Buffer) => chunks.push(c));
      req.on("end", () => {
        const raw = Buffer.concat(chunks).toString("utf8");
        const json = (t: string) => {
          try {
            return t ? JSON.parse(t) : {};
          } catch {
            return {};
          }
        };

        if (req.method === "GET") {
          // One subscribed contact in every segment.
          res.writeHead(200, { "Content-Type": "application/json" });
          return res.end(JSON.stringify({ data: [{ email: "t@example.com", unsubscribed: false }] }));
        }

        const body = json(raw) as Record<string, unknown>;
        const url = req.url ?? "";
        if (url === "/broadcasts") {
          const subject = String(body.subject ?? "");
          // Subjects are localised, so they identify the edition.
          const locale = /cambios/.test(subject) ? "es" : /changements/.test(subject) ? "fr" : /تغيير/.test(subject) ? "ar" : "en";
          if (failLocales.has(locale)) {
            res.writeHead(500, { "Content-Type": "application/json" });
            return res.end(JSON.stringify({ message: "upstream exploded" }));
          }
          posts.push({ path: url, body });
          res.writeHead(200, { "Content-Type": "application/json" });
          return res.end(JSON.stringify({ id: `bc_${locale}` }));
        }
        posts.push({ path: url, body });
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
      });
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    const addr = server.address();
    apiBase = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;
  });

  afterAll(() => new Promise<void>((r) => server.close(() => r())));

  /** A workspace with a manifest, its editions, and a ledger path. */
  function workspace(locales: string[]) {
    const dir = mkdtempSync(join(tmpdir(), "pulse-ledger-"));
    const html =
      `<html><body><p><a href="{{{RESEND_UNSUBSCRIBE_URL}}}" style="color:#334155;">Unsubscribe</a></p>` +
      `<a href="https://immigrationclock.com/x">x</a></body></html>`;
    const subjects: Record<string, string> = {
      en: "Immigration Pulse — 5 changes",
      es: "Immigration Pulse — 5 cambios",
      fr: "Immigration Pulse — 5 changements",
      ar: "Immigration Pulse — 5 تغييرات",
    };
    const labels: Record<string, string> = { en: "Unsubscribe", es: "Cancelar suscripción", fr: "Se désabonner", ar: "إلغاء الاشتراك" };

    const editions = locales.map((l) => {
      const body = html.replace(">Unsubscribe<", `>${labels[l]}<`);
      writeFileSync(join(dir, `${l}.html`), body, "utf8");
      writeFileSync(join(dir, `${l}.txt`), `${labels[l]}: {{{RESEND_UNSUBSCRIBE_URL}}}\n${"pad ".repeat(80)}`, "utf8");
      return {
        issueId: `weekly-${l}-2026-08-08`,
        segment: `weekly-${l}`,
        locale: l,
        subject: subjects[l],
        htmlPath: `${l}.html`,
        textPath: `${l}.txt`,
        audienceConfigured: true,
        errors: [],
        warnings: [],
        safeToSend: true,
        blockingFlags: [],
      };
    });

    writeFileSync(
      join(dir, "manifest.json"),
      JSON.stringify({ generatedAt: new Date().toISOString(), today: "2026-08-08", editions }),
      "utf8"
    );
    return { dir, manifestPath: join(dir, "manifest.json"), ledgerPath: join(dir, "ledger.json") };
  }

  function run(ws: ReturnType<typeof workspace>, args: string[], extraEnv: Record<string, string> = {}) {
    return new Promise<{ status: number | null; output: string }>((resolveRun) => {
      const child = spawn("npx", ["tsx", "scripts/send-newsletter.ts", ...args], {
        cwd: ROOT,
        shell: true,
        env: {
          ...process.env,
          NEWSLETTER_MANIFEST: ws.manifestPath,
          NEWSLETTER_SEND_LEDGER: ws.ledgerPath,
          RESEND_API_BASE: apiBase,
          RESEND_API_KEY: "re_test",
          NEXT_PUBLIC_CONTACT_EMAIL: "hello@immigrationclock.com",
          RESEND_AUDIENCE_EN: "aud_en",
          RESEND_AUDIENCE_ES: "aud_es",
          RESEND_AUDIENCE_FR: "aud_fr",
          RESEND_AUDIENCE_AR: "aud_ar",
          ...extraEnv,
        },
      });
      let output = "";
      child.stdout.on("data", (c) => (output += c));
      child.stderr.on("data", (c) => (output += c));
      child.on("close", (status) => resolveRun({ status, output }));
    });
  }

  const ledgerOf = (ws: ReturnType<typeof workspace>): SendLedger =>
    existsSync(ws.ledgerPath) ? parseLedger(readFileSync(ws.ledgerPath, "utf8"))! : EMPTY_LEDGER;

  beforeAll(() => {
    posts = [];
    failLocales = new Set();
  });

  it("records a send, and refuses to repeat it", async () => {
    posts = [];
    failLocales = new Set();
    const ws = workspace(["en"]);

    const first = await run(ws, ["--only", "en", "--send"]);
    expect(first.status, first.output).toBe(0);
    expect(posts.filter((p) => p.path === "/broadcasts")).toHaveLength(1);
    expect(ledgerOf(ws).sends).toHaveLength(1);

    const second = await run(ws, ["--only", "en", "--send"]);
    expect(second.status, second.output).toBe(0);
    expect(second.output).toMatch(/already sent/i);
    // THE INVARIANT: still exactly one broadcast.
    expect(posts.filter((p) => p.path === "/broadcasts")).toHaveLength(1);
    expect(ledgerOf(ws).sends).toHaveLength(1);
  });

  it("RETRY AFTER A PARTIAL MULTILINGUAL SEND re-sends only what failed", { timeout: 120_000 }, async () => {
    // The exact bug: English delivered, Spanish threw, the workflow retried.
    posts = [];
    failLocales = new Set(["es"]);
    const ws = workspace(["en", "es"]);

    const first = await run(ws, ["--send"]);
    expect(first.status).toBe(1); // Spanish failed, so the run fails
    expect(posts.filter((p) => p.path === "/broadcasts")).toHaveLength(1);
    expect(ledgerOf(ws).sends.map((s) => s.locale)).toEqual(["en"]);

    // The retry: Spanish now works.
    failLocales = new Set();
    const retry = await run(ws, ["--send"]);
    expect(retry.status, retry.output).toBe(0);
    expect(retry.output).toMatch(/weekly-en.*already sent/is);

    const created = posts.filter((p) => p.path === "/broadcasts");
    expect(created, "English was broadcast twice").toHaveLength(2);
    expect(created.map((p) => String(p.body.subject).includes("cambios"))).toEqual([false, true]);
    expect(ledgerOf(ws).sends.map((s) => s.locale).sort()).toEqual(["en", "es"]);
  });

  it("a retry that finds everything already sent succeeds rather than failing", async () => {
    posts = [];
    failLocales = new Set();
    const ws = workspace(["en"]);
    await run(ws, ["--only", "en", "--send"]);
    const retry = await run(ws, ["--only", "en", "--send"]);
    expect(retry.status, retry.output).toBe(0);
    expect(retry.output).toMatch(/retry finding its work complete/i);
    expect(retry.output).not.toMatch(/REACHED NOBODY/);
  });

  // Three sequential `npx tsx` spawns; the default 30s is tight on a loaded
  // machine and a timeout here would read as a logic failure.
  it("EXPLICIT OVERRIDE re-sends, and only with --only", { timeout: 120_000 }, async () => {
    posts = [];
    failLocales = new Set();
    const ws = workspace(["en"]);
    await run(ws, ["--only", "en", "--send"]);
    expect(posts.filter((p) => p.path === "/broadcasts")).toHaveLength(1);

    // Blanket override is refused.
    const blanket = await run(ws, ["--resend", "--send"]);
    expect(blanket.status).toBe(1);
    expect(blanket.output).toMatch(/--resend requires --only/);
    expect(posts.filter((p) => p.path === "/broadcasts")).toHaveLength(1);

    // Named override goes through.
    const named = await run(ws, ["--only", "en", "--resend", "--send"]);
    expect(named.status, named.output).toBe(0);
    expect(posts.filter((p) => p.path === "/broadcasts")).toHaveLength(2);

    const l = ledgerOf(ws);
    expect(l.sends).toHaveLength(2);
    expect(l.sends.some((s) => s.override === true)).toBe(true);
  });

  it("refuses to send when the ledger is corrupt", async () => {
    posts = [];
    const ws = workspace(["en"]);
    writeFileSync(ws.ledgerPath, "{ this is not json", "utf8");
    const r = await run(ws, ["--only", "en", "--send"]);
    expect(r.status).toBe(1);
    expect(r.output).toMatch(/unreadable or malformed/);
    expect(posts.filter((p) => p.path === "/broadcasts")).toHaveLength(0);
  });

  it("a dry run neither consults nor writes the ledger as a send would", async () => {
    posts = [];
    failLocales = new Set();
    const ws = workspace(["en"]);
    const r = await run(ws, ["--only", "en"]);
    expect(r.status, r.output).toBe(0);
    expect(posts.filter((p) => p.path === "/broadcasts")).toHaveLength(0);
    expect(existsSync(ws.ledgerPath)).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // Reply-To, fail-safe
  // ---------------------------------------------------------------------------
  it("REFUSES a live send when NEXT_PUBLIC_CONTACT_EMAIL is missing", async () => {
    posts = [];
    const ws = workspace(["en"]);
    const r = await run(ws, ["--only", "en", "--send"], { NEXT_PUBLIC_CONTACT_EMAIL: "" });
    expect(r.status).toBe(1);
    expect(r.output).toMatch(/NEXT_PUBLIC_CONTACT_EMAIL is not set/);
    expect(r.output).toMatch(/Refusing to send/);
    expect(posts.filter((p) => p.path === "/broadcasts")).toHaveLength(0);
  });

  it("warns but still previews on a dry run without it", async () => {
    const ws = workspace(["en"]);
    const r = await run(ws, ["--only", "en"], { NEXT_PUBLIC_CONTACT_EMAIL: "" });
    expect(r.status, r.output).toBe(0);
    expect(r.output).toMatch(/WARNING: NEXT_PUBLIC_CONTACT_EMAIL is not set/);
    expect(r.output).toMatch(/A live send would refuse/);
  });

  it("puts the address in reply_to when it IS set", async () => {
    posts = [];
    failLocales = new Set();
    const ws = workspace(["en"]);
    await run(ws, ["--only", "en", "--send"]);
    const created = posts.find((p) => p.path === "/broadcasts")!;
    expect(created.body.reply_to).toBe("hello@immigrationclock.com");
  });

  // ---------------------------------------------------------------------------
  // Recipient count via the current Segments API
  // ---------------------------------------------------------------------------
  it("reads the recipient count from /segments, not the retired /audiences", async () => {
    // Resend's reference no longer documents any /audiences/* endpoint. Probing
    // it returns 404, which printed "unknown" next to a live send prompt —
    // the one number an operator is confirming.
    const seenPaths: string[] = [];
    const probe = createServer((req, res) => {
      seenPaths.push(`${req.method} ${(req.url ?? "").split("?")[0]}`);
      if ((req.url ?? "").startsWith("/audiences/")) {
        res.writeHead(404, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ message: "not found" }));
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ data: [{ email: "one@example.com", unsubscribed: false }] }));
    });
    await new Promise<void>((r) => probe.listen(0, "127.0.0.1", r));
    const addr = probe.address();
    const base = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;

    const ws = workspace(["en"]);
    const r = await run(ws, ["--only", "en"], { RESEND_API_BASE: base });
    probe.close();

    expect(r.output).toMatch(/recipients\s*:\s*1 subscribed contact/);
    expect(seenPaths.some((p) => p.startsWith("GET /segments/"))).toBe(true);
    expect(r.output).not.toMatch(/could not read the audience/);
  });

  it("resolves the destination from RESEND_SEGMENT_*, the same family signup writes", async () => {
    posts = [];
    failLocales = new Set();
    const ws = workspace(["en"]);
    const r = await run(ws, ["--only", "en", "--send"], {
      RESEND_AUDIENCE_EN: "",
      RESEND_SEGMENT_EN: "seg_canonical",
    });
    expect(r.status, r.output).toBe(0);
    expect(posts.find((p) => p.path === "/broadcasts")!.body.audience_id).toBe("seg_canonical");
    expect(r.output).toMatch(/\[RESEND_SEGMENT_EN\]/);
  });

  it("still honours the deprecated RESEND_AUDIENCE_* alias", async () => {
    // What the first production send used. If this stopped resolving, Thursday
    // would mail nobody and report success.
    posts = [];
    failLocales = new Set();
    const ws = workspace(["en"]);
    const r = await run(ws, ["--only", "en", "--send"], { RESEND_SEGMENT_EN: "" });
    expect(r.status, r.output).toBe(0);
    expect(posts.find((p) => p.path === "/broadcasts")!.body.audience_id).toBe("aud_en");
    expect(r.output).toMatch(/\[RESEND_AUDIENCE_EN\]/);
  });

  it("prefers the canonical name when both are set", async () => {
    posts = [];
    failLocales = new Set();
    const ws = workspace(["en"]);
    await run(ws, ["--only", "en", "--send"], { RESEND_SEGMENT_EN: "seg_wins" });
    expect(posts.find((p) => p.path === "/broadcasts")!.body.audience_id).toBe("seg_wins");
  });

  it("REFUSES when two languages resolve to the same segment", async () => {
    // The misconfiguration that mails one person the same issue twice, in two
    // languages, every week. Both sends would succeed and the ledger keys on
    // destination, so nothing downstream would catch it.
    posts = [];
    failLocales = new Set();
    const ws = workspace(["en", "es"]);
    const r = await run(ws, ["--send"], { RESEND_SEGMENT_EN: "same_seg", RESEND_SEGMENT_ES: "same_seg" });

    expect(r.status).toBe(1);
    expect(r.output).toMatch(/SEGMENT COLLISION/);
    expect(r.output).toMatch(/RESEND_SEGMENT_EN/);
    expect(r.output).toMatch(/RESEND_SEGMENT_ES/);
    expect(posts.filter((p) => p.path === "/broadcasts"), "a broadcast went out despite the collision").toHaveLength(0);
  });

  it("allows distinct segments per language", async () => {
    posts = [];
    failLocales = new Set();
    const ws = workspace(["en", "es"]);
    const r = await run(ws, ["--send"], { RESEND_SEGMENT_EN: "seg_a", RESEND_SEGMENT_ES: "seg_b" });
    expect(r.status, r.output).toBe(0);
    expect(posts.filter((p) => p.path === "/broadcasts")).toHaveLength(2);
  });

  it("does not treat an unconfigured language as a collision", async () => {
    // Two languages with NO segment both resolve to nothing. That is a skip,
    // not a shared destination.
    posts = [];
    failLocales = new Set();
    const ws = workspace(["en", "es"]);
    const r = await run(ws, ["--send"], { RESEND_SEGMENT_ES: "", RESEND_AUDIENCE_ES: "" });
    expect(r.status, r.output).toBe(0);
    expect(r.output).not.toMatch(/SEGMENT COLLISION/);
  });

  it("REFUSES to send when the recipient count is UNKNOWN", async () => {
    // Broadcasting to an audience of unknown size is the one thing an operator
    // cannot undo or even assess afterwards.
    const probe = createServer((_req, res) => {
      res.writeHead(403, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ message: "forbidden" }));
    });
    await new Promise<void>((r) => probe.listen(0, "127.0.0.1", () => r()));
    const a = probe.address();
    const base = `http://127.0.0.1:${typeof a === "object" && a ? a.port : 0}`;

    const ws = workspace(["en"]);
    const r = await run(ws, ["--only", "en", "--send"], { RESEND_API_BASE: base });
    probe.close();

    expect(r.status).toBe(1);
    expect(r.output).toMatch(/recipient count is UNKNOWN/);
    expect(existsSync(ws.ledgerPath), "a ledger record was written for a send that never happened").toBe(false);
  });

  it("skips a language whose audience is missing rather than redirecting it", async () => {
    posts = [];
    failLocales = new Set();
    const ws = workspace(["en", "es"]);
    // Spanish audience unset. It must be SKIPPED, never folded into English.
    // Both names unset — the alias would otherwise still resolve it.
    const r = await run(ws, ["--send"], { RESEND_AUDIENCE_ES: "", RESEND_SEGMENT_ES: "" });
    expect(r.status, r.output).toBe(0);

    const created = posts.filter((p) => p.path === "/broadcasts");
    expect(created).toHaveLength(1);
    expect(String(created[0].body.subject)).toMatch(/changes/); // English
    expect(created[0].body.audience_id).toBe("aud_en");
    // Named by the CANONICAL variable, which is what an operator should set.
    expect(r.output).toMatch(/no RESEND_SEGMENT_ES — skipped/);
    // And the report says so rather than silently omitting Spanish.
    expect(r.output).toMatch(/Spanish:[\s\S]*Status: skipped/);
  });

  it("never substitutes one language's audience for another", async () => {
    posts = [];
    failLocales = new Set();
    const ws = workspace(["en", "es"]);
    await run(ws, ["--send"]);
    const created = posts.filter((p) => p.path === "/broadcasts");
    const byAudience = new Map(created.map((c) => [c.body.audience_id, String(c.body.subject)]));
    expect(byAudience.get("aud_en")).toMatch(/changes/);
    expect(byAudience.get("aud_es")).toMatch(/cambios/);
    expect(new Set(created.map((c) => c.body.audience_id)).size).toBe(created.length);
  });

  it("prints a post-send report naming every language and the totals", async () => {
    posts = [];
    failLocales = new Set();
    const ws = workspace(["en"]);
    const r = await run(ws, ["--only", "en", "--send"]);
    expect(r.output).toMatch(/IMMIGRATIONCLOCK NEWSLETTER/);
    expect(r.output).toMatch(/Edition: 2026-08-08/);
    expect(r.output).toMatch(/Status: SENT/);
    expect(r.output).toMatch(/English:/);
    expect(r.output).toMatch(/Broadcast ID: bc_en/);
    expect(r.output).toMatch(/Total recipients: 1/);
    expect(r.output).toMatch(/Failed: 0/);
  });

  it("never prints the API key in the report", async () => {
    posts = [];
    failLocales = new Set();
    const ws = workspace(["en"]);
    const r = await run(ws, ["--only", "en", "--send"]);
    expect(r.output).not.toContain("re_test");
  });

  it("excludes unsubscribed contacts from the count it shows", async () => {
    const probe = createServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          data: [
            { email: "a@example.com", unsubscribed: false },
            { email: "b@example.com", unsubscribed: true },
          ],
        })
      );
    });
    await new Promise<void>((r) => probe.listen(0, "127.0.0.1", r));
    const addr = probe.address();
    const base = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;

    const ws = workspace(["en"]);
    const r = await run(ws, ["--only", "en"], { RESEND_API_BASE: base });
    probe.close();
    expect(r.output).toMatch(/recipients\s*:\s*1 subscribed contact/);
  });
});
