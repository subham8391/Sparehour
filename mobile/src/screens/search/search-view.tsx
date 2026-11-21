// Search as the phone draws it (SCREENS.md §13 "Responsive": full-screen, entered from Browse): the field with the
// keyboard up, the filters behind an "Add filter" button with the active ones as removable chips in one row that
// scrolls sideways, then what was found as the web groups it: Tasks, Projects, Areas, and "Also found" folded
// (done, dropped, not started yet). A task's row says where the words were found under its title; a tap opens it, the
// ring completes it (or reopens a finished one), and an open task's ⋯ offers what its own list offers, the snooze
// presets and Someday. Under the results, the way to what was finished before the week the phone holds. Before
// there is anything to search for it says what it searches, and when nothing matched it offers the words as a task.
// Presentational: it is handed what was found and says what was chosen; search.tsx reads and writes.
import { useState, type ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import type { Instant, LocalDate } from "@/core/time";
import type { Task } from "@/core/types";
import type { DayPart } from "@/features/looks/look";
import { FILTER_STATES, datePresets } from "@/features/search/filter-choices";
import { HIT_MOVE_LABEL, hitMoves, type HitMove } from "@/features/search/hit-moves";
import { STATE_LABEL, filterLabel, hasFilters, type FilterKey, type SearchFilters, type Snippet } from "@/features/search/search";
import { dayChip } from "@/features/tasks/day-chip";
import { snoozePresets, type SnoozePreset } from "@/features/tasks/snooze";
import { ActionLine } from "~/ui/action-line";
import { Button } from "~/ui/button";
import { Card, CardRow } from "~/ui/card";
import { Chip } from "~/ui/chip";
import { ChipRow, RemovableChip } from "~/ui/chip-button";
import { CollapsedGroup } from "~/ui/collapsed-group";
import { Empty } from "~/ui/empty";
import { Icon } from "~/ui/icon";
import { MenuDivider, MenuHeading, MenuRow } from "~/ui/menu-row";
import { NavRow, RowMore } from "~/ui/nav-row";
import { IconButton, Screen } from "~/ui/screen";
import { SectionLabel } from "~/ui/section-label";
import { Sheet } from "~/ui/sheet";
import { TaskLine } from "~/ui/task-line";
import { TextField } from "~/ui/text-field";
import { font, useColours } from "~/ui/theme";

export interface SearchHit {
  task: Task;
  projectName: string | null;
  /** Where the words were found, when it was not the title: a line of the notes or of a step. */
  context: { where: "notes" | "step"; snippet: Snippet } | null;
}

export interface Named {
  id: string;
  name: string;
  /** A project's state when it is not active ("Completed", "Archived", "Someday"), said quietly beside its name. */
  note?: string | null;
}

export interface SearchViewProps {
  part?: DayPart;
  query: string;
  onQueryChange: (query: string) => void;
  filters: SearchFilters;
  onFiltersChange: (filters: SearchFilters) => void;
  /** Everything the filters can choose from. */
  projects: readonly { id: string; name: string }[];
  areas: readonly { id: string; name: string }[];
  tags: readonly { name: string }[];
  /** True while the statements run for a search. */
  searching: boolean;
  hits: readonly SearchHit[];
  alsoFound: readonly SearchHit[];
  projectMatches: readonly Named[];
  areaMatches: readonly Named[];
  today: LocalDate;
  now: Instant;
  zone: string;
  defaultEstimateMin: number;
  onOpen: (task: Task) => void;
  onComplete: (task: Task) => void;
  /** Today, Tomorrow, Someday, Drop, Reopen or Restore: what the task's own list offers. */
  onMove: (task: Task, move: HitMove) => void;
  /** This evening, In 4 hours, This weekend or Next week. */
  onSnooze: (task: Task, preset: SnoozePreset) => void;
  onOpenProject: (id: string) => void;
  onOpenArea: (id: string) => void;
  onAddTask: (title: string) => void;
  /** Under the results: the way to what was finished before the week the phone holds (older-found.tsx). */
  older?: ReactNode;
}

const open = (task: Task) => task.state === "inbox" || task.state === "active" || task.state === "someday";

export function SearchView(p: SearchViewProps) {
  const c = useColours();
  const { filters, onFiltersChange } = p;
  const [filterSheet, setFilterSheet] = useState(false);
  const [menu, setMenu] = useState<Task | null>(null);
  const names = { projects: new Map(p.projects.map((x) => [x.id, x.name])), areas: new Map(p.areas.map((x) => [x.id, x.name])) };
  const active = (Object.keys(filters) as FilterKey[]).filter((k) => filters[k] !== undefined && filters[k] !== false && filters[k] !== "");
  const set = (patch: SearchFilters) => {
    setFilterSheet(false);
    onFiltersChange({ ...filters, ...patch });
  };
  const remove = (key: FilterKey) => {
    const next = { ...filters };
    delete next[key];
    if (key === "from") delete next.to;
    onFiltersChange(next);
  };
  const words = p.query.trim();
  const isSearch = words.length > 0 || hasFilters(filters);
  const nothing = isSearch && !p.searching && p.hits.length === 0 && p.alsoFound.length === 0 && p.projectMatches.length === 0 && p.areaMatches.length === 0;

  /** A choice from a row's sheet: the sheet closes, then the choice is made. */
  const choose = (run: (task: Task) => void) => () => {
    const task = menu;
    setMenu(null);
    if (task) run(task);
  };
  const moves = menu ? hitMoves(menu, p.today) : [];
  const said = new Set(moves.map((m) => HIT_MOVE_LABEL[m]));
  // Under the row's own moves, the snooze presets; one that says the same as a move ("Tomorrow") steps aside.
  const presets = menu ? snoozePresets(p.now, p.zone, p.today).filter((preset) => !said.has(preset.label)) : [];

  const hit = (h: SearchHit, first: boolean) => {
    const { task } = h;
    const context = h.context ? (
      <View style={styles.context}>
        {h.context.where === "step" ? <View aria-hidden style={[styles.step, { borderColor: c.lineControl }]} /> : null}
        <Text numberOfLines={1} accessibilityLabel={`Found in ${h.context.where === "step" ? "a step" : "the notes"}: ${h.context.snippet.before}${h.context.snippet.match}${h.context.snippet.after}`} style={[styles.contextText, { color: c.ink2 }]}>
          {h.context.snippet.before}
          <Text style={[styles.match, { color: c.ink, backgroundColor: c.surface2 }]}>{h.context.snippet.match}</Text>
          {h.context.snippet.after}
        </Text>
      </View>
    ) : null;
    if (task.state === "dropped" || task.state === "archived") {
      // A dropped task offers Restore; an archived one only opens.
      const detail = [STATE_LABEL[task.state], h.projectName].filter(Boolean).join(" · ");
      return (
        <CardRow key={task.id} first={first}>
          <ActionLine title={task.title} detail={detail} onPress={() => p.onOpen(task)} action={task.state === "dropped" ? { label: HIT_MOVE_LABEL.restore, accessibilityLabel: `${HIT_MOVE_LABEL.restore} ${task.title}`, onPress: () => p.onMove(task, "restore") } : undefined} />
          {context}
        </CardRow>
      );
    }
    const done = task.state === "done";
    const day = done ? null : dayChip(task, p.today);
    return (
      <CardRow key={task.id} first={first}>
        <View style={styles.row}>
          <View style={styles.line}>
            <TaskLine
              task={task}
              today={p.today}
              defaultEstimateMin={p.defaultEstimateMin}
              // Where it is filed and its tags, as the web's row says them under the title.
              detail={[h.projectName, ...(task.tags ?? []).map((t) => `@${t}`)].filter(Boolean).join(" · ") || undefined}
              done={done}
              // A finished task says so; any other says its day (a carried one already carries its count).
              extra={done ? <Chip label={STATE_LABEL.done} /> : day && day.tone !== "carried" ? <Chip tone="time" label={day.label} /> : undefined}
              onComplete={done ? () => p.onMove(task, "reopen") : p.onComplete}
              onPress={p.onOpen}
            />
          </View>
          {open(task) ? (
            <View style={styles.more}>
              <RowMore label={`More actions for ${task.title}`} onPress={() => setMenu(task)} />
            </View>
          ) : null}
        </View>
        {context}
      </CardRow>
    );
  };
  const list = (hits: readonly SearchHit[]) => <Card>{hits.map((h, i) => hit(h, i === 0))}</Card>;

  return (
    <Screen title="Find anything" eyebrow="Search" back part={p.part}>
      <View style={styles.field}>
        <TextField accessibilityLabel="Search" autoFocus placeholder="Search tasks, notes, steps, projects…" value={p.query} onChangeText={p.onQueryChange} autoCorrect={false} autoCapitalize="none" autoComplete="off" spellCheck={false} returnKeyType="search" style={styles.input} />
        {p.query ? <IconButton icon="close" label="Clear the search" onPress={() => p.onQueryChange("")} /> : null}
      </View>

      {/* The chips scroll sideways; the button that adds one stays put before them. */}
      <View style={styles.filters}>
        <Button label="Filter" accessibilityLabel="Add filter" icon={<Icon name="plus" size={16} color={c.ink3} />} variant="quiet" onPress={() => setFilterSheet(true)} />
        <View style={styles.line}>
          <ChipRow label="Filters">
            {active.map((key) => {
              const label = filterLabel(key, filters, names);
              return label ? <RemovableChip key={key} label={label} removeLabel={`Remove filter ${label}`} onRemove={() => remove(key)} /> : null;
            })}
          </ChipRow>
        </View>
      </View>

      {!isSearch ? <Text style={[styles.about, { color: c.ink2 }]}>Titles, notes, checklist steps, projects and areas. Add a filter to browse tasks without typing.</Text> : null}

      {nothing ? (
        <View style={styles.nothing}>
          <Empty title={words ? `Nothing matched ${words}.` : "Nothing matched those filters."}>{words ? <Button variant="quiet" label={`Add “${words}” as a task`} onPress={() => p.onAddTask(words)} style={styles.emptyAction} /> : null}</Empty>
        </View>
      ) : null}

      {p.hits.length > 0 ? (
        <>
          <SectionLabel label="Tasks" count={p.hits.length} />
          {list(p.hits)}
        </>
      ) : null}

      {p.projectMatches.length > 0 ? (
        <>
          <SectionLabel label="Projects" count={p.projectMatches.length} />
          <Card>
            {p.projectMatches.map((x, i) => (
              <CardRow key={x.id} first={i === 0}>
                <NavRow dot label={x.name} note={x.note ?? undefined} accessibilityLabel={x.note ? `${x.name}, ${x.note}` : x.name} onPress={() => p.onOpenProject(x.id)} />
              </CardRow>
            ))}
          </Card>
        </>
      ) : null}

      {p.areaMatches.length > 0 ? (
        <>
          <SectionLabel label="Areas" count={p.areaMatches.length} />
          <Card>
            {p.areaMatches.map((x, i) => (
              <CardRow key={x.id} first={i === 0}>
                <NavRow icon="grid" label={x.name} onPress={() => p.onOpenArea(x.id)} />
              </CardRow>
            ))}
          </Card>
        </>
      ) : null}

      {p.alsoFound.length > 0 ? (
        <View style={styles.also}>
          <CollapsedGroup label="Also found · done, dropped or not started yet" count={p.alsoFound.length}>
            {list(p.alsoFound)}
          </CollapsedGroup>
        </View>
      ) : null}

      {p.older}

      <Sheet open={filterSheet} title="Add filter" onClose={() => setFilterSheet(false)}>
        <Group label="Project">
          {p.projects.map((x) => (
            <MenuRow key={x.id} label={`#${x.name}`} current={filters.project === x.id} onPress={() => set({ project: x.id })} />
          ))}
        </Group>
        <Group label="Area">
          {p.areas.map((x) => (
            <MenuRow key={x.id} label={x.name} current={filters.area === x.id} onPress={() => set({ area: x.id })} />
          ))}
        </Group>
        <Group label="Tag">
          {p.tags.map((x) => (
            <MenuRow key={x.name} label={`@${x.name}`} current={filters.tag === x.name} onPress={() => set({ tag: x.name })} />
          ))}
        </Group>
        <Group label="State">
          {FILTER_STATES.map((s) => (
            <MenuRow key={s} label={STATE_LABEL[s]} current={filters.state === s} onPress={() => set({ state: s })} />
          ))}
        </Group>
        <Group label="Do-date">
          {datePresets(p.today).map((x) => (
            <MenuRow key={x.label} label={x.label} current={filters.from === x.from && filters.to === x.to} onPress={() => set({ from: x.from, to: x.to })} />
          ))}
        </Group>
        <Group label="Other">
          <MenuRow label="Has a deadline" current={filters.hasDeadline === true} onPress={() => set({ hasDeadline: true })} />
          <MenuRow label="No estimate" current={filters.noEstimate === true} onPress={() => set({ noEstimate: true })} />
        </Group>
      </Sheet>

      <Sheet open={menu !== null} onClose={() => setMenu(null)}>
        <Text accessibilityRole="header" numberOfLines={2} style={[styles.menuTitle, { color: c.ink }]}>
          {menu?.title ?? ""}
        </Text>
        <View>
          {moves.map((move) => (
            <MenuRow key={move} label={HIT_MOVE_LABEL[move]} onPress={choose((task) => p.onMove(task, move))} />
          ))}
          <MenuRow label="Complete" onPress={choose(p.onComplete)} />
          <MenuDivider />
          {presets.map((preset) => (
            <MenuRow key={preset.id} label={preset.label} onPress={choose((task) => p.onSnooze(task, preset))} />
          ))}
          {/* Someday for every open task not there yet, after the presets, as on the web's row menu. */}
          {menu && menu.state !== "someday" && !moves.includes("someday") ? <MenuRow label={HIT_MOVE_LABEL.someday} onPress={choose((task) => p.onMove(task, "someday"))} /> : null}
        </View>
      </Sheet>
    </Screen>
  );
}

/** A named run of a sheet's lines; nothing when it has none. */
function Group({ label, children }: { label: string; children: ReactNode[] | ReactNode }) {
  if (Array.isArray(children) && children.length === 0) return null;
  return (
    <View accessibilityLabel={label}>
      <MenuHeading label={label} />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { flexDirection: "row", alignItems: "center", gap: 4, marginHorizontal: 16 },
  input: { flex: 1 },
  filters: { flexDirection: "row", alignItems: "center", gap: 4, marginLeft: 8, marginTop: 8 },
  nothing: { marginTop: 12 },
  more: { marginLeft: -12, justifyContent: "center" },
  about: { fontFamily: font.regular, fontSize: 15, lineHeight: 22, marginHorizontal: 20, marginTop: 10 },
  emptyAction: { alignSelf: "flex-start", marginLeft: -12 },
  row: { flexDirection: "row", alignItems: "stretch" },
  line: { flex: 1 },
  context: { flexDirection: "row", alignItems: "center", gap: 6, marginLeft: 52, marginRight: 16, marginTop: -4, marginBottom: 10 },
  step: { width: 10, height: 10, borderRadius: 2, borderWidth: 1 },
  contextText: { flex: 1, fontFamily: font.regular, fontSize: 13, lineHeight: 18 },
  match: { fontFamily: font.semibold },
  also: { marginTop: 14 },
  menuTitle: { fontFamily: font.semibold, fontSize: 18, lineHeight: 24 },
});
