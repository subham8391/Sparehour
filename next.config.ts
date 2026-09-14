import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The repo sits inside a folder with other projects; keep Turbopack's root here.
  turbopack: { root: __dirname },
  experimental: {
    // Keeps prefetched routes navigable through a connectivity drop (SYSTEM_DESIGN.md §10.1).
    useOffline: true,
  },
};

export default nextConfig;
