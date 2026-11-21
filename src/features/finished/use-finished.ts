"use client";
// Pages of older finished tasks for a view (the Logbook's "Show older", search's older results): nothing is asked
// until `load` is called, each call adds the next page, and a change of what is asked for (a filter, the words)
// starts again from nothing. A page that arrives for an earlier question is dropped.
import { useCallback, useEffect, useRef, useState } from "react";
import { fetchFinished, type ApiFetch, type FinishedQuery, type FinishedRow } from "./finished";

export type FinishedStatus = "idle" | "loading" | "error";

export interface Finished {
  rows: readonly FinishedRow[];
  status: FinishedStatus;
  /** Whether there is another page: unknown (null) until the first answer. */
  more: boolean | null;
  /** False where the server keeps no older tasks yet: the view shows no way to ask. */
  available: boolean;
  /** Fetches the next page; a call while one is under way does nothing. */
  load: () => void;
  /** Takes a row out (it was reopened, so it is a task again). */
  remove: (id: string) => void;
}

interface State {
  key: string;
  rows: FinishedRow[];
  status: FinishedStatus;
  more: boolean | null;
  available: boolean;
}

const fresh = (key: string, available = true): State => ({ key, rows: [], status: "idle", more: null, available });

export function useFinished(query: Omit<FinishedQuery, "after">, /** The Android app's way to the API; the browser's fetch when left out. */ api?: ApiFetch): Finished {
  const key = JSON.stringify(query);
  const [state, setState] = useState<State>(() => fresh(key));
  // What is asked for changed: the pages so far answered another question.
  if (state.key !== key) setState(fresh(key, state.available));
  const current = state.key === key ? state : fresh(key, state.available);

  const latest = useRef({ query, state: current, api });
  useEffect(() => {
    latest.current = { query, state: current, api };
  });
  const inFlight = useRef<AbortController | null>(null);
  useEffect(() => {
    inFlight.current?.abort();
    inFlight.current = null;
    return () => inFlight.current?.abort();
  }, [key]);

  const load = useCallback(() => {
    const { query: q, state: s, api: call } = latest.current;
    if (inFlight.current || s.more === false || !s.available) return;
    const controller = new AbortController();
    inFlight.current = controller;
    const last = s.rows[s.rows.length - 1];
    setState((now) => (now.key === s.key ? { ...now, status: "loading" } : now));
    fetchFinished({ ...q, after: last ? { id: last.id, completed_at: last.completed_at } : null }, controller.signal, call)
      .then(
        (page) => {
          if (controller.signal.aborted) return;
          setState((now) => {
            if (now.key !== s.key) return now;
            const seen = new Set(now.rows.map((r) => r.id));
            return { ...now, rows: [...now.rows, ...page.rows.filter((r) => !seen.has(r.id))], status: "idle", more: page.available && page.more, available: page.available };
          });
        },
        () => {
          if (controller.signal.aborted) return;
          setState((now) => (now.key === s.key ? { ...now, status: "error" } : now));
        },
      )
      .finally(() => {
        if (inFlight.current === controller) inFlight.current = null;
      });
  }, []);

  const remove = useCallback((id: string) => setState((now) => ({ ...now, rows: now.rows.filter((r) => r.id !== id) })), []);

  return { rows: current.rows, status: current.status, more: current.more, available: current.available, load, remove };
}
