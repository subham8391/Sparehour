// The Logbook's filters on the phone (SCREENS.md §8 Responsive "filters in a sheet behind a Filter button"; the web's
// logbook-filter-sheet.tsx): Done or Dropped, a date preset, a project, an area, a tag. Each tap applies at once, so
// the list behind is already narrowed when the sheet closes, and a second tap on the chosen row takes that filter off
// again. What a tap makes of the filters is the web's own rule (logbook-filters.ts).
import { View } from "react-native";
import { SHOW_OPTIONS, datePresets, filterKeys, withFilter, withoutFilter, type FilterOptions, type LogbookFilterKey, type LogbookFilters, type LogbookShow } from "@/app/(app)/logbook/logbook-filters";
import type { LocalDate } from "@/core/time";
import { Button } from "~/ui/button";
import { MenuHeading, MenuRow } from "~/ui/menu-row";
import { Segmented } from "~/ui/segmented";
import { Sheet } from "~/ui/sheet";

export function LogbookFilterSheet({ open, filters, onChange, options, today, onClose }: { open: boolean; filters: LogbookFilters; onChange: (filters: LogbookFilters) => void; /** The projects, areas and tags the Logbook has in it. */ options: FilterOptions; today: LocalDate; onClose: () => void }) {
  // A second tap on the chosen row takes that filter off again.
  const toggle = (key: LogbookFilterKey, on: boolean, patch: LogbookFilters) => onChange(on ? withoutFilter(filters, key) : withFilter(filters, patch));
  return (
    <Sheet
      open={open}
      title="Filter"
      onClose={onClose}
      footer={
        <>
          <Button variant="quiet" label="Clear all" disabled={filterKeys(filters).length === 0} onPress={() => onChange({})} />
          <Button variant="primary" label="Done" onPress={onClose} />
        </>
      }
    >
      <Segmented label="Show" options={SHOW_OPTIONS} value={filters.show ?? "all"} onChange={(v: "all" | LogbookShow) => onChange(v === "all" ? withoutFilter(filters, "show") : withFilter(filters, { show: v }))} />
      <View>
        <MenuHeading label="Dates" />
        {datePresets(today).map((d) => {
          const on = filters.from === d.from && filters.to === d.to;
          return <MenuRow key={d.label} label={d.label} current={on} onPress={() => toggle("dates", on, { from: d.from, to: d.to })} />;
        })}
      </View>
      {options.projects.length > 0 ? (
        <View>
          <MenuHeading label="Project" />
          {options.projects.map((p) => (
            <MenuRow key={p.id} label={`#${p.name}`} current={filters.project === p.id} onPress={() => toggle("project", filters.project === p.id, { project: p.id })} />
          ))}
        </View>
      ) : null}
      {options.areas.length > 0 ? (
        <View>
          <MenuHeading label="Area" />
          {options.areas.map((a) => (
            <MenuRow key={a.id} label={a.name} current={filters.area === a.id} onPress={() => toggle("area", filters.area === a.id, { area: a.id })} />
          ))}
        </View>
      ) : null}
      {options.tags.length > 0 ? (
        <View>
          <MenuHeading label="Tag" />
          {options.tags.map((t) => (
            <MenuRow key={t.name} label={`@${t.name}`} current={filters.tag === t.name} onPress={() => toggle("tag", filters.tag === t.name, { tag: t.name })} />
          ))}
        </View>
      ) : null}
    </Sheet>
  );
}
