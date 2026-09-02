// =============================================================================
// APPROVAL ENVELOPES — publish the exact copy a human read, or publish nothing
//
// The normal path generates copy and publishes it in the same process, which is
// right for an unattended system and wrong for a controlled first live post: the
// copy a human approves in a dry run is not the copy that ships, because the
// live command calls the model again.
//
// This file adds one narrow alternative path:
//
//     propose  →  inspect  →  approve  →  publish that exact text
//
// and the publish step makes NO model call at all. `runApproved()` in run.ts
// does not accept a CopyEngine, so an approved publication cannot generate.
//
// WHAT THIS IS NOT
// ----------------
// Not a CMS, not an editing surface, not a queue. There is no way to change a
// word here: the envelope is produced by the pipeline, read by a human, marked
// approved, and then either published verbatim or refused. Editing is not a
// supported operation — it is precisely the operation the digest exists to
// detect.
//
// THE DIGEST, AND WHAT IT HONESTLY GUARANTEES
// -------------------------------------------
// `contentDigest` is a SHA-256 over the fields the publisher will act on. The
// approve step requires the operator to pass back the digest they were shown, so
// approval is bound to a specific reading of a specific file. Publication then
// requires the recomputed digest to equal the one recorded at approval.
//
// This is TAMPER EVIDENCE, not authentication. Someone who can write the file
// can also recompute the digest — there is no secret here. What it rules out is
// the realistic failure: an edit, a partial write, a stale file, a copy-paste of
// the wrong envelope, or a regeneration silently replacing what was read. What
// it does not rule out is a deliberate forgery by someone with write access to
// the repository, and no file-based scheme without a key can.
//
// THE STORED FACT SET IS FOR READING, NOT FOR DECIDING
// ----------------------------------------------------
// The envelope carries the full fact set so a reviewer can check every figure
// against its source. It is never used at publication time: the publisher
// recomputes the fact set from today's data, requires the hash to match, and
// re-validates the copy against the RECOMPUTED facts. An envelope whose stored
// facts were edited therefore changes nothing, and one whose underlying data has
// moved since generation is refused rather than published with stale numbers.
// =============================================================================

import { createHash, randomUUID } from "node:crypto";
import type { IndexedEvent } from "@/lib/event-index";
import { candidatesFor } from "./select";
import { checkSubject, checkWording } from "./dedupe";
import { isPublishableDestination } from "./links";
import { validatePost, VALIDATOR_VERSION } from "./validate";
import { SLOT_BY_ID, chicagoParts } from "./slots";
import { publishedPosts, type PostLedger } from "./ledger";
import type {
  Angle,
  Candidate,
  EngineUsage,
  FactSet,
  GeneratedCopy,
  Platform,
  PoolId,
  SlotId,
  ValidationResult,
} from "./types";
import type { ContentType } from "./content-types";

/** Bump only for a breaking envelope shape change. Mismatches fail closed. */
export const APPROVAL_VERSION = "social-approval/1" as const;

/**
 * How long an approval stays publishable.
 *
 * Short because the copy states figures with periods in them — "so far in
 * fiscal year 2026, through June" — and a sentence like that decays. Twenty-four
 * hours is long enough for a human to read carefully and short enough that
 * nothing published from an envelope is describing last week's data.
 */
export const MAX_APPROVAL_AGE_HOURS = 24;

export interface ApprovalMark {
  approvedAtUtc: string;
  /** Who approved it. Required, and recorded in the ledger row. */
  approvedBy: string;
  /** Platforms the operator approved. May be a subset of what validated. */
  platforms: Platform[];
  /** The digest the operator confirmed they had read. */
  approvedDigest: string;
  note: string;
}

export interface ApprovalEnvelope {
  version: typeof APPROVAL_VERSION;
  /** Ties the published ledger row back to this file. */
  id: string;
  generatedAtUtc: string;
  /** The Chicago day and slot the copy was written for. */
  localDate: string;
  slot: SlotId;
  pool: PoolId;

  subjectId: string;
  subjectLabel: string;
  angle: Angle;
  /** What kind of post this is. Absent on envelopes written before content types existed. */
  contentType?: ContentType;
  score: number;
  scoreExplain: string;
  deepLink: string;

  /** Exactly what would be published. Byte for byte or not at all. */
  copy: GeneratedCopy;

  /** For human inspection only — see the header. Never read by the publisher. */
  facts: FactSet;
  /** What the publisher checks the recomputed fact set against. */
  factsHash: string;

  model: string;
  promptVersion: string;
  validatorVersion: string;
  usage: EngineUsage;
  /** What the validator said at generation time. Re-run before publishing. */
  validationAtGeneration: Record<Platform, ValidationResult>;

  /** Null until a human runs the approve step. */
  approval: ApprovalMark | null;

  /** SHA-256 over the fields below the publisher acts on. */
  contentDigest: string;
}

// -----------------------------------------------------------------------------
// THE DIGEST
// -----------------------------------------------------------------------------

/**
 * The canonical bytes the digest covers.
 *
 * Written as an explicit key list rather than a spread or a sort, for two
 * reasons: JSON key order is then fixed by this function instead of by object
 * construction order, and a field added to the envelope later cannot silently
 * join or leave the digest without someone editing this list.
 */
function contentBlock(e: Omit<ApprovalEnvelope, "contentDigest" | "approval">): string {
  return JSON.stringify([
    e.version,
    e.id,
    e.generatedAtUtc,
    e.localDate,
    e.slot,
    e.pool,
    e.subjectId,
    e.angle,
    e.contentType ?? null,
    e.deepLink,
    e.factsHash,
    e.validatorVersion,
    e.copy.x,
    e.copy.linkedin,
    e.copy.deepLink,
    e.copy.structure ?? null,
  ]);
}

export function contentDigest(e: Omit<ApprovalEnvelope, "contentDigest" | "approval">): string {
  return createHash("sha256").update(contentBlock(e)).digest("hex");
}

/** Recompute from a parsed envelope, ignoring whatever digest it claims. */
export function recomputeDigest(e: ApprovalEnvelope): string {
  return contentDigest(e);
}

// -----------------------------------------------------------------------------
// BUILD AND PARSE
// -----------------------------------------------------------------------------

export interface BuildApprovalInput {
  candidate: Candidate;
  angle: Angle;
  slot: SlotId;
  copy: GeneratedCopy;
  facts: FactSet;
  factsHash: string;
  usage: EngineUsage;
  validation: Record<Platform, ValidationResult>;
  promptVersion: string;
  now: Date;
  /** Overridable so tests are deterministic. */
  id?: string;
}

export function buildApproval(input: BuildApprovalInput): ApprovalEnvelope {
  const parts = chicagoParts(input.now);
  const base = {
    version: APPROVAL_VERSION,
    id: input.id ?? randomUUID(),
    generatedAtUtc: input.now.toISOString(),
    localDate: parts.date,
    slot: input.slot,
    pool: input.candidate.pool,
    subjectId: input.candidate.subjectId,
    subjectLabel: input.candidate.label,
    angle: input.angle,
    contentType: input.candidate.contentType,
    score: input.candidate.score,
    scoreExplain: input.candidate.scoreExplain,
    deepLink: input.candidate.deepLink,
    copy: input.copy,
    facts: input.facts,
    factsHash: input.factsHash,
    model: input.usage.model,
    promptVersion: input.promptVersion,
    validatorVersion: VALIDATOR_VERSION,
    usage: input.usage,
    validationAtGeneration: input.validation,
  } satisfies Omit<ApprovalEnvelope, "contentDigest" | "approval">;

  return { ...base, approval: null, contentDigest: contentDigest(base) };
}

export function serializeApproval(e: ApprovalEnvelope): string {
  return `${JSON.stringify(e, null, 2)}\n`;
}

/**
 * Parse, refusing anything that is not recognisably an envelope of this version.
 *
 * Returns null rather than throwing or partially accepting: every caller treats
 * null as "do not publish", which is the only safe reading of a file we cannot
 * fully understand.
 */
export function parseApproval(raw: string): ApprovalEnvelope | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  const e = parsed as Partial<ApprovalEnvelope>;
  if (e?.version !== APPROVAL_VERSION) return null;
  if (typeof e.id !== "string" || e.id === "") return null;
  if (typeof e.contentDigest !== "string") return null;
  if (typeof e.subjectId !== "string" || typeof e.angle !== "string") return null;
  if (typeof e.factsHash !== "string") return null;
  if (!e.copy || typeof e.copy.x !== "string" || typeof e.copy.linkedin !== "string") return null;
  if (!SLOT_BY_ID.has(e.slot as SlotId)) return null;
  return e as ApprovalEnvelope;
}

/**
 * Attach the human's decision and re-seal.
 *
 * `confirmedDigest` is the digest the operator was shown when they inspected the
 * file. Requiring them to pass it back is what binds the approval to a specific
 * reading: if the file changed between the inspect step and this one, the digest
 * they hold is stale and approval fails.
 */
export function approveEnvelope(
  e: ApprovalEnvelope,
  opts: { approvedBy: string; platforms: Platform[]; note?: string; confirmedDigest: string; now: Date }
): { ok: true; envelope: ApprovalEnvelope } | { ok: false; reason: string } {
  const actual = recomputeDigest(e);
  if (actual !== e.contentDigest) {
    return { ok: false, reason: `Envelope has been modified since it was written (digest ${actual.slice(0, 12)} ≠ recorded ${e.contentDigest.slice(0, 12)})` };
  }
  if (opts.confirmedDigest !== actual) {
    return { ok: false, reason: `The digest you confirmed (${opts.confirmedDigest.slice(0, 12)}) is not this file's digest (${actual.slice(0, 12)}). Re-inspect it before approving.` };
  }
  if (!opts.approvedBy.trim()) {
    return { ok: false, reason: "An approver must be named." };
  }
  if (opts.platforms.length === 0) {
    return { ok: false, reason: "No platform approved — nothing would publish." };
  }
  for (const p of opts.platforms) {
    if (!e.validationAtGeneration[p]?.ok) {
      return { ok: false, reason: `${p} did not pass validation at generation time and cannot be approved.` };
    }
  }
  return {
    ok: true,
    envelope: {
      ...e,
      approval: {
        approvedAtUtc: opts.now.toISOString(),
        approvedBy: opts.approvedBy.trim(),
        platforms: opts.platforms,
        approvedDigest: actual,
        note: opts.note ?? "",
      },
    },
  };
}

// -----------------------------------------------------------------------------
// THE PUBLISH-TIME GATE
// -----------------------------------------------------------------------------

export interface ApprovalCheck {
  ok: boolean;
  /** Empty when ok. Every entry is a reason not to publish. */
  failures: string[];
  /** Checks that ran and passed, recorded in the ledger row's reason. */
  checked: string[];
  /** Platforms that survived every check. */
  eligible: Platform[];
  /** The candidate as it exists TODAY. Null when the subject is gone. */
  candidate: Candidate | null;
}

export interface ApprovalCheckInput {
  envelope: ApprovalEnvelope;
  events: IndexedEvent[];
  ledger: PostLedger;
  now: Date;
  /** Injected so the check and the runner agree on how a fact set is hashed. */
  hashFacts: (facts: FactSet) => string;
}

/**
 * Everything that can be re-checked between approval and publication, re-checked.
 *
 * The ordering is deliberate: integrity first (is this the file that was
 * approved?), then freshness (is it still about today?), then the full
 * deterministic pipeline (does it still pass every gate the unattended path
 * would apply?). A failure anywhere means nothing publishes.
 */
export function checkApproval(input: ApprovalCheckInput): ApprovalCheck {
  const { envelope: e, events, ledger, now, hashFacts } = input;
  const failures: string[] = [];
  const checked: string[] = [];

  // --- integrity -------------------------------------------------------------
  checked.push("envelope-digest");
  const actual = recomputeDigest(e);
  if (actual !== e.contentDigest) {
    failures.push(
      `Envelope has been modified: digest ${actual.slice(0, 12)} does not match the recorded ${e.contentDigest.slice(0, 12)}`
    );
  }

  checked.push("approved");
  if (!e.approval) {
    failures.push("This envelope has not been approved. Run the approve step first.");
  } else {
    checked.push("approval-binds-this-copy");
    if (e.approval.approvedDigest !== actual) {
      failures.push(
        `The copy changed after approval: approved ${e.approval.approvedDigest.slice(0, 12)}, now ${actual.slice(0, 12)}`
      );
    }
    if (!e.approval.approvedBy?.trim()) {
      failures.push("Approval records no approver.");
    }
    if (Date.parse(e.approval.approvedAtUtc) < Date.parse(e.generatedAtUtc)) {
      failures.push("Approval is dated before the copy it approves.");
    }
    if (Date.parse(e.approval.approvedAtUtc) > now.getTime()) {
      failures.push("Approval is dated in the future.");
    }
  }

  // Any integrity failure makes the rest meaningless — we would be checking a
  // document we have already decided not to trust.
  if (failures.length) {
    return { ok: false, failures, checked, eligible: [], candidate: null };
  }

  const approval = e.approval as ApprovalMark;

  // --- freshness -------------------------------------------------------------
  checked.push("not-stale");
  const ageHours = (now.getTime() - Date.parse(e.generatedAtUtc)) / 3_600_000;
  if (ageHours > MAX_APPROVAL_AGE_HOURS) {
    failures.push(
      `Stale: generated ${ageHours.toFixed(1)}h ago (limit ${MAX_APPROVAL_AGE_HOURS}h). Regenerate and re-approve.`
    );
  }
  if (ageHours < 0) {
    failures.push("Envelope is dated in the future.");
  }

  checked.push("same-local-day");
  const today = chicagoParts(now).date;
  if (e.localDate !== today) {
    failures.push(
      `Written for ${e.localDate} America/Chicago, but today is ${today}. Copy that states a period must not be published on a different day.`
    );
  }

  checked.push("validator-version");
  if (e.validatorVersion !== VALIDATOR_VERSION) {
    failures.push(
      `Approved under ${e.validatorVersion}, but the validator is now ${VALIDATOR_VERSION}. Regenerate and re-approve.`
    );
  }

  // --- single use ------------------------------------------------------------
  checked.push("not-already-published");
  const already = publishedPosts(ledger).filter((p) => p.approvalId === e.id);
  if (already.length) {
    failures.push(
      `Already published from this approval on ${already.map((p) => p.platform).join(", ")}. An approval is single-use.`
    );
  }

  // --- the subject still exists, and its data has not moved ------------------
  checked.push("subject-still-eligible");
  const candidates = candidatesFor(events, today);
  const candidate =
    candidates.find(
      (c) => c.subjectId === e.subjectId && (!e.contentType || c.contentType === e.contentType)
    ) ??
    candidates.find((c) => c.subjectId === e.subjectId) ??
    null;

  if (!candidate) {
    failures.push(
      `${e.subjectId} is no longer a candidate for ${today} — it has aged out, lost its data, or no longer clears the bar.`
    );
  } else {
    if (!candidate.supportedAngles.includes(e.angle)) {
      failures.push(`${e.subjectId} no longer supports the ${e.angle} angle.`);
    }
    if (candidate.deepLink !== e.deepLink) {
      failures.push(
        `Destination moved: approved ${e.deepLink}, now ${candidate.deepLink}.`
      );
    }
    checked.push("facts-unchanged");
    const nowHash = hashFacts(candidate.facts);
    if (nowHash !== e.factsHash) {
      failures.push(
        `The underlying data changed since generation (fact set ${e.factsHash} → ${nowHash}). The copy may state figures that are no longer current.`
      );
    }
  }

  checked.push("destination-publishable");
  if (!isPublishableDestination(e.deepLink)) {
    failures.push(`${e.deepLink} is not a publishable destination.`);
  }

  if (failures.length || !candidate) {
    return { ok: false, failures, checked, eligible: [], candidate };
  }

  // --- the full deterministic pipeline, re-run against TODAY -----------------
  //
  // Validation runs against the RECOMPUTED fact set, not the stored one. That is
  // what makes the stored copy of the facts inert: editing it cannot make a post
  // pass, and the hash check above has already refused anything that moved.
  const eligible: Platform[] = [];
  for (const platform of approval.platforms) {
    const text = e.copy[platform];

    checked.push(`validator:${platform}`);
    const validation = validatePost(text, platform, candidate.facts);
    if (!validation.ok) {
      failures.push(`[${platform}] ${validation.failures.join("; ")}`);
      continue;
    }

    checked.push(`dedupe-subject:${platform}`);
    const subject = checkSubject(
      ledger,
      e.subjectId,
      [e.angle],
      platform,
      e.deepLink,
      now,
      e.pool
    );
    if (!subject.ok || !subject.availableAngles.includes(e.angle)) {
      failures.push(`[${platform}] ${subject.reason}`);
      continue;
    }

    checked.push(`dedupe-wording:${platform}`);
    const wording = checkWording(ledger, text, platform);
    if (!wording.ok) {
      failures.push(`[${platform}] ${wording.reason}`);
      continue;
    }

    eligible.push(platform);
  }

  // A partial pass is still a failure for the platform that failed, but the
  // other one may proceed — the same independence the unattended path has.
  return { ok: eligible.length > 0, failures, checked, eligible, candidate };
}
