// The web app manifest (SYSTEM_DESIGN.md §10.5). `shortcuts` work on
// Android and desktop and are ignored on iOS.
import type { MetadataRoute } from "next";

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
    background_color: "#f4f8f6",
    theme_color: "#f4f8f6",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Add a task", short_name: "Add", url: "/today?quickadd=1", icons: [{ src: "/icon-192.png", sizes: "192x192" }] },
      { name: "Today", short_name: "Today", url: "/today", icons: [{ src: "/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
