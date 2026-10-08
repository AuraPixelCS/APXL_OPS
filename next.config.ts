import type { NextConfig } from "next"

// AuraPixel Ops is served under aurapixel.live/ops. The landing-page project
// proxies /ops/* to apxl-ops.vercel.app (same pattern as /rsvp and /pxlchat),
// which only works with basePath set: without it every /_next/* asset would
// resolve against the landing page's own build and 404.
//
// basePath is inlined into the client bundles at build time, so it's
// re-exported through `env` as the single source of truth for lib/base-path.ts.
// Next prefixes its own output (Link, router, /_next/*, public/*); hand-built
// URLs (fetch to our API routes) go through withBasePath().
const BASE_PATH = "/ops"

const nextConfig: NextConfig = {
  basePath: BASE_PATH,
  env: { NEXT_PUBLIC_BASE_PATH: BASE_PATH },
  // Kept out of the server bundle so the Firestore client and our Vercel →
  // Google auth client share one copy of google-auth-library.
  serverExternalPackages: ["google-auth-library", "@vercel/oidc"],
  // Import moved under Sheets (2026-10-08).
  async redirects() {
    return [
      {
        source: "/leads/import",
        destination: "/sheets/import",
        permanent: false,
      },
    ]
  },
  cacheComponents: true,
  partialPrefetching: true,
  // Lets a verification build run beside a running dev server without both
  // fighting over .next. Set OPS_DIST_DIR=.next-test for the side instance.
  ...(process.env.OPS_DIST_DIR ? { distDir: process.env.OPS_DIST_DIR } : {}),
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
}

export default nextConfig
