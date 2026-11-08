// =============================================================================
// PRO FEEDBACK: what a subscriber would value next, or what was missing
//
// Three quiet places ask, and none of them interrupts: a small link on the
// Briefing, one optional question on the account page beside "Manage billing"
// (and again once a cancellation has gone through), and a footer line in the
// alert email that says a reply reaches us. No pop-up, no survey, nothing
// required.
//
// Every answer is kept on the subscriber's own record (a "feedback" Pro
// document, erased with the rest by /api/pro/data) and mailed to ONE fixed
// inbox. The recipient is a constant, never something a caller supplies, so
// this cannot be used to send mail to anyone else. The subscriber's verified
// address goes in Reply-To, so answering them is one tap.
// =============================================================================

export const FEEDBACK_INBOX = "hello@immigrationclock.com";

export const FEEDBACK_SOURCES = ["briefing", "cancel"] as const;
export type FeedbackSource = (typeof FEEDBACK_SOURCES)[number];

/** How the inbox labels each place an answer came from. */
export const SOURCE_LABEL: Record<FeedbackSource, string> = {
  briefing: "Pro idea (Briefing)",
  cancel: "What was missing (cancel)",
};

export const MAX_MESSAGE = 2000;
export const MIN_MESSAGE = 2;
/** Entries kept on the subscriber's record; the inbox has the full history. */
export const MAX_KEPT = 20;
/** Answers one identity may send per day. Generous for a person, useless for a script. */
export const DAILY_MAX = 10;

export interface FeedbackEntry {
  /** Unix seconds. */
  at: number;
  source: FeedbackSource;
  message: string;
}

export function isFeedbackSource(value: unknown): value is FeedbackSource {
  return typeof value === "string" && (FEEDBACK_SOURCES as readonly string[]).includes(value);
}

// Control characters other than tab and newline. Built from code points so
// U+2028 and U+2029 are covered without typing them into the source.
const CONTROL = new RegExp(`[\\u0000-\\u0008\\u000b\\u000c\\u000e-\\u001f\\u007f-\\u009f${String.fromCharCode(0x2028, 0x2029)}]`, "g");

/** The message as it will be stored and sent, or null when there is nothing to send. */
export function cleanMessage(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value
    .replace(/\r\n?/g, "\n")
    .replace(CONTROL, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (text.length < MIN_MESSAGE) return null;
  return text.slice(0, MAX_MESSAGE);
}

export type FeedbackInput = { ok: true; source: FeedbackSource; message: string } | { ok: false; message: string };

export function parseFeedbackInput(body: unknown): FeedbackInput {
  if (!body || typeof body !== "object") return { ok: false, message: "Expected a JSON object." };
  const { source, message } = body as Record<string, unknown>;
  if (!isFeedbackSource(source)) return { ok: false, message: "Unknown place." };
  if (typeof message === "string" && message.length > MAX_MESSAGE * 2) {
    return { ok: false, message: `Please keep it under ${MAX_MESSAGE} characters.` };
  }
  const clean = cleanMessage(message);
  if (!clean) return { ok: false, message: "Write a few words first." };
  return { ok: true, source, message: clean };
}

export function parseFeedbackLog(raw: string | null): FeedbackEntry[] {
  if (!raw) return [];
  try {
    const list = JSON.parse(raw) as unknown;
    if (!Array.isArray(list)) return [];
    return list.filter(
      (e): e is FeedbackEntry =>
        Boolean(e) &&
        typeof e === "object" &&
        typeof (e as FeedbackEntry).at === "number" &&
        isFeedbackSource((e as FeedbackEntry).source) &&
        typeof (e as FeedbackEntry).message === "string"
    );
  } catch {
    return [];
  }
}

/** Newest first, capped. */
export function appendFeedback(raw: string | null, entry: FeedbackEntry): string {
  return JSON.stringify([entry, ...parseFeedbackLog(raw)].slice(0, MAX_KEPT));
}

export interface FeedbackEmail {
  to: string;
  replyTo: string;
  subject: string;
  text: string;
}

/** The note that lands in the inbox. Plain text: it is for us, not a newsletter. */
export function buildFeedbackEmail(input: {
  source: FeedbackSource;
  message: string;
  email: string;
  /** "pro", "trial", "cancelling" or "free", as the store says right now. */
  standing: string;
  at: number;
  testMode?: boolean;
}): FeedbackEmail {
  const firstLine = input.message.split("\n")[0].replace(/\s+/g, " ").trim();
  const gist = firstLine.length > 60 ? `${firstLine.slice(0, 57)}...` : firstLine;
  const when = new Date(input.at * 1000).toISOString().replace("T", " ").slice(0, 16);
  return {
    to: FEEDBACK_INBOX,
    replyTo: input.email,
    subject: `${input.testMode ? "[TEST] " : ""}${SOURCE_LABEL[input.source]}: ${gist}`,
    text: [
      input.message,
      "",
      "",
      `From: ${input.email}`,
      `Account: ${input.standing}`,
      `Asked on: ${SOURCE_LABEL[input.source]}`,
      `Sent: ${when} UTC`,
      "",
      "Reply to this email to answer them directly.",
    ].join("\n"),
  };
}

/** Send through Resend, as the alert and sign-in emails do. */
export async function sendFeedbackEmail(
  mail: FeedbackEmail,
  env: Record<string, string | undefined> = process.env,
  fetchImpl: typeof fetch = fetch
): Promise<{ ok: true } | { ok: false; detail: string }> {
  const key = env.RESEND_API_KEY;
  if (!key) return { ok: false, detail: "email is not configured" };
  const base = (env.RESEND_API_BASE || "https://api.resend.com").replace(/\/$/, "");
  const from = env.RESEND_FROM_EMAIL || "Immigration Clock <noreply@immigrationclock.com>";
  try {
    const res = await fetchImpl(`${base}/emails`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [mail.to], reply_to: mail.replyTo, subject: mail.subject, text: mail.text }),
      signal: AbortSignal.timeout(8_000),
      cache: "no-store",
    });
    return res.ok ? { ok: true } : { ok: false, detail: `Resend returned ${res.status}` };
  } catch (err) {
    return { ok: false, detail: err instanceof Error ? err.message : "send failed" };
  }
}
