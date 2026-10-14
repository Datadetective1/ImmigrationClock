import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Script } from "node:vm";

// Workflows pass JavaScript to `node -e "…"` inside bash double quotes. Bash
// ends the argument at the first unescaped `"`, wherever it falls — including
// inside a JS comment. From 2026-10-08 a comment in refresh-data.yml quoted a
// phrase, the script was cut short, and the daily refresh failed every run for
// a week while the site served stale data. These tests read each inline script
// the way bash does and fail if it ends anywhere but its real closing quote.

const DIR = join(__dirname, "..", ".github", "workflows");
const OPEN = 'node -e "';

interface InlineScript {
  file: string;
  line: number;
  body: string;
  after: string;
}

function inlineScripts(): InlineScript[] {
  const out: InlineScript[] = [];
  for (const file of readdirSync(DIR).filter((f) => /\.ya?ml$/.test(f))) {
    const text = readFileSync(join(DIR, file), "utf8");
    let from = 0;
    for (;;) {
      const start = text.indexOf(OPEN, from);
      if (start === -1) break;
      let i = start + OPEN.length;
      // The first `"` not preceded by a backslash is where bash ends the argument.
      while (i < text.length && !(text[i] === '"' && text[i - 1] !== "\\")) i++;
      const lineEnd = text.indexOf("\n", i);
      out.push({
        file,
        line: text.slice(0, start).split("\n").length,
        body: text.slice(start + OPEN.length, i),
        after: text.slice(i + 1, lineEnd === -1 ? undefined : lineEnd),
      });
      from = i + 1;
    }
  }
  return out;
}

describe("inline node -e scripts in workflows", () => {
  const scripts = inlineScripts();

  it("finds the scripts it is meant to guard", () => {
    expect(scripts.some((s) => s.file === "refresh-data.yml")).toBe(true);
  });

  it.each(scripts.map((s) => [`${s.file}:${s.line}`, s] as const))(
    "%s ends at its real closing quote",
    (_where, s) => {
      // What legitimately follows the closing quote: end of line, `)` closing a
      // command substitution, or a shell operator. A word means bash closed the
      // string early, on a quote inside the script.
      expect(s.after).toMatch(/^\s*($|\)|;|&&|\|\||\||>|<|#)/);
    },
  );

  it.each(scripts.map((s) => [`${s.file}:${s.line}`, s] as const))("%s compiles", (_where, s) => {
    expect(() => new Script(s.body)).not.toThrow();
  });
});
