// The tap path for organising areas and projects (SCREENS.md §1, §9; the web's organise-sheet.tsx): a row's ⋯ in
// Browse opens this sheet. Move up, Move down, then "Move to area…" for a project or "Delete area…" for an area,
// each a step of the same sheet. Presentational: where the row stands and what a delete leaves are handed in.
import { StyleSheet } from "react-native";
import { Text } from "~/ui/text";
import type { OrganiseTarget } from "@/features/projects/organise-place";
import { Button } from "~/ui/button";
import { MenuRow } from "~/ui/menu-row";
import { Sheet } from "~/ui/sheet";
import { font, useColours } from "~/ui/theme";

export type OrganiseStep = "menu" | "move" | "delete";

export interface OrganiseSheetProps {
  target: OrganiseTarget | null;
  step: OrganiseStep;
  canMoveUp: boolean;
  canMoveDown: boolean;
  /** The areas a project can go to, in their order. */
  areas: readonly { id: string; name: string }[];
  /** The area the project is in now; null for none. */
  areaId: string | null;
  /** The sentence under "Delete “Work”?": what stays, and where. */
  deleteNote: string;
  onStep: (step: OrganiseStep) => void;
  onNudge: (dir: -1 | 1) => void;
  onMoveTo: (areaId: string | null) => void;
  onDelete: () => void;
  onClose: () => void;
}

export function OrganiseSheet(p: OrganiseSheetProps) {
  const c = useColours();
  const name = p.target?.name ?? "";
  const title = p.step === "move" ? `Move “${name}” to` : p.step === "delete" ? `Delete “${name}”?` : name;
  return (
    <Sheet
      open={p.target !== null}
      title={title}
      onClose={p.onClose}
      footer={
        p.step === "delete" ? (
          <>
            <Button variant="secondary" label="Keep" onPress={p.onClose} />
            {/* Delete is one of the two destructive actions in the product (DESIGN_SYSTEM.md §2); the toast undoes it. */}
            <Button variant="primary" destructive label="Delete area" onPress={p.onDelete} />
          </>
        ) : undefined
      }
    >
      {p.step === "menu" && p.target ? (
        <>
          {p.canMoveUp ? <MenuRow label="Move up" icon="arrow-up" onPress={() => p.onNudge(-1)} /> : null}
          {p.canMoveDown ? <MenuRow label="Move down" icon="arrow-down" onPress={() => p.onNudge(1)} /> : null}
          {p.target.kind === "project" ? <MenuRow label="Move to area…" onPress={() => p.onStep("move")} /> : <MenuRow label="Delete area…" onPress={() => p.onStep("delete")} />}
        </>
      ) : null}
      {p.step === "move" ? (
        <>
          {p.areas.map((a) => (
            <MenuRow key={a.id} label={a.name} current={p.areaId === a.id} onPress={() => p.onMoveTo(a.id)} />
          ))}
          <MenuRow label="No area" current={p.areaId === null} onPress={() => p.onMoveTo(null)} />
        </>
      ) : null}
      {p.step === "delete" ? <Text style={[styles.note, { color: c.ink2 }]}>{p.deleteNote}</Text> : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  note: { fontFamily: font.regular, fontSize: 16, lineHeight: 23 },
});
