import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { allPartners } from "@/lib/partners";
import { placementSubId, withPlacement } from "@/lib/partner-link";
import { KEY_DATES } from "@/lib/key-dates";

// The ImmiTranslate referral link is the only tracked affiliate link the site
// has. Its program reads the placement from `sub`, not `subid`, and the
// referral id `ref` is what pays the commission — so appending a placement must
// never disturb it.

const REF = "https://immitranslate.com/?ref=948mg968";
const read = (p: string) => readFileSync(join(__dirname, "..", p), "utf8");

describe("ImmiTranslate referral link", () => {
  const translation = allPartners().find((p) => p.id === "document-translation")!;

  it("resolves to the referral URL, uses `sub`, and stays a labelled partner", () => {
    expect(translation.href).toBe(REF);
    expect(translation.subParam).toBe("sub");
    expect(translation.kind).toBe("partner");
  });

  it("appends the placement as `sub` and keeps `ref` intact", () => {
    const out = withPlacement(translation.href, "resources-documents", translation.subParam);
    expect(out).toBe("https://immitranslate.com/?ref=948mg968&sub=ic_resources_documents");
    expect(new URL(out).searchParams.get("ref")).toBe("948mg968");
    expect(new URL(out).searchParams.has("subid")).toBe(false);
  });

  it("is placed on /resources and beside key dates", () => {
    expect(KEY_DATES.some((d) => d.partnerIds.includes("document-translation"))).toBe(true);
  });
});

describe("placement sub-ids", () => {
  it("are letters, digits and underscores only", () => {
    expect(placementSubId("home-h1b-registration")).toBe("ic_home_h1b_registration");
    expect(placementSubId("Key Dates/Page")).toBe("ic_key_dates_page");
  });

  it("default to `subid` for other programs and never overwrite an existing value", () => {
    expect(withPlacement("https://example.com/", "x")).toBe("https://example.com/?subid=ic_x");
    expect(withPlacement(`${REF}&sub=keep`, "x", "sub")).toBe(`${REF}&sub=keep`);
    expect(withPlacement("not a url", "x", "sub")).toBe("not a url");
  });
});

describe("every partner link keeps its disclosure and tracking", () => {
  for (const file of ["src/components/ResourcePanel.tsx", "src/components/KeyDates.tsx"]) {
    it(file, () => {
      const src = read(file);
      expect(src).toMatch(/withPlacement\([^)]*\.subParam\)/);
      expect(src).toContain('"sponsored nofollow noopener noreferrer"');
      expect(src).toContain("trackPartnerClick(");
    });
  }
});
