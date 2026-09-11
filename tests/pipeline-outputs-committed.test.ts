// =============================================================================
// EVERY GENERATED OUTPUT IS IN THE COMMIT PATH LIST
//
// THE INCIDENT THESE TESTS EXIST FOR
// ----------------------------------
// commit-and-push.sh declares, once, the set of generated files the refresh
// workflows commit to main. On 2026-09-04 the retained source-document store
// (data/source-text/, written during ingest by the federal-register and
// executive-actions adapters) was added to the repository WITHOUT being added
// to that list.
//
// The consequence was not the usual one. A missing path normally means a file
// quietly rots — which is the failure the script's own header describes, from
// the last time this happened to warn-summary.json. This time the store is
// rewritten on every run that finds a new document, so the working tree was
// dirty when the script reached `git pull --rebase`, and git refuses to rebase
// a dirty tree. Five attempts, then exit 1.
//
//   · refresh-data.yml failed every day from 2026-09-05 (runs #94-#100).
//     Production data was frozen for a week.
//   · newsletter.yml failed on 2026-09-10 at "Archive the issue" — the step
//     BEFORE "Send to subscribers". The issue was built, all four editions
//     validated, and preflight returned SAFE TO SEND. No email went out.
//
// The error the log showed was "cannot pull with rebase: You have unstaged
// changes", followed by an error suggesting branch protection. Neither named
// the cause, which is why it ran undiagnosed for a week.
//
// So: a unit test, not a comment. A generated output that nothing commits is a
// silent bug; a generated output that nothing commits AND that blocks the push
// takes the publishing pipeline down.
// =============================================================================

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const SCRIPT = readFileSync(join(ROOT, ".github/scripts/commit-and-push.sh"), "utf8");

/** The DEFAULT_PATHS array, read from the script rather than duplicated here. */
function defaultPaths(): string[] {
  const block = SCRIPT.match(/DEFAULT_PATHS=\(([\s\S]*?)\n\)/);
  if (!block) throw new Error("DEFAULT_PATHS not found in commit-and-push.sh");
  return [...block[1].matchAll(/^\s*"([^"]+)"/gm)].map((m) => m[1]);
}

/** Is `target` committed by the script — itself, or via a parent directory? */
function covered(target: string, paths: string[]): boolean {
  return paths.some((p) => target === p || target.startsWith(`${p}/`));
}

describe("every path the pipeline regenerates is committed", () => {
  const PATHS = defaultPaths();

  it("reads a non-empty path list from the script", () => {
    expect(PATHS.length).toBeGreaterThan(0);
  });

  it("commits the retained source-document store", () => {
    // The 2026-09-04 omission. Left out, it does not go stale — it stops the
    // daily refresh and the weekly newsletter.
    expect(covered("data/source-text", PATHS), `DEFAULT_PATHS is ${JSON.stringify(PATHS)}`).toBe(true);
  });

  it("commits the store at the location the code actually writes to", () => {
    // Moving SOURCE_TEXT_DIR without updating the path list would reintroduce
    // the same outage, so the test follows the constant rather than a literal.
    const src = readFileSync(join(ROOT, "src/lib/source-text.ts"), "utf8");
    const dir = src.match(/SOURCE_TEXT_DIR\s*=\s*resolve\("([^"]+)"\)/)?.[1];
    expect(dir, "SOURCE_TEXT_DIR is no longer a plain resolve() — update this test").toBeTruthy();
    expect(covered(dir!, PATHS), `${dir} is written by putSourceText() but nothing commits it`).toBe(true);
  });

  it("commits every generated directory the build scripts write to", () => {
    // Derived from the build scripts' own output constants, so a new output
    // added without a path entry fails here instead of in production at 14:00
    // on a Thursday.
    const scripts = [
      "scripts/refresh-data.mjs",
      "scripts/build-employers.ts",
      "scripts/build-warn.ts",
      "scripts/build-events.ts",
      "scripts/build-dataset.ts",
    ];
    const targets = new Set<string>();
    for (const s of scripts) {
      const src = readFileSync(join(ROOT, s), "utf8");
      for (const m of src.matchAll(/new URL\("\.\.\/([^"]+)"/g)) targets.add(m[1]);
    }
    expect(targets.size).toBeGreaterThan(0);
    const orphans = [...targets].filter((t) => !covered(t, PATHS)).sort();
    expect(orphans, "these are written by the build but committed by nothing").toEqual([]);
  });
});

describe("a dirty working tree cannot stop a publish", () => {
  it("rebases with autostash", () => {
    // Without it, ANY regenerated file outside the path list makes `git pull
    // --rebase` refuse outright — which is what took the pipeline down. With
    // it, an incomplete list costs an uncommitted file, not the newsletter.
    expect(SCRIPT).toMatch(/rebase\.autoStash=true/);
  });

  it("names the files it could not stage", () => {
    // The week-long diagnosis cost came from the symptom never naming the
    // cause. This prints them.
    expect(SCRIPT).toMatch(/git diff --name-only/);
    expect(SCRIPT).toMatch(/not in this script's path list/);
  });

  it("still never force-pushes", () => {
    // The incident must not have bought robustness with history rewriting.
    expect(SCRIPT).not.toMatch(/--force|\+HEAD|--force-with-lease/);
  });
});
