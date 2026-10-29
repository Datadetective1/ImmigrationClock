// =============================================================================
// NO EM DASHES IN TEXT A READER SEES
//
// A partner reading the site took its em dashes as the mark of machine-written
// copy. The site was swept clean; this keeps it that way. It walks every string,
// template and JSX text node under the reader-facing source with the TypeScript
// parser, so code comments are not counted, and fails on any em dash it finds.
//
// Allowed: a string that is only a dash (the empty-cell marker in tables and
// stat tiles) and HTML comments inside email templates, which nobody sees.
// The social pipeline's model instructions are internal and are left out; its
// posts are held to the same rule by the post validator instead.
// =============================================================================

import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const DIRS = ["src/app", "src/components", "src/lib", "src/domains"];
const SKIP = [/^src\/lib\/generated\//, /^src\/lib\/social\//];
// Social files whose strings reach readers: image captions and page descriptions.
const SOCIAL_READER_FACING = ["src/lib/social/visuals.ts", "src/lib/social/links.ts"];

const TEXT_KINDS = new Set([
  ts.SyntaxKind.StringLiteral,
  ts.SyntaxKind.NoSubstitutionTemplateLiteral,
  ts.SyntaxKind.TemplateHead,
  ts.SyntaxKind.TemplateMiddle,
  ts.SyntaxKind.TemplateTail,
  ts.SyntaxKind.JsxText,
]);

function sourceFiles(dir: string): string[] {
  return readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap((entry) => {
    const rel = `${dir}/${entry.name}`;
    if (entry.isDirectory()) return sourceFiles(rel);
    return /\.tsx?$/.test(entry.name) ? [rel] : [];
  });
}

function dashesIn(rel: string): string[] {
  const text = readFileSync(join(ROOT, rel), "utf8");
  if (!text.includes("—")) return [];
  const kind = rel.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const file = ts.createSourceFile(rel, text, ts.ScriptTarget.Latest, true, kind);
  const found: string[] = [];
  const visit = (node: ts.Node) => {
    if (TEXT_KINDS.has(node.kind)) {
      const raw = node.getText(file);
      const body = raw.replace(/<!--[\s\S]*?-->/g, "");
      const onlyAMarker = /^["'`}]?\s*—\s*["'`${]*$/.test(body.trim());
      if (body.includes("—") && !onlyAMarker) {
        const { line } = file.getLineAndCharacterOfPosition(node.getStart(file));
        found.push(`${rel}:${line + 1}: ${raw.replace(/\s+/g, " ").slice(0, 120)}`);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return found;
}

describe("reader-facing copy", () => {
  it("has no em dashes", () => {
    const files = DIRS.flatMap(sourceFiles)
      .map((f) => relative(ROOT, join(ROOT, f)))
      .filter((f) => !SKIP.some((re) => re.test(f)))
      .concat(SOCIAL_READER_FACING);
    expect(files.length).toBeGreaterThan(100);
    expect(files.flatMap(dashesIn)).toEqual([]);
  });
});
