// The web app manifest (SYSTEM_DESIGN.md §10.5), served by app/manifest.webmanifest/route.ts. `shortcuts` work on
// Android and desktop and are ignored on iOS; so does `share_target`, which puts Sparehour in Android's share sheet
// once installed: what is shared opens /share, to be saved to a list (DECISIONS.md, amendment 2026-10-22).
// Chrome on Android paints an installed app's navigation bar with `theme_color`, read from the manifest it fetches,
// and a manifest holds one colour: so the page asks for its own (features/pwa/system-bars.tsx puts the look's tab
// bar colour and paper in the manifest link), and without them both are Sky's dark paper (DECISIONS.md, amendments
// 2026-10-23 and 2026-10-25). The icons are the mark on paper: `any` keeps its own rounded corners, `maskable` is
// full-bleed so a launcher can cut its own shape (the two are separate files on purpose).
import type { MetadataRoute } from "next";
import { PAPER } from "@/features/commands/theme";

export function buildManifest(colours: { bar?: string | null; paper?: string | null } = {}): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Sparehour",
    short_name: "Sparehour",
    description: "A calm planner that knows how much free time you really have.",
    start_url: "/today?src=pwa",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: colours.paper ?? PAPER.dark,
    theme_color: colours.bar ?? PAPER.dark,
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    share_target: { action: "/share", method: "GET", params: { title: "title", text: "text", url: "url" } },
    shortcuts: [
      { name: "Add a task", short_name: "Add", url: "/today?quickadd=1", icons: [{ src: "/icon-192.png", sizes: "192x192" }] },
      { name: "Today", short_name: "Today", url: "/today", icons: [{ src: "/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
