"use client";
// Everything that was finished on one day and is no longer on the device, for Today stepped to a day older than
// the week it holds (DECISIONS.md, amendment 2026-11-15). Unlike the Logbook's pages (`useFinished`), a day is
// asked for as it is shown and fetched whole: every page between the day's two instants, so a long day is never
// cut without saying. Every way it can go ends in a state a view can put into words: there is no state that waits
// for ever, since a request that does not answer is given up on, and being offline or without the table is told
// apart from an error. Back online, it asks again by itself.
import { useCallback, useEffect, useState } from "react";
import { fetchFinished, type ApiFetch, type FinishedQuery, type FinishedRow } from "./finished";

/** `offline`: the browser says there is no connection. `unavailable`: the server keeps no older tasks yet. */
export type FinishedDayStatus = "loading" | "ready" | "offline" | "unavailable" | "error";

export interface FinishedDay {
  status: FinishedDayStatus;
  /** The day's finished tasks, newest first; empty until `ready`. */
  rows: readonly FinishedRow[];
  /** Asks again, after `offline` or `error`. */
  retry: () => void;
  /** Takes a row out (it was reopened, or deleted for good). */
  remove: (id: string) => void;
}

/** The most the server gives in one answer (`PAGE_MAX`): an ordinary day is one request. */
const PAGE = 100;
/** How long one page may go unanswered before the day is an error with "Try again". */
const WAIT_MS = 20_000;

interface State {
  key: string;
  status: FinishedDayStatus;
  rows: FinishedRow[];
}

/**
 * `from` inclusive and `to` exclusive: the day's two instants in the person's zone, as the Logbook's date filter builds
 * them. `api` is how the app's own routes are called where that is not the browser's `fetch` (the Android app's).
 */
export function useFinishedDay(from: string, to: string, api?: ApiFetch): FinishedDay {
  const key = `${from} ${to}`;
  const [state, setState] = useState<State>({ key, status: "loading", rows: [] });
  const [attempt, setAttempt] = useState(0);
  // Another day: what was fetched answered another question.
  const current: State = state.key === key ? state : { key, status: "loading", rows: [] };

  useEffect(() => {
    const controller = new AbortController();
    let left = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const settle = (status: FinishedDayStatus, rows: FinishedRow[] = []) => {
      if (!left) setState({ key, status, rows });
    };
    void (async () => {
      const rows: FinishedRow[] = [];
      const seen = new Set<string>();
      let after: FinishedQuery["after"] = null;
      try {
        for (;;) {
          clearTimeout(timer);
          timer = setTimeout(() => controller.abort(), WAIT_MS);
          const page = await fetchFinished({ from, to, limit: PAGE, after }, controller.signal, api);
          if (!page.available) return settle("unavailable");
          const fresh = page.rows.filter((r) => !seen.has(r.id));
          for (const r of fresh) seen.add(r.id);
          rows.push(...fresh);
          const last = page.rows[page.rows.length - 1];
          // No more to ask for; or a page that brought nothing new, which would otherwise be asked for again for ever.
          if (!page.more || !last || fresh.length === 0) return settle("ready", rows);
          after = { id: last.id, completed_at: last.completed_at };
        }
      } catch {
        settle(typeof navigator !== "undefined" && navigator.onLine === false ? "offline" : "error");
      } finally {
        clearTimeout(timer);
      }
    })();
    return () => {
      left = true;
      clearTimeout(timer);
      controller.abort();
    };
  }, [key, from, to, attempt, api]);

  const retry = useCallback(() => {
    setState((now) => ({ ...now, status: "loading" }));
    setAttempt((n) => n + 1);
  }, []);

  // The connection is back: what could not be fetched is asked for again without a press.
  const waiting = current.status === "offline" || current.status === "error";
  useEffect(() => {
    // The Android app has no such event to listen for: there, Try again is the way.
    if (!waiting || typeof window === "undefined" || typeof window.addEventListener !== "function") return;
    window.addEventListener("online", retry);
    return () => window.removeEventListener("online", retry);
  }, [waiting, retry]);

  const remove = useCallback((id: string) => setState((now) => ({ ...now, rows: now.rows.filter((r) => r.id !== id) })), []);

  return { status: current.status, rows: current.rows, retry, remove };
}
