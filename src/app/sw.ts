// The service worker (SYSTEM_DESIGN.md §10.1): caches the shell, the hashed
// chunks and the SQLite wasm — never data, which lives in SQLite. A new
// version waits until the person chooses to reload (§10.2). Push (§7.2):
// the same payload Safari renders declaratively is shown here with buttons
// where the platform has them; a tap or a button opens the deep link.
import { defaultCache } from "@serwist/next/worker";
import { CacheFirst, NetworkFirst, Serwist, type PrecacheEntry, type SerwistGlobalConfig } from "serwist";
import { ACTION_LABELS, isPushAction, supportsActions, withAction } from "../features/notifications/actions";

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

interface PushBody {
  notification?: { title?: string; body?: string; navigate?: string; silent?: boolean; lang?: string };
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
  event.waitUntil(
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
