import type { Platform } from "../types";

export interface PublishResult {
  ok: boolean;
  /**
   * True when the failure was authentication rather than anything about the
   * post. This is the flag that keeps X running while LinkedIn is locked out:
   * a credential problem on one platform must never be treated as a reason to
   * stop publishing on the other.
   */
  credentialProblem: boolean;
  /**
   * What KIND of failure this was, when it failed. `credits` is the one that
   * needs a human: X's pay-per-use API answered HTTP 402, and no retry helps
   * until the balance is topped up. `rate_limit` is transient.
   */
  code?: "credential" | "credits" | "rate_limit" | "other";
  error: string | null;
  externalId: string | null;
  externalUrl: string | null;
}

export interface Publisher {
  readonly platform: Platform;
  publish(text: string): Promise<PublishResult>;
}
