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
import { SLATE_FAILED, SLATE_KEEPS, SLATE_SCOPES as SCOPES, slateConfirmLabel, slateCount, slateQuestion } from "./confirm-words";

// The scopes, the question and the guarantee are in confirm-words.ts, shared with the Android app; handed on, so imports are unchanged.
export { slateQuestion };

export interface ClearSlateProps {
  /** The person's today, YYYY-MM-DD. */
  today: string;
  onClose: () => void;
}

export default function ClearSlateSheet({ today, onClose }: ClearSlateProps) {
  const db = useLocalDatabase();
  const undo = useUndoSink();
  const { data } = useQuery<{ today: number; backlog: number }>(SLATE_COUNTS_SQL, slateCountArgs(today));
  const counts = data?.[0];
  const [scope, setScope] = useState<SlateScope>("today");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const count = (s: SlateScope) => slateCount(counts, s);
  const n = count(scope);

  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      await clearTheSlate(db, undo ?? undefined, scope, today);
      onClose();
    } catch {
      setError(SLATE_FAILED);
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
        <p className="text-body-sm text-pretty text-ink-3">{SLATE_KEEPS}</p>
        {error && <p className="text-body-sm text-pretty text-deadline">{error}</p>}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => void confirm()} disabled={busy || !n}>
            {slateConfirmLabel(n, busy)}
          </Button>
        </div>
      </div>
    </Sheet>
  );
}
