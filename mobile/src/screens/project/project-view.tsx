// A project's page as the phone draws it (SCREENS.md §9 "Responsive": one column, headings that fold, the notes
// folded to their first line). The name, edited in place; its figures, its area, its deadline and its notes in one
// card; the tasks under no heading, then each heading with its own; an add line ending every section; what a section
// finished in the last week behind "Show completed"; "Add a heading"; and the parked tasks folded away at the bottom.
// A row's ⋯ is the one every list has (screens/rows): its own lines here are the tap path for the drag (Move up ·
// Move down, and the headings it can move under), and a parked row's Today · Tomorrow. The header's ⋯ holds the
// project's own actions. Presentational: it is handed everything it shows, and an add line only says which section
// asked (its screen opens the add sheet).
import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Text, TextInput } from "~/ui/text";
import { compareDates, type Instant, type LocalDate } from "@/core/time";
import type { Heading, Project, Task } from "@/core/types";
import type { DayPart } from "@/features/looks/look";
import type { HeadingGroup } from "@/features/projects/organise";
import type { ProjectAction } from "@/features/projects/page-rules";
import { notePreview } from "@/ui/markdown-plain";
import { relativeDay } from "@/ui/relative-day";
import { OrganiseSheet } from "~/screens/browse/organise-sheet";
import { moveActions, type RowAction } from "~/screens/rows/row-menu";
import { TaskRow } from "~/screens/rows/task-row";
import { DateSheet } from "~/screens/task/day-sheets";
import { useDraft } from "~/screens/task/use-draft";
import { ActionLine } from "~/ui/action-line";
import { NoteBox } from "~/ui/note-box";
import { AddLine } from "~/ui/add-line";
import { Button } from "~/ui/button";
import { Card, CardRow } from "~/ui/card";
import { Chip } from "~/ui/chip";
import { CollapsedGroup } from "~/ui/collapsed-group";
import { Empty } from "~/ui/empty";
import { FieldRow } from "~/ui/field-row";
import { Icon } from "~/ui/icon";
import { NameField } from "~/ui/name-field";
import { NavRow, RowMore } from "~/ui/nav-row";
import { IconButton, Screen } from "~/ui/screen";
import { TARGET, font, useColours } from "~/ui/theme";
import { HeadingSheet, ProjectActionsSheet } from "./project-sheets";
import { rowDetail } from "./row-detail";
import { TitleField } from "./title-field";

export interface ProjectViewProps {
  project: Project;
  /** The area it is in; a tap on its row opens it. Null for a project without one. */
  area: { id: string; name: string } | null;
  part?: DayPart;
  today: LocalDate;
  now: Instant;
  zone: string;
  defaultEstimateMin: number;
  /** The header's figures: "12 open · ~14h". */
  summary: string;
  /** Nothing is in the project, open or parked. */
  empty: boolean;
  /** The open tasks: those under no heading first, then each heading in its order (groupByHeading). */
  groups: readonly HeadingGroup[];
  /** What each section finished in the last week, by heading id ("" for the tasks under no heading). */
  done: ReadonlyMap<string, readonly Task[]>;
  /** The project's parked tasks. */
  someday: readonly Task[];
  /** The header's ⋯ for the project's state (projectActions). */
  actions: readonly ProjectAction[];
  /** The areas "Move to area…" lists, in their order. */
  areas: readonly { id: string; name: string }[];
  onRename: (name: string) => void;
  onNotes: (notes: string | null) => void;
  onDeadline: (deadline: LocalDate | null) => void;
  onOpenArea: (areaId: string) => void;
  /** A state to set, or Duplicate. "Move to area…" opens the picker here and answers through `onMoveToArea`. */
  onAction: (action: ProjectAction) => void;
  onMoveToArea: (areaId: string | null) => void;
  /** An add line was tapped: a new task for the project (null), or for the heading whose section the line ends. */
  onAdd: (heading: Heading | null) => void;
  onComplete: (task: Task) => void;
  onOpen: (task: Task) => void;
  /** One place up or down among the tasks of the section it is listed in (`headingId` null: under no heading). */
  onMoveTask: (task: Task, headingId: string | null, dir: -1 | 1) => void;
  /** Under another heading, or out of its heading (null), last in that section. */
  onTaskHeading: (task: Task, headingId: string | null) => void;
  /** A parked row's moves: back onto today, or tomorrow. */
  onToday: (task: Task) => void;
  onTomorrow: (task: Task) => void;
  onAddHeading: (title: string) => void;
  onRenameHeading: (headingId: string, title: string) => void;
  onMoveHeading: (headingId: string, dir: -1 | 1) => void;
  onRemoveHeading: (headingId: string) => void;
}

const keyOf = (g: HeadingGroup) => g.heading?.id ?? "";
const toggled = (set: ReadonlySet<string>, key: string) => {
  const next = new Set(set);
  if (!next.delete(key)) next.add(key);
  return next;
};
const nothing = () => undefined;

export function ProjectView(p: ProjectViewProps) {
  const c = useColours();
  const { project, today } = p;
  /** Headings folded away, and sections whose completed tasks are shown. */
  const [folded, setFolded] = useState<ReadonlySet<string>>(new Set());
  const [doneShown, setDoneShown] = useState<ReadonlySet<string>>(new Set());
  // On a phone the notes start folded to their first line (SCREENS.md §9 "Responsive").
  const [notesOpen, setNotesOpen] = useState(false);
  const [sheet, setSheet] = useState<"actions" | "area" | "deadline" | null>(null);
  const [addingHeading, setAddingHeading] = useState(false);
  const [headingMenu, setHeadingMenu] = useState<{ heading: Heading; step: "menu" | "rename" } | null>(null);

  const sameNote = (a: string | null, b: string | null) => (a?.trim() || null) === (b?.trim() || null);
  const notes = useDraft(project.notes ?? "", (text) => {
    if (!sameNote(text, project.notes)) p.onNotes(text.trim() || null);
    return text;
  });
  // Folding the notes away takes the field with it, and a removed field gets no blur: what was typed is saved first.
  const toggleNotes = () => {
    if (notesOpen) notes.onBlur();
    setNotesOpen(!notesOpen);
  };
  const missed = Boolean(project.deadline && compareDates(project.deadline, today) < 0);
  const deadline = project.deadline ? relativeDay(project.deadline, today) : "None";
  const preview = notePreview(project.notes);
  const headings = p.groups.flatMap((g) => (g.heading ? [g.heading] : []));

  /** What a row offers in the section it is listed in ("someday" for a parked one). */
  const actionsFor = (task: Task, group: HeadingGroup | "someday"): RowAction[] => {
    // A parked row goes back onto a day.
    if (group === "someday") return moveActions({ onToday: () => p.onToday(task), onTomorrow: () => p.onTomorrow(task) });
    const at = group.tasks.findIndex((t) => t.id === task.id);
    const here = group.heading?.id ?? null;
    return [
      // The tap path for dragging a row: one place up or down in its section, where there is one.
      ...(at > 0 ? [{ label: "Move up", run: () => p.onMoveTask(task, here, -1) }] : []),
      ...(at >= 0 && at < group.tasks.length - 1 ? [{ label: "Move down", run: () => p.onMoveTask(task, here, 1) }] : []),
      // And for dragging it under another heading: out of its own, or under any other.
      ...(group.heading ? [{ label: "Move out of the heading", text: "No heading", run: () => p.onTaskHeading(task, null) }] : []),
      ...headings.filter((h) => h.id !== here).map((h) => ({ label: `Move to ${h.title}`, run: () => p.onTaskHeading(task, h.id) })),
    ];
  };
  const row = (task: Task, i: number, group: HeadingGroup | "someday") => (
    <CardRow key={task.id} first={i === 0}>
      <TaskRow task={task} today={today} defaultEstimateMin={p.defaultEstimateMin} detail={rowDetail(task, today, group !== "someday")} onComplete={p.onComplete} onOpen={p.onOpen} actions={actionsFor(task, group)} />
    </CardRow>
  );

  const section = (g: HeadingGroup) => {
    const finished = p.done.get(keyOf(g)) ?? [];
    const shown = doneShown.has(keyOf(g));
    return (
      <>
        <Card>
          {g.tasks.map((task, i) => row(task, i, g))}
          <CardRow first={g.tasks.length === 0}>
            <AddLine label={g.heading ? `Add to ${g.heading.title}` : "Add a task"} onPress={() => p.onAdd(g.heading)} />
          </CardRow>
        </Card>
        {/* What this section finished in the last week, behind its own disclosure. */}
        {finished.length > 0 ? (
          <>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${shown ? "Hide completed" : "Show completed"} · ${finished.length}${g.heading ? ` in ${g.heading.title}` : ""}`}
              accessibilityState={{ expanded: shown }}
              onPress={() => setDoneShown((s) => toggled(s, keyOf(g)))}
              style={styles.disclosure}
            >
              <Icon name={shown ? "chevron-down" : "chevron-right"} size={16} color={c.ink3} />
              <Text style={[styles.disclosureText, { color: c.ink2 }]}>
                {shown ? "Hide completed" : "Show completed"} · {finished.length}
              </Text>
            </Pressable>
            {shown ? (
              <Card>
                {finished.map((task, i) => (
                  <CardRow key={task.id} first={i === 0}>
                    <ActionLine title={task.title} mark="done" onPress={() => p.onOpen(task)} />
                  </CardRow>
                ))}
              </Card>
            ) : null}
          </>
        ) : null}
      </>
    );
  };

  const headingAt = headingMenu ? headings.findIndex((h) => h.id === headingMenu.heading.id) : -1;
  const closeHeading = () => setHeadingMenu(null);

  return (
    <>
      <Screen title="Project" eyebrow={p.area?.name} back part={p.part} actions={<IconButton icon="more" label="Project actions" onPress={() => setSheet("actions")} />}>
        <Card>
          <TitleField label="Project name" value={project.name} onSave={p.onRename} />
          <CardRow style={styles.figures}>
            <Text style={[styles.figuresText, { color: c.ink2 }]}>{p.summary}</Text>
            {project.state !== "active" ? <Chip label={project.state} /> : null}
          </CardRow>
          {p.area ? (
            <CardRow>
              <NavRow label={p.area.name} note="Area" accessibilityLabel={`${p.area.name}, area`} onPress={() => p.area && p.onOpenArea(p.area.id)} />
            </CardRow>
          ) : null}
          <CardRow>
            <FieldRow label="Deadline" value={deadline} says={`${missed ? "Missed, " : ""}${deadline}`} quiet={!project.deadline} chip={missed ? "deadline" : undefined} onPress={() => setSheet("deadline")} />
          </CardRow>
          <CardRow>
            <Pressable accessibilityRole="button" accessibilityLabel="Notes" accessibilityState={{ expanded: notesOpen }} onPress={toggleNotes} style={styles.notesHead}>
              <Icon name={notesOpen ? "chevron-down" : "chevron-right"} size={16} color={c.ink3} />
              <Text style={[styles.eyebrow, { color: c.ink3 }]}>NOTES</Text>
              {!notesOpen && preview ? (
                <Text numberOfLines={1} style={[styles.preview, { color: c.ink2 }]}>
                  {preview}
                </Text>
              ) : null}
            </Pressable>
            {notesOpen ? (
              <NoteBox label="Project notes" placeholder="What this project is for, links, decisions." note={notes} style={styles.notes} />
            ) : null}
          </CardRow>
        </Card>

        {p.empty ? (
          <View style={styles.gap}>
            <Empty title="Nothing in this project yet." line="Add the first task below." />
          </View>
        ) : null}

        {p.groups.map((g) => {
          if (!g.heading) {
            return (
              <View key="loose" style={styles.gap}>
                {section(g)}
              </View>
            );
          }
          const heading = g.heading;
          const collapsed = folded.has(heading.id);
          return (
            <View key={heading.id}>
              <View style={styles.heading}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${collapsed ? "Show" : "Fold away"} the tasks under ${heading.title}`}
                  accessibilityState={{ expanded: !collapsed }}
                  onPress={() => setFolded((s) => toggled(s, heading.id))}
                  style={styles.headingMain}
                >
                  <Icon name={collapsed ? "chevron-right" : "chevron-down"} size={16} color={c.ink3} />
                  <Text numberOfLines={1} style={[styles.eyebrow, styles.headingTitle, { color: c.ink3 }]}>
                    {heading.title.toUpperCase()}
                    {collapsed && g.tasks.length > 0 ? <Text style={{ color: c.ink }}>{` · ${g.tasks.length}`}</Text> : null}
                  </Text>
                </Pressable>
                <RowMore label={`Heading actions: ${heading.title}`} onPress={() => setHeadingMenu({ heading, step: "menu" })} />
              </View>
              {collapsed ? null : section(g)}
            </View>
          );
        })}

        {addingHeading ? (
          <NameField
            label="Heading name"
            style={styles.newHeading}
            onDone={(title) => {
              setAddingHeading(false);
              if (title.trim()) p.onAddHeading(title.trim());
            }}
          />
        ) : (
          <Button variant="quiet" label="Add a heading" icon={<Icon name="plus" size={16} color={c.ink3} />} onPress={() => setAddingHeading(true)} style={styles.addHeading} />
        )}

        {p.someday.length > 0 ? (
          <View style={styles.parked}>
            <CollapsedGroup label="Someday in this project" count={p.someday.length}>
              <Card>{p.someday.map((task, i) => row(task, i, "someday"))}</Card>
            </CollapsedGroup>
          </View>
        ) : null}
      </Screen>

      <ProjectActionsSheet
        open={sheet === "actions"}
        name={project.name}
        actions={p.actions}
        onAction={(action) => {
          // "Move to area…" is a second step here: the areas, the one it is in ticked, then "No area".
          if (action.id === "move") return setSheet("area");
          setSheet(null);
          p.onAction(action);
        }}
        onClose={() => setSheet(null)}
      />
      <OrganiseSheet
        target={sheet === "area" ? { kind: "project", id: project.id, name: project.name } : null}
        step="move"
        canMoveUp={false}
        canMoveDown={false}
        areas={p.areas}
        areaId={p.area?.id ?? null}
        deleteNote=""
        onStep={nothing}
        onNudge={nothing}
        onMoveTo={(areaId) => {
          setSheet(null);
          p.onMoveToArea(areaId);
        }}
        onDelete={nothing}
        onClose={() => setSheet(null)}
      />
      <DateSheet open={sheet === "deadline"} title="Deadline" value={project.deadline} now={p.now} zone={p.zone} today={today} onChange={p.onDeadline} onClose={() => setSheet(null)} />
      <HeadingSheet
        heading={headingMenu?.heading ?? null}
        step={headingMenu?.step ?? "menu"}
        canMoveUp={headingAt > 0}
        canMoveDown={headingAt >= 0 && headingAt < headings.length - 1}
        onStep={(step) => setHeadingMenu((m) => (m ? { ...m, step } : m))}
        onRename={(title) => headingMenu && p.onRenameHeading(headingMenu.heading.id, title)}
        onMove={(dir) => {
          if (headingMenu) p.onMoveHeading(headingMenu.heading.id, dir);
          closeHeading();
        }}
        onRemove={() => {
          if (headingMenu) p.onRemoveHeading(headingMenu.heading.id);
          closeHeading();
        }}
        onClose={closeHeading}
      />
    </>
  );
}

/** A project that is not on this phone (deleted elsewhere, or a link from another account). */
export function ProjectMissingView({ onBrowse }: { onBrowse: () => void }) {
  return (
    <Screen title="Not here" eyebrow="Project" back>
      <Empty title="This project isn’t on this device.">
        <Button variant="quiet" label="Browse" onPress={onBrowse} style={styles.browse} />
      </Empty>
    </Screen>
  );
}

/** While the project is being read from the phone's database: the frame, so Back is there at once. */
export function ProjectOpeningView() {
  const c = useColours();
  return (
    <Screen title="Project" back>
      <Text style={[styles.opening, { color: c.ink3 }]}>Opening…</Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  figures: { minHeight: TARGET, flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16 },
  figuresText: { flex: 1, fontFamily: font.medium, fontSize: 15, fontVariant: ["tabular-nums"] },
  notesHead: { minHeight: 48, flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16 },
  eyebrow: { fontFamily: font.semibold, fontSize: 13, letterSpacing: 1.3 },
  preview: { flex: 1, fontFamily: font.regular, fontSize: 15 },
  notes: { minHeight: 96, paddingHorizontal: 16, paddingTop: 4, paddingBottom: 14, fontFamily: font.regular, fontSize: 17, lineHeight: 24 },
  gap: { marginTop: 16 },
  heading: { flexDirection: "row", alignItems: "center", marginTop: 12, marginBottom: 2, marginLeft: 22, marginRight: 16 },
  headingMain: { flex: 1, minHeight: TARGET, flexDirection: "row", alignItems: "center", gap: 8 },
  headingTitle: { flex: 1, fontVariant: ["tabular-nums"] },
  disclosure: { minHeight: TARGET, flexDirection: "row", alignItems: "center", gap: 8, marginHorizontal: 22 },
  disclosureText: { fontFamily: font.medium, fontSize: 15, fontVariant: ["tabular-nums"] },
  parked: { marginTop: 6 },
  addHeading: { alignSelf: "flex-start", marginLeft: 10, marginTop: 8 },
  newHeading: { marginHorizontal: 16, marginTop: 12 },
  browse: { alignSelf: "flex-start", marginLeft: -12 },
  opening: { marginHorizontal: 22, fontFamily: font.regular, fontSize: 17 },
});
