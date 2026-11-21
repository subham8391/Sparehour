// Search's older results, wired (the web's features/finished/older-found.tsx): the pages come from the web app's
// API (GET /api/logbook/older, called with the session's token: ~/api) through the shared `useFinished`, Reopen
// writes the task back to the phone through the shared `restoreFinished`, which records its undo, and the read-only
// view of a row is the Logbook's own, with Delete for good (no undo: it asks once). The drawing is older-found-view.tsx.
import { useCallback, useMemo, useState } from "react";
import { NO_TAG_IDS, TAGS_BY_ID_SQL } from "@/app/(app)/logbook/logbook-options";
import type { LocalDate } from "@/core/time";
import { useLocalDatabase, useQuery } from "@/data/powersync";
import { restoreFinished } from "@/data/repositories/finished-restore";
import type { FinishedRow } from "@/features/finished/finished";
import { deleteFinished } from "@/features/finished/finished-delete";
import { OLDER_FOUND_PAGE, finishedDay } from "@/features/finished/finished-words";
import { useFinished } from "@/features/finished/use-finished";
import { useProjectNames } from "@/features/projects/use-project-names";
import { useUndoSink } from "@/features/undo/undo-context";
import { apiFetch } from "~/api";
import { FinishedPeek } from "../logbook/finished-peek";
import { OlderFoundView } from "./older-found-view";

export function OlderFound({ words, zone, today }: { words: string; zone: string; today: LocalDate }) {
  const query = useMemo(() => ({ words: words.trim(), limit: OLDER_FOUND_PAGE }), [words]);
  const older = useFinished(query, apiFetch);
  const db = useLocalDatabase();
  const undo = useUndoSink();
  const projectNames = useProjectNames();
  // An older row names its tags by id; one deleted since has no name to show.
  const { data: tagRows } = useQuery<{ id: string; name: string }>(older.rows.length > 0 ? TAGS_BY_ID_SQL : NO_TAG_IDS);
  const tagName = useMemo(() => new Map((tagRows ?? []).map((t) => [t.id, t.name])), [tagRows]);
  const [peek, setPeek] = useState<FinishedRow | null>(null);
  const remove = older.remove;
  const reopen = useCallback(
    async (f: FinishedRow) => {
      await restoreFinished(db, undo, f);
      remove(f.id);
      setPeek(null);
    },
    [db, undo, remove],
  );
  // Deleted for good: off the results, and out of the view if it is still this one.
  const forget = useCallback(
    (id: string) => {
      remove(id);
      setPeek((p) => (p?.id === id ? null : p));
    },
    [remove],
  );
  const rows = useMemo(
    () =>
      older.rows.map((f) => ({
        id: f.id,
        title: f.title || "Untitled",
        detail: [f.project_id ? projectNames.get(f.project_id) : null, finishedDay(f.completed_at, zone, today)].filter(Boolean).join(" · "),
        reopens: !f.occurrence_of,
      })),
    [older.rows, projectNames, zone, today],
  );
  const find = (id: string) => older.rows.find((f) => f.id === id);

  if (!query.words || !older.available) return null;
  return (
    <>
      <OlderFoundView
        rows={rows}
        status={older.status}
        more={older.more}
        onLoad={older.load}
        onOpen={(id) => setPeek(find(id) ?? null)}
        onReopen={(id) => {
          const f = find(id);
          if (f) void reopen(f);
        }}
      />
      <FinishedPeek
        row={peek}
        projectName={peek?.project_id ? projectNames.get(peek.project_id) : null}
        tagNames={(peek?.tag_ids ?? []).flatMap((id) => tagName.get(id) ?? [])}
        zone={zone}
        today={today}
        // One finished day of a repeat is not a task to reopen; it can still be deleted.
        onReopen={peek && !peek.occurrence_of ? () => void reopen(peek) : undefined}
        onDelete={(signal) => (peek ? deleteFinished(peek.id, signal, apiFetch) : Promise.reject(new Error("nothing to delete")))}
        onDeleted={() => peek && forget(peek.id)}
        onClose={() => setPeek(null)}
      />
    </>
  );
}
