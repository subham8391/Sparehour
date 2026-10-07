"use client";
// The selected Inbox row's expansion (SCREENS.md §5), from `sm` up: where it goes — Today · Tomorrow · This week ·
// Someday · Drop — and what it is given — Project ▾ · Estimate ▾ · Deadline ▾ · Break it down. Each says its key in
// its tooltip, and the keys do the same on the selected row. A phone triages from the row's ⋯ sheet instead
// (DECISIONS.md "Phone tap on an Inbox row"). The pickers are islands (triage-islands.tsx, the organize island).
import { chipButtonClass } from "@/ui/chip";
import { cx } from "@/ui/cx";
import { Icon } from "@/ui/icons";
import { TRIAGE_KEY, TRIAGE_LABEL, type TriageAction, type TriageChoice, type TriageField } from "./triage";

const CHOICES: readonly TriageChoice[] = ["today", "tomorrow", "week", "someday", "drop"];
const FIELDS: readonly TriageField[] = ["project", "estimate", "deadline"];
// The quiet text action, 28 px beside the row on a pointer and 44 px on touch.
const FIELD = "inline-flex h-11 items-center gap-1 whitespace-nowrap rounded-sm px-2 text-body-sm font-medium text-ink-2 transition-colors dur-fast hover:bg-hover hover:text-ink sm:h-7 touch:h-11";

const tip = (a: TriageAction) => (TRIAGE_KEY[a] ? `${TRIAGE_LABEL[a]} (${TRIAGE_KEY[a]})` : undefined);

export function TriageActions({ title, onAct, onBreakDown }: { title: string; onAct: (action: TriageAction) => void; onBreakDown?: () => void }) {
  return (
    <div role="group" aria-label={`Triage ${title}`} className="mr-4 mb-3 ml-11 flex flex-col gap-1.5 max-sm:hidden print:hidden">
      <div className="flex flex-wrap gap-1.5">
        {CHOICES.map((c) => (
          <button key={c} type="button" title={tip(c)} className={cx(chipButtonClass(), c === "today" ? "border-line-strong" : "text-ink-2")} onClick={() => onAct(c)}>
            {TRIAGE_LABEL[c]}
          </button>
        ))}
      </div>
      <div className="-ml-2 flex flex-wrap items-center gap-x-1">
        {FIELDS.map((f) => (
          <button key={f} type="button" aria-haspopup="dialog" title={tip(f)} className={FIELD} onClick={() => onAct(f)}>
            {TRIAGE_LABEL[f]}
            <Icon name="chevron-down" size={14} className="text-ink-3" />
          </button>
        ))}
        {onBreakDown && (
          <button type="button" title="Convert it to a project" className={FIELD} onClick={onBreakDown}>
            Break it down
          </button>
        )}
      </div>
    </div>
  );
}
