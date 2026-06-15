/** @type {import('next').NextConfig} */
const nextConfig = {
  // The dashboard renders entirely from the bundled data layer with no
  // server-side runtime needs, so we export a fully static site. Vercel (the
  // production host) detects Next.js and serves the exported `out/` directory as
  // pure static files — no serverless functions or image optimization, which
  // keeps usage well within the Vercel Free (Hobby) tier. Any static host works.
  output: "export",
  reactStrictMode: true,
  poweredByHeader: false,
  trailingSlash: false,
  images: {
    unoptimized: true,
  },
};

module.exports = nextConfig;
