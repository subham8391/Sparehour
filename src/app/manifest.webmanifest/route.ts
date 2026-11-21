// The manifest, with the colours the page asks for (features/pwa/system-bars.tsx): the `sparehour-bars` cookie it
// keeps current, else Sky's dark paper. Chrome paints an installed app's navigation bar from the manifest it fetches,
// so the bar follows the person's look and theme. The manifest has one address (DECISIONS.md, amendment 2026-11-21);
// `?bar=rrggbb&paper=rrggbb` is still read, for an app installed while the link carried the colours, but only where
// there is no cookie: an old address must never pin an old look. Anything that is not a plain hex colour is ignored.
import { NextResponse } from "next/server";
import { barsFromCookie, hexParam } from "@/features/pwa/bar-colors";
import { buildManifest } from "@/features/pwa/manifest";

export function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const saved = barsFromCookie(request.headers.get("cookie"));
  const bar = saved.bar ?? hexParam(params.get("bar"));
  const paper = saved.paper ?? hexParam(params.get("paper"));
  return NextResponse.json(buildManifest({ bar, paper }), {
    // Per person (the cookie): no shared cache may keep one person's colours for another.
    headers: { "content-type": "application/manifest+json", "cache-control": "private, no-cache", vary: "Cookie" },
  });
}
