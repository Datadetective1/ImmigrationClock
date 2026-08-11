// =============================================================================
// LINKEDIN PUBLISHER — and the one place this system is not truly unattended
//
// LinkedIn access tokens expire on a fixed cycle (60 days for the standard
// member-authorized token), and programmatic refresh is gated behind an
// approved-partner product. Unless the account holds that access, LinkedIn
// publishing has a manual touchpoint roughly every two months and no
// architecture removes it.
//
// So the design does not pretend otherwise. It:
//   • detects a rejected or expired credential specifically (401/403, or
//     LinkedIn's REVOKED_ACCESS_TOKEN body),
//   • records SKIPPED_CREDENTIAL_EXPIRED for LinkedIn only,
//   • and leaves X completely unaffected.
//
// That last point is the requirement. X's OAuth 1.0a tokens do not expire, so X
// can genuinely run unattended, and it would be a poor trade to couple its
// reliability to a platform that cannot.
//
// UNVERIFIED AGAINST A LIVE ENDPOINT. Written from LinkedIn's documented Posts
// API shape; the first live post should be watched by a human.
// =============================================================================

import type { PublishResult, Publisher } from "./types";

const ENDPOINT = "https://api.linkedin.com/rest/posts";

/**
 * LinkedIn requires an explicit API version header in YYYYMM form and rejects
 * requests without one. It is pinned rather than computed: a version that
 * silently rolls forward every month is a scheduled outage waiting to happen.
 */
const LINKEDIN_VERSION = "202601";

export interface LinkedInCredentials {
  accessToken: string;
  /** urn:li:organization:12345 or urn:li:person:abc */
  authorUrn: string;
}

export function readLinkedInCredentials(
  env: Record<string, string | undefined> = process.env
): LinkedInCredentials | null {
  const accessToken = env.LINKEDIN_ACCESS_TOKEN;
  const authorUrn = env.LINKEDIN_AUTHOR_URN;
  if (!accessToken || !authorUrn) return null;
  return { accessToken, authorUrn };
}

/** LinkedIn escapes these in `commentary` — unescaped, the post is rejected. */
export function escapeCommentary(text: string): string {
  return text.replace(/([|{}@\[\]()<>#*_~\\])/g, "\\$1");
}

export class LinkedInPublisher implements Publisher {
  readonly platform = "linkedin" as const;

  constructor(private readonly creds: LinkedInCredentials) {}

  async publish(text: string): Promise<PublishResult> {
    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.creds.accessToken}`,
        "Content-Type": "application/json",
        "LinkedIn-Version": LINKEDIN_VERSION,
        "X-Restli-Protocol-Version": "2.0.0",
      },
      body: JSON.stringify({
        author: this.creds.authorUrn,
        commentary: escapeCommentary(text),
        visibility: "PUBLIC",
        distribution: {
          feedDistribution: "MAIN_FEED",
          targetEntities: [],
          thirdPartyDistributionChannels: [],
        },
        lifecycleState: "PUBLISHED",
        isReshareDisabledByAuthor: false,
      }),
      signal: AbortSignal.timeout(30_000),
    });

    const body = await response.text();

    // The two ways a token dies: an HTTP status, or a 200-shaped error naming
    // the revocation. Both must land on the same branch, or a revoked token
    // would be reported as a generic publish failure and nobody would know to
    // renew it.
    const revoked =
      response.status === 401 ||
      response.status === 403 ||
      /REVOKED_ACCESS_TOKEN|EXPIRED_ACCESS_TOKEN|INVALID_ACCESS_TOKEN/i.test(body);

    if (revoked) {
      return {
        ok: false,
        credentialProblem: true,
        error: `LinkedIn credential expired or was rejected (HTTP ${response.status}). Renew LINKEDIN_ACCESS_TOKEN.`,
        externalId: null,
        externalUrl: null,
      };
    }

    if (!response.ok) {
      return {
        ok: false,
        credentialProblem: false,
        error: `LinkedIn returned HTTP ${response.status}: ${body.replace(/\s+/g, " ").slice(0, 300)}`,
        externalId: null,
        externalUrl: null,
      };
    }

    const id = response.headers.get("x-restli-id") ?? response.headers.get("x-linkedin-id");

    return {
      ok: true,
      credentialProblem: false,
      error: null,
      externalId: id,
      externalUrl: id ? `https://www.linkedin.com/feed/update/${id}/` : null,
    };
  }
}
