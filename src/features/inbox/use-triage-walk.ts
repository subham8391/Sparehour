"use client";
// Triage all without its screen (SCREENS.md §5): the queue, the task it is on, what has been decided, and the
// writes behind each choice with their undo. Its own module, free of the walk's web parts (triage-walk.tsx draws
// it in the browser), so the Android app walks the Inbox by the same rules (docs/mobile/ANDROID_APP_SPEC.md §4.3).
import { useContext, useMemo, useState } from "react";
import type { LocalDate } from "@/core/time";
import { useQuery } from "@/data/powersync";
import { useLocalDay, useNow } from "@/features/shell/use-local-day";
import { useTaskRepo } from "@/features/tasks/use-task-repo";
import { UndoContext } from "@/features/undo/undo-context";
import { triage, type TriageAction, type TriageChoice, type TriageField } from "./triage";

export const ALL_ACTIONS: readonly TriageAction[] = ["today", "tomorrow", "week", "someday", "drop", "project", "estimate", "deadline"];
/** The actions that decide where a task goes; the rest open a picker. */
export const CHOICES: ReadonlySet<TriageAction> = new Set<TriageAction>(["today", "tomorrow", "week", "someday", "drop"]);

const WALK_SQL = `select id, title, notes_md, created_at, state from tasks where id in (select value from json_each(?)) and deleted_at is null`;

export interface WalkRow {
  id: string;
  title: string | null;
  notes_md: string | null;
  created_at: string | null;
  state: string | null;
}

/** The last line when some were skipped and still wait in the Inbox. */
export const inTheInbox = (n: number) => `That’s every one. ${n === 1 ? "One stays" : `${n} stay`} in the Inbox for later.`;

export interface TriageWalkState {
  /** False until the queue has been read. */
  loaded: boolean;
  /** The task on screen, or null once the walk has passed the last one. */
  id: string | null;
  row: WalkRow | undefined;
  /** How many still wait for a decision. */
  left: number;
  /** The walk's latest write, for "Last: …" beside Undo. */
  last: { id: string; decision: boolean; title: string } | undefined;
  /** Whether there is an undo stack to take a write back with. */
  canUndo: boolean;
  /** Whether a task still waits before this one. */
  canBack: boolean;
  /** The picker open over the walk. */
  picking: TriageField | null;
  setPicking: (pick: TriageField | null) => void;
  today: LocalDate;
  zone: string;
  act: (action: TriageAction) => void;
  step: (dir: 1 | -1) => void;
  undo: () => Promise<void>;
  /** A picker's write on a task: a decision when it filed the task (a project, a deadline). */
  wrote: (taskId: string, decision: boolean) => void;
}

export function useTriageWalk({ ids, waiting = "inbox", actions = ALL_ACTIONS }: { ids: readonly string[]; waiting?: string; actions?: readonly TriageAction[] }): TriageWalkState {
  const repo = useTaskRepo();
  const undoApi = useContext(UndoContext);
  const now = useNow();
  const { today, zone } = useLocalDay(now);
  const { data } = useQuery<WalkRow>(WALK_SQL, [JSON.stringify(ids)]);
  const rows = useMemo(() => new Map((data ?? []).map((r) => [r.id, r])), [data]);
  const [at, setAt] = useState(0);
  // Decided here: passed at once, before the write comes back through the query.
  const [decided, setDecided] = useState<ReadonlySet<string>>(new Set());
  // What this walk wrote, newest last, for ⌘Z: the task it was, whether it was a decision, and its toast's words.
  const [written, setWritten] = useState<{ id: string; decision: boolean; title: string }[]>([]);
  const [picking, setPicking] = useState<TriageField | null>(null);

  const open = (id: string) => !decided.has(id) && rows.get(id)?.state === waiting;
  const find = (from: number, dir: 1 | -1) => {
    for (let i = from; i >= 0 && i < ids.length; i += dir) if (open(ids[i])) return i;
    return -1;
  };
  // The task on screen: the first one still waiting at or after the cursor (a decision elsewhere may have taken it).
  const loaded = data !== undefined;
  const current = loaded ? find(at, 1) : -1;
  const id = current >= 0 ? ids[current] : null;
  const row = id ? rows.get(id) : undefined;
  const left = loaded ? ids.filter(open).length : 0;

  const wrote = (taskId: string, decision: boolean) => {
    setWritten((w) => [...w, { id: taskId, decision, title: rows.get(taskId)?.title ?? "" }]);
    if (!decision) return;
    setDecided((d) => new Set(d).add(taskId));
    setAt(ids.indexOf(taskId) + 1);
  };
  const act = (action: TriageAction) => {
    if (!id || !actions.includes(action)) return;
    if (CHOICES.has(action)) {
      void triage(repo, id, action as TriageChoice, today);
      wrote(id, true);
    } else setPicking(action as TriageField);
  };
  const step = (dir: 1 | -1) => {
    if (dir === 1) setAt(current >= 0 ? current + 1 : at);
    else {
      const back = find((current >= 0 ? current : ids.length) - 1, -1);
      if (back >= 0) setAt(back);
    }
  };
  const undo = async () => {
    const last = written.at(-1);
    if (!last || !undoApi) return;
    setWritten((w) => w.slice(0, -1));
    await undoApi.undo();
    if (last.decision)
      setDecided((d) => {
        const next = new Set(d);
        next.delete(last.id);
        return next;
      });
    setAt(ids.indexOf(last.id));
  };

  return { loaded, id, row, left, last: written.at(-1), canUndo: undoApi !== null, canBack: find(current - 1, -1) >= 0, picking, setPicking, today, zone, act, step, undo, wrote };
}
