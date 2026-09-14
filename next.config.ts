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
  experimental: {
    // Keeps prefetched routes navigable through a connectivity drop (SYSTEM_DESIGN.md §10.1).
    useOffline: true,
  },
  async rewrites() {
    return [{ source: "/powersync/:path*", destination: `${POWERSYNC_INTERNAL_URL}/:path*` }];
  },
};

export default nextConfig;
