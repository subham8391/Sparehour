import fs from "node:fs";
import type { NextConfig } from "next";
import { PHASE_PRODUCTION_BUILD } from "next/constants";

// The repo sits inside a folder with other projects, so Turbopack is told where the root is
// rather than inferring it. Resolving the real path lets the tree be reached through a symlink
// (a git worktree, a checkout under /private/var); TURBOPACK_ROOT overrides it when it must.
const TURBOPACK_ROOT = process.env.TURBOPACK_ROOT ?? fs.realpathSync(__dirname);

// Where the sync service lives from the app server's point of view. With the
// client pointed at `/powersync` (NEXT_PUBLIC_POWERSYNC_URL), the browser
// talks to its own origin and this rewrite carries the stream through — the
// sync worker then never needs a cross-origin fetch, which some embedded
// browsers refuse. Talking to PowerSync directly still works by giving the
// client an absolute URL.
const POWERSYNC_INTERNAL_URL = (process.env.POWERSYNC_INTERNAL_URL ?? "http://localhost:8080").replace(/\/$/, "");

const nextConfig: NextConfig = {
  turbopack: { root: TURBOPACK_ROOT },
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

/** "2026.10.07.1530": the build's UTC minute, so builds sort and /api/bootstrap's min_client_version can name the oldest one allowed (SYSTEM_DESIGN.md §10.2). */
export function buildStamp(at: Date): string {
  const two = (n: number) => String(n).padStart(2, "0");
  return `${at.getUTCFullYear()}.${two(at.getUTCMonth() + 1)}.${two(at.getUTCDate())}.${two(at.getUTCHours())}${two(at.getUTCMinutes())}`;
}

export default function config(phase: string): NextConfig {
  if (phase !== PHASE_PRODUCTION_BUILD) return nextConfig;
  // Stamped once per build, before the bundles read it (the build's workers inherit it); a set NEXT_PUBLIC_BUILD_ID
  // wins, and `next dev` stays "dev", which is never gated.
  process.env.NEXT_PUBLIC_BUILD_ID ||= buildStamp(new Date());
  return { ...nextConfig, env: { NEXT_PUBLIC_BUILD_ID: process.env.NEXT_PUBLIC_BUILD_ID } };
}
