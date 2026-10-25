// The manifest, with the colours the page asks for (features/pwa/system-bars.tsx): `?bar=rrggbb&paper=rrggbb` once the
// page has run, else the `sparehour-bars` cookie it left (the first fetch as a page loads, and an install from the
// browser menu), else Sky's dark paper. Chrome paints an installed app's navigation bar from the manifest it fetches,
// so the bar follows the person's look and theme. Anything that is not a plain hex colour is ignored.
import { NextResponse } from "next/server";
import { barsFromCookie, hexParam } from "@/features/pwa/bar-colors";
import { buildManifest } from "@/features/pwa/manifest";

export function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const saved = barsFromCookie(request.headers.get("cookie"));
  const bar = hexParam(params.get("bar")) ?? saved.bar;
  const paper = hexParam(params.get("paper")) ?? saved.paper;
  return NextResponse.json(buildManifest({ bar, paper }), {
    // Per person (the cookie): no shared cache may keep one person's colours for another.
    headers: { "content-type": "application/manifest+json", "cache-control": "private, no-cache", vary: "Cookie" },
  });
}
