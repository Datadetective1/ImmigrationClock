// Sending through the site's existing Resend account (RESEND_API_KEY), from
// the same verified sender as the newsletter and Pro mail. Plain fetch, as in
// src/app/api/subscribe/route.ts, so no new dependency.

import type { BuiltEmail } from "./email";

const RESEND_API = process.env.RESEND_API_BASE || "https://api.resend.com";

export const ALERTS_FROM = process.env.RESEND_FROM_EMAIL || "Immigration Clock <noreply@immigrationclock.com>";

export type SendResult = { ok: true; id?: string } | { ok: false; status: number; detail: string };

export async function sendAlertMail(input: {
  apiKey: string;
  to: string;
  mail: BuiltEmail;
  replyTo?: string;
  headers?: Record<string, string>;
  idempotencyKey?: string;
  fetchImpl?: typeof fetch;
}): Promise<SendResult> {
  const f = input.fetchImpl ?? fetch;
  const res = await f(`${RESEND_API}/emails`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      "Content-Type": "application/json",
      ...(input.idempotencyKey ? { "Idempotency-Key": input.idempotencyKey } : {}),
    },
    body: JSON.stringify({
      from: ALERTS_FROM,
      to: [input.to],
      ...(input.replyTo ? { reply_to: input.replyTo } : {}),
      subject: input.mail.subject,
      html: input.mail.html,
      text: input.mail.text,
      ...(input.headers ? { headers: input.headers } : {}),
    }),
    signal: AbortSignal.timeout(10_000),
    cache: "no-store",
  });
  if (res.ok) {
    const body = (await res.json().catch(() => ({}))) as { id?: string };
    return { ok: true, id: body.id };
  }
  return { ok: false, status: res.status, detail: (await res.text().catch(() => "")).slice(0, 300) };
}
