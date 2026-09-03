// =============================================================================
// scripts/social-verify-og.ts — does a share page give a crawler a real card?
//
//   npm run social:verify-og -- --base=https://immigrationclock.com
//   npm run social:verify-og -- --base=http://localhost:3000 --path=/what-changed/<slug>
//
// Fetches a share page the way X's crawler does (Twitterbot user agent, no
// cookies, no JavaScript), reads the Open Graph and Twitter tags out of the
// server-rendered HTML, then fetches the image they point at and checks it is
// a real PNG of the right size, served with 200 and image/png, with no
// authentication in the way. Exits non-zero on any miss.
//
// This is the check the first design never had, and it is why every post for
// three weeks carried the generic brand card: the tag looked right and nobody
// fetched what it pointed at.
// =============================================================================

import { EVENTS } from "../src/lib/event-store";
import { changePath } from "../src/lib/share";

function arg(name: string, fallback?: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=").slice(1).join("=") : fallback;
}

const UA = "Twitterbot/1.0";

function meta(html: string, key: string): string | null {
  const re = new RegExp(`<meta[^>]+(?:property|name)=["']${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["'][^>]*content=["']([^"']+)["']`, "i");
  const m = re.exec(html);
  if (m) return m[1];
  const re2 = new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["']${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["']`, "i");
  const m2 = re2.exec(html);
  return m2 ? m2[1] : null;
}

/**
 * Where to fetch the card from. The tag always carries the production URL,
 * because that is what a crawler must be handed; but when the page itself
 * came from somewhere else — a local `next start`, a preview deploy — the
 * check must exercise the build in front of it, not whatever production is
 * serving today. So the image is fetched from the page's own origin at the
 * tag's path, and the report says so.
 */
function imageUrlFor(ogImage: string, base: string): { url: string; rehomed: boolean } {
  try {
    const img = new URL(ogImage);
    const home = new URL(base);
    if (img.origin === home.origin) return { url: ogImage, rehomed: false };
    return { url: `${home.origin}${img.pathname}${img.search}`, rehomed: true };
  } catch {
    return { url: ogImage, rehomed: false };
  }
}

async function check(base: string, path: string): Promise<boolean> {
  const url = `${base.replace(/\/$/, "")}${path}`;
  console.log(`\n── ${url}`);
  const res = await fetch(url, { headers: { "User-Agent": UA }, redirect: "follow", signal: AbortSignal.timeout(30_000) });
  const html = await res.text();
  console.log(`   page      : HTTP ${res.status}, ${html.length} bytes`);
  let ok = res.status === 200;

  const ogImage = meta(html, "og:image");
  const twImage = meta(html, "twitter:image");
  const card = meta(html, "twitter:card");
  const canonical = /<link[^>]+rel=["']canonical["'][^>]*href=["']([^"']+)["']/i.exec(html)?.[1] ?? null;
  console.log(`   og:image  : ${ogImage ?? "MISSING"}`);
  console.log(`   tw:image  : ${twImage ?? "MISSING"}`);
  console.log(`   tw:card   : ${card ?? "MISSING"}`);
  console.log(`   canonical : ${canonical ?? "MISSING"}`);

  if (!ogImage || !/^https?:\/\//.test(ogImage)) {
    console.log("   ✗ og:image must be an absolute URL");
    ok = false;
  }
  if (card !== "summary_large_image") {
    console.log("   ✗ twitter:card must be summary_large_image");
    ok = false;
  }
  if (ogImage && ogImage.endsWith("/brand/og-image.png")) {
    console.log("   ✗ this page still carries the GENERIC brand card");
    ok = false;
  }

  if (ogImage) {
    const target = imageUrlFor(ogImage, base);
    if (target.rehomed) console.log(`   fetching  : ${target.url} (the tag points at production; checking this origin's build)`);
    const img = await fetch(target.url, { headers: { "User-Agent": UA }, redirect: "follow", signal: AbortSignal.timeout(30_000) });
    const type = img.headers.get("content-type") ?? "";
    const buf = new Uint8Array(await img.arrayBuffer());
    const isPng = buf.length > 24 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
    const width = isPng ? (buf[16] << 24) | (buf[17] << 16) | (buf[18] << 8) | buf[19] : 0;
    const height = isPng ? (buf[20] << 24) | (buf[21] << 16) | (buf[22] << 8) | buf[23] : 0;
    console.log(`   image     : HTTP ${img.status}, ${type}, ${buf.length} bytes, ${isPng ? `${width}×${height}` : "not a PNG"}`);
    if (img.status !== 200 || !type.startsWith("image/png") || !isPng || width !== 1200 || height !== 630) {
      console.log("   ✗ the card must be a 200 image/png at 1200×630");
      ok = false;
    }
    if (buf.length > 5 * 1024 * 1024) {
      console.log("   ✗ X rejects images over 5MB");
      ok = false;
    }
  }

  console.log(ok ? "   ✓ crawler-ready" : "   ✗ NOT crawler-ready");
  return ok;
}

async function main() {
  const base = arg("base", "https://immigrationclock.com") as string;
  const explicit = arg("path");
  const paths = explicit
    ? [explicit]
    : [
        changePath(EVENTS.find((e) => e.severity !== "routine") ?? EVENTS[0]),
        "/explained/proposed-rule-vs-final-rule",
        "/insights/h1b-sponsor-concentration",
        "/what-changed",
      ];

  let allOk = true;
  for (const p of paths) {
    try {
      if (!(await check(base, p))) allOk = false;
    } catch (err) {
      console.log(`   ✗ ${(err as Error).message}`);
      allOk = false;
    }
  }
  console.log(allOk ? "\nAll share pages are crawler-ready." : "\nAt least one share page is NOT crawler-ready.");
  if (!allOk) process.exitCode = 1;
}

main();
