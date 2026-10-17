// The service worker (SYSTEM_DESIGN.md §10.1): caches the shell, the hashed
// chunks and the SQLite wasm — never data, which lives in SQLite. A new
// version waits until the person chooses to reload (§10.2). Push (§7.2):
// the same payload Safari renders declaratively is shown here with buttons
// where the platform has them; a tap or a button opens the deep link.
import { defaultCache } from "@serwist/next/worker";
import { CacheFirst, NetworkFirst, Serwist, type PrecacheEntry, type SerwistGlobalConfig } from "serwist";
import { ACTION_LABELS, isPushAction, supportsActions, withAction } from "../features/notifications/actions";
import { bypassesWorker, isWorkerBootstrap } from "../features/pwa/worker-bypass";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

// Registered before Serwist's own listener, so for these requests that one never runs, nothing answers them and the
// browser fetches them itself: other origins, the sync service, route handlers and auth, streams, Turbopack's worker
// bootstrap (./worker-bypass says why each).
self.addEventListener("fetch", (event) => {
  if (bypassesWorker(event.request, self.location.origin)) event.stopImmediatePropagation();
});

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST?.filter((entry) => !isWorkerBootstrap(new URL(typeof entry === "string" ? entry : entry.url, self.location.origin).pathname)),
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
    // Its "apis" and "cross-origin" caches stay empty: those requests never reach Serwist (above).
    ...defaultCache,
  ],
  fallbacks: {
    entries: [{ url: "/offline", matcher: ({ request }) => request.destination === "document" }],
  },
});

serwist.addEventListeners();

interface PushBody {
  notification?: { title?: string; body?: string; navigate?: string; silent?: boolean; lang?: string; app_badge?: number };
  sh?: { kind?: string; task_id?: string | null; block_id?: string | null; actions?: string[] };
}

self.addEventListener("push", (event) => {
  let data: PushBody | null = null;
  try {
    data = event.data?.json() as PushBody;
  } catch {
    data = null;
  }
  const n = data?.notification;
  if (!n?.title) return;
  const sh = data?.sh;
  const actions = supportsActions(self.navigator.userAgent) ? (sh?.actions ?? []).filter(isPushAction).map((a) => ({ action: a, title: ACTION_LABELS[a] })) : [];
  // The app-icon badge travels with every push (today's remaining count, 0 after shutdown), so a closed app stays right.
  const badger = self.navigator as WorkerNavigator & { setAppBadge?: (count?: number) => Promise<void>; clearAppBadge?: () => Promise<void> };
  const badge = typeof n.app_badge === "number" ? (n.app_badge > 0 ? badger.setAppBadge?.(n.app_badge) : badger.clearAppBadge?.())?.catch(() => undefined) : undefined;
  event.waitUntil(
    Promise.all([
      badge,
      self.registration.showNotification(n.title, {
        body: n.body ?? "",
        icon: "/icon-192.png",
        badge: "/icon-192.png",
        lang: n.lang,
        silent: n.silent ?? false,
        tag: sh?.kind ? `${sh.kind}:${sh.block_id ?? sh.task_id ?? ""}` : undefined,
        data: { navigate: n.navigate ?? "/today?src=push", sh },
        ...(actions.length > 0 ? { actions } : {}),
      }),
    ]),
  );
});

/** A payload may only send the app to itself (defence in depth: the payload is ours, but the key could leak). */
function sameOrigin(url: string): string {
  try {
    return new URL(url, self.location.origin).origin === self.location.origin ? url : "/today?src=push";
  } catch {
    return "/today?src=push";
  }
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const data = event.notification.data as { navigate?: string } | undefined;
  const url = withAction(sameOrigin(data?.navigate ?? "/today?src=push"), event.action);
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(async (list) => {
      const client = list[0];
      if (client) {
        await client.focus();
        if ("navigate" in client) await client.navigate(url);
        return;
      }
      await self.clients.openWindow(url);
    }),
  );
});
