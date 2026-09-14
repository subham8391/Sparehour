// The service worker (SYSTEM_DESIGN.md §10.1): caches the shell, the hashed
// chunks and the SQLite wasm — never data, which lives in SQLite. A new
// version waits until the person chooses to reload (§10.2). Push handlers
// arrive with P9.
import { defaultCache } from "@serwist/next/worker";
import { CacheFirst, NetworkFirst, Serwist, type PrecacheEntry, type SerwistGlobalConfig } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: false,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    {
      matcher: ({ request }) => request.destination === "document",
      handler: new NetworkFirst({ cacheName: "shell", networkTimeoutSeconds: 3 }),
    },
    {
      matcher: ({ url }) => url.pathname.startsWith("/_next/static/"),
      handler: new CacheFirst({ cacheName: "static" }),
    },
    {
      matcher: ({ url }) => url.pathname.endsWith(".wasm"),
      handler: new CacheFirst({ cacheName: "wasm" }),
    },
    ...defaultCache,
  ],
  fallbacks: {
    entries: [{ url: "/offline", matcher: ({ request }) => request.destination === "document" }],
  },
});

serwist.addEventListeners();
