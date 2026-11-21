"use client";
// Settings › Planning (SCREENS.md §18): the default estimate, when to ask
// about a carried-over task, when an untouched one goes to Someday, the
// morning review, what a new one-off task does when its day passes, and the
// view the app opens to.
import { suggestDefault } from "@/core/estimates";
import { TODAY_SORTS, isTodaySort } from "@/core/today/sort-options";
import { useLearned } from "@/features/estimates/use-learned";
import { UsualLine } from "@/features/estimates/usual-line";
import { cx } from "@/ui/cx";
import { Segmented } from "@/ui/segmented";
import { Select } from "@/ui/select";
import { HINT, LABEL, ROW } from "../rows";
// The choices, the numbers' bounds and the sentences are shared with the Android app's Settings (section-words.ts).
import { CARRY_REVIEW_HINT, MISS, OPEN_TO, OPEN_TO_HINT, PLANNING_NUMBERS, SHOW_COMPLETED_HINT, TODAY_SORT_HINT, USUAL_UNESTIMATED, missHint } from "../section-words";
import { NumberRow, Section, SwitchRow, useSavedFlash } from "../settings-ui";
import type { SettingsFormProps } from "../types";

export function PlanningSection(p: SettingsFormProps) {
  const { values } = p;
  const [saved, flash] = useSavedFlash();
  const change = (patch: Parameters<SettingsFormProps["onChange"]>[0]) => {
    p.onChange(patch);
    flash();
  };
  // What tasks finished without an estimate really took, when that is not the default they are counted as
  // (DECISIONS.md, amendment 2026-11-15): one tap makes it the default, and every day's number counts with it.
  const usual = suggestDefault(useLearned(), values.defaultEstimateMin);
  return (
    <Section title="Planning" saved={saved}>
      <NumberRow id="estimate" label="Default estimate" {...PLANNING_NUMBERS.defaultEstimateMin} value={values.defaultEstimateMin} onChange={(v) => change({ defaultEstimateMin: v })} />
      {usual && <UsualLine className="-mt-1 px-4 pb-2" about={USUAL_UNESTIMATED} minutes={usual.minutes} onUse={() => change({ defaultEstimateMin: usual.minutes })} />}
      <NumberRow id="carry" label="Ask about a carried-over task after" {...PLANNING_NUMBERS.carryAskAfter} value={values.carryAskAfter} onChange={(v) => change({ carryAskAfter: v })} />
      <NumberRow id="someday" label="Move an untouched task to Someday after" {...PLANNING_NUMBERS.autoSomedayDays} value={values.autoSomedayDays} onChange={(v) => change({ autoSomedayDays: v })} />
      <SwitchRow id="carry-review" label="Morning review" hint={CARRY_REVIEW_HINT} checked={values.carryReview} onChange={(v) => change({ carryReview: v })} />
      <div className={cx(ROW, "items-start")}>
        <span className="flex min-w-0 flex-1 flex-col sm:max-w-72">
          <span className={LABEL}>Default if missed</span>
          <span className={HINT}>{missHint(values.defaultMissPolicy)}</span>
        </span>
        <Segmented label="Default if missed" options={MISS} value={values.defaultMissPolicy} onChange={(v) => change({ defaultMissPolicy: v })} />
      </div>
      <div className={ROW}>
        <span className="flex min-w-0 flex-col">
          <span className={LABEL}>Open to</span>
          <span className={HINT}>{OPEN_TO_HINT}</span>
        </span>
        <Segmented label="Open to" options={OPEN_TO} value={values.defaultView} onChange={(v) => change({ defaultView: v })} />
      </div>
      {/* The same values Today's ⋯ menu sets (one setting each, for Today). The five sorts are a list, not a segmented control: they never fit 360 px. */}
      <div className={cx(ROW, "items-start")}>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className={LABEL}>Sort Today by</span>
          <span className={HINT}>{TODAY_SORT_HINT}</span>
        </span>
        <Select aria-label="Sort Today by" value={values.todaySort} onChange={(e) => isTodaySort(e.target.value) && change({ todaySort: e.target.value })} className="w-auto shrink-0">
          {TODAY_SORTS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      </div>
      <SwitchRow id="show-completed" label="Show completed on Today" hint={SHOW_COMPLETED_HINT} checked={values.showCompleted} onChange={(v) => change({ showCompleted: v })} />
    </Section>
  );
}
