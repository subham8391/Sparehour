"use client";
// Triage all (SCREENS.md §5): the queue one task at a time, full-screen, keyboard-driven — the fastest way to an
// empty Inbox. One task shows with its age and its note; T, ⇧T, S, Backspace, #, E and ⇧D act on it (DECISIONS.md
// "Triage all keys"), → / J skip it, K / ↑ go back, Esc leaves, and every key has its button (44 px on a phone). A
// decision is written at once with its undo, and the walk moves on; ⌘Z or Undo takes the last one back and returns
// to it. It ends on "Inbox zero. Nice." It takes a list of task ids and an action set, so Someday's Review and the
// weekly review (M2) walk their own lists with it. Lazy: loaded when it is opened (and in idle time before).
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useQuery } from "@/data/powersync";
import { useLocalDay, useNow } from "@/features/shell/use-local-day";
import { useTaskRepo } from "@/features/tasks/use-task-repo";
import { useUndoOptional } from "@/features/undo/undo-provider";
import { buttonClass } from "@/ui/button";
import { cx } from "@/ui/cx";
import { Icon } from "@/ui/icons";
import { Kbd } from "@/ui/kbd";
import { notePlain } from "@/ui/markdown-plain";
import { trapTab, useDialogFocus } from "@/ui/sheet";
import { addedLabel } from "./age";
import { TRIAGE_LABEL, triage, walkKey, type TriageAction, type TriageChoice } from "./triage";
import { TriageSheet, type TriagePick } from "./triage-sheet";

export const ALL_ACTIONS: readonly TriageAction[] = ["today", "tomorrow", "week", "someday", "drop", "project", "estimate", "deadline"];
const KEY_HINT: Partial<Record<TriageAction, string>> = { today: "T", tomorrow: "⇧T", someday: "S", drop: "⌫", project: "#", estimate: "E", deadline: "⇧D" };
const CHOICES = new Set<TriageAction>(["today", "tomorrow", "week", "someday", "drop"]);

const WALK_SQL = `select id, title, notes_md, created_at, state from tasks where id in (select value from json_each(?)) and deleted_at is null`;

interface WalkRow {
  id: string;
  title: string | null;
  notes_md: string | null;
  created_at: string | null;
  state: string | null;
}

export interface TriageWalkProps {
  /** The tasks to walk, in order. */
  ids: readonly string[];
  /** The state a task is in while it still waits for a decision (the Inbox's "inbox"); one that has left it is passed. */
  waiting?: string;
  /** The actions offered, as keys and buttons; the Inbox offers them all. */
  actions?: readonly TriageAction[];
  /** The dialog's name. */
  label?: string;
  /** The last line, once nothing is left waiting. */
  done?: string;
  /** The last line when some were skipped and still wait. */
  remaining?: (n: number) => string;
  onClose: () => void;
}

const inTheInbox = (n: number) => `That’s every one. ${n === 1 ? "One stays" : `${n} stay`} in the Inbox for later.`;

export function TriageWalk({ ids, waiting = "inbox", actions = ALL_ACTIONS, label = "Triage", done = "Inbox zero. Nice.", remaining = inTheInbox, onClose }: TriageWalkProps) {
  const repo = useTaskRepo();
  const undoApi = useUndoOptional();
  const now = useNow();
  const { today, zone } = useLocalDay(now);
  const panel = useDialogFocus();
  const { data } = useQuery<WalkRow>(WALK_SQL, [JSON.stringify(ids)]);
  const rows = useMemo(() => new Map((data ?? []).map((r) => [r.id, r])), [data]);
  const [at, setAt] = useState(0);
  // Decided here: passed at once, before the write comes back through the query.
  const [decided, setDecided] = useState<ReadonlySet<string>>(new Set());
  // What this walk wrote, newest last, for ⌘Z: the task it was, whether it was a decision, and its toast's words.
  const [written, setWritten] = useState<{ id: string; decision: boolean; title: string }[]>([]);
  const [picking, setPicking] = useState<TriagePick | null>(null);

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
    } else setPicking(action as TriagePick);
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

  // The keys are the walk's wherever focus is (a button that went away leaves it on the page), except while a
  // picker is open over it; a focused button keeps Enter and Space. Taken before the app's own keyboard layer.
  const onKey = (e: globalThis.KeyboardEvent) => {
    if (picking || e.defaultPrevented || e.isComposing) return;
    const k = walkKey(e);
    if (!k) return;
    e.preventDefault();
    e.stopPropagation();
    if ("leave" in k) onClose();
    else if ("undo" in k) void undo();
    else if ("step" in k) step(k.step);
    else act(k.act);
  };
  const keyRef = useRef(onKey);
  useEffect(() => {
    keyRef.current = onKey;
  });
  useEffect(() => {
    const listen = (e: globalThis.KeyboardEvent) => keyRef.current(e);
    window.addEventListener("keydown", listen, true);
    return () => window.removeEventListener("keydown", listen, true);
  }, []);
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Tab") trapTab(e);
  };

  const age = row ? addedLabel(row.created_at, today, zone) : null;
  const note = row ? notePlain(row.notes_md) : "";
  const last = written.at(-1);
  const BTN = cx(buttonClass({ variant: "secondary" }), "h-11 justify-between gap-2 sm:h-10 touch:h-11");

  return (
    <>
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        onKeyDown={onKeyDown}
        className="fixed inset-0 z-40 flex flex-col overflow-y-auto bg-paper pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] outline-none"
      >
        <div className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-6 px-5 py-4 sm:px-6 sm:py-8">
          <header className="flex min-h-11 items-center justify-between gap-3">
            <p className="text-label font-medium tracking-wide text-ink-2 uppercase">
              {label}
              {id && (
                <span className="ml-2 font-normal tracking-normal normal-case num">
                  {ids.indexOf(id) + 1} of {ids.length}
                </span>
              )}
            </p>
            <button type="button" onClick={onClose} className={cx(buttonClass({ variant: "quiet", size: "touch" }), "-mr-2 gap-2 px-2.5")}>
              Leave
              <Kbd>esc</Kbd>
            </button>
          </header>

          {!loaded ? null : id && row ? (
            <>
              <article aria-live="polite" aria-atomic="true" className="flex flex-col gap-2">
                <h2 className="font-display text-title font-book text-pretty text-ink [overflow-wrap:anywhere]">{row.title ?? ""}</h2>
                {age && <p className="text-body-sm text-ink-2">{age}</p>}
                {note && <p className="line-clamp-6 text-body text-pretty whitespace-pre-line text-ink-2">{note}</p>}
              </article>
              <div role="group" aria-label="Where it goes" className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {actions.filter((a) => CHOICES.has(a)).map((a) => (
                  <button key={a} type="button" className={cx(BTN, a === "today" && "border-ink")} onClick={() => act(a)}>
                    {TRIAGE_LABEL[a]}
                    {KEY_HINT[a] && <Kbd>{KEY_HINT[a]}</Kbd>}
                  </button>
                ))}
              </div>
              <div role="group" aria-label="What it needs" className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {actions.filter((a) => !CHOICES.has(a)).map((a) => (
                  <button key={a} type="button" aria-haspopup="dialog" className={cx(BTN, "border-transparent text-ink-2")} onClick={() => act(a)}>
                    {TRIAGE_LABEL[a]}…
                    {KEY_HINT[a] && <Kbd>{KEY_HINT[a]}</Kbd>}
                  </button>
                ))}
              </div>
              <nav aria-label="The queue" className="flex items-center justify-between gap-2">
                <button type="button" onClick={() => step(-1)} disabled={find(current - 1, -1) < 0} className={cx(buttonClass({ variant: "quiet", size: "touch" }), "-ml-2 gap-2 px-2.5 disabled:opacity-40")}>
                  <Icon name="chevron-right" size={16} className="rotate-180" />
                  Back
                  <Kbd>K</Kbd>
                </button>
                <button type="button" onClick={() => step(1)} className={cx(buttonClass({ variant: "quiet", size: "touch" }), "-mr-2 gap-2 px-2.5")}>
                  <Kbd>J</Kbd>
                  Skip
                  <Icon name="chevron-right" size={16} />
                </button>
              </nav>
            </>
          ) : (
            <div className="flex flex-col items-start gap-4 py-6">
              <p className="font-display text-pane font-medium text-ink">{left === 0 ? done : remaining(left)}</p>
              <button type="button" autoFocus onClick={onClose} className={buttonClass({ variant: "primary", size: "touch" })}>
                Done
              </button>
            </div>
          )}

          {last && undoApi && (
            <p className="mt-auto flex min-h-11 items-center gap-1 text-body-sm text-ink-2">
              <span className="min-w-0 truncate">Last: “{last.title}”</span>
              <button type="button" onClick={() => void undo()} className={buttonClass({ variant: "link", size: "compact" })}>
                Undo
              </button>
            </p>
          )}
        </div>
      </div>
      {picking && id && (
        <TriageSheet
          id={id}
          pick={picking}
          onDone={(filed) => wrote(id, filed)}
          onClose={() => {
            setPicking(null);
            panel.current?.focus({ preventScroll: true });
          }}
        />
      )}
    </>
  );
}
