"use client";
// Search's older results (DECISIONS.md, amendment 2026-11-14): the device searches the tasks it holds, which
// includes a week of finished ones; what was finished before that is kept on the server, so it is searched there,
// and only when asked — a quiet button under the results, then the matches by the day they were finished, a
// read-only view of each and Reopen. An island: nothing of it rides in the search screen's first download.
import { useCallback, useMemo, useState } from "react";
import { instant, type LocalDate } from "@/core/time";
import { formatDay } from "@/core/time/format-day";
import { normaliseTimestamp, toTask } from "@/data/mappers";
import { useLocalDatabase, useQuery } from "@/data/powersync";
import { restoreFinished } from "@/data/repositories/finished-restore";
import { useProjectNames } from "@/features/projects/use-project-names";
import { RowAction } from "@/features/tasks/task-actions";
import { TaskList, TaskRow } from "@/features/tasks/task-row";
import { useUndoSink } from "@/features/undo/undo-provider";
import { Button } from "@/ui/button";
import { SectionLabel } from "@/ui/section-label";
import { toTaskRow, type FinishedRow } from "./finished";
import { FinishedPeek } from "./finished-peek";
import { useFinished } from "./use-finished";

const TAGS_BY_ID_SQL = `select id, lower(name) as name from tags where deleted_at is null`;
const NO_TAG_IDS = `select id, name from tags where 0`;
const PAGE = 20;

/** The day a row was finished, in the person's zone: "Tue 3 Mar", with the year when it is another one. */
function finishedDay(f: FinishedRow, zone: string, today: LocalDate): string | null {
  if (!f.completed_at) return null;
  return formatDay(instant(normaliseTimestamp(f.completed_at)).toZonedDateTimeISO(zone).toPlainDate(), { today });
}

export function OlderFound({ words, zone, today }: { words: string; zone: string; today: LocalDate }) {
  const query = useMemo(() => ({ words: words.trim(), limit: PAGE }), [words]);
  const older = useFinished(query);
  const db = useLocalDatabase();
  const undo = useUndoSink();
  const projectNames = useProjectNames();
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

  if (!query.words || !older.available) return null;
  const asked = older.more !== null || older.status !== "idle";
  return (
    <section className="flex flex-col gap-2" aria-label="Finished earlier">
      {asked && (
        <SectionLabel className="px-0.5" count={older.rows.length}>
          Finished earlier
        </SectionLabel>
      )}
      {older.rows.length > 0 && (
        <TaskList>
          {older.rows.map((f) => (
            <TaskRow
              key={f.id}
              task={toTask(toTaskRow(f))}
              today={today}
              onOpen={() => setPeek(f)}
              meta={
                <>
                  {f.project_id && projectNames.has(f.project_id) && <span>{projectNames.get(f.project_id)}</span>}
                  <span className="num">{finishedDay(f, zone, today)}</span>
                </>
              }
              actions={f.occurrence_of ? undefined : <RowAction label="Reopen" primary onClick={() => void reopen(f)} />}
            />
          ))}
        </TaskList>
      )}
      <div className="flex flex-col items-start gap-2">
        {older.status === "error" && (
          <p role="alert" className="text-body-sm text-pretty text-ink-2">
            Couldn&rsquo;t search older tasks. Check the connection and try again.
          </p>
        )}
        {older.more === false ? (
          older.rows.length === 0 && (
            <p role="status" className="text-body-sm text-ink-3">
              Nothing older matches.
            </p>
          )
        ) : (
          <Button variant="secondary" onClick={older.load} disabled={older.status === "loading"}>
            {older.status === "loading" ? "Searching…" : asked ? "Show more" : "Search older finished tasks"}
          </Button>
        )}
      </div>
      {peek && (
        <FinishedPeek
          row={peek}
          projectName={peek.project_id ? projectNames.get(peek.project_id) : null}
          tagNames={(peek.tag_ids ?? []).flatMap((id) => tagName.get(id) ?? [])}
          zone={zone}
          today={today}
          onReopen={peek.occurrence_of ? undefined : () => void reopen(peek)}
          onClose={() => setPeek(null)}
        />
      )}
    </section>
  );
}
