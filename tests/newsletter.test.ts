import { describe, it, expect } from "vitest";
import { newsletterState, canSubscribe, buttondownEndpoint } from "@/lib/newsletter";

// The rule under test: we ask for an email address only when a provider will
// actually receive it. The previous implementation rendered "✓ You're on the
// list." with nothing configured, silently discarding every signup.
describe("newsletter signup state", () => {
  it("is not-configured when no provider is set", () => {
    expect(newsletterState({})).toEqual({ kind: "not-configured" });
  });

  it("treats empty and whitespace-only config as not-configured", () => {
    expect(newsletterState({ buttondownUsername: "" }).kind).toBe("not-configured");
    expect(newsletterState({ customEndpoint: "   " }).kind).toBe("not-configured");
  });

  it("never reports a subscribable state without a provider", () => {
    expect(canSubscribe(newsletterState({}))).toBe(false);
    expect(canSubscribe(newsletterState({ buttondownUsername: "" }))).toBe(false);
  });

  it("opens with a Buttondown username", () => {
    const state = newsletterState({ buttondownUsername: "immigrationclock" });
    expect(canSubscribe(state)).toBe(true);
    expect(state).toMatchObject({
      kind: "open",
      endpoint: "https://buttondown.com/api/emails/embed-subscribe/immigrationclock",
    });
  });

  it("lets a custom endpoint override Buttondown", () => {
    const state = newsletterState({
      buttondownUsername: "immigrationclock",
      customEndpoint: "https://example.test/subscribe",
    });
    expect(state).toMatchObject({ kind: "open", endpoint: "https://example.test/subscribe" });
  });

  it("disables submission in dev mode even when a provider is configured", () => {
    const state = newsletterState({ buttondownUsername: "immigrationclock", mode: "dev" });
    expect(state.kind).toBe("dev-disabled");
    expect(canSubscribe(state)).toBe(false);
  });

  it("escapes the username when building the endpoint", () => {
    expect(buttondownEndpoint("a b/c")).toBe(
      "https://buttondown.com/api/emails/embed-subscribe/a%20b%2Fc"
    );
  });
});
