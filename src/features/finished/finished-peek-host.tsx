"use client";
// The read-only view of an older finished task with its two actions wired to the device (DECISIONS.md, amendments
// 2026-11-14 and 2026-11-15), for a list that only has the server's row to hand: Today's past day. It finds the
// project's and the tags' names, Reopen writes the task back through `restoreFinished`, and either way of the row
// ceasing to be a finished one (reopened, or deleted for good) is reported once through `onGone`, so the list
// drops it. An island of its own: loaded when a row is opened, never with the list (SYSTEM_DESIGN.md §11.6).
import type { LocalDate } from "@/core/time";
import { useLocalDatabase, useQuery } from "@/data/powersync";
import { restoreFinished } from "@/data/repositories/finished-restore";
import { useProjectNames } from "@/features/projects/use-project-names";
import { useUndoSink } from "@/features/undo/undo-provider";
import type { FinishedRow } from "./finished";
import { FinishedPeek } from "./finished-peek";

const TAGS_BY_ID_SQL = `select id, lower(name) as name from tags where deleted_at is null`;
const NO_TAG_IDS = `select id, name from tags where 0`;

export default function FinishedPeekHost({ row, zone, today, onGone, onClose }: { row: FinishedRow; zone: string; today?: LocalDate; onGone: (id: string) => void; onClose: () => void }) {
  const db = useLocalDatabase();
  const undo = useUndoSink();
  const projectNames = useProjectNames();
  // An older row names its tags by id; one deleted since has no name to show.
  const { data: tagRows } = useQuery<{ id: string; name: string }>(row.tag_ids?.length ? TAGS_BY_ID_SQL : NO_TAG_IDS);
  const tagName = new Map((tagRows ?? []).map((t) => [t.id, t.name]));
  const reopen = async () => {
    await restoreFinished(db, undo, row);
    onGone(row.id);
  };
  return (
    <FinishedPeek
      row={row}
      projectName={row.project_id ? projectNames.get(row.project_id) : null}
      tagNames={(row.tag_ids ?? []).flatMap((id) => tagName.get(id) ?? [])}
      zone={zone}
      today={today}
      // One finished day of a repeat is not a task to reopen; it can still be deleted.
      onReopen={row.occurrence_of ? undefined : () => void reopen()}
      onDeleted={() => onGone(row.id)}
      onClose={onClose}
    />
  );
}
