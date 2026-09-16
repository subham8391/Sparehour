import type { NextConfig } from "next";

// Where the sync service lives from the app server's point of view. With the
// client pointed at `/powersync` (NEXT_PUBLIC_POWERSYNC_URL), the browser
// talks to its own origin and this rewrite carries the stream through — the
// sync worker then never needs a cross-origin fetch, which some embedded
// browsers refuse. Talking to PowerSync directly still works by giving the
// client an absolute URL.
const POWERSYNC_INTERNAL_URL = (process.env.POWERSYNC_INTERNAL_URL ?? "http://localhost:8080").replace(/\/$/, "");

const nextConfig: NextConfig = {
  // The repo sits inside a folder with other projects; keep Turbopack's root here.
  turbopack: { root: __dirname },
  // `next build` type-checks the whole tree, tests included, which `npm run typecheck` already does;
  // a local build may skip it (SKIP_TYPECHECK=1) while a test file elsewhere is mid-edit. CI never sets it.
  typescript: { ignoreBuildErrors: process.env.SKIP_TYPECHECK === "1" },
  experimental: {
    // Keeps prefetched routes navigable through a connectivity drop (SYSTEM_DESIGN.md §10.1).
    useOffline: true,
  },
  async rewrites() {
    // Only what the sync client needs: the stream and the write checkpoint. The
    // service's probes and admin surface stay inside the network.
    return [
      { source: "/powersync/sync/:path*", destination: `${POWERSYNC_INTERNAL_URL}/sync/:path*` },
      { source: "/powersync/write-checkpoint2.json", destination: `${POWERSYNC_INTERNAL_URL}/write-checkpoint2.json` },
    ];
  },
  async headers() {
    const headers = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
      // Never framed: the app has no embedding use and the session cookie is worth protecting.
      { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
    ];
    if (process.env.NODE_ENV === "production" && (process.env.NEXT_PUBLIC_APP_URL ?? "").startsWith("https://")) {
      headers.push({ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" });
    }
    return [{ source: "/:path*", headers }];
  },
};

export default nextConfig;
