#!/usr/bin/env tsx
/**
 * BUSINESS EMAIL — send one human-written email from hello@immigrationclock.com.
 *
 *   From:     Amary | ImmigrationClock <hello@immigrationclock.com>   (fixed)
 *   Reply-To: hello@immigrationclock.com                              (fixed)
 *
 * Replies arrive at hello@, which Cloudflare Email Routing forwards to the
 * owner's inbox as before. Nothing about inbound mail changes.
 *
 * Owner-only by construction: this runs on the owner's machine with the owner's
 * RESEND_API_KEY, and nothing on the website can invoke it. See
 * src/lib/business-email.ts for why it is not a web endpoint.
 *
 * DRY RUN BY DEFAULT. Without --send it prints exactly what would go out and
 * contacts no one. With --send it asks you to type "send" before delivering.
 *
 * Usage:
 *   npm run email:send -- --to someone@example.com --subject "Re: Hello" --body-file outbox/reply.txt
 *   npm run email:send -- ...same... --send
 *
 * Options:
 *   --to <address>         exactly one recipient
 *   --subject <text>       one line
 *   --body-file <path>     plain-text body (keeps correspondence out of shell history)
 *   --in-reply-to <id>     optional Message-ID of the email you are answering, for threading
 *   --send                 actually send, after a typed confirmation
 *   --yes                  skip the typed confirmation (required when stdin is not a terminal)
 *
 * RESEND_API_KEY is read from the environment, or from .env.local if present.
 * Drafts belong in outbox/, which is gitignored: this repository is public.
 */

import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";
import {
  BUSINESS_FROM,
  BUSINESS_REPLY_TO,
  LIMITS,
  sendBusinessEmail,
  validateBusinessEmail,
} from "../src/lib/business-email";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

// Values that take an argument. Anything not listed here — --from, --reply-to,
// --cc, --bcc, a typo — is an error rather than something silently ignored.
const VALUE_FLAGS = new Set(["--to", "--subject", "--body-file", "--in-reply-to"]);
const BOOLEAN_FLAGS = new Set(["--send", "--yes"]);

function fail(message: string, code = 2): never {
  console.error(`[email] ${message}`);
  process.exit(code);
}

function parseArgs(argv: string[]): { values: Map<string, string>; flags: Set<string> } {
  const values = new Map<string, string>();
  const flags = new Set<string>();
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (BOOLEAN_FLAGS.has(arg)) flags.add(arg);
    else if (VALUE_FLAGS.has(arg)) {
      const value = argv[i + 1];
      if (value === undefined || VALUE_FLAGS.has(value) || BOOLEAN_FLAGS.has(value)) fail(`${arg} needs a value`);
      if (values.has(arg)) fail(`${arg} was given more than once; one recipient, one message`);
      values.set(arg, value);
      i++;
    } else if (arg === "--from" || arg === "--reply-to") {
      fail(`${arg} cannot be set. From is always "${BUSINESS_FROM}" and Reply-To is always ${BUSINESS_REPLY_TO}.`);
    } else fail(`unknown argument: ${arg}`);
  }
  return { values, flags };
}

function readBody(path: string): string {
  const full = resolve(process.cwd(), path);
  if (!existsSync(full) || !statSync(full).isFile()) fail(`body file not found: ${path}`);
  // Size check before reading the whole thing, with headroom for multi-byte text.
  if (statSync(full).size > LIMITS.body * 4) fail(`body file is too large (limit ${LIMITS.body} characters)`);
  return readFileSync(full, "utf8");
}

async function confirm(to: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await rl.question(`\nType "send" to deliver this email to ${to}: `);
    return answer.trim().toLowerCase() === "send";
  } finally {
    rl.close();
  }
}

async function main(): Promise<void> {
  const { values, flags } = parseArgs(process.argv.slice(2));
  const live = flags.has("--send");

  const bodyPath = values.get("--body-file");
  if (!bodyPath) fail("--body-file is required");

  const checked = validateBusinessEmail({
    to: values.get("--to"),
    subject: values.get("--subject"),
    text: readBody(bodyPath),
    ...(values.has("--in-reply-to") ? { inReplyTo: values.get("--in-reply-to") } : {}),
  });
  if (!checked.ok) fail(`not sent:\n  - ${checked.errors.join("\n  - ")}`);
  const email = checked.email;

  const rule = "─".repeat(64);
  console.log(rule);
  console.log(`From:        ${BUSINESS_FROM}`);
  console.log(`Reply-To:    ${BUSINESS_REPLY_TO}`);
  console.log(`To:          ${email.to}`);
  console.log(`Subject:     ${email.subject}`);
  if (email.inReplyTo) console.log(`In-Reply-To: ${email.inReplyTo}`);
  console.log(rule);
  console.log(email.text);
  console.log(rule);

  if (!live) {
    console.log("DRY RUN — nothing was sent. Add --send to deliver it.");
    return;
  }

  // Loaded only for a live send, and never over a variable already set.
  const envFile = resolve(ROOT, ".env.local");
  if (!process.env.RESEND_API_KEY && existsSync(envFile) && typeof process.loadEnvFile === "function") {
    process.loadEnvFile(envFile);
  }
  const apiKey = process.env.RESEND_API_KEY ?? "";
  if (!apiKey) fail("RESEND_API_KEY is not set (environment or .env.local). Nothing was sent.", 1);

  if (!flags.has("--yes")) {
    if (!process.stdin.isTTY) fail("stdin is not a terminal, so the send cannot be confirmed. Pass --yes to confirm. Nothing was sent.");
    if (!(await confirm(email.to))) {
      console.log("Cancelled. Nothing was sent.");
      return;
    }
  }

  const result = await sendBusinessEmail(email, { apiKey, apiBase: process.env.RESEND_API_BASE });
  if (!result.ok) fail(`NOT SENT — ${result.error}`, 1);
  console.log(`Email sent.${result.id ? ` (Resend id ${result.id})` : ""}`);
}

main().catch(() => fail("unexpected error; nothing was confirmed as sent", 1));
