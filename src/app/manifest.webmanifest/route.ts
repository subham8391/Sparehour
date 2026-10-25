// The manifest, with the colours the page asks for (`?bar=rrggbb&paper=rrggbb`, features/pwa/system-bars.tsx): Chrome
// paints an installed app's navigation bar from the manifest it fetches, so the bar can follow the person's look and
// theme. Anything that is not a plain hex colour is ignored and the defaults stand.
import { NextResponse } from "next/server";
import { hexParam } from "@/features/pwa/bar-colors";
import { buildManifest } from "@/features/pwa/manifest";

export function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  return NextResponse.json(buildManifest({ bar: hexParam(params.get("bar")), paper: hexParam(params.get("paper")) }), {
    headers: { "content-type": "application/manifest+json", "cache-control": "public, max-age=0, must-revalidate" },
  });
}
