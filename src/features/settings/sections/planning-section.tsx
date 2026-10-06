"use client";
// Settings › Planning (SCREENS.md §18): the default estimate, when to ask
// about a carried-over task, when an untouched one goes to Someday, the
// morning review, what a new one-off task does when its day passes, and the
// view the app opens to.
import { TODAY_SORTS, isTodaySort } from "@/core/today/sort-options";
import type { MissPolicy } from "@/core/types";
import type { OpenTo } from "@/data/repositories/settings-repo";
import { cx } from "@/ui/cx";
import { Segmented } from "@/ui/segmented";
import { Select } from "@/ui/select";
import { HINT, LABEL, ROW } from "../rows";
import { NumberRow, Section, SwitchRow, useSavedFlash } from "../settings-ui";
import type { SettingsFormProps } from "../types";

const MISS: { value: MissPolicy; label: string }[] = [
  { value: "carry", label: "Carry" },
  { value: "skip", label: "Skip" },
  { value: "expire", label: "Expire" },
];

/** What each choice does, said under the control. */
const MISS_HINT: Record<MissPolicy, string> = {
  carry: "A new task that misses its day moves to the next one.",
  skip: "A new task that misses its day loses its date and waits, undated.",
  expire: "A new task that misses its day goes to the Logbook, where it can come back.",
};

const OPEN_TO: { value: OpenTo; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "inbox", label: "Inbox" },
  { value: "upcoming", label: "Upcoming" },
];

export function PlanningSection(p: SettingsFormProps) {
  const { values } = p;
  const [saved, flash] = useSavedFlash();
  const change = (patch: Parameters<SettingsFormProps["onChange"]>[0]) => {
    p.onChange(patch);
    flash();
  };
  return (
    <Section title="Planning" saved={saved}>
      <NumberRow id="estimate" label="Default estimate" unit="minutes" value={values.defaultEstimateMin} min={5} max={480} step={5} onChange={(v) => change({ defaultEstimateMin: v })} />
      <NumberRow id="carry" label="Ask about a carried-over task after" unit="carries" value={values.carryAskAfter} min={1} max={14} step={1} onChange={(v) => change({ carryAskAfter: v })} />
      <NumberRow id="someday" label="Move an untouched task to Someday after" unit="days" value={values.autoSomedayDays} min={7} max={120} step={1} onChange={(v) => change({ autoSomedayDays: v })} />
      <SwitchRow id="carry-review" label="Morning review" hint="Ask about carried-over tasks when the day starts" checked={values.carryReview} onChange={(v) => change({ carryReview: v })} />
      <div className={cx(ROW, "items-start")}>
        <span className="flex min-w-0 flex-1 flex-col sm:max-w-72">
          <span className={LABEL}>Default if missed</span>
          <span className={HINT}>{MISS_HINT[values.defaultMissPolicy]} Repeating tasks skip.</span>
        </span>
        <Segmented label="Default if missed" options={MISS} value={values.defaultMissPolicy} onChange={(v) => change({ defaultMissPolicy: v })} />
      </div>
      <div className={ROW}>
        <span className="flex min-w-0 flex-col">
          <span className={LABEL}>Open to</span>
          <span className={HINT}>Where the app starts</span>
        </span>
        <Segmented label="Open to" options={OPEN_TO} value={values.defaultView} onChange={(v) => change({ defaultView: v })} />
      </div>
      {/* The same values Today's ⋯ menu sets (one setting each, for Today). The five sorts are a list, not a segmented control: they never fit 360 px. */}
      <div className={cx(ROW, "items-start")}>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className={LABEL}>Sort Today by</span>
          <span className={HINT}>Manual keeps the order you set by hand; the others never change it.</span>
        </span>
        <Select aria-label="Sort Today by" value={values.todaySort} onChange={(e) => isTodaySort(e.target.value) && change({ todaySort: e.target.value })} className="w-auto shrink-0">
          {TODAY_SORTS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      </div>
      <SwitchRow id="show-completed" label="Show completed on Today" hint="Today’s finished tasks under a Done divider" checked={values.showCompleted} onChange={(v) => change({ showCompleted: v })} />
    </Section>
  );
}
