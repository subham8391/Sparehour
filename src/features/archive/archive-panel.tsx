"use client";
// Settings › Data's archive half (SCREENS.md §18, PRODUCT_SPEC.md §6, §8.5):
// Clear the slate, the Archive with a restore per batch — each named by date
// and count, kept indefinitely (A9) — and Delete permanently, the only hard
// delete there is, naming the count behind a typed confirmation. It reads the
// device's own rows; restores are undoable, deletes are final. Part of the
// Data section's island.
import { useMemo, useState, type ReactNode } from "react";
import { Temporal, todayFor } from "@/core/time";
import { useLocalDatabase, useQuery } from "@/data/powersync";
import { ARCHIVED_SQL, DROPPED_SQL, type ArchivedRow } from "@/data/queries/archive";
import { restoreBatch } from "@/data/repositories/archive";
import { HINT, LABEL, NOTE, ROW } from "@/features/settings/rows";
import { useUndoSink } from "@/features/undo/undo-provider";
import { Button } from "@/ui/button";
import { cx } from "@/ui/cx";
import { Icon } from "@/ui/icons";
import { ListCard } from "@/ui/list-card";
import { SectionLabel } from "@/ui/section-label";
import ClearSlateSheet from "./clear-slate-sheet";
import { batchLabel, deletedNotice, deletePermanently, groupBatches, tasksWord, type ArchiveBatch } from "./batches";
import { TypedConfirmSheet } from "./typed-confirm";

/** How many titles a batch lists when opened; the rest are counted. */
const SHOWN_TITLES = 50;

interface Doomed {
  /** "the archived batch from Tue 6 Oct", "every dropped task". */
  what: string;
  ids: string[];
}

function Group({ title, children, note }: { title: string; children: ReactNode; note?: ReactNode }) {
  return (
    <section aria-label={title} className="flex flex-col gap-2">
      <SectionLabel>{title}</SectionLabel>
      <ListCard as="div">{children}</ListCard>
      {note}
    </section>
  );
}

export function ArchivePanel({ timezone, dayRolloverHour }: { timezone: string; dayRolloverHour: number }) {
  const db = useLocalDatabase();
  const undo = useUndoSink();
  const { data: archived } = useQuery<ArchivedRow>(ARCHIVED_SQL);
  const { data: dropped } = useQuery<{ id: string }>(DROPPED_SQL);
  const today = todayFor({ timezone, dayRolloverHour }, Temporal.Now.instant());
  const batches = useMemo(() => groupBatches(archived ?? [], timezone), [archived, timezone]);
  const archivedIds = useMemo(() => (archived ?? []).map((r) => r.id), [archived]);
  const droppedIds = useMemo(() => (dropped ?? []).map((r) => r.id), [dropped]);
  const [slateOpen, setSlateOpen] = useState(false);
  const [doomed, setDoomed] = useState<Doomed | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [restoring, setRestoring] = useState<string | null>(null);

  const restore = async (batch: ArchiveBatch) => {
    const key = batch.key ?? "";
    setRestoring(key);
    try {
      const n = await restoreBatch(db, undo ?? undefined, batch.key);
      setNotice(n > 0 ? `Brought back ${tasksWord(n)}.` : null);
    } finally {
      setRestoring(null);
    }
  };

  const confirmDelete = async (): Promise<string | null> => {
    if (!doomed) return null;
    try {
      const n = await deletePermanently(doomed.ids);
      setNotice(deletedNotice(n, doomed.ids.length));
      setDoomed(null);
      return null;
    } catch (e) {
      return e instanceof Error ? e.message : "Couldn’t delete them just now. Nothing was deleted — try again.";
    }
  };

  return (
    <>
      <Group title="Clear the slate">
        <div className={ROW}>
          <span className="flex min-w-0 flex-col">
            <span className={LABEL}>Clear the slate</span>
            <span className={HINT}>Archive Today, or Today and the backlog, in one batch. Nothing is deleted.</span>
          </span>
          <Button variant="secondary" onClick={() => setSlateOpen(true)}>
            Clear the slate…
          </Button>
        </div>
      </Group>

      <Group title="Archive" note={<p className={NOTE}>Archived tasks stay here until you delete them. Restoring a batch puts each task back where it was, or in Carried over if its day has passed.</p>}>
        {batches.length === 0 ? (
          <p className={cx(ROW, HINT)}>Nothing archived.</p>
        ) : (
          batches.map((b) => {
            const label = batchLabel(b, today);
            return (
              <div key={b.key ?? "earlier"} className={cx(ROW, "items-start")}>
                <details className="group min-w-0 flex-1 basis-56">
                  <summary className="-mx-2 flex min-h-11 cursor-pointer list-none items-center gap-1.5 rounded-sm px-2 text-body font-medium text-ink hover:bg-hover [&::-webkit-details-marker]:hidden">
                    <Icon name="chevron-right" size={14} className="shrink-0 text-ink-3 motion-safe:transition-transform motion-safe:dur-fast group-open:rotate-90" />
                    <span className="num">{label}</span>
                  </summary>
                  <ul className="flex flex-col gap-1 pb-2 pl-6 text-body-sm text-ink-2">
                    {b.tasks.slice(0, SHOWN_TITLES).map((t) => (
                      <li key={t.id} className="line-clamp-2 [overflow-wrap:anywhere]">
                        {t.title}
                      </li>
                    ))}
                    {b.tasks.length > SHOWN_TITLES && <li className="text-ink-3">and {tasksWord(b.tasks.length - SHOWN_TITLES)} more</li>}
                  </ul>
                </details>
                <span className="flex flex-wrap gap-2">
                  <Button variant="secondary" onClick={() => void restore(b)} disabled={restoring !== null} aria-label={`Restore ${label}`}>
                    {restoring === (b.key ?? "") ? "Restoring…" : "Restore"}
                  </Button>
                  <Button variant="quiet" tone="destructive" onClick={() => setDoomed({ what: `the batch archived ${label.split(" · ")[0]}`, ids: b.tasks.map((t) => t.id) })} aria-label={`Delete ${label} permanently`}>
                    Delete
                  </Button>
                </span>
              </div>
            );
          })
        )}
      </Group>

      <Group title="Delete permanently" note={<p className={NOTE}>A permanent delete can’t be undone. Export first if you might want these again.</p>}>
        <div className={ROW}>
          <span className="flex min-w-0 flex-col">
            <span className={LABEL}>Archived tasks</span>
            <span className={cx(HINT, "num")}>{archivedIds.length === 0 ? "None" : tasksWord(archivedIds.length)}</span>
          </span>
          <Button variant="secondary" tone="destructive" disabled={archivedIds.length === 0} onClick={() => setDoomed({ what: "every archived task", ids: archivedIds })}>
            Delete…
          </Button>
        </div>
        <div className={ROW}>
          <span className="flex min-w-0 flex-col">
            <span className={LABEL}>Dropped tasks</span>
            <span className={cx(HINT, "num")}>{droppedIds.length === 0 ? "None" : `${tasksWord(droppedIds.length)}, kept in the Logbook`}</span>
          </span>
          <Button variant="secondary" tone="destructive" disabled={droppedIds.length === 0} onClick={() => setDoomed({ what: "every dropped task", ids: droppedIds })}>
            Delete…
          </Button>
        </div>
      </Group>

      {notice && (
        <p role="status" className={HINT}>
          {notice}
        </p>
      )}

      {slateOpen && <ClearSlateSheet today={today.toString()} onClose={() => setSlateOpen(false)} />}
      {doomed && (
        <TypedConfirmSheet
          title={`Delete ${tasksWord(doomed.ids.length)} permanently?`}
          confirmLabel={`Delete ${tasksWord(doomed.ids.length)}`}
          busyLabel="Deleting…"
          onConfirm={confirmDelete}
          onClose={() => setDoomed(null)}
        >
          <p>
            This deletes {doomed.what} — {tasksWord(doomed.ids.length)} with their steps, tags and notes — from every device and your account.
          </p>
          <p>It can’t be undone, and Undo won’t bring them back.</p>
        </TypedConfirmSheet>
      )}
    </>
  );
}
