// Settings › Planning on the phone (SCREENS.md §18; the web's sections/planning-section.tsx): the default estimate
// (with what unestimated tasks usually took, once the app has learned it), when to ask about a carried-over task,
// when an untouched one goes to Someday, the morning review, what a new one-off task does when its day passes, the
// view the app opens to, and Today's sort and Show completed. The choices, the numbers' bounds and the sentences
// are the web's own (features/settings/section-words.ts). Presentational.
import { useState } from "react";
import { TODAY_SORTS } from "@/core/today/sort-options";
import { formatMinutes } from "@/core/time";
import type { SettingsPatch } from "@/data/repositories/settings-repo";
import { useSavedFlash } from "@/features/settings/saved-flash";
import { CARRY_REVIEW_HINT, MISS, OPEN_TO, OPEN_TO_HINT, PLANNING_NUMBERS, SHOW_COMPLETED_HINT, TODAY_SORT_HINT, USUAL_UNESTIMATED, missHint } from "@/features/settings/section-words";
import type { SettingsValues } from "@/features/settings/settings-values";
import { CardRow } from "~/ui/card";
import { FieldNote } from "~/ui/field-row";
import { Segmented } from "~/ui/segmented";
import { SwitchRow } from "~/ui/switch-row";
import { ChoiceSheet, Group, NumberSheet, SettingRow } from "./parts";

export interface PlanningViewProps {
  values: SettingsValues;
  /** What tasks finished without an estimate usually took, when that is worth saying (core/estimates `suggestDefault`). */
  usual?: number | null;
  onChange: (patch: SettingsPatch) => void;
}

type NumberKey = keyof typeof PLANNING_NUMBERS;
const NUMBER_TITLES: Record<NumberKey, string> = {
  defaultEstimateMin: "Default estimate",
  carryAskAfter: "Ask about a carried-over task after",
  autoSomedayDays: "Move an untouched task to Someday after",
};

export function PlanningView({ values, usual = null, onChange }: PlanningViewProps) {
  const [saved, flash] = useSavedFlash();
  const [number, setNumber] = useState<NumberKey | null>(null);
  const [sorting, setSorting] = useState(false);
  const change = (patch: SettingsPatch) => {
    onChange(patch);
    flash();
  };
  const numberRow = (key: NumberKey) => <SettingRow label={NUMBER_TITLES[key]} value={`${values[key]} ${PLANNING_NUMBERS[key].unit}`} onPress={() => setNumber(key)} />;
  return (
    <>
      <Group saved={saved}>
        <CardRow first>
          {numberRow("defaultEstimateMin")}
          {usual != null ? <FieldNote text={`${USUAL_UNESTIMATED} ${formatMinutes(usual)}.`} action={`Use ${formatMinutes(usual)}`} onPress={() => change({ defaultEstimateMin: usual })} /> : null}
        </CardRow>
        <CardRow>{numberRow("carryAskAfter")}</CardRow>
        <CardRow>{numberRow("autoSomedayDays")}</CardRow>
        <CardRow>
          <SwitchRow label="Morning review" hint={CARRY_REVIEW_HINT} checked={values.carryReview} onChange={(v) => change({ carryReview: v })} />
        </CardRow>
        <CardRow>
          <SettingRow label="Default if missed" hint={missHint(values.defaultMissPolicy)}>
            <Segmented label="Default if missed" options={MISS} value={values.defaultMissPolicy} onChange={(v) => change({ defaultMissPolicy: v })} />
          </SettingRow>
        </CardRow>
        <CardRow>
          <SettingRow label="Open to" hint={OPEN_TO_HINT}>
            <Segmented label="Open to" options={OPEN_TO} value={values.defaultView} onChange={(v) => change({ defaultView: v })} />
          </SettingRow>
        </CardRow>
        <CardRow>
          <SettingRow label="Sort Today by" hint={TODAY_SORT_HINT} value={TODAY_SORTS.find((o) => o.value === values.todaySort)?.label ?? ""} onPress={() => setSorting(true)} />
        </CardRow>
        <CardRow>
          <SwitchRow label="Show completed on Today" hint={SHOW_COMPLETED_HINT} checked={values.showCompleted} onChange={(v) => change({ showCompleted: v })} />
        </CardRow>
      </Group>
      {(Object.keys(PLANNING_NUMBERS) as NumberKey[]).map((key) => (
        <NumberSheet key={key} open={number === key} title={NUMBER_TITLES[key]} value={values[key]} bounds={PLANNING_NUMBERS[key]} onSet={(v) => change({ [key]: v })} onClose={() => setNumber(null)} />
      ))}
      <ChoiceSheet open={sorting} title="Sort Today by" options={TODAY_SORTS} value={values.todaySort} onChange={(v) => change({ todaySort: v })} onClose={() => setSorting(false)} />
    </>
  );
}
