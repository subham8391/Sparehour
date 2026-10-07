"use client";
// Inbox (SCREENS.md §5): a triage queue, not a list. The goal is to empty it. Every row says its age factually
// ("added 2d", never red). From `sm` up the selected row expands to the triage actions (features/inbox/triage-row);
// on a phone a tap opens the task like every row, and the four triage actions — Today · Tomorrow · Someday ·
// Project… — head the row's ⋯ sheet (DECISIONS.md "Phone tap on an Inbox row"); "Select" ticks rows for a bulk edit,
// as a long-press does. Triage all walks the queue one task at a time (features/inbox/triage-walk). "+ Add to Inbox"
// at the end adds through the quick-add parser.
import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import type { TaskDraft } from "@/core/quickadd/types";
import { useQuery } from "@/data/powersync";
import { toTask } from "@/data/mappers";
import { INBOX_SQL } from "@/data/queries/views";
import type { TaskRow as TaskRowType } from "@/data/schema.client";
import { addedLabel } from "@/features/inbox/age";
import { triage, type TriageAction } from "@/features/inbox/triage";
import { TriageSheetIsland, TriageWalkIsland, preloadTriage } from "@/features/inbox/triage-islands";
import { onTriageAll } from "@/features/inbox/triage-request";
import { TriageActions } from "@/features/inbox/triage-row";
import type { TriagePick } from "@/features/inbox/triage-sheet";
import { useProjectNames } from "@/features/projects/use-project-names";
import { useListSelection, useSelection } from "@/features/selection/selection-provider";
import { useLocalDay, useNow } from "@/features/shell/use-local-day";
import { VIEW_COLUMN, ViewHeader } from "@/features/shell/view-header";
import { requestOrganize } from "@/features/tasks/organize";
import { MenuOnly, MoveActions, RowAction } from "@/features/tasks/task-actions";
import { useTaskDetail } from "@/features/tasks/task-detail";
import { TaskList, TaskRow } from "@/features/tasks/task-row";
import { useConvertToProject } from "@/features/tasks/use-convert";
import { useTaskRepo } from "@/features/tasks/use-task-repo";
import { Button } from "@/ui/button";
import { Icon } from "@/ui/icons";
import { EmptyCard, ListLine } from "@/ui/list-card";

const SPACE_SQL = `select personal_space_id from users limit 1`;

// The add row parses like quick-add, and the parser is heavy: it follows the first paint, in a line of the same height.
const InlineAdd = dynamic(() => import("@/features/tasks/inline-add").then((m) => m.InlineAdd), {
  ssr: false,
  loading: () => <ListLine className="border-t border-line first:border-t-0" cellClassName="min-h-14 sm:min-h-11">{null}</ListLine>,
});

export default function InboxPage() {
  const repo = useTaskRepo();
  const detail = useTaskDetail();
  // "Long — break it down?" answers itself: the row offers Convert to project (PRODUCT_SPEC.md §5.4, §6).
  const breakDown = useConvertToProject(repo, detail.close);
  const now = useNow();
  const { today, zone, settings } = useLocalDay(now);
  const { data, isLoading } = useQuery<TaskRowType>(INBOX_SQL);
  const rows = data ?? [];
  const tasks = rows.map(toTask);
  const projectNames = useProjectNames();
  const sel = useListSelection(tasks.map((t) => t.id));
  const { checkedIds, clearChecks, selecting, setSelecting } = useSelection();
  const { data: users } = useQuery<{ personal_space_id: string | null }>(SPACE_SQL);
  const parseCtx = useMemo(() => ({ now, zone, eveningStartsAt: settings?.eveningStartsAt }), [now, zone, settings?.eveningStartsAt]);
  const [walking, setWalking] = useState<readonly string[] | null>(null);
  const [picking, setPicking] = useState<{ id: string; pick: TriagePick } | null>(null);
  useEffect(() => preloadTriage(), []);
  // The palette's Triage all: taken once the queue has loaded, so the walk starts with every task in it.
  const [asked, setAsked] = useState(false);
  useEffect(() => onTriageAll(() => setAsked(true)), []);
  if (asked && !isLoading) {
    setAsked(false);
    setWalking(tasks.map((t) => t.id));
  }
  // "Select" is this view's: leaving the Inbox lets go of it.
  useEffect(() => () => setSelecting(false), [setSelecting]);

  const act = (id: string, action: TriageAction) => {
    // Project ▾ is the organize island's picker, the one `#` opens (one write, one undo).
    if (action === "project") return requestOrganize({ kind: "move", ids: [id] });
    if (action === "estimate" || action === "deadline") return setPicking({ id, pick: action });
    void triage(repo, id, action, today);
  };
  const add = (draft: TaskDraft) => {
    const spaceId = users?.[0]?.personal_space_id;
    if (spaceId) void repo.create(draft, { spaceId });
  };
  const bulk = selecting || checkedIds.length > 0;

  return (
    <main className={VIEW_COLUMN}>
      <ViewHeader
        eyebrow="Inbox"
        title={tasks.length > 0 ? `${tasks.length} to triage` : "Inbox"}
        subtitle="A queue to empty, not a list to keep."
        actions={
          tasks.length > 0 && (
            <>
              {/* The phone's way into a bulk edit besides a long-press (DESIGN_SYSTEM.md §4a Inbox). */}
              <Button
                variant="link"
                size="touch"
                className="sm:hidden"
                onClick={() => {
                  if (bulk) clearChecks();
                  setSelecting(!bulk);
                }}
              >
                {bulk ? "Done" : "Select"}
              </Button>
              <Button variant="link" size="compact" className="gap-1" onClick={() => setWalking(tasks.map((t) => t.id))}>
                Triage all
                <Icon name="chevron-right" size={16} className="text-ink-3" />
              </Button>
            </>
          )
        }
      />
      {!isLoading && tasks.length === 0 && <EmptyCard fact="Inbox zero. Nice." />}
      {!isLoading && (
        <TaskList>
          {tasks.map((t, i) => {
            const selected = sel.selectedId === t.id;
            const project = t.projectId && projectNames.get(t.projectId);
            const age = addedLabel(rows[i]?.created_at, today, zone);
            const moves = (
              <>
                <MoveActions onToday={() => act(t.id, "today")} onTomorrow={() => act(t.id, "tomorrow")} onSomeday={() => act(t.id, "someday")} onDrop={() => act(t.id, "drop")} />
                <MenuOnly>
                  <RowAction label="This week" onClick={() => act(t.id, "week")} />
                </MenuOnly>
              </>
            );
            return (
              <TaskRow
                key={t.id}
                task={t}
                today={today}
                onOpen={() => detail.open(t.id)}
                selected={selected}
                onSelect={() => sel.select(t.id)}
                onDone={() => void repo.complete(t.id)}
                // The expansion offers Break it down to the selected row, so its zone does not say it twice.
                onBreakDown={selected ? undefined : () => void breakDown(t.id)}
                meta={
                  <>
                    {project && <span>{project}</span>}
                    {age && <span>{age}</span>}
                  </>
                }
                // The selected row's choices are its expansion; its zone keeps the ⋯ alone.
                actions={selected ? <MenuOnly>{moves}</MenuOnly> : moves}
                menuLead={[
                  <RowAction key="today" label="Today" onClick={() => act(t.id, "today")} />,
                  <RowAction key="tomorrow" label="Tomorrow" onClick={() => act(t.id, "tomorrow")} />,
                  <RowAction key="someday" label="Someday" onClick={() => act(t.id, "someday")} />,
                  <RowAction key="project" label="Project…" onClick={() => setPicking({ id: t.id, pick: "project-then" })} />,
                ]}
                footer={selected && <TriageActions title={t.title} onAct={(a) => act(t.id, a)} onBreakDown={() => void breakDown(t.id)} />}
              />
            );
          })}
          <InlineAdd ctx={parseCtx} onAdd={add} placeholder="Add to Inbox" />
        </TaskList>
      )}
      {walking && <TriageWalkIsland ids={walking} onClose={() => setWalking(null)} />}
      {picking && <TriageSheetIsland id={picking.id} pick={picking.pick} onClose={() => setPicking(null)} />}
    </main>
  );
}
