import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

import { PARTNERS_ALL } from "@/lib/partners";
import { sanitizeSearchTerm } from "@/lib/analytics";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (rel: string) => readFileSync(join(root, rel), "utf8");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(join(root, dir))) {
    const rel = `${dir}/${name}`;
    if (statSync(join(root, rel)).isDirectory()) walk(rel, out);
    else if (rel.endsWith(".tsx")) out.push(rel);
  }
  return out;
}

const APP_PAGES = walk("src/app").filter((p) => p.endsWith("page.tsx"));

// =============================================================================
// Founder Directive Part 1: "Not a content farm." Part 5: "Whenever there is
// tension between increasing short-term revenue and preserving long-term trust:
// choose trust." Commercial content lives on /resources and nowhere else.
// =============================================================================
describe("editorial separation", () => {
  it("renders affiliate resources on /resources only", () => {
    const offenders = APP_PAGES.filter(
      (p) => !p.includes("app/resources/") && read(p).includes("<ResourcePanel")
    );
    expect(offenders, `affiliate panel outside /resources: ${offenders.join(", ")}`).toEqual([]);
  });

  it("has removed display advertising from the platform entirely", () => {
    expect(existsSync(join(root, "src/components/AdSlot.tsx"))).toBe(false);
    expect(existsSync(join(root, "src/components/AdSenseScript.tsx"))).toBe(false);
    expect(existsSync(join(root, "src/app/ads.txt"))).toBe(false);
    for (const p of APP_PAGES) {
      expect(read(p), `${p} still renders an ad slot`).not.toContain("<AdSlot");
    }
    expect(read("src/app/layout.tsx")).not.toContain("AdSenseScript");
  });

  it("keeps the catalog to services answering a genuine immigration need", () => {
    const ids = PARTNERS_ALL.map((p) => p.id);
    // Generic newcomer commerce was removed: it is not immigration information.
    for (const removed of [
      "wise",
      "remitly",
      "esim",
      "intl-moving",
      "newcomer-insurance",
      "newcomer-credit",
      "visa-jobs",
      "resident-tax",
      "english-prep",
    ]) {
      expect(ids, `${removed} should have been removed from the catalog`).not.toContain(removed);
    }
    expect(ids.length).toBeLessThanOrEqual(8);
  });

  it("labels every catalog entry official or partner", () => {
    for (const p of PARTNERS_ALL) {
      expect(["official", "partner"], `${p.id} has kind "${p.kind}"`).toContain(p.kind);
    }
    // Free government/nonprofit resources must never be tracked or rel=sponsored.
    const panel = read("src/components/ResourcePanel.tsx");
    expect(panel).toContain('partner.kind === "partner"');
    expect(panel).toContain('isPartner ? "sponsored nofollow noopener noreferrer" : "noopener noreferrer"');
  });

  it("shows a cookie banner only when something actually sets cookies", () => {
    const banner = read("src/components/ConsentBanner.tsx");
    expect(banner).toContain("NEEDS_CONSENT");
    expect(banner).not.toContain("AdSense");
  });
});

// =============================================================================
// Directive Part 4 — "Every major page should communicate: Source, Last
// refreshed, Data-through date, Published date, Methodology."
// =============================================================================
describe("data-freshness contract", () => {
  const MAJOR = [
    "src/app/layoffs/page.tsx",
    "src/app/employer/[slug]/page.tsx",
    "src/app/h1b/employers/page.tsx",
    "src/app/border/encounters/page.tsx",
    "src/app/immigration/enforcement-trends/page.tsx",
    "src/app/layoffs-vs-h1b/page.tsx",
  ];

  it("renders the full source contract on every major data page", () => {
    for (const p of MAJOR) {
      expect(read(p), `${p} is missing <DataStatus>`).toContain("<DataStatus");
    }
  });

  it("resolves provenance through the registry, not free text", () => {
    const s = read("src/components/DataStatus.tsx");
    expect(s).toContain("SOURCE_BY_KEY");
    expect(s).toContain("src.limitations");
    expect(s).toContain("lastVerifiedAt");
  });
});

// =============================================================================
// Directive Part 4 — measurement must not compromise privacy.
// =============================================================================
describe("analytics privacy", () => {
  it("drops search terms containing contact details", () => {
    expect(sanitizeSearchTerm("me@example.com")).toBeNull();
    expect(sanitizeSearchTerm("case A123456789")).toBeNull();
    expect(sanitizeSearchTerm("   ")).toBeNull();
  });

  it("keeps and normalizes genuine policy questions", () => {
    expect(sanitizeSearchTerm("  Does AMAZON   sponsor H1B ")).toBe("does amazon sponsor h1b");
  });

  it("truncates long terms", () => {
    expect(sanitizeSearchTerm("a".repeat(200))!.length).toBe(60);
  });

  it("honours Do Not Track and Global Privacy Control", () => {
    const s = read("src/components/AnalyticsScripts.tsx");
    expect(s).toContain("readerOptedOut");
    expect(s).toContain("globalPrivacyControl");
  });

  it("adds no session recording or fingerprinting", () => {
    const s = read("src/lib/analytics.ts");
    for (const banned of ["fingerprint", "sessionRecord", "hotjar", "fullstory", "clarity"]) {
      expect(s.toLowerCase()).not.toContain(banned.toLowerCase());
    }
  });
});

// =============================================================================
// Directive Part 7 — "Accessibility is a product feature, not an afterthought."
// =============================================================================
describe("accessibility baseline", () => {
  it("provides a skip link as the first tab stop", () => {
    const layout = read("src/app/layout.tsx");
    expect(layout).toContain('href="#main-content"');
    expect(layout).toContain('id="main-content"');
  });

  it("keeps a visible focus ring for keyboard users", () => {
    const css = read("src/app/globals.css");
    expect(css).toContain(":focus-visible");
    expect(css).toContain("outline: 2px solid");
  });

  it("respects prefers-reduced-motion globally", () => {
    expect(read("src/app/globals.css")).toContain("prefers-reduced-motion");
  });

  it("uses a slate-500 that passes WCAG AA on our darkest surfaces", () => {
    // Secondary text carries source names, dates, and freshness — the trust
    // signals. Tailwind's default slate-500 (#64748b) fails AA here.
    const cfg = read("tailwind.config.ts");
    expect(cfg).toContain("#8b98ad");
    expect(cfg).not.toMatch(/slate:\s*\{\s*500:\s*"#64748b"/);

    const luminance = (hex: string) => {
      const c = hex
        .replace("#", "")
        .match(/../g)!
        .map((h) => parseInt(h, 16) / 255)
        .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
      return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    };
    const contrast = (a: string, b: string) => {
      const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
      return (hi + 0.05) / (lo + 0.05);
    };
    // Against both the page background and the panel background.
    expect(contrast("#8b98ad", "#05070d")).toBeGreaterThanOrEqual(4.5);
    expect(contrast("#8b98ad", "#0f1424")).toBeGreaterThanOrEqual(4.5);
  });
});

// =============================================================================
// Dead subsystems must stay dead.
// =============================================================================
describe("removed subsystems", () => {
  it("has no Prisma or Postgres surface left", () => {
    expect(existsSync(join(root, "prisma"))).toBe(false);
    expect(existsSync(join(root, "src/lib/prisma.ts"))).toBe(false);
    const pkg = JSON.parse(read("package.json"));
    expect(pkg.dependencies).not.toHaveProperty("@prisma/client");
    expect(pkg.devDependencies).not.toHaveProperty("prisma");
    expect(pkg.scripts).not.toHaveProperty("postinstall");
    expect(pkg).not.toHaveProperty("prisma");
    expect(read(".env.example")).not.toContain("DATABASE_URL");
  });

  it("has no unused Python ingestion pipeline", () => {
    expect(existsSync(join(root, "data_pipeline"))).toBe(false);
  });
});
