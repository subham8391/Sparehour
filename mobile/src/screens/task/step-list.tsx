// The task's checklist on the phone (SCREENS.md §10 "Checklist"): one level, in the order the person gives it. A step
// is ticked by its box, renamed in place, and moved or removed from its ⋯ (Move up · Move down · Remove step, the tap
// path the web gives a phone); the last row adds a step. Each move writes the one sort key the web's would
// (features/tasks/checklist-order.ts). Presentational.
import { useState } from "react";
import { StyleSheet, TextInput, View } from "react-native";
import type { ChecklistItem } from "@/core/types";
import { keyForStep } from "@/features/tasks/checklist-order";
import { Card, CardRow } from "~/ui/card";
import { CheckBox } from "~/ui/check-box";
import { Icon } from "~/ui/icon";
import { RowMore } from "~/ui/nav-row";
import { SectionLabel } from "~/ui/section-label";
import { TARGET, font, useColours } from "~/ui/theme";
import { MoreSheet, type MoreAction } from "./choice-sheets";
import { useDraft } from "./use-draft";

export interface StepListProps {
  items: readonly ChecklistItem[];
  onAdd?: (title: string, sortKey?: string) => void;
  onToggle?: (id: string, done: boolean) => void;
  onRename?: (id: string, title: string) => void;
  onRemove?: (id: string) => void;
  onReorder?: (id: string, sortKey: string) => void;
  /** The checklist's ⋯: its steps become the tasks of a new project. */
  onConvert?: () => void;
}

export function StepList({ items, onAdd, onToggle, onRename, onRemove, onReorder, onConvert }: StepListProps) {
  const c = useColours();
  const [draft, setDraft] = useState("");
  // Whose ⋯ is open: a step's id, or "list" for the checklist's own.
  const [menu, setMenu] = useState<string | null>(null);
  const done = items.filter((i) => i.done).length;
  const add = () => {
    const title = draft.trim();
    if (!title) return;
    onAdd?.(title);
    setDraft("");
  };
  const move = (id: string, dir: -1 | 1) => {
    const key = keyForStep(items, id, dir);
    if (key) onReorder?.(id, key);
  };
  const at = items.findIndex((i) => i.id === menu);
  const step = at >= 0 ? items[at] : null;
  const close = () => setMenu(null);
  const actions: MoreAction[] = step
    ? [
        ...(onReorder && at > 0 ? [{ label: "Move up", onPress: () => (close(), move(step.id, -1)) }] : []),
        ...(onReorder && at < items.length - 1 ? [{ label: "Move down", onPress: () => (close(), move(step.id, 1)) }] : []),
        { label: "Remove step", onPress: () => (close(), onRemove?.(step.id)) },
      ]
    : menu === "list" && onConvert
      ? [{ label: "Convert to project", onPress: () => (close(), onConvert()) }]
      : [];
  return (
    <View>
      <SectionLabel label="Checklist" detail={items.length > 0 ? `${done} / ${items.length}` : undefined} action={onConvert && items.length > 0 ? <RowMore label="Checklist options" onPress={() => setMenu("list")} /> : undefined} />
      <Card>
        {items.map((item, i) => (
          <CardRow key={item.id} first={i === 0}>
            <Step item={item} onToggle={onToggle} onRename={onRename} onMenu={() => setMenu(item.id)} />
          </CardRow>
        ))}
        <CardRow first={items.length === 0} style={styles.row}>
          <View aria-hidden style={styles.slot}>
            <Icon name="plus" size={18} color={c.ink3} />
          </View>
          <TextInput
            accessibilityLabel="Add a step"
            placeholder="Add a step"
            placeholderTextColor={c.ink4}
            value={draft}
            onChangeText={setDraft}
            // The keyboard stays up after a step is added, so the next one can be typed straight away.
            submitBehavior="submit"
            returnKeyType="done"
            onSubmitEditing={add}
            onBlur={add}
            style={[styles.input, { color: c.ink }]}
          />
        </CardRow>
      </Card>
      <MoreSheet open={actions.length > 0} title={step ? step.title : "Checklist"} actions={actions} onClose={close} />
    </View>
  );
}

function Step({ item, onToggle, onRename, onMenu }: { item: ChecklistItem; onToggle?: (id: string, done: boolean) => void; onRename?: (id: string, title: string) => void; onMenu: () => void }) {
  const c = useColours();
  const title = useDraft(item.title, (text) => {
    const next = text.trim();
    if (next && next !== item.title) onRename?.(item.id, next);
    // An emptied step goes back to its words; removing it is its ⋯'s job.
    return next || item.title;
  });
  return (
    <View style={styles.row}>
      <CheckBox accessibilityLabel={`Done: ${item.title}`} checked={item.done} onChange={(checked) => onToggle?.(item.id, checked)} />
      <TextInput
        accessibilityLabel={`Step: ${item.title}`}
        value={title.draft}
        onChangeText={(t) => title.setDraft(t.replace(/\s*[\r\n]+\s*/g, " "))}
        onFocus={title.onFocus}
        onBlur={title.onBlur}
        multiline
        submitBehavior="blurAndSubmit"
        returnKeyType="done"
        style={[styles.input, { color: item.done ? c.ink3 : c.ink }, item.done && styles.struck]}
      />
      <RowMore label={`Step actions: ${item.title}`} onPress={onMenu} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { minHeight: 48, flexDirection: "row", alignItems: "center", paddingLeft: 4 },
  slot: { width: TARGET, height: TARGET, alignItems: "center", justifyContent: "center" },
  input: { flex: 1, minHeight: TARGET, paddingVertical: 10, paddingHorizontal: 0, fontFamily: font.medium, fontSize: 17, lineHeight: 23 },
  struck: { textDecorationLine: "line-through" },
});
