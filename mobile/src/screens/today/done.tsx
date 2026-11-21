// What was finished on a day older than the week the phone holds (DECISIONS.md, amendment 2026-11-15; the web's is
// OlderDone in features/today/day-states.tsx), wired: the day's finished tasks are asked of the server through the
// web's own hook (features/finished/use-finished-day.ts) with the session's token (~/api), listed after any the phone
// still has (those are not listed twice), and an older row opens the Logbook's read-only view, where it can be
// reopened or deleted for good. The drawing is DoneSection (sections.tsx).
import { useMemo, useState } from "react";
import type { LocalDate } from "@/core/time";
import type { Task } from "@/core/types";
import { useLocalDatabase } from "@/data/powersync";
import { restoreFinished } from "@/data/repositories/finished-restore";
import type { FinishedRow } from "@/features/finished/finished";
import { deleteFinished } from "@/features/finished/finished-delete";
import { useFinishedDay } from "@/features/finished/use-finished-day";
import { useUndoSink } from "@/features/undo/undo-context";
import { apiFetch } from "~/api";
import { FinishedPeek } from "../logbook/finished-peek";
import { DoneSection, type RowContext } from "./sections";

export function OlderDone({ label, from, to, zone, today, have, ctx }: { label: string; /** The day's two instants. */ from: string; to: string; zone: string; today: LocalDate; /** What the phone still holds of the day. */ have: readonly Task[]; ctx: RowContext }) {
  const db = useLocalDatabase();
  const undo = useUndoSink();
  const day = useFinishedDay(from, to, apiFetch);
  const [peek, setPeek] = useState<FinishedRow | null>(null);
  const rows = useMemo(() => {
    const here = new Set<string>(have.map((t) => t.id));
    return day.rows.filter((f) => !here.has(f.id));
  }, [day.rows, have]);
  const gone = (id: string) => {
    day.remove(id);
    setPeek((p) => (p?.id === id ? null : p));
  };
  return (
    <>
      <DoneSection
        label={label}
        tasks={have}
        onReopen={null}
        ctx={ctx}
        older={{
          status: day.status,
          rows: rows.map((f) => ({ id: f.id, title: f.title ?? "", detail: f.project_id ? ctx.projectNames?.get(f.project_id) : undefined })),
          onRetry: day.retry,
          onOpen: (id) => setPeek(rows.find((f) => f.id === id) ?? null),
        }}
      />
      <FinishedPeek
        row={peek}
        projectName={peek?.project_id ? ctx.projectNames?.get(peek.project_id) : null}
        zone={zone}
        today={today}
        // One finished day of a repeat has no Reopen, as in the Logbook.
        onReopen={peek && !peek.occurrence_of ? () => void restoreFinished(db, undo, peek).then(() => gone(peek.id)) : undefined}
        onDelete={(signal) => (peek ? deleteFinished(peek.id, signal, apiFetch) : Promise.reject(new Error("nothing to delete")))}
        onDeleted={() => peek && gone(peek.id)}
        onClose={() => setPeek(null)}
      />
    </>
  );
}
