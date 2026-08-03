// =============================================================================
// NEWSLETTER SIGNUP STATE — pure decision logic, extracted so it is testable.
//
// The rule this module exists to enforce: we ask for an email address only when
// a provider will actually receive it. Any other configuration must resolve to a
// state that shows no email field and makes no subscription claim.
//
// That rule predates this file's current shape. An earlier version of the signup
// rendered "✓ You're on the list" with no provider configured, discarding every
// address typed into it (docs/data-corrections.md). Everything here exists so
// that cannot recur by configuration alone.
// =============================================================================

export type NewsletterState =
  /**
   * Our own /api/subscribe route, backed by Resend. Resolved from SERVER-side
   * env, so the decision is made where the credentials actually live rather than
   * mirrored into a NEXT_PUBLIC_ flag that can drift out of sync with them.
   */
  | { kind: "open"; provider: "self" }
  /** A third-party endpoint that accepts a native cross-origin form POST. */
  | { kind: "open"; provider: "external"; endpoint: string }
  /** Explicitly disabled for local/preview builds. Render an honest notice. */
  | { kind: "dev-disabled" }
  /** No provider configured. Render an honest notice — never an email field. */
  | { kind: "not-configured" };

export interface NewsletterEnv {
  /** Set when RESEND_API_KEY is present. That is the only requirement. */
  resendConfigured?: boolean;
  buttondownUsername?: string;
  customEndpoint?: string;
  mode?: string;
}

export function buttondownEndpoint(username: string): string {
  return `https://buttondown.com/api/emails/embed-subscribe/${encodeURIComponent(username)}`;
}

/**
 * Resolve the signup state from environment configuration.
 *
 * Precedence, highest first:
 *   1. dev mode — a misconfigured preview must never write to the live audience,
 *      even when a provider is present.
 *   2. an explicit custom endpoint — lets a provider be swapped without code.
 *   3. Buttondown.
 *   4. our own Resend-backed route.
 *
 * Resend sits LAST deliberately. It is the default rather than an override: if
 * someone has gone to the trouble of naming an explicit endpoint, that is a more
 * specific instruction than "the app is configured", and silently ignoring it
 * would send addresses somewhere the operator did not intend.
 */
export function newsletterState(env: NewsletterEnv): NewsletterState {
  if (env.mode === "dev") return { kind: "dev-disabled" };

  const custom = env.customEndpoint?.trim();
  if (custom) return { kind: "open", provider: "external", endpoint: custom };

  const username = env.buttondownUsername?.trim();
  if (username) return { kind: "open", provider: "external", endpoint: buttondownEndpoint(username) };

  if (env.resendConfigured) return { kind: "open", provider: "self" };

  return { kind: "not-configured" };
}

/** True only when submitting will reach a real provider. */
export function canSubscribe(
  state: NewsletterState
): state is Extract<NewsletterState, { kind: "open" }> {
  return state.kind === "open";
}

/**
 * Is this address plausibly deliverable?
 *
 * Deliberately permissive about the local part and strict about structure. Email
 * validation by regex cannot prove deliverability and the elaborate patterns that
 * try to are famous for rejecting valid addresses — so this rejects only what is
 * definitely wrong (no @, no dot in the domain, whitespace, an over-long value)
 * and leaves the real verdict to the provider.
 *
 * Shared by the client and the API route so a reader never sees the field accept
 * something the server then rejects.
 */
export function isPlausibleEmail(value: string): boolean {
  const email = value.trim();
  if (email.length < 6 || email.length > 254) return false;
  if (/\s/.test(email)) return false;
  const at = email.lastIndexOf("@");
  if (at < 1 || at === email.length - 1) return false;
  const domain = email.slice(at + 1);
  if (!domain.includes(".") || domain.startsWith(".") || domain.endsWith(".")) return false;
  if (domain.includes("..")) return false;
  return true;
}
