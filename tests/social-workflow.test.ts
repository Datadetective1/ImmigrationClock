// =============================================================================
// THE PUBLISHING SWITCH, AS ACTUALLY WIRED
//
// scripts/social-post.ts reads process.env.SOCIAL_POST_ENABLED. GitHub Actions
// does NOT put repository variables into a job's environment automatically — a
// `vars.X` reference in an `if:` expression is evaluated by the runner, while
// `process.env.X` inside the job is only populated if the workflow maps it.
//
// That gap is not hypothetical: this workflow shipped without the mapping, which
// meant the switch could never be turned on, while the "Publishing not enabled"
// notice — which reads `vars` directly — would have stopped printing the moment
// someone set the variable. A switch that does nothing paired with a warning
// that goes quiet is the worst combination of the two.
//
// These tests read the workflow file as text. That is deliberately literal: the
// property being protected is a fact about a YAML file that nothing else in the
// test suite can observe, and asserting on the real bytes is the only way to
// notice if the line is removed.
// =============================================================================

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { isPublishingEnabled } from "@/lib/social/run";

const WORKFLOW = readFileSync(resolve(".github/workflows/social.yml"), "utf8");
const POST_SCRIPT = readFileSync(resolve("scripts/social-post.ts"), "utf8");
const ENV_EXAMPLE = readFileSync(resolve(".env.example"), "utf8");

describe("the workflow maps the switch into the job environment", () => {
  it("exports SOCIAL_POST_ENABLED from the repository variable", () => {
    expect(WORKFLOW).toMatch(/^\s+SOCIAL_POST_ENABLED:\s+\$\{\{\s*vars\.SOCIAL_POST_ENABLED\s*\}\}\s*$/m);
  });

  it("maps it from `vars`, never from a literal", () => {
    // A hardcoded value would enable publishing for everyone who checks out the
    // repository, which is the one thing this file must never allow.
    const assignments = [...WORKFLOW.matchAll(/SOCIAL_POST_ENABLED:\s*(.+)$/gm)].map((m) =>
      m[1].trim()
    );
    expect(assignments.length).toBeGreaterThan(0);
    for (const value of assignments) {
      expect(value).toBe("${{ vars.SOCIAL_POST_ENABLED }}");
    }
  });

  it("still requires --live in addition to the switch", () => {
    // Two independent gates. The workflow decides whether to pass --live; the
    // script decides whether the switch permits publishing. Losing either one
    // would leave a single point of failure in front of a public account.
    expect(WORKFLOW).toContain('ARGS="$ARGS --live"');
    expect(POST_SCRIPT).toContain("const live = wantsLive && enabled;");
  });

  it("keeps the notice that says nothing was published", () => {
    expect(WORKFLOW).toContain("vars.SOCIAL_POST_ENABLED != 'true'");
    expect(WORKFLOW).toContain("Publishing not enabled");
  });

  it("does not set the variable to true anywhere in the repository's own config", () => {
    expect(WORKFLOW).not.toMatch(/SOCIAL_POST_ENABLED:\s*["']?true["']?\s*$/m);
    expect(ENV_EXAMPLE).toMatch(/^SOCIAL_POST_ENABLED=""$/m);
  });
});

// =============================================================================
// THE COPY ENGINE MUST REACH THE STEP THAT PUBLISHES
//
// The failure this pins: SOCIAL_ENGINE was mapped from a repository variable
// that was never set, so it arrived as the empty string and the publish step
// died with `Unknown copy engine provider:`. Two independent things had to be
// true for that to happen, and both are asserted here — the value must be
// deterministic without depending on a variable existing, and it must be
// declared at JOB level so every step inherits it rather than only the ones
// somebody remembered to wire.
// =============================================================================
describe("the workflow resolves the copy engine deterministically", () => {
  it("maps SOCIAL_ENGINE with an explicit openai default", () => {
    expect(WORKFLOW).toMatch(
      /^\s+SOCIAL_ENGINE:\s+\$\{\{\s*vars\.SOCIAL_ENGINE\s*\|\|\s*'openai'\s*\}\}\s*$/m
    );
  });

  it("never leaves SOCIAL_ENGINE as a bare vars reference", () => {
    // A bare reference is the bug: unset renders as "", not as absent.
    const assignments = [...WORKFLOW.matchAll(/SOCIAL_ENGINE:\s*(.+)$/gm)].map((m) => m[1].trim());
    expect(assignments.length).toBeGreaterThan(0);
    for (const value of assignments) {
      expect(value).not.toBe("${{ vars.SOCIAL_ENGINE }}");
      expect(value).toContain("'openai'");
    }
  });

  it("declares it at job level, so 'Publish this slot' inherits it", () => {
    // The publish step has no `env:` of its own; it inherits the job's. If
    // SOCIAL_ENGINE ever moves under a single step — preflight, say — the
    // scheduled publish silently loses it again, which is exactly what happened.
    const jobEnvBlock = WORKFLOW.slice(
      WORKFLOW.indexOf("    env:"),
      WORKFLOW.indexOf("    steps:")
    );
    expect(jobEnvBlock).toContain("SOCIAL_ENGINE:");
    expect(jobEnvBlock).toContain("OPENAI_API_KEY:");

    // And it is not scoped to any step below.
    const stepsBlock = WORKFLOW.slice(WORKFLOW.indexOf("    steps:"));
    expect(stepsBlock).not.toContain("SOCIAL_ENGINE:");
  });

  it("keeps the OpenAI key coming from secrets and hardcodes no key", () => {
    expect(WORKFLOW).toMatch(/OPENAI_API_KEY:\s*\$\{\{\s*secrets\.OPENAI_API_KEY\s*\}\}/);
    // No literal key material, of any provider, anywhere in the file.
    expect(WORKFLOW).not.toMatch(/sk-[A-Za-z0-9_-]{16,}/);
  });

  it("keeps the publish step's pipefail, so a failed publish cannot read green", () => {
    expect(WORKFLOW).toContain("set -o pipefail");
  });

  it("keeps X live and LinkedIn unconfigured", () => {
    // LinkedIn stays wired-but-unset: readLinkedInCredentials() needs both
    // values, so it records SKIPPED_CREDENTIAL_EXPIRED and X is unaffected.
    expect(WORKFLOW).toMatch(/LINKEDIN_ACCESS_TOKEN:\s*\$\{\{\s*secrets\.LINKEDIN_ACCESS_TOKEN\s*\}\}/);
    expect(WORKFLOW).toMatch(/X_ACCESS_TOKEN:\s*\$\{\{\s*secrets\.X_ACCESS_TOKEN\s*\}\}/);
  });
});

describe("the script reads the switch through the tested predicate", () => {
  it("does not compare the environment variable inline any more", () => {
    // The rule lives in one place so it can be tested. An inline comparison
    // would drift from it silently.
    expect(POST_SCRIPT).toContain("const enabled = isPublishingEnabled();");
    expect(POST_SCRIPT).not.toMatch(/process\.env\.SOCIAL_POST_ENABLED\s*===/);
  });

  it("treats an unset variable as disabled", () => {
    expect(isPublishingEnabled({})).toBe(false);
    expect(isPublishingEnabled({ SOCIAL_POST_ENABLED: undefined })).toBe(false);
  });

  it("treats an empty variable — what an unset GitHub variable expands to — as disabled", () => {
    // `${{ vars.X }}` with X unset renders as the empty string, not as an absent
    // key. This is the exact value the new mapping produces today.
    expect(isPublishingEnabled({ SOCIAL_POST_ENABLED: "" })).toBe(false);
  });
});
