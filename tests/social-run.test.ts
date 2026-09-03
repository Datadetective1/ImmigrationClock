// =============================================================================
// THE RUNNER AND THE PLATFORM ADAPTERS
//
// The requirement this file exists to protect: X and LinkedIn are independent
// all the way down. LinkedIn's access token expires on a cycle that no
// architecture removes, so a LinkedIn credential problem must cost LinkedIn its
// posts and cost X nothing. Several tests here assert exactly that.
//
// The rest pin the gate ordering, because the ordering is what keeps the system
// cheap: everything that can reject a slot without an API call runs first.
// =============================================================================

import { describe, it, expect } from "vitest";
import { runSlot, MAX_GENERATION_ATTEMPTS } from "@/lib/social/run";
import { SLOT_BY_ID } from "@/lib/social/slots";
import { EMPTY_POST_LEDGER, appendRecords, type PostLedger, type PostRecord } from "@/lib/social/ledger";
import { percentEncode, signatureBaseString, buildAuthorizationHeader, readXCredentials } from "@/lib/social/platforms/x";
import { escapeCommentary, readLinkedInCredentials } from "@/lib/social/platforms/linkedin";
import type { PublishResult, Publisher } from "@/lib/social/platforms/types";
import type { CopyEngine, CopyRequest, EngineResult } from "@/lib/social/types";
import type { IndexedEvent } from "@/lib/event-index";

const LINK = "https://immigrationclock.com/what-changed?q=public%20charge%20ground%20inadmissibility";

const EVENTS: IndexedEvent[] = [
  {
    id: "federal_register:x1",
    title: "Public Charge Ground of Inadmissibility",
    publishedAt: "2026-08-10",
    effectiveAt: "2026-09-18",
    scheduled: false,
    severity: "major",
    classification: "final_rule",
    sourceKey: "federal_register",
    sourceUrl: "https://www.federalregister.gov/documents/x1",
    summary:
      "DHS is amending the fee and eligibility requirements that apply to all benefit requests, changing filing requirements for every applicant and petitioner.",
    entityIds: ["agency:dhs", "topic:policy-changes"],
  },
];

/** Returns fixed, valid copy. Lets the runner's own logic be the thing tested. */
class StubEngine implements CopyEngine {
  readonly id = "stub";
  calls = 0;
  constructor(private readonly makeCopy: (req: CopyRequest) => { x: string; linkedin: string }) {}
  async generate(req: CopyRequest): Promise<EngineResult> {
    this.calls++;
    const copy = this.makeCopy(req);
    return {
      copy: { ...copy, deepLink: req.facts.deepLink },
      usage: { model: "stub", inputTokens: 100, outputTokens: 50, cachedInputTokens: 0, reasoningTokens: 0, totalTokens: null, costUsd: 0.001 },
    };
  }
}

class ThrowingEngine implements CopyEngine {
  readonly id = "throwing";
  calls = 0;
  async generate(): Promise<EngineResult> {
    this.calls++;
    throw new Error("network down");
  }
}

function goodCopy(req: CopyRequest) {
  const link = req.facts.deepLink;
  return {
    x: `DHS is amending eligibility and fee requirements for benefit requests. It takes effect on 18 September 2026. ${link}`,
    linkedin: [
      "DHS is amending the eligibility and fee requirements that apply to benefit requests.",
      "",
      "The change takes effect on 18 September 2026. Until that date, the existing requirements are the ones in force, which is the distinction most often lost when a rule is reported on the day it publishes.",
      "",
      "Who this reaches: applicants and petitioners filing benefit requests with the agency.",
      "",
      link,
    ].join("\n"),
  };
}

class StubPublisher implements Publisher {
  posts: string[] = [];
  constructor(
    readonly platform: "x" | "linkedin",
    private readonly result: PublishResult
  ) {}
  async publish(text: string): Promise<PublishResult> {
    this.posts.push(text);
    return this.result;
  }
}

const OK: PublishResult = { ok: true, credentialProblem: false, error: null, externalId: "1", externalUrl: "https://x.com/1" };
const EXPIRED: PublishResult = { ok: false, credentialProblem: true, error: "token expired", externalId: null, externalUrl: null };
const BROKEN: PublishResult = { ok: false, credentialProblem: false, error: "500", externalId: null, externalUrl: null };

const NOW = new Date("2026-08-10T14:05:00Z");
const morning = SLOT_BY_ID.get("morning")!;

const base = {
  slot: morning,
  events: EVENTS,
  now: NOW,
};

describe("dry run is the default posture", () => {
  it("validates everything and publishes nothing", async () => {
    const engine = new StubEngine(goodCopy);
    const x = new StubPublisher("x", OK);
    const r = await runSlot({
      ...base,
      ledger: EMPTY_POST_LEDGER,
      engine,
      publishers: { x },
      live: false,
    });

    expect(r.outcome.platforms.every((p) => p.decision === "DRY_RUN")).toBe(true);
    expect(x.posts).toHaveLength(0);
    expect(r.outcome.validator?.ok).toBe(true);
  });

  it("still writes a ledger row for every platform", async () => {
    const r = await runSlot({
      ...base,
      ledger: EMPTY_POST_LEDGER,
      engine: new StubEngine(goodCopy),
      publishers: {},
      live: false,
    });
    expect(r.records).toHaveLength(2);
  });
});

describe("platforms are independent", () => {
  it("an expired LinkedIn credential does not stop X", async () => {
    const x = new StubPublisher("x", OK);
    const linkedin = new StubPublisher("linkedin", EXPIRED);

    const r = await runSlot({
      ...base,
      ledger: EMPTY_POST_LEDGER,
      engine: new StubEngine(goodCopy),
      publishers: { x, linkedin },
      live: true,
    });

    const byPlatform = Object.fromEntries(r.outcome.platforms.map((p) => [p.platform, p.decision]));
    expect(byPlatform.x).toBe("POSTED");
    expect(byPlatform.linkedin).toBe("SKIPPED_CREDENTIAL_EXPIRED");
    expect(x.posts).toHaveLength(1);
  });

  it("a missing LinkedIn credential does not stop X", async () => {
    const x = new StubPublisher("x", OK);
    const r = await runSlot({
      ...base,
      ledger: EMPTY_POST_LEDGER,
      engine: new StubEngine(goodCopy),
      publishers: { x },
      live: true,
    });
    const byPlatform = Object.fromEntries(r.outcome.platforms.map((p) => [p.platform, p.decision]));
    expect(byPlatform.x).toBe("POSTED");
    expect(byPlatform.linkedin).toBe("SKIPPED_CREDENTIAL_EXPIRED");
  });

  it("distinguishes a credential problem from an ordinary publish failure", async () => {
    const x = new StubPublisher("x", BROKEN);
    const r = await runSlot({
      ...base,
      ledger: EMPTY_POST_LEDGER,
      engine: new StubEngine(goodCopy),
      publishers: { x },
      live: true,
    });
    expect(r.outcome.platforms.find((p) => p.platform === "x")?.decision).toBe("SKIPPED_PUBLISH_FAILED");
  });

  it("records the platform's own post id so a post can be traced back", async () => {
    const r = await runSlot({
      ...base,
      ledger: EMPTY_POST_LEDGER,
      engine: new StubEngine(goodCopy),
      publishers: { x: new StubPublisher("x", OK) },
      live: true,
    });
    expect(r.records.find((p) => p.platform === "x")?.externalId).toBe("1");
  });
});

describe("gates run before the engine, so a silent window is free", () => {
  it("makes no engine call when the archive is empty", async () => {
    // An empty archive is not an empty queue any more — the evergreen tier is
    // always there — but the morning may not draw on it, so the window is
    // silent by cadence rather than by an empty queue. Either way: no call.
    const engine = new StubEngine(goodCopy);
    const r = await runSlot({
      ...base,
      events: [],
      ledger: EMPTY_POST_LEDGER,
      engine,
      publishers: {},
      live: false,
    });
    expect(engine.calls).toBe(0);
    expect(["SKIPPED_NO_QUALIFYING_CONTENT", "SKIPPED_CADENCE"]).toContain(r.outcome.platforms[0].decision);
    expect(r.outcome.subjectId).toBeNull();
  });

  it("makes no engine call when the cadence policy says nothing may publish", async () => {
    // Three posts already today on X: the daily maximum. Selection never runs.
    const rows: PostRecord[] = [1, 2, 3].map((n) => ({
      category: "development",
      localDate: "2026-08-10",
      localTime: "06:05",
      runAtUtc: `2026-08-10T0${n}:00:00.000Z`,
      slot: "evening",
      pool: "news",
      readerValue: null,
      readerValueExplain: null,
      treatment: null,
      platform: "x",
      decision: "POSTED",
      reason: "Published",
      subjectId: `event:other-${n}`,
      subjectLabel: "Other",
      angle: "breaking_change",
      contentType: "breaking_change",
      tier: "news",
      score: 1,
      text: `prior ${n}`,
      deepLink: `/what-changed/other-${n}`,
      externalId: null,
      externalUrl: null,
      model: null,
      promptVersion: null,
      validatorVersion: null,
      factsHash: null,
      approvalId: null,
      approvedBy: null,
      topicKey: null,
      topicFamily: null,
      adjustedScore: null,
      rotationExplain: null,
      inputTokens: null,
      outputTokens: null,
      costUsd: null,
      attempts: null,
    }));
    const engine = new StubEngine(goodCopy);
    const r = await runSlot({
      ...base,
      ledger: appendRecords(EMPTY_POST_LEDGER, rows),
      engine,
      publishers: {},
      live: false,
      platforms: ["x"],
    });
    expect(engine.calls).toBe(0);
    expect(r.outcome.platforms[0].decision).toBe("SKIPPED_CADENCE");
    expect(r.outcome.platforms[0].reason).toMatch(/Daily maximum reached/);
    expect(r.outcome.cadenceExplain).toMatch(/Daily maximum/);
  });

  it("makes no engine call when every candidate is on cooldown", async () => {
    const prior: PostRecord = {
      category: null,
      localDate: "2026-08-10",
      localTime: "09:05",
      runAtUtc: "2026-08-10T13:00:00.000Z",
      slot: "morning",
      pool: "news",
      readerValue: null,
      readerValueExplain: null,
      treatment: null,
      platform: "x",
      decision: "POSTED",
      reason: "Published",
      subjectId: "event:federal_register:x1",
      subjectLabel: "Public Charge",
      angle: "breaking_change",
      score: 1,
      text: "prior",
      deepLink: LINK,
      externalId: null,
      externalUrl: null,
      model: null,
      promptVersion: null,
      validatorVersion: null,
      factsHash: null,
      approvalId: null,
      approvedBy: null,
      topicKey: null,
      topicFamily: null,
      adjustedScore: null,
      rotationExplain: null,
      inputTokens: null,
      outputTokens: null,
      costUsd: null,
      attempts: null,
    };
    const ledger: PostLedger = appendRecords(EMPTY_POST_LEDGER, [
      prior,
      { ...prior, platform: "linkedin" },
    ]);

    const engine = new StubEngine(goodCopy);
    const r = await runSlot({ ...base, ledger, engine, publishers: {}, live: false });
    expect(engine.calls).toBe(0);
    expect(["SKIPPED_DUPLICATE", "SKIPPED_COOLDOWN"]).toContain(r.outcome.platforms[0].decision);
  });
});

// -----------------------------------------------------------------------------
// ELIGIBILITY IS EVALUATED OVER THE PLATFORMS THIS RUN CAN PUBLISH TO
//
// The first design asked "is this subject available on ANY platform?", and
// LinkedIn — never configured, so with no history — always answered yes.
// Seventeen X windows were spent generating copy for a subject that was on
// cooldown on X and "available" only on a platform that could not post. A
// platform with no credential cannot make a subject eligible.
// -----------------------------------------------------------------------------

describe("a platform that cannot publish cannot make a subject eligible", () => {
  /**
   * Every treatment of the subject stood down on X by a recent validator
   * rejection — rows that the rotation memory ignores (it reads only POSTED),
   * so the per-platform eligibility check is the gate under test.
   */
  const standDownOnX = (): PostLedger => {
    const angles = ["breaking_change", "what_changed", "why_it_matters"] as const;
    const rows: PostRecord[] = angles.map((angle) => ({
      category: null,
      localDate: "2026-08-09",
      localTime: "09:05",
      runAtUtc: "2026-08-09T14:05:00.000Z",
      slot: "morning",
      pool: "news",
      readerValue: null,
      readerValueExplain: null,
      treatment: null,
      platform: "x",
      decision: "SKIPPED_VALIDATION_FAILED",
      reason: "rejected twice",
      subjectId: "event:federal_register:x1",
      subjectLabel: "Public Charge",
      angle,
      score: 1,
      text: null,
      deepLink: "/what-changed/public-charge-ground-of-inadmissibility-2qezk3",
      externalId: null,
      externalUrl: null,
      model: null,
      promptVersion: null,
      validatorVersion: null,
      factsHash: null,
      approvalId: null,
      approvedBy: null,
      topicKey: null,
      topicFamily: null,
      adjustedScore: null,
      rotationExplain: null,
      inputTokens: null,
      outputTokens: null,
      costUsd: null,
      attempts: null,
    }));
    return appendRecords(EMPTY_POST_LEDGER, rows);
  };

  it("LIVE with only an X publisher: a subject unavailable on X yields no post, not a LinkedIn ghost", async () => {
    const engine = new StubEngine(goodCopy);
    const x = new StubPublisher("x", OK);
    const r = await runSlot({ ...base, ledger: standDownOnX(), engine, publishers: { x }, live: true });

    expect(engine.calls).toBe(0);
    expect(x.posts).toHaveLength(0);
    expect(r.outcome.subjectId).toBeNull();
    expect(["SKIPPED_DUPLICATE", "SKIPPED_COOLDOWN"]).toContain(
      r.outcome.platforms.find((p) => p.platform === "x")!.decision
    );
    // Nothing "posted" or dry-ran on LinkedIn either — it was never a target.
    expect(r.outcome.platforms.every((p) => p.decision !== "POSTED" && p.decision !== "DRY_RUN")).toBe(true);
  });

  it("DRY RUN over X alone: likewise, and for free", async () => {
    const engine = new StubEngine(goodCopy);
    const r = await runSlot({ ...base, ledger: standDownOnX(), engine, publishers: {}, live: false, platforms: ["x"] });

    expect(engine.calls).toBe(0);
    expect(r.outcome.subjectId).toBeNull();
    expect(r.outcome.platforms.every((p) => p.decision !== "DRY_RUN")).toBe(true);
  });

  it("a dry run over BOTH platforms still exercises LinkedIn — which is why the simulator passes X alone", async () => {
    // The contrast that explains the `platforms` option: asked to evaluate
    // LinkedIn, a dry run evaluates LinkedIn, and LinkedIn's empty history
    // makes the subject eligible there. Production is X, so production
    // simulations pass ["x"].
    const engine = new StubEngine(goodCopy);
    const r = await runSlot({ ...base, ledger: standDownOnX(), engine, publishers: {}, live: false, platforms: ["x", "linkedin"] });

    expect(engine.calls).toBe(1);
    const byPlatform = Object.fromEntries(r.outcome.platforms.map((p) => [p.platform, p]));
    expect(byPlatform.linkedin.decision).toBe("DRY_RUN");
    expect(byPlatform.x.decision).toBe("SKIPPED_DUPLICATE");
    expect(byPlatform.x.reason).toMatch(/not available on x/);
  });

  it("LIVE with no publisher at all skips before selection, and calls nothing", async () => {
    const engine = new StubEngine(goodCopy);
    const r = await runSlot({ ...base, ledger: EMPTY_POST_LEDGER, engine, publishers: {}, live: true });
    expect(engine.calls).toBe(0);
    expect(r.outcome.platforms.every((p) => p.decision === "SKIPPED_CREDENTIAL_EXPIRED")).toBe(true);
    expect(r.outcome.poolSize).toBe(0);
  });
});

describe("generation failures end the slot rather than degrading it", () => {
  it("skips when the engine is unavailable, and does not fall back to a template", async () => {
    const engine = new ThrowingEngine();
    const r = await runSlot({
      ...base,
      ledger: EMPTY_POST_LEDGER,
      engine,
      publishers: {},
      live: false,
    });
    expect(r.outcome.platforms[0].decision).toBe("SKIPPED_ENGINE_UNAVAILABLE");
    expect(r.outcome.platforms.every((p) => p.text === null)).toBe(true);
  });

  it("repairs exactly once on a MECHANICAL validation failure, then stops", async () => {
    let attempt = 0;
    const engine = new StubEngine((req) => {
      attempt++;
      // Mechanically invalid and nothing else: it names its subject, states a
      // grounded fact and carries the effective date — it simply omits the link.
      // That distinction is the whole point of the repair path, so the fixture
      // has to fail for a repairable reason or it tests the wrong branch.
      return {
        x: "The public charge ground of inadmissibility is being amended, effective 18 September 2026.",
        linkedin:
          "The public charge ground of inadmissibility is being amended, effective 18 September 2026.\n\n" +
          "The rescission applies to benefit requests decided on or after that date, and the earlier framework stops applying.\n\n" +
          "The underlying document is recorded in full, with the source linked beside it, so the change can be read rather than taken on trust.",
      };
    });
    const r = await runSlot({
      ...base,
      ledger: EMPTY_POST_LEDGER,
      engine,
      publishers: {},
      live: false,
    });
    expect(engine.calls).toBe(MAX_GENERATION_ATTEMPTS);
    expect(r.outcome.platforms[0].decision).toBe("SKIPPED_VALIDATION_FAILED");
  });

  it("passes the validator's reasons AND the rejected text back on the repair", async () => {
    let secondRequest: CopyRequest | null = null;
    let n = 0;
    const engine = new StubEngine((req) => {
      n++;
      if (n === 2) secondRequest = req;
      return {
        x: "The public charge ground of inadmissibility is being amended, effective 18 September 2026.",
        linkedin:
          "The public charge ground of inadmissibility is being amended, effective 18 September 2026.\n\n" +
          "The rescission applies to benefit requests decided on or after that date, and the earlier framework stops applying.\n\n" +
          "The underlying document is recorded in full, with the source linked beside it, so the change can be read rather than taken on trust.",
      };
    });
    await runSlot({ ...base, ledger: EMPTY_POST_LEDGER, engine, publishers: {}, live: false });
    expect(secondRequest).not.toBeNull();
    const req = secondRequest as unknown as CopyRequest;
    expect(req.validatorFeedback?.length).toBeGreaterThan(0);
    // Without the rejected text a "repair" is a fresh post written in hope.
    expect(req.previousCopy?.x).toContain("public charge");
  });

  it("does NOT spend a second call on a SEMANTIC failure", async () => {
    // An ungrounded figure is not a container defect. Asking the model to re-say
    // it so that it passes is asking it to negotiate with the trust layer, and
    // the honest outcome is silence — one call, then stop.
    const engine = new StubEngine((req) => ({
      x: `The public charge rule reaches 47000 applicants a year. ${req.facts.deepLink}`,
      linkedin: `The public charge rule reaches 47000 applicants a year.\n\nThat figure appears nowhere in the source material, which is the point of this fixture.\n\nThe document itself is linked in full so the claim can be checked against it directly.\n\n${req.facts.deepLink}`,
    }));
    const r = await runSlot({ ...base, ledger: EMPTY_POST_LEDGER, engine, publishers: {}, live: false });
    expect(engine.calls).toBe(1);
    expect(r.outcome.platforms[0].decision).toBe("SKIPPED_VALIDATION_FAILED");
    expect(r.outcome.platforms[0].reason).toMatch(/not repairable/i);
  });
});

describe("provenance is recorded", () => {
  it("stamps model, prompt version, validator version and a facts hash", async () => {
    const r = await runSlot({
      ...base,
      ledger: EMPTY_POST_LEDGER,
      engine: new StubEngine(goodCopy),
      publishers: {},
      live: false,
    });
    const rec = r.records[0];
    expect(rec.model).toBe("stub");
    expect(rec.promptVersion).toBeTruthy();
    expect(rec.validatorVersion).toBeTruthy();
    expect(rec.factsHash).toMatch(/^[0-9a-f]{16}$/);
  });
});

// -----------------------------------------------------------------------------
// PLATFORM ADAPTERS
// -----------------------------------------------------------------------------

describe("X OAuth 1.0a signing", () => {
  it("percent-encodes the characters OAuth requires and encodeURIComponent skips", () => {
    expect(percentEncode("a!b*c'd(e)")).toBe("a%21b%2Ac%27d%28e%29");
  });

  it("builds an RFC 5849 signature base string", () => {
    const base = signatureBaseString("post", "https://api.x.com/2/tweets", { b: "2", a: "1" });
    expect(base).toBe("POST&https%3A%2F%2Fapi.x.com%2F2%2Ftweets&a%3D1%26b%3D2");
  });

  it("sorts parameters, as the spec requires", () => {
    const withA = signatureBaseString("POST", "https://e.com", { z: "1", a: "2" });
    const withB = signatureBaseString("POST", "https://e.com", { a: "2", z: "1" });
    expect(withA).toBe(withB);
  });

  it("produces a deterministic header for a fixed nonce and timestamp", () => {
    const creds = { apiKey: "ck", apiSecret: "cs", accessToken: "at", accessTokenSecret: "ats" };
    const a = buildAuthorizationHeader(creds, "POST", "https://api.x.com/2/tweets", "nonce1", "1700000000");
    const b = buildAuthorizationHeader(creds, "POST", "https://api.x.com/2/tweets", "nonce1", "1700000000");
    expect(a).toBe(b);
    expect(a.startsWith("OAuth ")).toBe(true);
    expect(a).toContain('oauth_signature_method="HMAC-SHA1"');
  });

  it("changes the signature when the nonce changes", () => {
    const creds = { apiKey: "ck", apiSecret: "cs", accessToken: "at", accessTokenSecret: "ats" };
    const a = buildAuthorizationHeader(creds, "POST", "https://api.x.com/2/tweets", "n1", "1700000000");
    const b = buildAuthorizationHeader(creds, "POST", "https://api.x.com/2/tweets", "n2", "1700000000");
    expect(a).not.toBe(b);
  });

  it("never leaks a secret into the header value", () => {
    const creds = { apiKey: "ck", apiSecret: "SECRET_CS", accessToken: "at", accessTokenSecret: "SECRET_ATS" };
    const header = buildAuthorizationHeader(creds, "POST", "https://api.x.com/2/tweets", "n", "1");
    expect(header).not.toContain("SECRET_CS");
    expect(header).not.toContain("SECRET_ATS");
  });

  it("reads credentials only when all four are present", () => {
    expect(readXCredentials({ X_API_KEY: "a" })).toBeNull();
    expect(
      readXCredentials({
        X_API_KEY: "a",
        X_API_SECRET: "b",
        X_ACCESS_TOKEN: "c",
        X_ACCESS_TOKEN_SECRET: "d",
      })
    ).not.toBeNull();
  });
});

describe("LinkedIn adapter", () => {
  it("escapes the characters LinkedIn rejects in commentary", () => {
    expect(escapeCommentary("a (b) [c] {d} #e")).toBe("a \\(b\\) \\[c\\] \\{d\\} \\#e");
  });

  it("reads credentials only when both are present", () => {
    expect(readLinkedInCredentials({ LINKEDIN_ACCESS_TOKEN: "t" })).toBeNull();
    expect(
      readLinkedInCredentials({
        LINKEDIN_ACCESS_TOKEN: "t",
        LINKEDIN_AUTHOR_URN: "urn:li:organization:1",
      })
    ).not.toBeNull();
  });
});
