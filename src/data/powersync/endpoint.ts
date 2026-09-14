/**
 * The sync endpoint. A path such as `/powersync` means "this origin" — the
 * app server rewrites it to the service (next.config.ts) — so the sync worker
 * never makes a cross-origin request. An absolute URL is used as given. The
 * SDK rejects a trailing slash, so one is never returned.
 */
export function resolvePowerSyncUrl(configured: string | undefined, origin: string): string {
  const value = (configured ?? "http://localhost:8080").replace(/\/$/, "");
  return value.startsWith("/") ? `${origin}${value}` : value;
}
