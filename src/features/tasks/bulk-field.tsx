"use client";
// One field picker for every ticked row (DECISIONS.md "Shortcuts with rows
// ticked": D, Shift+D, Shift+S and E act on all of them). The same pickers
// the task detail opens, in a sheet over the list; the choice is one write
// with one undo entry for the lot, then the ticks clear as the bulk bar's do.
import type { LocalDate } from "@/core/time";
import type { TaskPatch } from "@/data/repositories/task-repo";
import { formatMinutes, localDate } from "@/core/time";
import { useLocalDay, useNow } from "@/features/shell/use-local-day";
import { Button } from "@/ui/button";
import { chipButtonClass } from "@/ui/chip";
import { DateField } from "@/ui/date-field";
import { Icon } from "@/ui/icons";
import { Sheet } from "@/ui/sheet";
import { snoozePresets } from "./snooze";
import type { DetailField } from "./task-detail";
import { DatePicker, EstimatePicker, TypedDate } from "./task-detail-panel";
import { useTaskRepo } from "./use-task-repo";

const PICK = chipButtonClass();

const TITLE: Record<DetailField, string> = {
  do: "Pick a date",
  deadline: "Set deadline",
  start: "Set start date",
  estimate: "Set estimate",
  repeat: "Repeat",
};

export function BulkField({ ids, field, onDone, onClose }: { ids: readonly string[]; field: DetailField; onDone?: () => void; onClose: () => void }) {
  const repo = useTaskRepo();
  const now = useNow();
  const { today, zone } = useLocalDay(now);
  const presets = snoozePresets(now, zone, today);
  const count = `${ids.length} ${ids.length === 1 ? "task" : "tasks"}`;
  const apply = (patch: TaskPatch, note: string) => {
    onClose();
    void repo.updateMany(ids, patch, note).then(() => onDone?.());
  };
  const onDate = (key: "deadline" | "startDate", d: LocalDate | null) =>
    apply({ [key]: d }, d ? `Set the ${key === "deadline" ? "deadline" : "start date"} on {title}` : `Cleared the ${key === "deadline" ? "deadline" : "start date"} on {title}`);

  return (
    <Sheet label={`${TITLE[field]} for ${count}`} onClose={onClose} width="sm" align="center">
      <div className="flex flex-col gap-3 p-4 sm:p-5">
        <div className="-mt-1 flex items-center justify-between gap-2">
          <h2 className="text-body-lg font-medium text-ink">
            {TITLE[field]} <span className="font-normal text-ink-2">· {count}</span>
          </h2>
          <Button variant="icon" aria-label="Close" onClick={onClose} className="-mr-2">
            <Icon name="close" size={18} />
          </Button>
        </div>
        {field === "do" && (
          <>
            <TypedDate now={now} zone={zone} today={today} withTime autoFocus onApply={(d) => apply({ doDate: d.date, doTime: d.time, evening: d.evening }, "Moved {title}")} />
            <div className="flex flex-wrap gap-1.5">
              <button type="button" className={PICK} onClick={() => apply({ doDate: today, doTime: null, evening: false }, "Moved {title} to today")}>
                Today
              </button>
              {presets.map((s) => (
                <button key={s.id} type="button" className={PICK} onClick={() => apply(s.patch, `Moved {title} to ${s.label.toLowerCase()}`)}>
                  {s.label}
                </button>
              ))}
            </div>
            <DateField aria-label="Day" className="w-full" today={today} value="" onChange={(e) => e.target.value && apply({ doDate: localDate(e.target.value), doTime: null, evening: false }, "Moved {title}")} />
          </>
        )}
        {field === "deadline" && <DatePicker value={null} today={today} now={now} zone={zone} presets={presets} autoFocus onChange={(d) => onDate("deadline", d)} />}
        {field === "start" && <DatePicker value={null} today={today} now={now} zone={zone} presets={presets} autoFocus onChange={(d) => onDate("startDate", d)} />}
        {field === "estimate" && <EstimatePicker value={null} onChange={(m) => apply({ estimateMin: m }, m == null ? "Cleared the estimate on {title}" : `Estimated {title} at ${formatMinutes(m)}`)} />}
      </div>
    </Sheet>
  );
}
