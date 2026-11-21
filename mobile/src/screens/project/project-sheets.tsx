// The project page's own sheets on the phone (SCREENS.md §9). The header's ⋯: the web's own actions for the project's
// state, in its order. A heading's ⋯: Rename, Move up · Move down (its tasks follow it) and Delete heading, which
// keeps its tasks. Presentational: what each choice does is handed in.
import { useState } from "react";
import type { Heading } from "@/core/types";
import type { ProjectAction } from "@/features/projects/page-rules";
import { Button } from "~/ui/button";
import { MenuDivider, MenuRow } from "~/ui/menu-row";
import { Sheet } from "~/ui/sheet";
import { TextField } from "~/ui/text-field";

export function ProjectActionsSheet({ open, name, actions, onAction, onClose }: { open: boolean; name: string; actions: readonly ProjectAction[]; onAction: (action: ProjectAction) => void; onClose: () => void }) {
  return (
    <Sheet open={open} title={name} onClose={onClose}>
      {actions.map((a) => (
        <MenuRow key={a.id} label={a.label} onPress={() => onAction(a)} />
      ))}
    </Sheet>
  );
}

export interface HeadingSheetProps {
  /** The heading whose ⋯ was tapped; null while the sheet is closed. */
  heading: Heading | null;
  step: "menu" | "rename";
  canMoveUp: boolean;
  canMoveDown: boolean;
  onStep: (step: "menu" | "rename") => void;
  onRename: (title: string) => void;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
  onClose: () => void;
}

export function HeadingSheet(p: HeadingSheetProps) {
  const title = p.heading?.title ?? "";
  // The heading's words while they are being changed: Done on the keyboard or Rename saves them, and an emptied or
  // unchanged field saves nothing.
  const [draft, setDraft] = useState("");
  const next = draft.trim();
  const changed = next !== "" && next !== title;
  const save = () => {
    if (changed) p.onRename(next);
    p.onClose();
  };
  const renaming = p.step === "rename";
  return (
    <Sheet
      open={p.heading !== null}
      title={renaming ? "Rename heading" : title}
      onClose={p.onClose}
      footer={
        renaming ? (
          <>
            <Button variant="quiet" label="Cancel" onPress={p.onClose} />
            <Button variant="primary" label="Rename" disabled={!changed} onPress={save} />
          </>
        ) : undefined
      }
    >
      {renaming ? (
        <TextField accessibilityLabel={`Heading ${title}`} autoFocus value={draft} onChangeText={setDraft} returnKeyType="done" onSubmitEditing={save} />
      ) : (
        <>
          <MenuRow
            label="Rename"
            onPress={() => {
              setDraft(title);
              p.onStep("rename");
            }}
          />
          {p.canMoveUp ? <MenuRow label="Move up" icon="arrow-up" onPress={() => p.onMove(-1)} /> : null}
          {p.canMoveDown ? <MenuRow label="Move down" icon="arrow-down" onPress={() => p.onMove(1)} /> : null}
          <MenuDivider />
          {/* Its tasks are never deleted with it: they move up, and the toast puts the heading back over them. */}
          <MenuRow label="Delete heading" hint="Tasks move up" accessibilityLabel={`Delete heading ${title}`} onPress={p.onRemove} />
        </>
      )}
    </Sheet>
  );
}
