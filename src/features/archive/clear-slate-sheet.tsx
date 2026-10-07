"use client";
// Clear the slate (PRODUCT_SPEC.md §8.5): two scopes, the exact count and the
// guarantee, then one batch archived with one undo. Opened from Today's ⋯, the
// Carried over header and Settings › Data. A bottom sheet on a phone with
// 44 px choices and buttons, a centred dialog from `sm`. A lazy island.
import { useState } from "react";
import type { SlateScope } from "@/core/rollover";
import { useLocalDatabase, useQuery } from "@/data/powersync";
import { SLATE_COUNTS_SQL, slateCountArgs } from "@/data/queries/archive";
import { clearTheSlate } from "@/data/repositories/archive";
import { useUndoSink } from "@/features/undo/undo-provider";
import { Button } from "@/ui/button";
import { cx } from "@/ui/cx";
import { Radio } from "@/ui/radio";
import { Sheet } from "@/ui/sheet";

export interface ClearSlateProps {
  /** The person's today, YYYY-MM-DD. */
  today: string;
  onClose: () => void;
}

const tasksWord = (n: number) => (n === 1 ? "1 task" : `${n} tasks`);

/** The confirmation's question and guarantee, verbatim from PRODUCT_SPEC.md §8.5 rule 4. */
export function slateQuestion(n: number): string {
  if (n === 0) return "Nothing to archive here.";
  return `Archive ${tasksWord(n)}? Nothing is deleted — you can bring the whole batch back for 30 days.`;
}

const SCOPES: readonly { value: SlateScope; label: string; hint: string }[] = [
  { value: "today", label: "Today only", hint: "Everything dated today or earlier, Carried over included" },
  { value: "backlog", label: "Today + backlog", hint: "Adds active tasks with no date" },
];

export default function ClearSlateSheet({ today, onClose }: ClearSlateProps) {
  const db = useLocalDatabase();
  const undo = useUndoSink();
  const { data } = useQuery<{ today: number; backlog: number }>(SLATE_COUNTS_SQL, slateCountArgs(today));
  const counts = data?.[0];
  const [scope, setScope] = useState<SlateScope>("today");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const count = (s: SlateScope) => (counts ? Number(counts.today) + (s === "backlog" ? Number(counts.backlog) : 0) : null);
  const n = count(scope);

  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      await clearTheSlate(db, undo ?? undefined, scope, today);
      onClose();
    } catch {
      setError("Couldn’t archive them — nothing changed. Try again.");
      setBusy(false);
    }
  };

  return (
    <Sheet label="Clear the slate" onClose={onClose} align="center" width="sm" data-testid="clear-slate">
      <div className="flex flex-col gap-4 px-5 pt-2 pb-5 sm:pt-5">
        <h2 className="font-display text-pane font-medium text-ink">Clear the slate</h2>
        <fieldset className="flex flex-col">
          <legend className="sr-only">What to archive</legend>
          {SCOPES.map((o) => (
            <label key={o.value} className={cx("-mx-2 flex min-h-11 cursor-pointer items-center gap-1 rounded-lg pr-2 hover:bg-hover")}>
              <Radio name="slate-scope" value={o.value} checked={scope === o.value} onChange={() => setScope(o.value)} />
              <span className="flex min-w-0 flex-1 flex-col py-1.5">
                <span className="text-body font-medium text-ink">{o.label}</span>
                <span className="text-body-sm text-pretty text-ink-2">{o.hint}</span>
              </span>
              <span className="shrink-0 text-body text-ink-2 num">{count(o.value) ?? "…"}</span>
            </label>
          ))}
        </fieldset>
        <p role="status" className="text-body text-pretty text-ink">
          {n === null ? "Counting…" : slateQuestion(n)}
        </p>
        <p className="text-body-sm text-pretty text-ink-3">The Inbox and repeating tasks stay as they are.</p>
        {error && <p className="text-body-sm text-pretty text-deadline">{error}</p>}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => void confirm()} disabled={busy || !n}>
            {busy ? "Archiving…" : n ? `Archive ${tasksWord(n)}` : "Archive"}
          </Button>
        </div>
      </div>
    </Sheet>
  );
}
