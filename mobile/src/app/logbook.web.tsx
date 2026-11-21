// The browser preview of the Logbook (npm run preview, /logbook): the real view, made-up data.
// `?state=empty|filtered|nomatch|older|all|error|expired` picks what is shown; `?sheet=filter|peek` opens the
// filter sheet or the read-only view of an older task. See _layout.web.tsx.
import { useLocalSearchParams } from "expo-router";
import type { LogbookDay, LogbookEntry } from "@/app/(app)/logbook/logbook-days";
import type { LogbookFilterKey } from "@/app/(app)/logbook/logbook-filters";
import { localDate } from "@/core/time";
import type { Task } from "@/core/types";
import type { FinishedRow } from "@/features/finished/finished";
import { FinishedPeek } from "~/screens/logbook/finished-peek";
import { LogbookFilterSheet } from "~/screens/logbook/logbook-filter-sheet";
import { LogbookView, type OlderState } from "~/screens/logbook/logbook-view";
import { PreviewRows } from "~/screens/rows/preview-rows";

const TODAY = localDate("2026-11-21");
const entry = (key: string, title: string, kind: LogbookEntry["kind"], at: string, more: Partial<LogbookEntry> = {}, projectId: string | null = null): LogbookEntry => ({ key, kind, at, task: { id: key, title, estimateMin: 30, carryCount: 0, projectId } as unknown as Task, ...more });
const DAYS: LogbookDay[] = [
  { day: TODAY, minutes: 140, done: [entry("d1", "Write the quarterly report", "done", "16:20", { tookMin: 95 }, "p1"), entry("c1", "Take B12 Vit", "completion", "08:05"), entry("d2", "Call the bank", "done", "11:40")], dropped: [entry("x1", "Chase the invoice", "dropped", "09:15", { expired: true }, "p1")] },
  { day: TODAY.subtract({ days: 1 }), minutes: 60, done: [entry("d3", "Review the budget", "done", "15:02"), entry("d4", "Book the dentist", "done", "10:30")], dropped: [] },
];
const OLDER_DAY: LogbookDay = { day: localDate("2026-11-03"), minutes: 75, done: [entry("o1", "Draft the proposal", "done", "14:05", {}, "p1"), entry("o2", "Run 5k", "completion", "07:10")], dropped: [] };
const ROW = { id: "o1", title: "Draft the proposal", completed_at: "2026-11-03T14:05:00.123456+00:00", project_id: "p1", estimate_min: 45, actual_min: 70, deadline: "2026-11-05", notes_md: "Second draft went to Dana.\nShe wants the numbers by Friday.", checklist: [{ title: "Outline", done: true }, { title: "Numbers", done: false }], tag_ids: ["t1"], blocks: null, occurrence_of: null, occurrence_date: null, evening: false } as unknown as FinishedRow;
const NAMES = new Map([["p1", "Acme launch"]]);
const nothing = () => undefined;

export default function Preview() {
  const q = useLocalSearchParams<{ state?: string; sheet?: string }>();
  const state = q.state ?? "";
  const withOlder = state === "older" || state === "all";
  const filtering = state === "filtered" || state === "nomatch";
  const chips: { key: LogbookFilterKey; label: string }[] = filtering ? [{ key: "project", label: "#Acme launch" }, { key: "dates", label: "Last 7 days" }] : [];
  const older: OlderState = { available: true, status: state === "error" ? "error" : "idle", more: state === "all" ? false : state === "older" ? true : null, count: withOlder ? 2 : 0 };
  return (
    <PreviewRows today={TODAY}>
      <LogbookView
        today={TODAY}
        defaultEstimateMin={35}
        days={state === "empty" || state === "nomatch" ? [] : withOlder ? [...DAYS, OLDER_DAY] : DAYS}
        hasAny={state !== "empty"}
        empty={state === "empty"}
        dayLines={new Map([["2026-11-20", "Rated 4/5 · Highlight: shipped the deck"]])}
        partDay={state === "older" ? "2026-11-03" : null}
        projectNames={NAMES}
        olderRows={withOlder ? new Map([["o1", true], ["o2", false]]) : new Map()}
        filterChips={chips}
        droppedOnly={false}
        older={older}
        expired={state === "expired" ? DAYS[0].dropped : null}
        onOpenFilters={nothing}
        onRemoveFilter={nothing}
        onClearFilters={nothing}
        onLoadOlder={nothing}
        onOpen={nothing}
        onReopen={nothing}
        onRestore={nothing}
        onWholeLogbook={nothing}
      />
      <LogbookFilterSheet
        open={q.sheet === "filter"}
        filters={filtering ? { project: "p1", from: "2026-11-15", to: "2026-11-21" } : {}}
        onChange={nothing}
        options={{ projects: [{ id: "p1", name: "Acme launch" }], areas: [{ id: "a1", name: "Work" }], tags: [{ name: "calls" }, { name: "writing" }] }}
        today={TODAY}
        onClose={nothing}
      />
      <FinishedPeek row={q.sheet === "peek" ? ROW : null} projectName="Acme launch" tagNames={["writing"]} zone="Europe/London" today={TODAY} onReopen={nothing} onDelete={async () => "deleted"} onDeleted={nothing} onClose={nothing} />
    </PreviewRows>
  );
}
