/** @type {import('next').NextConfig} */
const nextConfig = {
  // `output: "export"` was REMOVED on 2026-08-03 to add newsletter signup.
  //
  // Everything that renders remains statically generated — all ~2,700 pages are
  // prerendered at build from the committed data layer, exactly as before, and a
  // source outage still cannot take a page down. What changed is that the app now
  // also ships ONE serverless function, /api/subscribe, because Resend requires a
  // secret API key and a static site has nowhere to keep one. A key shipped to
  // the browser is a published key.
  //
  // The tradeoff, stated plainly: there is now a runtime that can fail, and a
  // public endpoint that can be abused. The route is written accordingly — see
  // src/app/api/subscribe/route.ts. Page rendering does not depend on it, so if
  // the function is down the site is unaffected apart from signup.
  //
  // Image optimization stays off so no image traffic bills against the Vercel
  // Hobby tier.
  reactStrictMode: true,
  poweredByHeader: false,
  trailingSlash: false,
  images: {
    unoptimized: true,
  },
};

module.exports = nextConfig;
