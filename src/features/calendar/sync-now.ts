// "Sync now" for the calendar (PRODUCT_SPEC.md §10.1): every account of the signed-in person, read again now, and
// the blocks waiting to go to Google pushed. One path for Settings › Calendar, the sync chip and Today's retry line.

/** What the person is told afterwards, in plain words. */
export interface CalendarSyncOutcome {
  ok: boolean;
  message: string;
}

/** The words for a server that has no Google client yet (the same as the Settings notice). */
export const CALENDAR_UNAVAILABLE = "Google Calendar isn't set up on this server yet.";

export async function calendarSyncNow(fetcher: typeof fetch = fetch): Promise<CalendarSyncOutcome> {
  try {
    const res = await fetcher("/api/calendar/sync", { method: "POST", credentials: "include" });
    if (!res.ok) return { ok: false, message: res.status === 503 ? CALENDAR_UNAVAILABLE : "Couldn't sync just now. Try again in a moment." };
    const { report } = (await res.json()) as { report?: Record<string, { status: string; error: string | null }> };
    const problem = Object.values(report ?? {}).find((r) => r.error);
    return problem ? { ok: false, message: problem.error as string } : { ok: true, message: "Synced." };
  } catch {
    return { ok: false, message: "Couldn't reach the server. It syncs again on its own once you're back online." };
  }
}
