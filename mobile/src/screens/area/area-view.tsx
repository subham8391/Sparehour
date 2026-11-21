// An area's page as the phone draws it (SCREENS.md §9 "Responsive": the cards stack in one column). The name, edited
// in place; its active projects as cards, each with its bar of what was finished this week against what is open, its
// figures and its nearest deadline; "Add project" last; the tasks filed in the area directly, with an add line; and
// its completed and archived projects folded away. The header's ⋯ deletes the area, after saying what stays.
// Presentational: it is handed everything it shows, and the add line only asks (its screen opens the add sheet).
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { compareDates, type LocalDate } from "@/core/time";
import type { Task } from "@/core/types";
import { projectStateLabel, type ProjectStateRow } from "@/data/queries/nav";
import type { DayPart } from "@/features/looks/look";
import type { SnoozePreset } from "@/features/tasks/snooze";
import { deadlineWording } from "@/ui/relative-day";
import { OrganiseSheet, type OrganiseStep } from "~/screens/browse/organise-sheet";
import { AddLine } from "~/ui/add-line";
import { Button } from "~/ui/button";
import { Card, CardRow } from "~/ui/card";
import { Chip } from "~/ui/chip";
import { CollapsedGroup } from "~/ui/collapsed-group";
import { Empty } from "~/ui/empty";
import { Icon } from "~/ui/icon";
import { NameField } from "~/ui/name-field";
import { NavRow, RowMore } from "~/ui/nav-row";
import { IconButton, Screen } from "~/ui/screen";
import { SectionLabel } from "~/ui/section-label";
import { TaskLine } from "~/ui/task-line";
import { TARGET, font, useColours } from "~/ui/theme";
import { rowDetail } from "../project/row-detail";
import { TaskMenu } from "../project/task-menu";
import { TitleField } from "../project/title-field";

/** One active project of the area, as its card shows it. */
export interface AreaCard {
  id: string;
  name: string;
  /** The bar's share, 0–1: finished this week against those plus the open ones. */
  share: number;
  /** "3 done this week · 9 open · ~4h" */
  figures: string;
  /** The nearest deadline among its open tasks, else the project's own. */
  deadline: LocalDate | null;
}

export interface AreaViewProps {
  id: string;
  name: string;
  part?: DayPart;
  today: LocalDate;
  defaultEstimateMin: number;
  /** "3 projects"; left out until the cards have been read. */
  count?: string;
  cards: readonly AreaCard[];
  /** Its completed and archived projects, the most recently finished first. */
  finished: readonly ProjectStateRow[];
  /** The open tasks filed in the area directly, in their order. */
  tasks: readonly Task[];
  /** The snooze presets for a row's ⋯; empty until the account's day and zone are known. */
  presets: readonly SnoozePreset[];
  /** The sentence under "Delete “Work”?": what stays, and where. */
  deleteNote: string;
  onRename: (name: string) => void;
  onOpenProject: (projectId: string) => void;
  onAddProject: (name: string) => void;
  /** The add line was tapped: a new task, filed in the area. */
  onAdd: () => void;
  onComplete: (task: Task) => void;
  onOpen: (task: Task) => void;
  onMoveTask: (task: Task, dir: -1 | 1) => void;
  onSnooze: (task: Task, preset: SnoozePreset) => void;
  onSomeday: (task: Task) => void;
  onDelete: () => void;
}

const nothing = () => undefined;

export function AreaView(p: AreaViewProps) {
  const c = useColours();
  const [addingProject, setAddingProject] = useState(false);
  const [menu, setMenu] = useState<Task | null>(null);
  /** The header's ⋯: its one line, then the confirmation. Null while it is closed. */
  const [organising, setOrganising] = useState<OrganiseStep | null>(null);
  const at = menu ? p.tasks.findIndex((t) => t.id === menu.id) : -1;

  return (
    <>
      <Screen title="Area" back part={p.part} actions={<IconButton icon="more" label="Area actions" onPress={() => setOrganising("menu")} />}>
        <Card>
          <TitleField label="Area name" value={p.name} onSave={p.onRename} />
          {p.count ? (
            <CardRow style={styles.figures}>
              <Text style={[styles.figuresText, { color: c.ink2 }]}>{p.count}</Text>
            </CardRow>
          ) : null}
        </Card>

        <View style={styles.cards}>
          {p.cards.map((card) => {
            const missed = Boolean(card.deadline && compareDates(card.deadline, p.today) < 0);
            const deadline = card.deadline ? deadlineWording(card.deadline, p.today).label : null;
            return (
              <Pressable key={card.id} accessibilityRole="button" accessibilityLabel={`${card.name}, ${card.figures}`} onPress={() => p.onOpenProject(card.id)}>
                {({ pressed }) => (
                  <Card style={[styles.card, pressed && { backgroundColor: c.surface2 }]}>
                    <Text numberOfLines={2} style={[styles.cardName, { color: c.ink }]}>
                      {card.name}
                    </Text>
                    {/* One static line: the words beside it carry the figures. */}
                    <View aria-hidden testID="project-progress" style={[styles.bar, { backgroundColor: c.line }]}>
                      <View style={[styles.barFill, { backgroundColor: c.ink3, width: `${Math.round(card.share * 100)}%` }]} />
                    </View>
                    <View style={styles.cardFoot}>
                      <Text style={[styles.cardFigures, { color: c.ink2 }]}>{card.figures}</Text>
                      {deadline ? <Chip tone={missed ? "deadline" : "neutral"} label={deadline} accessibilityLabel={`${missed ? "Deadline missed" : "Deadline"} ${deadline}`} /> : null}
                    </View>
                  </Card>
                )}
              </Pressable>
            );
          })}
          {addingProject ? (
            <NameField
              label="Project name"
              style={styles.newProject}
              onDone={(name) => {
                setAddingProject(false);
                if (name.trim()) p.onAddProject(name.trim());
              }}
            />
          ) : (
            <Pressable accessibilityRole="button" accessibilityLabel="Add project" onPress={() => setAddingProject(true)}>
              {({ pressed }) => (
                <Card style={[styles.addProject, pressed && { backgroundColor: c.surface2 }]}>
                  <Icon name="plus" size={18} color={c.ink2} />
                  <Text style={[styles.addProjectText, { color: c.ink2 }]}>Add project</Text>
                </Card>
              )}
            </Pressable>
          )}
        </View>

        {/* Tasks filed in the area directly, with no project. */}
        <SectionLabel label="Tasks" />
        <Card>
          {p.tasks.map((task, i) => (
            <CardRow key={task.id} first={i === 0} style={styles.row}>
              <View style={styles.line}>
                <TaskLine task={task} today={p.today} defaultEstimateMin={p.defaultEstimateMin} detail={rowDetail(task, p.today)} onComplete={p.onComplete} onPress={p.onOpen} />
              </View>
              <View style={styles.more}>
                <RowMore label={`More actions for ${task.title}`} onPress={() => setMenu(task)} />
              </View>
            </CardRow>
          ))}
          <CardRow first={p.tasks.length === 0}>
            <AddLine label={`Add to ${p.name}`} onPress={p.onAdd} />
          </CardRow>
        </Card>

        {/* Finished projects stay reachable from their area, folded away. */}
        {p.finished.length > 0 ? (
          <View style={styles.finished}>
            <CollapsedGroup label="Completed and archived" count={p.finished.length}>
              <Card>
                {p.finished.map((project, i) => (
                  <CardRow key={project.id} first={i === 0}>
                    <NavRow label={project.name ?? "Untitled project"} dot quiet note={projectStateLabel(project.state) ?? undefined} onPress={() => p.onOpenProject(project.id)} />
                  </CardRow>
                ))}
              </Card>
            </CollapsedGroup>
          </View>
        ) : null}
      </Screen>

      <TaskMenu
        task={menu}
        presets={p.presets}
        canMoveUp={at > 0}
        canMoveDown={at >= 0 && at < p.tasks.length - 1}
        onMove={p.onMoveTask}
        onComplete={p.onComplete}
        onSnooze={p.onSnooze}
        onSomeday={p.onSomeday}
        onClose={() => setMenu(null)}
      />
      {/* The area's ⋯ has one line, "Delete area…"; moving an area up or down is Browse's. */}
      <OrganiseSheet
        target={organising ? { kind: "area", id: p.id, name: p.name } : null}
        step={organising ?? "menu"}
        canMoveUp={false}
        canMoveDown={false}
        areas={[]}
        areaId={null}
        deleteNote={p.deleteNote}
        onStep={setOrganising}
        onNudge={nothing}
        onMoveTo={nothing}
        onDelete={() => {
          setOrganising(null);
          p.onDelete();
        }}
        onClose={() => setOrganising(null)}
      />
    </>
  );
}

/** An area that is not on this phone (deleted elsewhere, or a link from another account). */
export function AreaMissingView({ onBrowse }: { onBrowse: () => void }) {
  return (
    <Screen title="Not here" eyebrow="Area" back>
      <Empty title="This area isn’t on this device.">
        <Button variant="quiet" label="Browse" onPress={onBrowse} style={styles.browse} />
      </Empty>
    </Screen>
  );
}

/** While the area is being read from the phone's database: the frame, so Back is there at once. */
export function AreaOpeningView() {
  const c = useColours();
  return (
    <Screen title="Area" back>
      <Text style={[styles.opening, { color: c.ink3 }]}>Opening…</Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  figures: { minHeight: TARGET, justifyContent: "center", paddingHorizontal: 16 },
  figuresText: { fontFamily: font.medium, fontSize: 15, fontVariant: ["tabular-nums"] },
  cards: { marginTop: 16, gap: 12 },
  card: { padding: 16, gap: 8 },
  cardName: { fontFamily: font.medium, fontSize: 17, lineHeight: 23 },
  bar: { height: 4, borderRadius: 2, overflow: "hidden" },
  barFill: { height: 4, borderRadius: 2 },
  cardFoot: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 },
  cardFigures: { fontFamily: font.regular, fontSize: 14, lineHeight: 20, fontVariant: ["tabular-nums"] },
  addProject: { minHeight: 52, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  addProjectText: { fontFamily: font.medium, fontSize: 17 },
  newProject: { marginHorizontal: 16 },
  row: { flexDirection: "row", alignItems: "center" },
  line: { flex: 1 },
  more: { marginLeft: -12 },
  finished: { marginTop: 6 },
  browse: { alignSelf: "flex-start", marginLeft: -12 },
  opening: { marginHorizontal: 22, fontFamily: font.regular, fontSize: 17 },
});
