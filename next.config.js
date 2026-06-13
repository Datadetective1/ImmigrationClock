/** @type {import('next').NextConfig} */
const nextConfig = {
  // The dashboard renders entirely from the bundled data layer with no
  // server-side runtime needs, so we export a fully static site. Netlify (or any
  // static host) serves the `out/` directory directly — no Next.js runtime
  // plugin or serverless functions required.
  output: "export",
  reactStrictMode: true,
  poweredByHeader: false,
  trailingSlash: false,
  images: {
    unoptimized: true,
  },
};

module.exports = nextConfig;
