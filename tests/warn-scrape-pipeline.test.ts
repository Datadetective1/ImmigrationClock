// =============================================================================
// THE WIDE-NET WARN SCRAPE CANNOT LOSE STATES SILENTLY
//
// THE INCIDENT THESE TESTS EXIST FOR
// ----------------------------------
// On 2026-09-11 refresh-warn.yml asked warn-scraper for eleven states in one
// process. The CLI has no per-state error handling: Georgia's portal hung on a
// TCP connect, the process died on the traceback, and the six states after it
// in the list were never attempted. Two of the eleven (MN, MA) had no parser in
// the package at all and would have crashed the run the same way. Maryland
// wrote a CSV with an empty header row. `|| true` made the step green. The
// site showed five states, and the cache was rebuilt from scratch each run, so
// any state whose portal was down for one run vanished until the next.
//
// The rewrite: a static list of supported states (scripts/warn-states.mjs), a
// planner that drops unknown codes instead of crashing on them, one process per
// state with a timeout (.github/scripts/scrape-warn-states.sh), a normalizer
// that keeps a failed state's last good snapshot with the date it was read, and
// a workflow that holds the shared main-writer lock only while committing.
// =============================================================================

import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, existsSync, readdirSync, chmodSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import {
  SCRAPER_STATES,
  DEFAULT_SCRAPE_STATES,
  LIVE_ADAPTER_STATES,
  STATE_SOURCE,
  resolveStates,
  planBatches,
} from "../scripts/warn-states.mjs";

const ROOT = process.cwd();
const WORKFLOW_PATH = resolve(ROOT, ".github/workflows/refresh-warn.yml");
const WORKFLOW_TEXT = readFileSync(WORKFLOW_PATH, "utf8");

// The workflow is read as text, like the other workflow tests here: the
// repository has no YAML parser as a direct dependency, and the properties
// below are facts about specific lines. Blocks are sliced by indentation.
/** The text of one job under `jobs:` (2-space indent) up to the next job. */
function jobBlock(name: string): string {
  const m = WORKFLOW_TEXT.match(new RegExp(`^  ${name}:\\n([\\s\\S]*?)(?=^  [a-z]+:\\n|(?![\\s\\S]))`, "m"));
  if (!m) throw new Error(`job "${name}" not found in refresh-warn.yml`);
  return m[1];
}
/** The text of one step (matched by its `- name:` or `- uses:` line) up to the next step. */
function stepBlock(job: string, pattern: RegExp): string {
  const steps = jobBlock(job).split(/^      - /m).slice(1);
  const hit = steps.find((st) => pattern.test(st.split("\n")[0]));
  if (!hit) throw new Error(`no step matching ${pattern} in job "${job}"`);
  return hit;
}
const SCRAPE_SCRIPT_PATH = resolve(ROOT, ".github/scripts/scrape-warn-states.sh");
const SCRAPE_SCRIPT = readFileSync(SCRAPE_SCRIPT_PATH, "utf8");
const NORMALIZER = resolve(ROOT, "scripts/refresh-warn-scraper.mjs");
const PLANNER = resolve(ROOT, "scripts/warn-scrape-plan.mjs");
const BUILD_WARN = readFileSync(resolve(ROOT, "scripts/build-warn.ts"), "utf8");

// ── The state list ──────────────────────────────────────────────────────────

describe("the supported-state list", () => {
  it("is every parser warn-scraper ships, as two-letter upper-case codes, sorted", () => {
    // 41 modules in warn/scrapers/ of the 1.2.143 wheel (50 states minus those
    // with no portal or no parser, plus DC).
    expect(SCRAPER_STATES).toHaveLength(41);
    for (const code of SCRAPER_STATES) expect(code).toMatch(/^[A-Z]{2}$/);
    expect([...SCRAPER_STATES].sort()).toEqual(SCRAPER_STATES);
    expect(new Set(SCRAPER_STATES).size).toBe(SCRAPER_STATES.length);
  });

  it("does not contain the two codes that crashed the old run", () => {
    // Minnesota and Massachusetts were in the workflow's default list; the
    // package has never had a parser for either.
    expect(SCRAPER_STATES).not.toContain("MN");
    expect(SCRAPER_STATES).not.toContain("MA");
  });

  it("has an agency name and an https portal for every state", () => {
    for (const code of SCRAPER_STATES) {
      const src = (STATE_SOURCE as Record<string, { agency: string; portal: string }>)[code];
      expect(src.agency.length, code).toBeGreaterThan(5);
      expect(src.portal, code).toMatch(/^https:\/\//);
    }
  });

  it("scrapes every supported state by default except those a live adapter already fetches", () => {
    expect(LIVE_ADAPTER_STATES).toEqual(["TX", "CA"]);
    for (const code of LIVE_ADAPTER_STATES) {
      // The live adapters in build-warn.ts really do exist for these codes.
      expect(BUILD_WARN, `no live adapter for ${code}`).toMatch(new RegExp(`code: "${code}"`));
      expect(DEFAULT_SCRAPE_STATES).not.toContain(code);
    }
    expect(DEFAULT_SCRAPE_STATES).toHaveLength(SCRAPER_STATES.length - LIVE_ADAPTER_STATES.length);
    // Oregon's live adapter gets HTTP 403 from the runners; the scraper is its
    // working path, so it must stay in the default list.
    expect(DEFAULT_SCRAPE_STATES).toContain("OR");
    for (const code of ["NJ", "WA", "VA"]) expect(DEFAULT_SCRAPE_STATES).toContain(code);
  });
});

describe("resolveStates", () => {
  it("expands the two keywords", () => {
    expect(resolveStates("default").states).toEqual(DEFAULT_SCRAPE_STATES);
    expect(resolveStates("").states).toEqual(DEFAULT_SCRAPE_STATES);
    expect(resolveStates("all").states).toEqual(SCRAPER_STATES);
  });

  it("keeps explicit codes in order, de-duplicated, case-insensitive, comma- or space-separated", () => {
    expect(resolveStates("wa NJ,va wa").states).toEqual(["WA", "NJ", "VA"]);
  });

  it("returns unknown codes instead of throwing, so the rest still run", () => {
    const r = resolveStates("wa mn nj ma");
    expect(r.states).toEqual(["WA", "NJ"]);
    expect(r.unknown).toEqual(["MN", "MA"]);
  });
});

describe("planBatches", () => {
  it("covers every state exactly once across at most N batches", () => {
    const batches = planBatches(DEFAULT_SCRAPE_STATES, 5);
    expect(batches.length).toBeLessThanOrEqual(5);
    const all = batches.flatMap((b) => b.states.split(" "));
    expect(all.map((s) => s.toUpperCase()).sort()).toEqual([...DEFAULT_SCRAPE_STATES].sort());
    expect(new Set(batches.map((b) => b.name)).size).toBe(batches.length);
    for (const b of batches) expect(b.states).toMatch(/^[a-z]{2}( [a-z]{2})*$/);
  });

  it("never produces an empty batch", () => {
    expect(planBatches(["WA"], 5)).toHaveLength(1);
    expect(planBatches(["WA", "NJ"], 5).every((b) => b.states.length > 0)).toBe(true);
  });
});

describe("the planner script", () => {
  it("emits fromJSON-able batches and warns about unsupported codes", () => {
    const dir = mkdtempSync(join(tmpdir(), "warn-plan-"));
    const out = join(dir, "output.txt");
    const r = spawnSync("node", [PLANNER, "--batches", "2", "wa mn nj"], {
      encoding: "utf8",
      env: { ...process.env, GITHUB_OUTPUT: out },
    });
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/::warning::.*MN/);
    const lines = readFileSync(out, "utf8");
    const batches = JSON.parse(lines.match(/^batches=(.*)$/m)![1]);
    expect(batches.flatMap((b: any) => b.states.split(" "))).toEqual(["wa", "nj"]);
    expect(lines).toMatch(/^states=WA NJ$/m);
  });

  it("fails the run when nothing is left to scrape", () => {
    const r = spawnSync("node", [PLANNER, "mn"], { encoding: "utf8" });
    expect(r.status).toBe(1);
    expect(r.stdout).toMatch(/::error::/);
  });
});

// ── The workflow ────────────────────────────────────────────────────────────

describe("refresh-warn.yml", () => {
  it("is three jobs: plan → scrape (matrix) → publish", () => {
    expect(WORKFLOW_TEXT).toMatch(/^jobs:\n  plan:\n[\s\S]*^  scrape:\n[\s\S]*^  publish:\n/m);
    expect(jobBlock("scrape")).toMatch(/^    needs: plan$/m);
    expect(jobBlock("publish")).toMatch(/^    needs: \[plan, scrape\]$/m);
    expect(jobBlock("scrape")).toMatch(/batch: \$\{\{ fromJSON\(needs\.plan\.outputs\.batches\) \}\}/);
  });

  it("keeps the schedule unchanged", () => {
    expect(WORKFLOW_TEXT).toMatch(/^    - cron: "0 9 \* \* 2,5"$/m);
  });

  it("lets batches fail independently", () => {
    expect(jobBlock("scrape")).toMatch(/^      fail-fast: false$/m);
  });

  it("holds the shared main-writer lock only while publishing", () => {
    // The lock is shared with the daily refresh, the newsletter and the social
    // poster, and GitHub drops the second run waiting on a group. A forty-portal
    // scrape inside it could have cost a newsletter.
    expect(WORKFLOW_TEXT).not.toMatch(/^concurrency:/m);
    expect(jobBlock("plan")).not.toMatch(/concurrency:/);
    expect(jobBlock("scrape")).not.toMatch(/concurrency:/);
    expect(jobBlock("publish")).toMatch(/^    concurrency:\n      group: main-writer\n      cancel-in-progress: false$/m);
  });

  it("publishes whatever was scraped even when a batch failed or timed out", () => {
    expect(jobBlock("publish")).toMatch(/^    if: \$\{\{ !cancelled\(\) && needs\.plan\.result == 'success' \}\}$/m);
    const upload = stepBlock("scrape", /Upload CSVs/);
    expect(upload).toMatch(/^        if: always\(\)$/m);
    expect(upload).toMatch(/uses: actions\/upload-artifact@v4/);
    const download = stepBlock("publish", /Collect every batch/);
    expect(download).toMatch(/uses: actions\/download-artifact@v4/);
    expect(download).toMatch(/pattern: warn-scrape-\*/);
    expect(download).toMatch(/merge-multiple: true/);
  });

  it("runs the per-state script and never masks it with `|| true`", () => {
    const scrape = stepBlock("scrape", /Scrape each state/);
    expect(scrape).toMatch(/bash \.github\/scripts\/scrape-warn-states\.sh \/tmp\/warn \$BATCH_STATES/);
    expect(scrape).not.toMatch(/\|\|\s*true/);
    expect(scrape).not.toMatch(/continue-on-error/);
    // The matrix value reaches the shell through the environment, never by
    // interpolating an expression into the command line.
    expect(scrape).not.toMatch(/\$\{\{/);
    expect(jobBlock("scrape")).toMatch(/^      BATCH_STATES: \$\{\{ matrix\.batch\.states \}\}$/m);
  });

  it("offers a dry run that skips the commit, and still commits on the schedule", () => {
    expect(WORKFLOW_TEXT).toMatch(/^      commit:\n(?:        .*\n)*?        type: boolean\n(?:        .*\n)*?        default: true$/m);
    const commit = stepBlock("publish", /Commit refreshed WARN data/);
    // `!= 'false'` rather than `== 'true'`: a scheduled run has no inputs at
    // all, and the commit must still happen then.
    expect(commit).toMatch(/^        if: steps\.changed\.outputs\.changed == 'true' && github\.event\.inputs\.commit != 'false'$/m);
    expect(commit).toMatch(/commit-and-push\.sh/);
  });

  it("commits to the branch a manual run started from, and pings production only from main", () => {
    // commit-and-push.sh pushes to `main` unless TARGET_BRANCH says otherwise.
    // Without this, ticking `commit` on a feature branch would rebase that
    // branch onto main and push it there — a merge through the bot.
    const commit = stepBlock("publish", /Commit refreshed WARN data/);
    expect(commit).toMatch(/^          TARGET_BRANCH: \$\{\{ github\.ref_name \}\}$/m);
    const hook = stepBlock("publish", /Optional Vercel deploy hook/);
    expect(hook).toMatch(/^        if: .*github\.ref_name == 'main'$/m);
  });

  it("passes the accept_partial input through to the normalizer", () => {
    expect(WORKFLOW_TEXT).toMatch(/^      accept_partial:\n/m);
    const normalize = stepBlock("publish", /Normalize CSVs/);
    expect(normalize).toMatch(/WARN_ACCEPT_PARTIAL: \$\{\{ github\.event\.inputs\.accept_partial \}\}/);
  });

  it("defaults the state list to the planner's 'default' keyword, not a hand-written list", () => {
    expect(WORKFLOW_TEXT).toMatch(/^      states:\n(?:        .*\n)*?        default: "default"$/m);
    expect(WORKFLOW_TEXT).toMatch(/^  WARN_STATES: \$\{\{ github\.event\.inputs\.states \|\| 'default' \}\}$/m);
  });
});

// ── The per-state scrape script ─────────────────────────────────────────────

describe("scrape-warn-states.sh", () => {
  it("is not `set -e`: one state's failure must not end the loop", () => {
    expect(SCRAPE_SCRIPT).toMatch(/^set -uo pipefail/m);
    expect(SCRAPE_SCRIPT).not.toMatch(/^set -e/m);
    expect(SCRAPE_SCRIPT).not.toMatch(/^set -euo/m);
  });

  it("gives every state its own timeout", () => {
    expect(SCRAPE_SCRIPT).toMatch(/timeout -k \d+ "\$TIMEOUT" xvfb-run -a warn-scraper/);
  });

  describe("run against a stub scraper", () => {
    let data: string;
    let summary: string;
    let result: ReturnType<typeof spawnSync>;

    beforeAll(() => {
      const dir = mkdtempSync(join(tmpdir(), "warn-scrape-"));
      const bin = join(dir, "bin");
      data = join(dir, "data");
      summary = join(dir, "summary.md");
      mkdirSync(bin);
      // Stub CLI: behaviour keyed by the state code it is asked for.
      writeFileSync(
        join(bin, "warn-scraper"),
        `#!/usr/bin/env bash
dir=""; st=""
while [ $# -gt 0 ]; do case "$1" in --data-dir) dir="$2"; shift 2;; --cache-dir|-l) shift 2;; *) st="$1"; shift;; esac; done
case "$st" in
  nj) printf 'Company,City,Effective Date,Employees\\n"Acme, Inc",Trenton,2026-01-05,120\\nBeta,Newark,2026-02-01,"1,200"\\n' > "$dir/nj.csv"; exit 0;;
  ri) printf 'Company,City,Notice Date,Employees\\nSolo,Warwick,2026-03-01,50' > "$dir/ri.csv"; exit 0;;
  md) printf '\\n' > "$dir/md.csv"; exit 0;;
  ga) printf 'Company,City\\nPartial,Nowhere\\n' > "$dir/ga.csv"; echo "requests.exceptions.ConnectTimeout: www.tcsg.edu" >&2; exit 1;;
  hi) printf 'Company\\nHalf\\n' > "$dir/hi.csv"; sleep 20; exit 0;;
esac
`
      );
      writeFileSync(join(bin, "xvfb-run"), `#!/usr/bin/env bash\nshift\nexec "$@"\n`);
      writeFileSync(join(bin, "pip"), `#!/usr/bin/env bash\necho "Version: 0.0.0-stub"\n`);
      for (const f of ["warn-scraper", "xvfb-run", "pip"]) chmodSync(join(bin, f), 0o755);
      result = spawnSync("bash", [SCRAPE_SCRIPT_PATH, data, "NJ", "ri", "md", "ga", "hi"], {
        encoding: "utf8",
        env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, WARN_STATE_TIMEOUT: "1", GITHUB_STEP_SUMMARY: summary },
      });
    });

    it("attempts every state even after a crash, an empty file and a hang", () => {
      expect(result.status).toBe(0);
      const statuses = Object.fromEntries(
        readdirSync(join(data, "status")).map((f) => {
          const rec = JSON.parse(readFileSync(join(data, "status", f), "utf8"));
          return [rec.state, rec.status];
        })
      );
      expect(statuses).toEqual({ NJ: "ok", RI: "ok", MD: "empty", GA: "failed", HI: "timeout" });
    });

    it("keeps only the CSVs of states that succeeded — a partial file is not data", () => {
      const csvs = readdirSync(data).filter((f) => f.endsWith(".csv")).sort();
      expect(csvs).toEqual(["nj.csv", "ri.csv"]);
    });

    it("counts a single row with no trailing newline as data", () => {
      const ri = JSON.parse(readFileSync(join(data, "status", "ri.json"), "utf8"));
      expect(ri.rows).toBe(1);
    });

    it("annotates every failure with its reason", () => {
      expect(result.stdout).toMatch(/::warning::GA: failed — .*ConnectTimeout/);
      expect(result.stdout).toMatch(/::warning::HI: timeout/);
      expect(result.stdout).toMatch(/::warning::MD: empty/);
      expect(readFileSync(summary, "utf8")).toMatch(/\| GA \| failed \|/);
    });

    it("fails the batch only when nothing at all succeeded", () => {
      const r = spawnSync("bash", [SCRAPE_SCRIPT_PATH, join(data, "none"), "md", "ga"], {
        encoding: "utf8",
        env: { ...process.env, PATH: `${join(data, "..", "bin")}:${process.env.PATH}`, WARN_STATE_TIMEOUT: "1" },
      });
      expect(r.status).toBe(1);
      expect(r.stdout).toMatch(/::error::no state in this batch produced data/);
    });
  });
});

// ── The normalizer ──────────────────────────────────────────────────────────

function runNormalizer(scrapeDir: string, out: string, previous: string) {
  return spawnSync("node", [NORMALIZER], {
    encoding: "utf8",
    env: { ...process.env, WARN_SCRAPE_DIR: scrapeDir, WARN_SCRAPER_OUT: out, WARN_SCRAPER_PREVIOUS: previous },
  });
}

const PREVIOUS_CACHE = {
  generatedAt: "2026-09-01T09:00:00.000Z",
  source: "biglocalnews/warn-scraper",
  states: [
    { code: "GA", count: 1, portal: "old" },
    { code: "NJ", count: 1, portal: "old" },
  ],
  noticeCount: 2,
  notices: [
    { employer: "Old Georgia Co", city: null, county: null, state: "GA", noticeDate: "2025-05-01", effectiveDate: null, employees: 40, layoffType: null, sourceUrl: "old" },
    { employer: "Old Jersey Co", city: null, county: null, state: "NJ", noticeDate: "2025-05-01", effectiveDate: null, employees: 40, layoffType: null, sourceUrl: "old" },
  ],
};

describe("refresh-warn-scraper.mjs", () => {
  it("keeps a failed state's last good snapshot, dated to when it was actually read", () => {
    const dir = mkdtempSync(join(tmpdir(), "warn-norm-"));
    mkdirSync(join(dir, "status"));
    writeFileSync(join(dir, "nj.csv"), 'Company,City,Effective Date,Employees\nNew Jersey Co,Trenton,2026-01-05,120\n');
    writeFileSync(join(dir, "status", "nj.json"), JSON.stringify({ state: "NJ", status: "ok", rows: 1, scrapedAt: "2026-09-11T09:05:00Z" }));
    writeFileSync(join(dir, "status", "ga.json"), JSON.stringify({ state: "GA", status: "timeout", rows: 0, reason: "killed after 420s", scrapedAt: "2026-09-11T09:12:00Z" }));
    const prev = join(dir, "prev.json");
    writeFileSync(prev, JSON.stringify(PREVIOUS_CACHE));
    const out = join(dir, "out.json");

    const r = runNormalizer(dir, out, prev);
    expect(r.status, r.stderr).toBe(0);
    const cache = JSON.parse(readFileSync(out, "utf8"));

    const nj = cache.states.find((s: any) => s.code === "NJ");
    expect(nj.status).toBe("fresh");
    expect(nj.scrapedAt).toBe("2026-09-11T09:05:00Z");
    expect(nj.agency).toMatch(/New Jersey/);
    expect(nj.portal).toMatch(/^https:\/\/www\.nj\.gov/);
    // Fresh replaces, never appends: the old NJ row is gone.
    expect(cache.notices.filter((n: any) => n.state === "NJ").map((n: any) => n.employer)).toEqual(["New Jersey Co"]);

    const ga = cache.states.find((s: any) => s.code === "GA");
    expect(ga.status).toBe("carried");
    // No scrapedAt in the old cache format → the old cache's generatedAt.
    expect(ga.scrapedAt).toBe("2026-09-01T09:00:00.000Z");
    expect(cache.notices.filter((n: any) => n.state === "GA").map((n: any) => n.employer)).toEqual(["Old Georgia Co"]);

    // The attempt log names the failure so a missing state is explained.
    expect(cache.attempts.find((a: any) => a.state === "GA")).toMatchObject({ status: "timeout", reason: "killed after 420s" });
    expect(r.stderr).toMatch(/GA: timeout — killed after 420s; keeping 1 notices last read 2026-09-01/);
  });

  it("carries a state forward across runs that did not even attempt it, and keeps its original read date", () => {
    // A manual `states: nj` dispatch must not wipe the other forty states.
    const dir = mkdtempSync(join(tmpdir(), "warn-norm-"));
    writeFileSync(join(dir, "nj.csv"), 'Company,City,Effective Date,Employees\nNew Jersey Co,Trenton,2026-01-05,120\n');
    const prev = join(dir, "prev.json");
    writeFileSync(prev, JSON.stringify({
      ...PREVIOUS_CACHE,
      states: [{ code: "GA", count: 1, portal: "old", status: "fresh", scrapedAt: "2026-08-20T09:00:00Z" }, { code: "NJ", count: 1, portal: "old" }],
    }));
    const out = join(dir, "out.json");
    expect(runNormalizer(dir, out, prev).status).toBe(0);
    const ga = JSON.parse(readFileSync(out, "utf8")).states.find((s: any) => s.code === "GA");
    expect(ga).toMatchObject({ status: "carried", count: 1, scrapedAt: "2026-08-20T09:00:00Z" });
  });

  it("treats a CSV with an empty header as unusable and keeps the previous snapshot", () => {
    // Maryland, 2026-09-11.
    const dir = mkdtempSync(join(tmpdir(), "warn-norm-"));
    writeFileSync(join(dir, "ga.csv"), "\n");
    writeFileSync(join(dir, "nj.csv"), 'Company,City,Effective Date,Employees\nNew Jersey Co,Trenton,2026-01-05,120\n');
    const prev = join(dir, "prev.json");
    writeFileSync(prev, JSON.stringify(PREVIOUS_CACHE));
    const out = join(dir, "out.json");
    const r = runNormalizer(dir, out, prev);
    expect(r.status).toBe(0);
    expect(r.stderr).toMatch(/ga\.csv: no data rows/);
    expect(JSON.parse(readFileSync(out, "utf8")).states.find((s: any) => s.code === "GA").status).toBe("carried");
  });

  it("refuses to write anything when no state produced usable rows", () => {
    // A totally failed run is a broken pipeline, not forty broken portals; the
    // committed cache must stay exactly as it was and the job must go red.
    const dir = mkdtempSync(join(tmpdir(), "warn-norm-"));
    mkdirSync(join(dir, "status"));
    writeFileSync(join(dir, "status", "nj.json"), JSON.stringify({ state: "NJ", status: "failed", reason: "boom" }));
    const prev = join(dir, "prev.json");
    writeFileSync(prev, JSON.stringify(PREVIOUS_CACHE));
    const out = join(dir, "out.json");
    const r = runNormalizer(dir, out, prev);
    expect(r.status).toBe(1);
    expect(existsSync(out)).toBe(false);
    expect(r.stderr).toMatch(/no state produced usable rows/);
  });

  // Column shapes taken from the header rows the warn-scraper modules write.
  function normalizeOne(code: string, csv: string) {
    const dir = mkdtempSync(join(tmpdir(), "warn-norm-"));
    writeFileSync(join(dir, `${code}.csv`), csv);
    const out = join(dir, "out.json");
    const r = runNormalizer(dir, out, join(dir, "missing.json"));
    expect(r.status, r.stderr).toBe(0);
    return JSON.parse(readFileSync(out, "utf8")).notices[0];
  }

  it("reads Colorado's headcount (`jobs`) and start date (`begin_date`), and does not call an address a city", () => {
    const n = normalizeOne(
      "co",
      "at_the_location,begin_date,company,contact,dropdown,email,end_date,fein,furloughs,jobs,letter,location,naics,notes,notice_date,occupations,permanent_job_losses,phone,reason,received_date,reduced_hours,temporary_job_losses,total_notified,workforce_area,workforce_region\n" +
        ",2026-03-01,Front Range Co,,,,,,0,85,,\"4850 32nd Avenue South, Denver\",,,2026-01-15,,,,Closure,2026-01-15,,,85,,\n"
    );
    expect(n).toMatchObject({ employer: "Front Range Co", employees: 85, effectiveDate: "2026-03-01", noticeDate: "2026-01-15", city: null, state: "CO" });
    // The `url` substring alias reaches `furloughs`; the https guard must keep
    // that headcount out of sourceUrl.
    expect(n.sourceUrl).toMatch(/^https:\/\/cdle\.colorado\.gov/);
  });

  it("reads Connecticut's filing date from `warn_document_date`, not the free-text layoff dates", () => {
    const n = normalizeOne(
      "ct",
      "affected_company,layoff_dates,layoff_locations,number_of_impacted_workers,warn_document_date\n" +
        "Nutmeg Corp,11/24/2025,Hartford,120,2025-09-30\n"
    );
    expect(n).toMatchObject({ employer: "Nutmeg Corp", noticeDate: "2025-09-30", effectiveDate: "2025-11-24", employees: 120, city: "Hartford" });
  });

  it("reads Alabama's type and start date, and never takes a date column for the state", () => {
    const n = normalizeOne(
      "al",
      "Closing or Layoff,Initial Report Date,Planned Starting Date,Company,City,Planned # Affected Employees\n" +
        "Closing,1/5/2026,3/1/2026,Yellowhammer Inc,Mobile,40\n"
    );
    expect(n).toMatchObject({ employer: "Yellowhammer Inc", layoffType: "Closing", noticeDate: "2026-01-05", effectiveDate: "2026-03-01", employees: 40, state: "AL" });
  });

  it("reads Illinois's IEBS export, preferring the revised headcount and ignoring the site's whole workforce", () => {
    const header =
      "location_name,doing_business_as_name,location_address,location_city,location_state,location_zipcode,county,lwia,lwia,layoff_type,warn_notice,trade,petition_date,determination,impact_date,certificationdate,exp_term_date,ataa_certified,causes,reason,status,report_source,industry,naics_codes,iebs_id,approximate_total_of_full_time_employees,expected_layoff,revised_layoff,initial_date_reported,last_report_date,notification_date_s,unions_involved,unions,has_public_layoff_assistance_web_page\n";
    const dir = mkdtempSync(join(tmpdir(), "warn-norm-"));
    writeFileSync(
      join(dir, "il.csv"),
      header +
        "Prairie Works,,100 Main St,Peoria,IL,61602,Peoria,,,State,Yes,,2025-01-09,,2026-04-30,,,,Other,Closure,,,,,1,2500,140,155,2026-02-02,2026-02-10,2026-02-01,,,\n" +
        "Second Site,,,Chicago,IL,,Cook,,,Temporary,Yes,,2025-01-09,,2026-05-15,,,,,,,,,,2,900,60,,2026-02-03,,,,,\n"
    );
    const out = join(dir, "out.json");
    const r = runNormalizer(dir, out, join(dir, "missing.json"));
    expect(r.status, r.stderr).toBe(0);
    const [a, b] = JSON.parse(readFileSync(out, "utf8")).notices;
    // Revised (155) beats expected (140); the 2,500-person workforce is never the layoff.
    // Type comes from `reason` (the closure or layoff), not `layoff_type` (which WARN act applies).
    expect(a).toMatchObject({ employer: "Prairie Works", employees: 155, noticeDate: "2026-02-02", effectiveDate: "2026-04-30", city: "Peoria", county: "Peoria", state: "IL", layoffType: "Closure" });
    // No revision → the expected figure; the TAA petition date is never the notice date.
    expect(b).toMatchObject({ employer: "Second Site", employees: 60, noticeDate: "2026-02-03", effectiveDate: "2026-05-15" });
  });

  it("reads Missouri's and New York's column names", () => {
    const mo = normalizeOne(
      "mo",
      "received_sort_descending,title,industry,location_s,county,region,type,layoff_date_s,affected,notes\n" +
        "2026-03-04,Gateway Foods,Manufacturing,Kansas City,Jackson,West,Closure,2026-05-01,210,\n"
    );
    expect(mo).toMatchObject({ employer: "Gateway Foods", noticeDate: "2026-03-04", effectiveDate: "2026-05-01", employees: 210, city: "Kansas City", county: "Jackson", layoffType: "Closure", state: "MO" });
    const ny = normalizeOne(
      "ny",
      "business_legal_name,date_layoff_closure_starts,date_of_warn_notice,date_posted,impacted_site_address,impacted_site_county,layoff_or_closure,permanent_or_temporary_layoff,reason_for_layoff_closure,index,number_of_affected_workers,number_of_affected_workers\n" +
        "Empire Retail LLC,05/30/2026,03/02/2026,03/05/2026,\"1 Broadway, New York\",New York,Layoff,Permanent,Economic,1,75,75\n"
    );
    expect(ny).toMatchObject({ employer: "Empire Retail LLC", noticeDate: "2026-03-02", effectiveDate: "2026-05-30", employees: 75, county: "New York", layoffType: "Layoff", state: "NY" });
  });

  it("reads Maryland's header-less, positional file", () => {
    // The parser reads the first page's header with the <td> selector, so the
    // <th> cells come out as an empty row. These are two real rows from the
    // 2026-09-11 run.
    const dir = mkdtempSync(join(tmpdir(), "warn-norm-"));
    writeFileSync(
      join(dir, "md.csv"),
      "\n" +
        '08/31/2026,459510,"ThriftBooks Global, LLC","4734 Trident Court, Building A Baltimore, MD 21227",Baltimore County,136,10/31/2026,Plant Closure\n' +
        '08/25/2026,541810,Crosby Marketing Communications,"705 Melvin Avenue Annapolis, MD 21401",Anne Arundel County,20,10/30/2026,Mass Layoff- No Recall\n'
    );
    const out = join(dir, "out.json");
    const r = runNormalizer(dir, out, join(dir, "missing.json"));
    expect(r.status, r.stderr).toBe(0);
    const [a, b] = JSON.parse(readFileSync(out, "utf8")).notices;
    expect(a).toMatchObject({ employer: "ThriftBooks Global, LLC", noticeDate: "2026-08-31", effectiveDate: "2026-10-31", employees: 136, county: "Baltimore", city: null, layoffType: "Plant Closure", state: "MD" });
    expect(b).toMatchObject({ employer: "Crosby Marketing Communications", employees: 20, county: "Anne Arundel" });
  });

  it("reports, rather than misreads, a header-less file whose width does not match the known layout", () => {
    const dir = mkdtempSync(join(tmpdir(), "warn-norm-"));
    writeFileSync(join(dir, "md.csv"), "\nOnly,Three,Columns\n");
    writeFileSync(join(dir, "nj.csv"), 'Company,City,Effective Date,Employees\nNew Jersey Co,Trenton,2026-01-05,120\n');
    const out = join(dir, "out.json");
    const r = runNormalizer(dir, out, join(dir, "missing.json"));
    expect(r.status).toBe(0);
    expect(r.stderr).toMatch(/md\.csv: empty header row and no 3-column layout for MD/);
  });

  it("reads Kentucky's effective date, type and notice link", () => {
    const n = normalizeOne(
      "ky",
      "NAICS,address,closure_or_layoff,comments,company,congressional,contact,county,date_effective,date_received,employees,industry,neg,notice_number,notice_url,region,source,trade,union,union_affected\n" +
        '312111,,Layoff,,"Congo Brands (Alani, Prime, 3D Energy)",,,Jefferson,2026-11-04 00:00:00,2026-09-04 00:00:00,15,,,Notice 2837,https://kydev.my.salesforce.com/sfc/p/abc,Kentuckiana Works,WARN Notice,TBD,,Non-Union\n'
    );
    expect(n).toMatchObject({ employer: "Congo Brands (Alani, Prime, 3D Energy)", noticeDate: "2026-09-04", effectiveDate: "2026-11-04", employees: 15, county: "Jefferson", layoffType: "Layoff", sourceUrl: "https://kydev.my.salesforce.com/sfc/p/abc", state: "KY" });
  });

  it("attributes every row to the state whose portal published it, whatever a worksite-state column says", () => {
    // Otherwise a handful of out-of-state worksites in Illinois's export would
    // make the site claim coverage of states whose portals it never read.
    const dir = mkdtempSync(join(tmpdir(), "warn-norm-"));
    writeFileSync(join(dir, "il.csv"), "location_name,location_city,location_state,expected_layoff,initial_date_reported\nBorder Co,Hammond,IN,30,2026-01-01\nHome Co,Chicago,IL,40,2026-01-02\n");
    const out = join(dir, "out.json");
    const r = runNormalizer(dir, out, join(dir, "missing.json"));
    expect(r.status).toBe(0);
    const cache = JSON.parse(readFileSync(out, "utf8"));
    expect(cache.notices.map((n: any) => n.state)).toEqual(["IL", "IL"]);
    expect(cache.states.map((s: any) => s.code)).toEqual(["IL"]);
    expect(r.stdout).toMatch(/IL: 2 notices, 70 employees \(1 rows list a worksite in another state; kept as IL\)/);
  });

  it("treats a quote in the middle of an unquoted field as a literal, not as the start of a quoted field", () => {
    // One stray inch mark used to swallow every following comma and newline
    // into a single field, shifting every later column of the file.
    const n = normalizeOne("nj", 'Company,City,Effective Date,Employees\nAcme 12" Pipe Co,Newark,2026-02-01,50\nNext Co,Camden,2026-03-01,60\n');
    expect(n).toMatchObject({ employer: 'Acme 12" Pipe Co', city: "Newark", effectiveDate: "2026-02-01", employees: 50 });
  });

  it("reads the first figure of a headcount cell, never a concatenation of every digit", () => {
    const csv =
      "Company,City,Notice Date,Employees\n" +
      "Range Co,A,2026-01-01,50-75\n" +
      "Thousands Co,A,2026-01-01,\"1,200\"\n" +
      "Note Co,A,2026-01-01,Up to 300\n" +
      "Amended Co,A,2026-01-01,45 (amended)\n" +
      "Unknown Co,A,2026-01-01,TBA\n" +
      "List Co,A,2026-01-01,100 / 50\n";
    const dir = mkdtempSync(join(tmpdir(), "warn-norm-"));
    writeFileSync(join(dir, "ri.csv"), csv);
    const out = join(dir, "out.json");
    expect(runNormalizer(dir, out, join(dir, "missing.json")).status).toBe(0);
    const employees = JSON.parse(readFileSync(out, "utf8")).notices.map((n: any) => n.employees);
    expect(employees).toEqual([50, 1200, 300, 45, 0, 100]);
  });

  it("reads the headcount columns of Iowa, Indiana, Nebraska, Utah and Wisconsin", () => {
    // Header rows from the 2026-09-11 run; all five parsed with 0 employees before.
    const ia = normalizeOne(
      "ia",
      "Company,Address Line 1,City,County,St,ZIP,Notice Type,Emp #,Notice Date,Layoff Date,Local Workforce Area,Industry\n" +
        "CNH Industrial America LLC ,1930 Des Moines Ave,Burlington,Des Moines,IA,52601,Closing ,7,2026-01-20 00:00:00,2026-03-02 00:00:00,Mississippi Valley ,Manufacturing \n"
    );
    expect(ia).toMatchObject({ employer: "CNH Industrial America LLC", employees: 7, noticeDate: "2026-01-20", effectiveDate: "2026-03-02", city: "Burlington", county: "Des Moines", layoffType: "Closing" });
    const inn = normalizeOne(
      "in",
      "Company,City,Affected Workers,Notice Date,LO/CL Date,NAICS,Description of Work/Industry,Notice Type,\n" +
        "PMG Indiana,Columbus,150,9/2/2026,12/31/2026,336110,Automobile and Light Duty Motor Vehicle Manufacturing,CL,\n"
    );
    expect(inn).toMatchObject({ employer: "PMG Indiana", employees: 150, noticeDate: "2026-09-02", effectiveDate: "2026-12-31", layoffType: "CL" });
    const ne = normalizeOne("ne", "Date,Company,Type,Jobs Affected,City,Location\n08/26/2026,Fortrex 0129 Madison,,91,,Madison\n");
    // An empty City cell falls through to Location.
    expect(ne).toMatchObject({ employer: "Fortrex 0129 Madison", employees: 91, noticeDate: "2026-08-26", city: "Madison" });
    const ut = normalizeOne("ut", "Date of Notice,Company Name,Location,Affected Workers\n10/30/26,Point Designs,Bountiful,8\n");
    expect(ut).toMatchObject({ employer: "Point Designs", employees: 8, noticeDate: "2026-10-30", city: "Bountiful" });
    const wi = normalizeOne(
      "wi",
      "Company,City,Affected Workers,Notice Received,Original Notice Type / Update Type,Layoff Begin Date,NAICS Description,CountyWorkforce Development Area\n" +
        "Semco Windows and Doors,Merrill,141,20200102,CL,12/31/2019,Wood Window & Door Mfg.,Lincoln,North Central\n"
    );
    // yyyymmdd notice date; the county header is fused with the next column's name in the file.
    expect(wi).toMatchObject({ employer: "Semco Windows and Doors", employees: 141, noticeDate: "2020-01-02", effectiveDate: "2019-12-31", layoffType: "CL", county: "Lincoln" });
  });

  it("keeps the earlier snapshot when a read comes back under half of it, unless told to accept it", () => {
    // Arizona: 460 rows in one run, 91 an hour later. Archives only grow.
    const dir = mkdtempSync(join(tmpdir(), "warn-norm-"));
    const rows = Array.from({ length: 10 }, (_, i) => `Co ${i},Phoenix,2026-01-0${(i % 9) + 1},5`).join("\n");
    writeFileSync(join(dir, "az.csv"), `Company,City,Notice Date,Employees\n${rows}\n`);
    const prev = {
      ...PREVIOUS_CACHE,
      states: [{ code: "AZ", count: 40, portal: "old", scrapedAt: "2026-09-01T09:00:00Z" }],
      notices: Array.from({ length: 40 }, (_, i) => ({ employer: `Old ${i}`, city: null, county: null, state: "AZ", noticeDate: "2025-01-01", effectiveDate: null, employees: 3, layoffType: null, sourceUrl: "old" })),
    };
    writeFileSync(join(dir, "prev.json"), JSON.stringify(prev));
    writeFileSync(join(dir, "nj.csv"), 'Company,City,Effective Date,Employees\nNew Jersey Co,Trenton,2026-01-05,120\n');
    const out = join(dir, "out.json");
    const r = runNormalizer(dir, out, join(dir, "prev.json"));
    expect(r.status).toBe(0);
    const az = JSON.parse(readFileSync(out, "utf8")).states.find((s: any) => s.code === "AZ");
    expect(az).toMatchObject({ status: "carried", count: 40, scrapedAt: "2026-09-01T09:00:00Z" });
    expect(r.stderr).toMatch(/AZ: partial read — 10 rows where the last good read had 40; kept the earlier snapshot/);

    const r2 = spawnSync("node", [NORMALIZER], {
      encoding: "utf8",
      env: { ...process.env, WARN_SCRAPE_DIR: dir, WARN_SCRAPER_OUT: out, WARN_SCRAPER_PREVIOUS: join(dir, "prev.json"), WARN_ACCEPT_PARTIAL: "az" },
    });
    expect(r2.status).toBe(0);
    expect(JSON.parse(readFileSync(out, "utf8")).states.find((s: any) => s.code === "AZ")).toMatchObject({ status: "fresh", count: 10 });
  });

  it("skips positional rows whose width does not match the layout, and says how many", () => {
    const dir = mkdtempSync(join(tmpdir(), "warn-norm-"));
    writeFileSync(
      join(dir, "md.csv"),
      "\n" +
        '08/31/2026,459510,"ThriftBooks Global, LLC","4734 Trident Court",Baltimore County,136,10/31/2026,Plant Closure\n' +
        "08/25/2026,541810,Short Row Co,Anne Arundel County,20,10/30/2026,Mass Layoff\n"
    );
    const out = join(dir, "out.json");
    const r = runNormalizer(dir, out, join(dir, "missing.json"));
    expect(r.status).toBe(0);
    expect(JSON.parse(readFileSync(out, "utf8")).notices).toHaveLength(1);
    expect(r.stdout).toMatch(/MD: 1 notices, 136 employees \(1 rows skipped: not MD's 8-column layout\)/);
  });

  it("never matches a generic word like `title` as a substring of another column", () => {
    const n = normalizeOne("xx", "job_title,company,notice_date,employees\nWelder,Widget Co,2026-01-01,12\n");
    expect(n.employer).toBe("Widget Co");
  });

  it("does not pass an effective date off as a notice date", () => {
    // Unchanged behaviour from before the rewrite, pinned: a state whose only
    // date column is the layoff date (NJ) gets noticeDate null.
    const dir = mkdtempSync(join(tmpdir(), "warn-norm-"));
    writeFileSync(join(dir, "nj.csv"), 'Company,City,Effective Date,Employees\nNew Jersey Co,Trenton,2026-01-05,120\n');
    const out = join(dir, "out.json");
    expect(runNormalizer(dir, out, join(dir, "missing.json")).status).toBe(0);
    const [n] = JSON.parse(readFileSync(out, "utf8")).notices;
    expect(n).toMatchObject({ noticeDate: null, effectiveDate: "2026-01-05", employees: 120 });
  });
});

// ── The build script ────────────────────────────────────────────────────────

describe("build-warn.ts", () => {
  it("never reads a state from the scraper cache when a live adapter fetched it", () => {
    // Both describe the same filings with different column conventions; the
    // dedupe key cannot always reconcile them, so a live state owns its rows.
    expect(BUILD_WARN).toMatch(/if \(stateMeta\.has\(code\)\) \{\s*droppedForLive\+\+;\s*continue;/);
  });

  it("derives the coverage note from the states actually present, not a fixed list", () => {
    // The old note named "TX, OR, CA" as live while Oregon had been 403-ing for weeks.
    expect(BUILD_WARN).not.toMatch(/portals \(TX, OR, CA\)/);
    expect(BUILD_WARN).toMatch(/liveCodes\.join\(", "\)/);
  });

  it("stamps every state with how and when its rows were read", () => {
    expect(BUILD_WARN).toMatch(/via: m\.via, asOf: m\.asOf/);
  });
});
