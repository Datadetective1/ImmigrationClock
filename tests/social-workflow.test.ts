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
