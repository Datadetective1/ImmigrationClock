// =============================================================================
// WINDOWS SHIM FOR @vercel/og 0.6.3 — a repair for one bug, on one platform
//
// The @vercel/og build bundled with Next 14.2 locates its wasm binaries and its
// fallback font with `path.join(import.meta.url, "../file")`. On win32 that
// expression yields `.\file:\C:\…\file` — a Windows path with a URL scheme glued
// to the front, not a URL — and `fileURLToPath()` throws "Invalid URL" before a
// single card can render. Next loads the module as an external ESM file, so the
// failure reaches `next build`, `next start` and vitest alike on a Windows
// machine. On Linux and macOS `path.join` leaves the URL intact and nothing
// here runs; production builds on Vercel are unaffected either way.
//
// The repair is narrow: `url.fileURLToPath` is taught to recognise exactly that
// mangled shape and hand back the Windows path that follows the scheme.
// Everything else is passed to the original. `syncBuiltinESMExports()` pushes
// the replacement into the live ESM binding that @vercel/og imports, which is
// why this file must be evaluated before the first ImageResponse is built —
// card.tsx imports it for that side effect.
//
// Remove this file once the bundled @vercel/og resolves its assets with
// `new URL("./file", import.meta.url)` instead.
// =============================================================================

import url from "node:url";
import { syncBuiltinESMExports } from "node:module";

const MANGLED_FILE_URL = /^(?:\.[\\/])?file:[\\/]+([A-Za-z]:[\\/].*)$/;

if (process.platform === "win32") {
  const original = url.fileURLToPath;
  const repaired: typeof original = (input, options) => {
    if (typeof input === "string") {
      const m = MANGLED_FILE_URL.exec(input);
      if (m) return m[1].replace(/\//g, "\\");
    }
    return original(input, options);
  };
  url.fileURLToPath = repaired;
  syncBuiltinESMExports();
}

export {};
