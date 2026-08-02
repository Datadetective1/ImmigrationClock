// =============================================================================
// NEWSLETTER SIGNUP STATE — pure decision logic, extracted so it is testable.
//
// The rule this module exists to enforce: we ask for an email address only when
// a provider will actually receive it. Any other configuration must resolve to a
// state that shows no email field and makes no subscription claim.
// =============================================================================

export type NewsletterState =
  /** A provider is configured and submissions are live. Render the form. */
  | { kind: "open"; endpoint: string }
  /** Explicitly disabled for local/preview builds. Render an honest notice. */
  | { kind: "dev-disabled" }
  /** No provider configured. Render an honest notice — never an email field. */
  | { kind: "not-configured" };

export interface NewsletterEnv {
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
 * Precedence: an explicit custom endpoint wins over the Buttondown username, so
 * a different provider can be swapped in without touching component code. Dev
 * mode overrides both — a misconfigured preview must never write to the live
 * audience, even when a provider is present.
 */
export function newsletterState(env: NewsletterEnv): NewsletterState {
  if (env.mode === "dev") return { kind: "dev-disabled" };

  const custom = env.customEndpoint?.trim();
  if (custom) return { kind: "open", endpoint: custom };

  const username = env.buttondownUsername?.trim();
  if (username) return { kind: "open", endpoint: buttondownEndpoint(username) };

  return { kind: "not-configured" };
}

/** True only when submitting will reach a real provider. */
export function canSubscribe(state: NewsletterState): state is { kind: "open"; endpoint: string } {
  return state.kind === "open";
}
