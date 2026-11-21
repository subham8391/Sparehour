// The browser preview of Search (npm run preview, /search): the real views, made-up data. `?state=start` is before
// anything is typed, `?state=none` is nothing matched, `?state=older` shows older finished matches from the server,
// `?state=asked` shows an older search that found nothing. `?add=1` opens quick add over it (`?add=day` on a day,
// `?add=project` on a project's page) with made-up projects and tags: the line is read by the real parser, and
// nothing is saved. See _layout.web.tsx.
import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Temporal, localDate } from "@/core/time";
import type { Task } from "@/core/types";
import type { SearchFilters } from "@/features/search/search";
import { DayEffectLine, QuickAddView } from "~/screens/quick-add/quick-add-view";
import { PreviewRows } from "~/screens/rows/preview-rows";
import { OlderFoundView } from "~/screens/search/older-found-view";
import { SearchView, type SearchHit } from "~/screens/search/search-view";

const TODAY = localDate("2026-11-21");
const NOW = Temporal.Instant.from("2026-11-21T14:05:00Z");
const task = (id: string, title: string, more: Partial<Task> = {}) => ({ id, title, state: "active", estimateMin: 30, carryCount: 0, projectId: null, deadline: null, doDate: null, doTime: null, startDate: null, ...more }) as unknown as Task;
const HITS: SearchHit[] = [
  { task: task("t1", "Draft the Acme proposal", { doDate: TODAY, estimateMin: 45 }), projectName: "Acme launch", context: null },
  { task: task("t2", "Call the bank", { state: "inbox", estimateMin: null }), projectName: null, context: { where: "notes", snippet: { before: "…ask about the ", match: "Acme", after: " account fees before Friday" } } },
  { task: task("t3", "Plan the offsite", { doDate: TODAY.add({ days: 3 }), deadline: TODAY.add({ days: 5 }) }), projectName: "Offsite", context: { where: "step", snippet: { before: "Book the ", match: "Acme", after: " meeting room" } } },
  { task: task("t4", "Learn to bake bread", { state: "someday" }), projectName: null, context: null },
];
const ALSO: SearchHit[] = [
  { task: task("t5", "Send the Acme invoice", { state: "done" }), projectName: "Acme launch", context: null },
  { task: task("t6", "Chase the Acme contract", { state: "dropped" }), projectName: null, context: null },
];
const PROJECTS = [
  { id: "p1", name: "Acme launch", area: "Work" },
  { id: "p2", name: "Website", area: "Work" },
  { id: "p3", name: "Website", area: "Personal" },
];
const TAGS = [
  { id: "g1", name: "calls" },
  { id: "g2", name: "writing" },
];
const nothing = () => undefined;

export default function Preview() {
  const q = useLocalSearchParams<{ state?: string; add?: string }>();
  const state = q.state ?? "";
  const [query, setQuery] = useState(state === "start" ? "" : state === "none" ? "zebra" : "acme");
  const [filters, setFilters] = useState<SearchFilters>(state === "start" || state === "none" ? {} : { project: "p1", hasDeadline: true });
  const [adding, setAdding] = useState(Boolean(q.add));
  const found = state !== "start" && state !== "none" && query.trim() !== "";
  return (
    <PreviewRows today={TODAY}>
      <SearchView
        query={query}
        onQueryChange={setQuery}
        filters={filters}
        onFiltersChange={setFilters}
        projects={PROJECTS.slice(0, 2)}
        areas={[{ id: "a1", name: "Work" }]}
        tags={TAGS}
        searching={false}
        hits={found ? HITS : []}
        alsoFound={found ? ALSO : []}
        projectMatches={found ? [{ id: "p1", name: "Acme launch" }, { id: "p9", name: "Acme 2025", note: "Completed" }] : []}
        areaMatches={found ? [{ id: "a9", name: "Acme" }] : []}
        today={TODAY}
        defaultEstimateMin={35}
        onOpen={nothing}
        onComplete={nothing}
        onMove={nothing}
        onOpenProject={nothing}
        onOpenArea={nothing}
        onAddTask={() => setAdding(true)}
        older={
          query.trim() ? (
            <OlderFoundView
              rows={state === "older" ? [{ id: "o1", title: "Draft the Acme pitch", detail: "Acme launch · Tue 3 Nov", reopens: true }, { id: "o2", title: "Acme weekly check-in", detail: "Mon 2 Nov", reopens: false }] : []}
              status="idle"
              more={state === "older" ? true : state === "asked" ? false : null}
              onLoad={nothing}
              onOpen={nothing}
              onReopen={nothing}
            />
          ) : null
        }
      />
      <QuickAddView
        open={adding}
        initial={q.add ? "" : query}
        projects={PROJECTS}
        tags={TAGS}
        ctx={{ now: NOW, zone: "Europe/London", today: TODAY }}
        here={q.add === "day" ? { day: TODAY.add({ days: 3 }) } : q.add === "project" ? { projectId: "p1" } : null}
        onClose={() => setAdding(false)}
        onSubmit={async () => undefined}
        usual={(t) => (t.estimateMin === 30 ? 50 : null)}
        dayLine={(draft) => (draft.doDate ? <DayEffectLine text={draft.estimateMin ? "Leaves 2h 50m spare today" : "Leaves 2h 45m spare today · counted as 35m"} over={false} /> : null)}
      />
    </PreviewRows>
  );
}
