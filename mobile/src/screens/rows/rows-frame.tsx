// A screen's frame for its task rows (the web's shell does the same for every list: the selection provider, the
// bulk bar, the organising island and the rows' own lazy pickers). It holds what is open over the list — one row's ⋯
// menu and the picker a choice in it asks for — and which rows are ticked, draws the bulk bar while any are, and
// hands every row on the screen the way to ask (rows-context.ts). Presentational: the lists the pickers show and
// every write are handed in as `wiring` (rows.tsx reads and writes for a real screen; a test or a preview hands in
// its own). The ticks follow the web's own rules (features/selection/selection.ts).
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType, type ReactNode } from "react";
import { BackHandler, StyleSheet, Text, View } from "react-native";
import type { LocalDate } from "@/core/time";
import type { Task } from "@/core/types";
import type { BulkWrite } from "@/features/selection/bulk-actions";
import { EMPTY_SELECTION, clearChecks, reconcile, toggleCheck, type SelectionState } from "@/features/selection/selection";
import type { MoveTarget } from "@/features/tasks/move-options";
import type { SnoozePreset } from "@/features/tasks/snooze";
import type { ProjectChoicesData } from "~/screens/inbox/triage-choices";
import { Button } from "~/ui/button";
import { MenuDivider, MenuRow } from "~/ui/menu-row";
import { Sheet } from "~/ui/sheet";
import { font, useColours } from "~/ui/theme";
import { BulkBar } from "./bulk-bar";
import { rowMenu, type MenuRun } from "./row-menu";
import { DayPickerSheet, MoveSheet, TagSheet, type PickerDay } from "./row-sheets";
import { RowsContext, type MenuRequest, type RowsApi, type SwipeProps } from "./rows-context";

/** What a frame reads and writes through: the lists its pickers show, and each of the menu's and the bar's writes. */
export interface RowsWiring {
  today: LocalDate;
  /** This evening · Tomorrow · In 4 hours · This weekend · Next week; empty until the account's day and zone are known. */
  presets: readonly SnoozePreset[];
  /** Move to…'s days: today and the six after it, with their readouts. */
  days: readonly PickerDay[];
  /** The projects "Move to project…" files into. */
  choices: ProjectChoicesData;
  /** Every tag in the space, for "Add a tag…". */
  tags: readonly { id: string; name: string }[];
  onSnooze: (ids: readonly string[], preset: SnoozePreset) => void;
  /** Tomorrow as an open row's swipe runs it: the menu's own preset of that name. */
  onTomorrow: (id: string) => void;
  onSomeday: (id: string) => void;
  onSkip: (id: string) => void;
  onDuplicate: (id: string) => void;
  onCopyLink: (id: string) => void;
  onMoveToDay: (id: string, day: LocalDate) => void;
  /** Into a project or out of one, for one task or every ticked one: one write, one undo. */
  onMove: (ids: readonly string[], target: MoveTarget) => unknown;
  onTag: (ids: readonly string[], name: string) => unknown;
  /** The bulk bar's writes; each resolves once it has been written, and the ticks then clear. */
  onBulk: (ids: readonly string[], write: BulkWrite) => unknown;
  onBulkComplete: (ids: readonly string[]) => unknown;
  onBulkState: (ids: readonly string[], state: "someday" | "dropped") => unknown;
  /** Move to… opened or closed: its days' readouts are worked out only while it is open. */
  onDayPicker?: (open: boolean) => void;
  /** The swipe gesture (swipe-row.tsx); left out, rows do not swipe (a test, a preview). */
  Swipe?: ComponentType<SwipeProps>;
}

/** The picker open over the list: for one row's task, or for every ticked row. */
type Picking = { kind: "day"; task: Task } | { kind: "move"; ids: readonly string[]; task: Task | null } | { kind: "tag"; ids: readonly string[]; task: Task | null };

export function RowsFrame({ wiring, bottomInset = 0, children }: { wiring: RowsWiring; /** Room under the bulk bar for the phone's own bottom strip; none on a tab's screen. */ bottomInset?: number; children: ReactNode }) {
  const c = useColours();
  const [menu, setMenu] = useState<MenuRequest | null>(null);
  const [picking, setPicking] = useState<Picking | null>(null);

  // The rows on screen, in the order they came; a row that leaves lets go of its tick (selection.ts `reconcile`).
  const mounted = useRef(new Map<string, number>());
  const [selection, setSelection] = useState<SelectionState>(EMPTY_SELECTION);
  const ids = () => [...mounted.current.keys()];
  const mount = useCallback((id: string) => {
    mounted.current.set(id, (mounted.current.get(id) ?? 0) + 1);
    return () => {
      const left = (mounted.current.get(id) ?? 1) - 1;
      if (left > 0) return void mounted.current.set(id, left);
      mounted.current.delete(id);
      setSelection((s) => (s.checked.includes(id) ? reconcile(s, [...mounted.current.keys()]) : s));
    };
  }, []);
  const toggle = useCallback((id: string) => setSelection((s) => toggleCheck({ ...s, ids: [...mounted.current.keys()] }, id)), []);
  const clear = useCallback(() => setSelection((s) => clearChecks(s)), []);
  const checked = selection.checked;
  const [selecting, setSelecting] = useState(false);

  const latest = useRef(wiring);
  useEffect(() => {
    latest.current = wiring;
  });
  const api = useMemo<RowsApi>(
    () => ({
      today: wiring.today,
      openMenu: setMenu,
      checkedIds: checked,
      toggleCheck: toggle,
      clearChecks: clear,
      selecting,
      setSelecting,
      mount,
      runTomorrow: (task) => latest.current.onTomorrow(task.id),
      runSomeday: (task) => latest.current.onSomeday(task.id),
      Swipe: wiring.Swipe ?? null,
    }),
    // By its date: the day object is a new one each minute, the day is not.
    [wiring.today.toString(), wiring.Swipe, checked, toggle, clear, selecting, mount], // eslint-disable-line react-hooks/exhaustive-deps
  );

  // Android's Back lets go of the ticks before it leaves the screen, as Escape does on the web.
  const held = checked.length > 0;
  useEffect(() => {
    if (!held) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      clear();
      return true;
    });
    return () => sub.remove();
  }, [held, clear]);

  const pickingDay = picking?.kind === "day";
  useEffect(() => {
    latest.current.onDayPicker?.(pickingDay);
  }, [pickingDay]);

  /** A choice from the menu: the sheet closes, then the choice is made. */
  const run = (what: MenuRun) => {
    const request = menu;
    setMenu(null);
    if (!request) return;
    const { task } = request;
    switch (what.type) {
      case "own":
        return what.run();
      case "complete":
        return request.onComplete?.();
      case "skip":
        return wiring.onSkip(task.id);
      case "move-project":
        return setPicking({ kind: "move", ids: [task.id], task });
      case "tag":
        return setPicking({ kind: "tag", ids: [task.id], task });
      case "duplicate":
        return wiring.onDuplicate(task.id);
      case "copy-link":
        return wiring.onCopyLink(task.id);
      case "preset":
        return wiring.onSnooze([task.id], what.preset);
      case "someday":
        return wiring.onSomeday(task.id);
      case "move-day":
        return setPicking({ kind: "day", task });
    }
  };

  // A picker that acted on the ticked rows lets go of them once it has written, as the bulk bar does; one task filed
  // from its own ⋯ while other rows are ticked leaves those ticks alone (the web's organising island).
  const finish = (acted: readonly string[]) => () => {
    if (checked.length > 0 && acted.length === checked.length && acted.every((id) => checked.includes(id))) clear();
  };
  const after = (written: unknown, then: () => void) => void Promise.resolve(written).then(then, () => undefined);

  const lead = menu?.lead ?? [];
  const items = menu ? rowMenu({ task: menu.task, own: menu.own, lead: menu.lead, canComplete: Boolean(menu.onComplete), onBreakDown: menu.onBreakDown, presets: wiring.presets }) : [];
  const one = picking && picking.kind !== "day" ? picking.task : null;
  // Checked against what is on screen now, so a tick on a row that has gone is never written to.
  const ticked = () => checked.filter((id) => ids().includes(id));

  return (
    <RowsContext.Provider value={api}>
      <View style={styles.fill}>
        {children}
        <BulkBar
          count={checked.length}
          today={wiring.today}
          bottomInset={bottomInset}
          onWrite={(write) => after(wiring.onBulk(ticked(), write), clear)}
          onProject={() => setPicking({ kind: "move", ids: ticked(), task: null })}
          onTag={(name) => after(wiring.onTag(ticked(), name), clear)}
          onComplete={() => after(wiring.onBulkComplete(ticked()), clear)}
          onSomeday={() => after(wiring.onBulkState(ticked(), "someday"), clear)}
          onDrop={() => after(wiring.onBulkState(ticked(), "dropped"), clear)}
          onDone={clear}
        />
      </View>

      {/* The row's "More actions": the view's lead as buttons, then every line in the web's order. */}
      <Sheet open={menu !== null} onClose={() => setMenu(null)} footer={<Button variant="quiet" label="Cancel" onPress={() => setMenu(null)} />}>
        <Text accessibilityRole="header" numberOfLines={2} style={[styles.title, { color: c.ink }]}>
          {menu?.task.title ?? ""}
        </Text>
        {lead.length > 0 ? (
          <View style={styles.lead}>
            {lead.map((a, i) => (
              // The first, no-penalty choice reads in ink, as on the web.
              <Button key={a.label} label={a.label} style={[styles.leadButton, i === 0 && { borderColor: c.ink }]} onPress={() => run({ type: "own", run: a.run })} />
            ))}
          </View>
        ) : null}
        <View accessibilityRole="menu" accessibilityLabel="More actions">
          {items.map((item, i) => (item.kind === "divider" ? <MenuDivider key={`d${i}`} /> : <MenuRow key={`${i}:${item.label}`} label={item.label} accessibilityLabel={item.says} onPress={() => run(item.what)} />))}
        </View>
      </Sheet>

      <DayPickerSheet
        task={picking?.kind === "day" ? picking.task : null}
        today={wiring.today}
        days={wiring.days}
        onPick={(day) => {
          if (picking?.kind === "day") wiring.onMoveToDay(picking.task.id, day);
          setPicking(null);
        }}
        onClose={() => setPicking(null)}
      />
      <MoveSheet
        count={picking?.kind === "move" ? picking.ids.length : 0}
        currentProjectId={one ? one.projectId : null}
        choices={wiring.choices}
        onPick={(project) => {
          if (picking?.kind === "move") after(wiring.onMove(picking.ids, { kind: "project", id: project.id, name: project.name }), finish(picking.ids));
          setPicking(null);
        }}
        onClose={() => setPicking(null)}
      />
      <TagSheet
        count={picking?.kind === "tag" ? picking.ids.length : 0}
        tags={wiring.tags}
        // A task carries its tags by name; the picker marks them by id.
        attached={one ? wiring.tags.filter((t) => one.tags?.includes(t.name)).map((t) => t.id) : []}
        onPick={(name) => {
          if (picking?.kind === "tag") after(wiring.onTag(picking.ids, name), finish(picking.ids));
          setPicking(null);
        }}
        onClose={() => setPicking(null)}
      />
    </RowsContext.Provider>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  title: { fontFamily: font.semibold, fontSize: 18, lineHeight: 24 },
  lead: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  leadButton: { flexGrow: 1, flexBasis: "45%" },
});
