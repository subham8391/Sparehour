// The detail's plain pickers as bottom sheets (SCREENS.md §10): Estimate (and Took, which is the same picker),
// Priority, Project or Area, Heading, If missed, and the footer's More actions. Presentational: the choices and their
// words are the web's own (features/tasks/detail-rules.ts, estimate-presets.ts, data/queries/project-label.ts).
import { Pressable, StyleSheet, View } from "react-native";
import { Text } from "~/ui/text";
import { formatMinutes } from "@/core/time";
import type { MissPolicy, Priority } from "@/core/types";
import { projectOptionLabel } from "@/data/queries/project-label";
import { MISS_POLICIES, PRIORITIES } from "@/features/tasks/detail-rules";
import { ESTIMATE_PRESETS } from "@/features/tasks/estimate-presets";
import { Button } from "~/ui/button";
import { Icon } from "~/ui/icon";
import { MenuHeading, MenuRow } from "~/ui/menu-row";
import { Sheet } from "~/ui/sheet";
import { font, useColours } from "~/ui/theme";
import { LengthField } from "./typed-fields";

const cancel = (onClose: () => void) => <Button variant="quiet" label="Cancel" onPress={onClose} />;

/** The estimate picker: the presets, a length typed in, and the way to clear it (`clear` names it). */
export function EstimateSheet({ open, title = "Estimate", value, clear = "No estimate", onChange, onClose }: { open: boolean; title?: string; value: number | null; clear?: string; onChange: (minutes: number | null) => void; onClose: () => void }) {
  const set = (minutes: number | null) => {
    onChange(minutes);
    onClose();
  };
  return (
    <Sheet open={open} title={title} onClose={onClose} footer={cancel(onClose)}>
      <View style={styles.wrap}>
        {ESTIMATE_PRESETS.map((m) => (
          <Button key={m} label={formatMinutes(m)} accessibilityLabel={value === m ? `${formatMinutes(m)}, chosen` : formatMinutes(m)} variant={value === m ? "primary" : "secondary"} onPress={() => set(m)} />
        ))}
      </View>
      <LengthField onSubmit={set} />
      {value != null ? <Button variant="quiet" label={clear} onPress={() => set(null)} style={styles.clear} /> : null}
    </Sheet>
  );
}

export function PrioritySheet({ open, value, onChange, onClose }: { open: boolean; value: Priority; onChange: (priority: Priority) => void; onClose: () => void }) {
  return (
    <Sheet open={open} title="Priority" onClose={onClose} footer={cancel(onClose)}>
      <View style={styles.wrap}>
        {PRIORITIES.map((x) => (
          <Button key={x.value} label={x.label} accessibilityLabel={value === x.value ? `${x.label}, chosen` : x.label} variant={value === x.value ? "primary" : "secondary"} onPress={() => (onChange(x.value), onClose())} />
        ))}
      </View>
    </Sheet>
  );
}

export interface ProjectSheetProps {
  open: boolean;
  projectId: string | null;
  areaId: string | null;
  /** `area` tells two projects of one name apart (PRODUCT_SPEC.md §5.4). */
  projects: readonly { id: string; name: string; area?: string | null }[];
  /** The areas a task can be filed in directly, after the projects (a project or an area, never both). */
  areas: readonly { id: string; name: string }[];
  onProject: (projectId: string | null) => void;
  onArea: (areaId: string) => void;
  onClose: () => void;
}

export function ProjectSheet({ open, projectId, areaId, projects, areas, onProject, onArea, onClose }: ProjectSheetProps) {
  return (
    <Sheet open={open} title="Project" onClose={onClose} footer={cancel(onClose)}>
      <View>
        <MenuRow label="No project" icon="inbox" onPress={() => (onProject(null), onClose())} />
        {projects.map((pr) => (
          <MenuRow key={pr.id} label={projectOptionLabel(pr, projects)} icon="grid" current={projectId === pr.id} onPress={() => (onProject(pr.id), onClose())} />
        ))}
        {/* Or straight into an area, with no project: a loose task in the area view (SCREENS.md §9). */}
        {areas.length > 0 ? <MenuHeading label="Areas" /> : null}
        {areas.map((a) => (
          <MenuRow key={a.id} label={a.name} accessibilityLabel={`Area ${a.name}`} current={areaId === a.id} onPress={() => (onArea(a.id), onClose())} />
        ))}
      </View>
    </Sheet>
  );
}

export function HeadingSheet({ open, headingId, headings, onChange, onClose }: { open: boolean; headingId: string | null; headings: readonly { id: string; title: string }[]; onChange: (headingId: string | null) => void; onClose: () => void }) {
  return (
    <Sheet open={open} title="Heading" onClose={onClose} footer={cancel(onClose)}>
      <View>
        <MenuRow label="No heading" current={headingId === null} onPress={() => (onChange(null), onClose())} />
        {headings.map((h) => (
          <MenuRow key={h.id} label={h.title} current={headingId === h.id} onPress={() => (onChange(h.id), onClose())} />
        ))}
      </View>
    </Sheet>
  );
}

/** If missed: each policy with what it does in a line under its name. */
export function MissedSheet({ open, value, onChange, onClose }: { open: boolean; value: MissPolicy; onChange: (policy: MissPolicy) => void; onClose: () => void }) {
  const c = useColours();
  return (
    <Sheet open={open} title="If missed" onClose={onClose} footer={cancel(onClose)}>
      <View>
        {MISS_POLICIES.map((m) => (
          <Pressable key={m.value} accessibilityRole="button" accessibilityLabel={m.label} accessibilityHint={m.help} accessibilityState={{ selected: value === m.value }} onPress={() => (onChange(m.value), onClose())} style={({ pressed }) => [styles.option, pressed && { backgroundColor: c.surface2 }]}>
            <View style={styles.optionWords}>
              <Text style={[styles.optionLabel, { color: c.ink }]}>{m.label}</Text>
              <Text style={[styles.optionHelp, { color: c.ink2 }]}>{m.help}</Text>
            </View>
            {value === m.value ? <Icon name="check" size={18} color={c.ink} strokeWidth={2} /> : null}
          </Pressable>
        ))}
      </View>
    </Sheet>
  );
}

/** One line of the footer's menu; left out of the list when its action is not offered. */
export interface MoreAction {
  label: string;
  onPress: () => void;
}

/** More actions: everything the footer does not show as a button (SCREENS.md §10 footer ⋯). */
export function MoreSheet({ open, title = "More actions", actions, onClose }: { open: boolean; title?: string; actions: readonly MoreAction[]; onClose: () => void }) {
  return (
    <Sheet open={open} title={title} onClose={onClose} footer={cancel(onClose)}>
      <View>
        {actions.map((a) => (
          <MenuRow key={a.label} label={a.label} onPress={a.onPress} />
        ))}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  clear: { alignSelf: "flex-start", marginLeft: -12 },
  option: { minHeight: 56, flexDirection: "row", alignItems: "center", gap: 12, marginHorizontal: -8, paddingHorizontal: 8, paddingVertical: 8, borderRadius: 10 },
  optionWords: { flex: 1, gap: 2 },
  optionLabel: { fontFamily: font.medium, fontSize: 17 },
  optionHelp: { fontFamily: font.regular, fontSize: 14, lineHeight: 20 },
});
