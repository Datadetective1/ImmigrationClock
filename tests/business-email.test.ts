// =============================================================================
// BUSINESS EMAIL
//
// The one sender in this project whose recipient is typed by a person rather
// than read from a subscriber list. These tests are about what a caller CANNOT
// do: choose the From, choose the Reply-To, add a second recipient, smuggle a
// header through a field, or reach it from the website at all.
//
// Nothing here contacts Resend. The module is driven with a fake fetch, and the
// script is spawned against a local stub — the same arrangement as
// newsletter-send-ledger.test.ts.
// =============================================================================

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { spawn } from "node:child_process";
import { createServer, type Server } from "node:http";
import { mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  BUSINESS_FROM,
  BUSINESS_REPLY_TO,
  LIMITS,
  buildResendPayload,
  idempotencyKey,
  sendBusinessEmail,
  validateBusinessEmail,
  type BusinessEmail,
} from "@/lib/business-email";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const KEY = "re_test_SECRET_do_not_leak";

const good = { to: "partner@example.com", subject: "Re: Translation Affiliate?", text: "Hi,\n\nThanks.\n\nAmary" };

function valid(input: Record<string, unknown> = good): BusinessEmail {
  const r = validateBusinessEmail(input);
  if (!r.ok) throw new Error(r.errors.join("; "));
  return r.email;
}

function errorsOf(input: unknown): string[] {
  const r = validateBusinessEmail(input);
  return r.ok ? [] : r.errors;
}

// =============================================================================
// Fixed identity
// =============================================================================
describe("fixed From and Reply-To", () => {
  it("are the owner's hello@ address", () => {
    expect(BUSINESS_FROM).toBe("Amary | ImmigrationClock <hello@immigrationclock.com>");
    expect(BUSINESS_REPLY_TO).toBe("hello@immigrationclock.com");
  });

  it("are what Resend receives, with exactly one recipient", () => {
    const payload = buildResendPayload(valid());
    expect(payload).toEqual({
      from: BUSINESS_FROM,
      to: ["partner@example.com"],
      reply_to: BUSINESS_REPLY_TO,
      subject: "Re: Translation Affiliate?",
      text: "Hi,\n\nThanks.\n\nAmary",
    });
  });

  it.each(["from", "reply_to", "replyTo", "cc", "bcc", "headers", "html", "attachments"])(
    "refuses a caller-supplied %s rather than ignoring it",
    (field) => {
      expect(errorsOf({ ...good, [field]: "attacker@evil.example" }).join(" ")).toContain(`"${field}" cannot be set`);
    }
  );
});

// =============================================================================
// Recipient
// =============================================================================
describe("recipient", () => {
  it("accepts one plain address and trims it", () => {
    expect(valid({ ...good, to: "  matthew.pinckney@immitranslate.com " }).to).toBe("matthew.pinckney@immitranslate.com");
  });

  it("refuses an array, even of one", () => {
    expect(errorsOf({ ...good, to: ["a@example.com"] })).toContain("exactly one recipient is allowed");
    expect(errorsOf({ ...good, to: ["a@example.com", "b@example.com"] })).toContain("exactly one recipient is allowed");
  });

  it.each([
    ["missing", undefined],
    ["empty", ""],
    ["no at sign", "partner.example.com"],
    ["no TLD", "partner@example"],
    ["comma list", "a@example.com,b@example.com"],
    ["semicolon list", "a@example.com;b@example.com"],
    ["display name", "Partner <partner@example.com>"],
    ["space inside", "part ner@example.com"],
    ["CRLF header injection", "a@example.com\r\nBcc: victim@example.com"],
    ["LF header injection", "a@example.com\nCc: victim@example.com"],
    ["NUL", "a@example.com\u0000"],
    ["over 254 chars", `${"a".repeat(60)}@${"b".repeat(200)}.com`],
    ["local part over 64", `${"a".repeat(65)}@example.com`],
    ["number", 42],
  ])("refuses %s", (_label, to) => {
    expect(validateBusinessEmail({ ...good, to }).ok).toBe(false);
  });
});

// =============================================================================
// Subject
// =============================================================================
describe("subject", () => {
  it.each([
    ["missing", undefined],
    ["empty", ""],
    ["whitespace", "   "],
    ["CRLF injection", "Hello\r\nBcc: victim@example.com"],
    ["LF injection", "Hello\nX-Evil: 1"],
    ["Unicode line separator", `Hello${String.fromCharCode(0x2028)}Bcc: victim@example.com`],
    ["tab", "Hello\tthere"],
    ["over the limit", "x".repeat(LIMITS.subject + 1)],
  ])("refuses %s", (_label, subject) => {
    expect(validateBusinessEmail({ ...good, subject }).ok).toBe(false);
  });

  it("accepts the limit exactly", () => {
    expect(validateBusinessEmail({ ...good, subject: "x".repeat(LIMITS.subject) }).ok).toBe(true);
  });
});

// =============================================================================
// Body
// =============================================================================
describe("body", () => {
  it.each([
    ["missing", undefined],
    ["empty", ""],
    ["whitespace only", " \n\n\t "],
    ["NUL", "Hello\u0000"],
    ["escape sequence", "Hello\u001b[31m"],
    ["over the limit", "x".repeat(LIMITS.body + 1)],
  ])("refuses %s", (_label, text) => {
    expect(validateBusinessEmail({ ...good, text }).ok).toBe(false);
  });

  it("normalizes Windows line endings and a BOM instead of refusing them", () => {
    const bom = String.fromCharCode(0xfeff);
    expect(valid({ ...good, text: `${bom}Hi Matt,\r\n\r\nThanks.\r\n` }).text).toBe("Hi Matt,\n\nThanks.");
  });
});

// =============================================================================
// Threading
// =============================================================================
describe("In-Reply-To", () => {
  it("adds threading headers when given one Message-ID", () => {
    const payload = buildResendPayload(valid({ ...good, inReplyTo: "<CAF123@mail.gmail.com>" }));
    expect(payload.headers).toEqual({ "In-Reply-To": "<CAF123@mail.gmail.com>", References: "<CAF123@mail.gmail.com>" });
  });

  it("adds the angle brackets if they were left off", () => {
    expect(valid({ ...good, inReplyTo: "CAF123@mail.gmail.com" }).inReplyTo).toBe("<CAF123@mail.gmail.com>");
  });

  it("sends no headers at all without one", () => {
    expect(buildResendPayload(valid())).not.toHaveProperty("headers");
  });

  it.each([
    "<a@b>\r\nBcc: victim@example.com",
    "<a@b> <c@d>",
    "not a message id",
    "<@>",
    `<${"a".repeat(LIMITS.messageId)}@b>`,
  ])("refuses %j", (inReplyTo) => {
    expect(validateBusinessEmail({ ...good, inReplyTo }).ok).toBe(false);
  });
});

// =============================================================================
// Sending, with a fake fetch
// =============================================================================
describe("sendBusinessEmail", () => {
  type Call = { url: string; init: RequestInit };
  let calls: Call[];
  const fakeFetch = (status: number, body: unknown, raw = false) =>
    (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response(raw ? String(body) : JSON.stringify(body), { status });
    }) as unknown as typeof fetch;

  beforeEach(() => {
    calls = [];
  });

  it("posts the fixed payload once, with auth and an idempotency key", async () => {
    const email = valid();
    const r = await sendBusinessEmail(email, { apiKey: KEY, apiBase: "https://stub.test/", fetchImpl: fakeFetch(200, { id: "em_1" }) });
    expect(r).toEqual({ ok: true, id: "em_1" });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://stub.test/emails");
    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Bearer ${KEY}`);
    expect(headers["Idempotency-Key"]).toBe(idempotencyKey(email));
    expect(JSON.parse(String(calls[0].init.body))).toEqual(buildResendPayload(email));
  });

  it("does not call Resend without a key", async () => {
    const r = await sendBusinessEmail(valid(), { apiKey: "", fetchImpl: fakeFetch(200, {}) });
    expect(r.ok).toBe(false);
    expect(calls).toHaveLength(0);
  });

  it("re-validates, so an unchecked object cannot reach Resend", async () => {
    const smuggled = { ...good, to: "a@example.com\r\nBcc: victim@example.com" } as BusinessEmail;
    const withFrom = { ...good, from: "ceo@bank.example" } as unknown as BusinessEmail;
    for (const bad of [smuggled, withFrom]) {
      const r = await sendBusinessEmail(bad, { apiKey: KEY, fetchImpl: fakeFetch(200, {}) });
      expect(r.ok).toBe(false);
    }
    expect(calls).toHaveLength(0);
  });

  it("reports a Resend rejection by status and error name only", async () => {
    const r = await sendBusinessEmail(valid(), {
      apiKey: KEY,
      fetchImpl: fakeFetch(422, { name: "validation_error", message: `echo ${KEY} ${good.text}` }),
    });
    expect(r).toEqual({ ok: false, error: "Resend rejected the email (HTTP 422: validation_error)" });
  });

  it("survives a non-JSON error page", async () => {
    const r = await sendBusinessEmail(valid(), { apiKey: KEY, fetchImpl: fakeFetch(502, "<html>Bad gateway</html>", true) });
    expect(r).toEqual({ ok: false, error: "Resend rejected the email (HTTP 502)" });
  });

  it("does not repeat an unexpected error name", async () => {
    const r = await sendBusinessEmail(valid(), { apiKey: KEY, fetchImpl: fakeFetch(400, { name: `Bearer ${KEY}` }) });
    expect(r).toEqual({ ok: false, error: "Resend rejected the email (HTTP 400)" });
  });

  it("turns a network failure into a safe message instead of throwing", async () => {
    const throwing = (async () => {
      throw new Error(`connect ECONNREFUSED with ${KEY}`);
    }) as unknown as typeof fetch;
    const r = await sendBusinessEmail(valid(), { apiKey: KEY, fetchImpl: throwing });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toContain("could not reach Resend");
      expect(r.error).not.toContain(KEY);
    }
  });

  it("gives the same message the same idempotency key, and a changed one a new key", () => {
    expect(idempotencyKey(valid())).toBe(idempotencyKey(valid()));
    expect(idempotencyKey(valid())).not.toBe(idempotencyKey(valid({ ...good, text: "Different" })));
    expect(idempotencyKey(valid())).not.toContain("partner");
  });
});

// =============================================================================
// Not reachable from the website
// =============================================================================
describe("no web surface", () => {
  function walk(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const full = join(dir, name);
      return statSync(full).isDirectory() ? walk(full) : /\.(ts|tsx|js|jsx|mjs)$/.test(name) ? [full] : [];
    });
  }

  it("is imported by nothing that Next.js builds into a route or page", () => {
    const shipped = [join(ROOT, "src/app"), join(ROOT, "src/components")].flatMap(walk);
    const offenders = shipped.filter((f) => /business-email/.test(readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
  });

  it("is imported by no other module in src/lib either", () => {
    const lib = walk(join(ROOT, "src/lib")).filter((f) => !f.endsWith("business-email.ts"));
    expect(lib.filter((f) => /business-email/.test(readFileSync(f, "utf8")))).toEqual([]);
  });
});

// =============================================================================
// The script, spawned, against a stub Resend
// =============================================================================
describe("scripts/send-business-email.ts", () => {
  let server: Server;
  let apiBase = "";
  let requests: Array<{ path: string; headers: Record<string, unknown>; body: Record<string, unknown> }> = [];
  let reply: { status: number; body: unknown } = { status: 200, body: { id: "em_stub" } };
  let dir = "";
  let bodyFile = "";

  beforeAll(async () => {
    server = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on("data", (c: Buffer) => chunks.push(c));
      req.on("end", () => {
        const raw = Buffer.concat(chunks).toString("utf8");
        requests.push({ path: req.url ?? "", headers: req.headers, body: raw ? JSON.parse(raw) : {} });
        res.writeHead(reply.status, { "Content-Type": "application/json" });
        res.end(JSON.stringify(reply.body));
      });
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
    const addr = server.address();
    apiBase = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;

    dir = mkdtempSync(join(tmpdir(), "business-email-"));
    bodyFile = join(dir, "reply.txt");
    writeFileSync(bodyFile, "Hi Matt,\r\n\r\nThanks for following up.\r\n\r\nBest,\r\nAmary\r\n", "utf8");
  });

  afterAll(() => new Promise<void>((r) => server.close(() => r())));

  beforeEach(() => {
    requests = [];
    reply = { status: 200, body: { id: "em_stub" } };
  });

  function run(args: string[], env: Record<string, string> = {}) {
    return new Promise<{ status: number | null; output: string }>((done) => {
      // Spawned without a shell so a subject with spaces is one argument, and
      // with piped stdin so the script sees no terminal.
      const child = spawn(process.execPath, [join(ROOT, "node_modules/tsx/dist/cli.mjs"), "scripts/send-business-email.ts", ...args], {
        cwd: ROOT,
        env: { ...process.env, RESEND_API_BASE: apiBase, RESEND_API_KEY: KEY, ...env },
        stdio: ["pipe", "pipe", "pipe"],
      });
      child.stdin.end();
      let output = "";
      child.stdout.on("data", (c) => (output += c));
      child.stderr.on("data", (c) => (output += c));
      child.on("close", (status) => done({ status, output }));
    });
  }

  const base = () => ["--to", "partner@example.com", "--subject", "Re: Translation Affiliate?", "--body-file", bodyFile];

  it("dry-runs by default: shows the fixed headers and contacts no one", async () => {
    const r = await run(base());
    expect(r.status).toBe(0);
    expect(r.output).toContain(`From:        ${BUSINESS_FROM}`);
    expect(r.output).toContain(`Reply-To:    ${BUSINESS_REPLY_TO}`);
    expect(r.output).toContain("To:          partner@example.com");
    expect(r.output).toContain("Subject:     Re: Translation Affiliate?");
    expect(r.output).toContain("DRY RUN — nothing was sent");
    expect(requests).toHaveLength(0);
  }, 60_000);

  it("refuses to send when stdin cannot confirm, unless --yes is given", async () => {
    const r = await run([...base(), "--send"]);
    expect(r.status).toBe(2);
    expect(r.output).toContain("Nothing was sent");
    expect(requests).toHaveLength(0);
  }, 60_000);

  it("sends exactly one message with the fixed identity on --send --yes", async () => {
    const r = await run([...base(), "--send", "--yes"]);
    expect(r.status).toBe(0);
    expect(r.output).toContain("Email sent. (Resend id em_stub)");
    expect(requests).toHaveLength(1);
    expect(requests[0].path).toBe("/emails");
    expect(requests[0].headers["idempotency-key"]).toMatch(/^manual-email\/[0-9a-f]{48}$/);
    expect(requests[0].body).toEqual({
      from: BUSINESS_FROM,
      to: ["partner@example.com"],
      reply_to: BUSINESS_REPLY_TO,
      subject: "Re: Translation Affiliate?",
      text: "Hi Matt,\n\nThanks for following up.\n\nBest,\nAmary",
    });
    expect(r.output).not.toContain(KEY);
  }, 60_000);

  it.each([
    ["--from", "ceo@bank.example"],
    ["--reply-to", "attacker@evil.example"],
    ["--cc", "victim@example.com"],
    ["--bcc", "victim@example.com"],
  ])("refuses %s even with --send --yes", async (flag, value) => {
    const r = await run([...base(), flag, value, "--send", "--yes"]);
    expect(r.status).toBe(2);
    expect(requests).toHaveLength(0);
  }, 60_000);

  it("refuses a second --to", async () => {
    const r = await run([...base(), "--to", "victim@example.com", "--send", "--yes"]);
    expect(r.status).toBe(2);
    expect(requests).toHaveLength(0);
  }, 60_000);

  it("refuses an invalid recipient before anything else", async () => {
    const r = await run(["--to", "a@example.com,b@example.com", "--subject", "Hi", "--body-file", bodyFile, "--send", "--yes"]);
    expect(r.status).toBe(2);
    expect(r.output).toContain("recipient must be a single plain email address");
    expect(requests).toHaveLength(0);
  }, 60_000);

  it("refuses to send with no API key", async () => {
    const r = await run([...base(), "--send", "--yes"], { RESEND_API_KEY: "" });
    expect(r.status).toBe(1);
    expect(r.output).toContain("RESEND_API_KEY is not set");
    expect(requests).toHaveLength(0);
  }, 60_000);

  it("exits non-zero on a Resend error without printing the key", async () => {
    reply = { status: 403, body: { name: "invalid_from_address", message: "nope" } };
    const r = await run([...base(), "--send", "--yes"]);
    expect(r.status).toBe(1);
    expect(r.output).toContain("NOT SENT — Resend rejected the email (HTTP 403: invalid_from_address)");
    expect(r.output).not.toContain(KEY);
    expect(r.output).not.toContain("Email sent");
  }, 60_000);
});
