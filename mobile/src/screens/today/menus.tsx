// Today's menus as bottom sheets (SCREENS.md §2.1 ⋯, §2.3, §2.4; PRODUCT_SPEC.md §9.4; the web's are features/today/
// today-menu.tsx, the rows' "More actions" and trim-today.tsx): the screen's options, one row's actions, and Trim
// today. Presentational: each says what was picked. Trim's order and readout are the web's own (trim-order.ts).
import { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { TODAY_SORTS, type TodaySort } from "@/core/today/sort-options";
import { formatMinutes } from "@/core/time";
import type { Task } from "@/core/types";
import { FITS_CLOSE_MS, trimOrder, trimReadout } from "@/features/today/trim-order";
import { Button } from "~/ui/button";
import { Chip } from "~/ui/chip";
import { MenuDivider, MenuHeading, MenuRow } from "~/ui/menu-row";
import { Sheet } from "~/ui/sheet";
import { font, useColours } from "~/ui/theme";

export interface TodayMenuProps {
  open: boolean;
  onClose: () => void;
  /** Sort and Show completed: left out on a day that has passed, which has nothing to sort. */
  sort?: { value: TodaySort; onChange: (sort: TodaySort) => void };
  showCompleted?: { value: boolean; onChange: (show: boolean) => void };
  /** Today only, like Trim and the day as text. */
  onClearSlate?: () => void;
  onTrim?: () => void;
  onShareText?: () => void;
  /** Settings, where Sign out is too. */
  onSettings: () => void;
}

export function TodayMenuSheet(p: TodayMenuProps) {
  const run = (fn: () => void) => () => {
    p.onClose();
    fn();
  };
  return (
    <Sheet open={p.open} title="Today options" onClose={p.onClose} footer={<Button variant="quiet" label="Done" onPress={p.onClose} />}>
      {p.sort ? (
        <View accessibilityRole="radiogroup" accessibilityLabel="Sort">
          <MenuHeading label="Sort" />
          {TODAY_SORTS.map((o) => (
            <MenuRow key={o.value} label={o.label} current={p.sort?.value === o.value} onPress={run(() => p.sort?.onChange(o.value))} />
          ))}
          <MenuDivider />
        </View>
      ) : null}
      {p.showCompleted ? <MenuRow label="Show completed" current={p.showCompleted.value} onPress={run(() => p.showCompleted?.onChange(!p.showCompleted.value))} /> : null}
      {p.onClearSlate ? <MenuRow label="Clear the slate…" onPress={run(p.onClearSlate)} /> : null}
      {p.onTrim ? <MenuRow label="Trim today" onPress={run(p.onTrim)} /> : null}
      {p.onShareText ? <MenuRow label="Share today as text" icon="share" onPress={run(p.onShareText)} /> : null}
      <MenuDivider />
      <MenuRow label="Settings" icon="sliders" onPress={run(p.onSettings)} />
    </Sheet>
  );
}

export interface RowMenuItem {
  label: string;
  onPress: () => void;
}

/** A row's "More actions": what the web's row offers at phone width, by name. */
export function RowMenuSheet({ task, items, onClose }: { /** The row it is for; null while the sheet is shut. */ task: Task | null; items: readonly RowMenuItem[]; onClose: () => void }) {
  const c = useColours();
  return (
    <Sheet open={task !== null} title="More actions" onClose={onClose} footer={<Button variant="quiet" label="Cancel" onPress={onClose} />}>
      {task ? (
        <Text numberOfLines={2} style={[styles.task, { color: c.ink2 }]}>
          {task.title}
        </Text>
      ) : null}
      {items.map((item) => (
        <MenuRow
          key={item.label}
          label={item.label}
          onPress={() => {
            onClose();
            item.onPress();
          }}
        />
      ))}
    </Sheet>
  );
}

export interface TrimSheetProps {
  open: boolean;
  /** Today's open daytime tasks (not the evening's: they never use working-hours time). */
  tasks: readonly Task[];
  /** How far over the day is now, live; 0 when it fits. */
  overMin: number;
  defaultEstimateMin: number;
  onTomorrow: (task: Task) => void;
  onSomeday: (task: Task) => void;
  onDrop: (task: Task) => void;
  onClose: () => void;
}

/**
 * Trim today (PRODUCT_SPEC.md §9.4): today's daytime tasks by estimate, largest first, each with Tomorrow / Someday /
 * Drop, and a live readout that reads "Now fits" the moment the day fits, after which the sheet closes itself. The
 * moves are the rows' own, so each one is undoable. Nothing here is red.
 */
export function TrimSheet(p: TrimSheetProps) {
  return p.open ? <Trim {...p} /> : null;
}

function Trim({ tasks, overMin, defaultEstimateMin, onTomorrow, onSomeday, onDrop, onClose }: TrimSheetProps) {
  const c = useColours();
  // It closes itself once a trim has made the day fit; opened on a day that already fits, it stays until closed.
  const [wasOver, setWasOver] = useState(overMin > 0);
  if (overMin > 0 && !wasOver) setWasOver(true);
  const fits = overMin <= 0;
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });
  useEffect(() => {
    if (!fits || !wasOver) return;
    const timer = setTimeout(() => closeRef.current(), FITS_CLOSE_MS);
    return () => clearTimeout(timer);
  }, [fits, wasOver]);
  const list = trimOrder(tasks, defaultEstimateMin);
  return (
    <Sheet open title="Trim today" onClose={onClose} footer={<Button variant="quiet" label="Done" onPress={onClose} />}>
      {/* The live readout: amber words while over, never red; ink once it fits. */}
      <Text accessibilityLiveRegion="polite" style={[styles.readout, fits ? { color: c.ink, fontFamily: font.medium } : { color: c.over }]}>
        {fits && !wasOver ? "Today fits." : trimReadout(overMin)}
      </Text>
      {list.length === 0 ? (
        <Text style={[styles.task, styles.none, { color: c.ink2 }]}>Nothing left on today to move.</Text>
      ) : (
        list.map((t, i) => (
          <View key={t.id} style={[styles.trimRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line }]}>
            <View style={styles.trimTitle}>
              <Text numberOfLines={2} style={[styles.trimText, { color: c.ink }]}>
                {t.title}
              </Text>
              {t.estimateMin ? <Chip label={formatMinutes(t.estimateMin)} /> : <Chip tone="guess" label={`${formatMinutes(defaultEstimateMin)}?`} accessibilityLabel={`No estimate, counted as ${formatMinutes(defaultEstimateMin)}`} />}
            </View>
            <View style={styles.trimActions}>
              <Button variant="quiet" label="Tomorrow" accessibilityLabel={`Move ${t.title} to tomorrow`} onPress={() => onTomorrow(t)} style={styles.trimAction} />
              <Button variant="quiet" label="Someday" accessibilityLabel={`Move ${t.title} to Someday`} onPress={() => onSomeday(t)} style={styles.trimAction} />
              <Button variant="quiet" label="Drop" accessibilityLabel={`Drop ${t.title}`} onPress={() => onDrop(t)} style={styles.trimAction} />
            </View>
          </View>
        ))
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  task: { fontFamily: font.regular, fontSize: 15, lineHeight: 21, marginTop: -6 },
  none: { marginTop: 0 },
  readout: { fontFamily: font.regular, fontSize: 17, lineHeight: 23, marginTop: -6, fontVariant: ["tabular-nums"] },
  trimRow: { paddingTop: 10 },
  trimTitle: { flexDirection: "row", alignItems: "center", gap: 8 },
  trimText: { flex: 1, fontFamily: font.medium, fontSize: 17, lineHeight: 23 },
  trimActions: { flexDirection: "row", marginLeft: -12 },
  trimAction: { paddingHorizontal: 12 },
});
