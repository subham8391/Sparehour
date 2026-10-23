// The web app manifest (SYSTEM_DESIGN.md §10.5). `shortcuts` work on
// Android and desktop and are ignored on iOS; so does `share_target`, which
// puts Sparehour in Android's share sheet once installed: what is shared
// opens /share, to be saved to a list (DECISIONS.md, amendment 2026-10-22).
// Chrome on Android paints an installed app's navigation bar with
// `theme_color`, and a manifest has one colour, no dark variant (the page's
// theme-color metas only reach the status bar), so both colours are Sky's dark
// paper: a dark bar under the dark app, and the classic dark bar under the
// light one, never a white strip under a dark screen (DECISIONS.md, amendment
// 2026-10-23). The icons are the mark on
// paper: `any` keeps its own rounded corners, `maskable` is full-bleed so a
// launcher can cut its own shape (the two are separate files on purpose).
import type { MetadataRoute } from "next";
import { PAPER } from "@/features/commands/theme";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Sparehour",
    short_name: "Sparehour",
    description: "A calm planner that knows how much free time you really have.",
    start_url: "/today?src=pwa",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: PAPER.dark,
    theme_color: PAPER.dark,
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
