// Browse as the phone draws it (SCREENS.md §1 "Responsive", §22): the sidebar's phone form. A search entry, the areas
// with their projects (each with a ⋯ for the tap path of organising them), the completed and archived projects
// folded away, then Someday, Logbook, Carried over and Settings. Presentational: it is handed everything it shows.
import { useRef, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Text } from "~/ui/text";
import type { BrowseRow } from "@/app/(app)/browse/browse-rows";
import { projectStateLabel, type ProjectGroup, type ProjectStateRow } from "@/data/queries/nav";
import type { OrganiseTarget } from "@/features/projects/organise-place";
import { Button } from "~/ui/button";
import { Card, CardRow } from "~/ui/card";
import { CollapsedGroup } from "~/ui/collapsed-group";
import { Empty } from "~/ui/empty";
import { Icon } from "~/ui/icon";
import { NavRow, RowMore } from "~/ui/nav-row";
import { Screen } from "~/ui/screen";
import { SectionLabel } from "~/ui/section-label";
import { TextField } from "~/ui/text-field";
import { TARGET, font, useColours } from "~/ui/theme";

export type Adding = "area" | "project" | null;

export interface BrowseViewProps {
  /** The Areas → Projects tree in the navigation's own order; the trailing no-area group is a heading. */
  areas: readonly ProjectGroup[];
  /** Completed and archived projects, the most recently finished first. */
  finished: readonly ProjectStateRow[];
  /** Someday, Logbook, Carried over, Settings. */
  rows: readonly BrowseRow[];
  /** The name field that is open, if one is. */
  adding: Adding;
  onSearch: () => void;
  onAddArea: () => void;
  /** The name as typed; an empty one closes the field and makes nothing. */
  onCreate: (name: string) => void;
  onOpenArea: (id: string) => void;
  onOpenProject: (id: string) => void;
  onOrganise: (target: OrganiseTarget) => void;
  onOpenRow: (row: BrowseRow) => void;
  bottomRoom?: number;
}

export function BrowseView(p: BrowseViewProps) {
  const c = useColours();
  const addArea = (
    <Pressable accessibilityRole="button" accessibilityLabel="Add area" onPress={p.onAddArea} hitSlop={8} style={styles.add}>
      <Icon name="plus" size={14} color={c.ink2} strokeWidth={2} />
      <Text style={[styles.addText, { color: c.ink2 }]}>Add area</Text>
    </Pressable>
  );
  return (
    <Screen title="Everything else" eyebrow="Browse" bottomRoom={p.bottomRoom}>
      <Pressable accessibilityRole="button" accessibilityLabel="Search tasks, notes, projects" onPress={p.onSearch} style={[styles.search, { borderColor: c.lineStrong, backgroundColor: c.surface }]}>
        <Icon name="search" size={20} color={c.ink2} />
        <Text numberOfLines={1} style={[styles.searchText, { color: c.ink3 }]}>
          Search tasks, notes, projects
        </Text>
      </Pressable>

      <SectionLabel label="Areas" action={!p.adding && p.areas.length > 0 ? addArea : undefined} />
      {p.adding ? <NameField key={p.adding} what={p.adding} onCreate={p.onCreate} /> : null}
      {p.areas.length === 0 && !p.adding ? (
        <Empty title="No areas yet.">
          <Button variant="quiet" label="Add area" onPress={p.onAddArea} style={styles.emptyAction} />
        </Empty>
      ) : p.areas.length > 0 ? (
        <Card>
          {p.areas.map((a, i) => (
            <CardRow key={a.id} first={i === 0}>
              {a.loose ? (
                // Projects without an area: a heading for the rows under it, with no page of its own.
                <NavRow label={a.name} count={a.projects.length} accessibilityLabel={`${a.name}, ${a.projects.length}`} />
              ) : (
                <NavRow
                  label={a.name}
                  count={a.projects.length > 0 ? a.projects.length : undefined}
                  onPress={() => p.onOpenArea(a.id)}
                  trailing={<RowMore label={`Organise ${a.name}`} onPress={() => p.onOrganise({ kind: "area", id: a.id, name: a.name })} />}
                />
              )}
              {a.projects.map((project) => (
                <NavRow
                  key={project.id}
                  label={project.name}
                  dot
                  indent
                  quiet
                  onPress={() => p.onOpenProject(project.id)}
                  trailing={<RowMore label={`Organise ${project.name}`} onPress={() => p.onOrganise({ kind: "project", id: project.id, name: project.name })} />}
                />
              ))}
            </CardRow>
          ))}
        </Card>
      ) : null}

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

      <Card style={styles.views}>
        {p.rows.map((row, i) => (
          <CardRow key={row.id} first={i === 0}>
            <NavRow label={row.label} icon={row.icon} onPress={() => p.onOpenRow(row)} />
          </CardRow>
        ))}
      </Card>
    </Screen>
  );
}

/** The name of a new area or project: Done on the keyboard, or leaving the field, makes it; an empty name makes nothing. */
function NameField({ what, onCreate }: { what: Exclude<Adding, null>; onCreate: (name: string) => void }) {
  const [name, setName] = useState("");
  // Done and the blur that follows it are one answer, not two.
  const sent = useRef(false);
  const send = () => {
    if (sent.current) return;
    sent.current = true;
    onCreate(name);
  };
  const label = what === "area" ? "Area name" : "Project name";
  return <TextField accessibilityLabel={label} placeholder={label} autoFocus value={name} onChangeText={setName} returnKeyType="done" onSubmitEditing={send} onBlur={send} style={styles.name} />;
}

const styles = StyleSheet.create({
  search: { marginHorizontal: 16, minHeight: 48, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", gap: 12 },
  searchText: { flex: 1, fontFamily: font.regular, fontSize: 17 },
  add: { minHeight: TARGET, flexDirection: "row", alignItems: "center", gap: 4, marginVertical: -12 },
  addText: { fontFamily: font.semibold, fontSize: 14 },
  name: { marginHorizontal: 16, marginBottom: 8 },
  emptyAction: { alignSelf: "flex-start", marginLeft: -12 },
  finished: { marginTop: 6 },
  views: { marginTop: 22 },
});
