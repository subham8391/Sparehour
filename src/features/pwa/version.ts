// The forced update's one rule (SYSTEM_DESIGN.md §4.7 "Version gating",
// §10.2): when GET /api/bootstrap's min_client_version is above this build,
// the app blocks with "Update required". Builds are stamped "YYYY.MM.DD.HHMM"
// (next.config.ts) and compared part by part as numbers; a build with no
// numbers in it ("dev") is never gated, and neither is anything when the gate
// is unset or unreadable. Pure, so it is tested without a server.

export interface Bootstrap {
  min_client_version: string | null;
  server_time?: string;
}

function parts(version: string): number[] | null {
  const found = version.match(/\d+/g);
  return found ? found.map(Number) : null;
}

/** Negative when `a` is the older build, positive when newer, 0 when the same; parts missing on one side count as 0. */
export function compareBuilds(a: string, b: string): number {
  const x = parts(a) ?? [];
  const y = parts(b) ?? [];
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] ?? 0) - (y[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

/** Whether this build is below the oldest one allowed. */
export function isUpdateRequired(build: string, min: string | null | undefined): boolean {
  if (typeof min !== "string" || !parts(min) || !parts(build)) return false;
  return compareBuilds(build, min) < 0;
}

/** Reads /api/bootstrap; null when it cannot be reached or says nothing usable, which never blocks. */
export async function fetchBootstrap(fetchImpl: typeof fetch = fetch): Promise<Bootstrap | null> {
  try {
    const res = await fetchImpl("/api/bootstrap", { cache: "no-store", headers: { accept: "application/json" } });
    if (!res.ok) return null;
    const body = (await res.json()) as Partial<Bootstrap> | null;
    return { min_client_version: typeof body?.min_client_version === "string" ? body.min_client_version : null, server_time: body?.server_time };
  } catch {
    return null;
  }
}
