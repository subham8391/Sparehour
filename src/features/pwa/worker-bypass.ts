// What the service worker leaves to the browser (SYSTEM_DESIGN.md §10.1). No
// DOM, no React: the worker bundle imports this file directly.

/** Responses that never end on their own: the sync service's streams, and server-sent events should one appear. */
const STREAM_TYPES = ["text/event-stream", "application/x-ndjson", "application/vnd.powersync.bson-stream"];

/**
 * True for a request the worker must not answer, so its fetch handler holds no event open for it and caches none of it:
 * - another origin: Supabase's auth and data (`auth.getUser()` carries the session's bearer token), an absolute sync
 *   URL — the shell never comes from there;
 * - the sync service through our origin (`/powersync/…`, rewritten in next.config.ts): its stream stays open as long
 *   as the app does, and a worker holding an event that long never lets a waiting version activate, so "Reload" on
 *   "A new version is ready" did nothing;
 * - route handlers (`/api/…`) and the sign-in callback (`/auth/…`): data and credentials, above all the five-minute sync
 *   token, which a cache would hand back long expired;
 * - anything that asks for a stream;
 * - Turbopack's worker bootstrap (below).
 */
export function bypassesWorker(request: Pick<Request, "url" | "headers">, origin: string): boolean {
  const url = new URL(request.url, origin);
  if (url.origin !== origin) return true;
  if (/^\/(?:powersync|api|auth)(?:\/|$)/.test(url.pathname)) return true;
  if (isWorkerBootstrap(url.pathname)) return true;
  const accept = request.headers.get("accept") ?? "";
  return STREAM_TYPES.some((type) => accept.includes(type));
}

/**
 * Turbopack starts a web worker through a small bootstrap script that reads its chunk list from the script
 * URL's #fragment. A response handed over by a service worker carries no fragment, so the worker started
 * without its config ("Missing worker bootstrap config"), PowerSync's database worker never opened, and every
 * visit after the first stayed on "Opening…" (found by the end-to-end walkthrough). These scripts are left to
 * the browser: the hashed file sits in its HTTP cache for a year, which also covers an offline start. Any folder under
 * `/_next/static/`: Vercel serves the chunks from `/_next/static/immutable/chunks/`, and matching only `chunks/` sent
 * the first hosted deploy back to "Opening…" on every load after the worker took over (laptop and Android alike).
 */
export const isWorkerBootstrap = (pathname: string) => /^\/_next\/static\/(?:[^?#]*\/)?turbopack-worker-[^/]*\.js$/.test(pathname);
