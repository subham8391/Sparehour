"use client";
// Step 3, "What's on your plate today?" (ONBOARDING.md §Step 3): the production quick-add composer in the page, so
// what is learnt here is how the app works. Each Enter saves a real task, which joins the rows above the box; a
// line that names no day of its own goes on today; a pasted list is one task a line with one Undo. After the
// twentieth a quiet line says so and the rest go to the Inbox. Either button first saves a line still in the box,
// so tapping Next after typing (no Enter on the way) loses nothing. Lazy: it carries the parser, which the first
// step does not need.
import { useEffect, useMemo, useRef, useState } from "react";
import type { TaskDraft } from "@/core/quickadd";
import { useLocalDatabase } from "@/data/powersync";
import { ProjectRepo } from "@/data/repositories/project-repo";
import { QuickAddConnected } from "@/features/quickadd/quick-add-connected";
import type { QuickAddContext, QuickAddFlush, QuickAddSubmission } from "@/features/quickadd/quick-add";
import { interpret, type Fact } from "@/features/quickadd/interpret";
import { useTaskRepo } from "@/features/tasks/use-task-repo";
import { useUndoSink } from "@/features/undo/undo-provider";
import { Button } from "@/ui/button";
import { chipClass, type ChipTone } from "@/ui/chip";
import { prefersReducedMotion } from "@/ui/reduced-motion";
import { FOOTER_BUTTON, WelcomeFrame } from "./welcome-frame";
import { BRAIN_DUMP_TODAY_LIMIT, PLACEHOLDERS, PLACEHOLDER_MS, PLENTY_LINE, brainDumpDraft, keptForThen, nextLabel } from "./welcome-rules";

const SPACE_SQL = `select personal_space_id from users limit 1`;

interface Added {
  id: string;
  draft: TaskDraft;
}

export interface BrainDumpProps {
  ctx: QuickAddContext;
  spaceId: string | null;
  /** "Next — N things" or "I'll add things later": either way the first run is over. */
  onFinish: () => void;
  busy?: boolean;
  /** Why ending the first run failed; the step stays as it is. */
  failure?: string | null;
}

export function BrainDump({ ctx, spaceId, onFinish, busy = false, failure = null }: BrainDumpProps) {
  const db = useLocalDatabase();
  const tasks = useTaskRepo();
  const projects = useMemo(() => new ProjectRepo(db), [db]);
  const undo = useUndoSink();
  const [added, setAdded] = useState<Added[]>([]);
  /** How many lines have been handed to the save so far: the next one's place, counted before the list redraws. */
  const committed = useRef(0);
  const placeholder = useCyclingPlaceholder();
  const flush = useRef<QuickAddFlush>(null);
  const composer = useRef<HTMLDivElement>(null);
  const [finishing, setFinishing] = useState(false);

  const onSubmit = async (s: QuickAddSubmission): Promise<string> => {
    const sid = spaceId ?? (await db.getOptional<{ personal_space_id: string | null }>(SPACE_SQL))?.personal_space_id ?? null;
    if (!sid) throw new Error("Your account is still loading — try again in a moment.");
    const index = committed.current++;
    try {
      const draft = brainDumpDraft(s.draft, ctx.today, index);
      let projectId = s.projectId;
      if (!projectId && s.createProjectName) {
        const existing = await db.getOptional<{ id: string }>(`select id from projects where deleted_at is null and lower(name) = lower(?) limit 1`, [s.createProjectName]);
        projectId = existing?.id ?? (await projects.create(s.createProjectName, { spaceId: sid }));
      }
      const id = await tasks.create(draft, { spaceId: sid, projectId });
      setAdded((list) => [...list, { id, draft }]);
      return id;
    } catch (e) {
      committed.current -= 1;
      throw e;
    }
  };

  // A paste is one undo for all its tasks, here and on the stack, run once whichever comes first (PRODUCT_SPEC.md §5.1 rule 6).
  const onPasted = (ids: readonly string[]) => {
    let taken: Promise<void> | null = null;
    const takeBack = () =>
      (taken ??= tasks.removeCreated(ids).then(() => {
        committed.current -= ids.length;
        setAdded((list) => list.filter((a) => !ids.includes(a.id)));
      }));
    // The composer's own notice carries the Undo; a toast on a phone would sit over the step's buttons.
    undo?.record({ label: `${ids.length} ${ids.length === 1 ? "task" : "tasks"} added`, toast: false, undo: takeBack });
    return takeBack;
  };

  const count = added.length;
  // Each row pushes the box down: keep it (and the strip under it) in view above the buttons held at the bottom.
  useEffect(() => {
    if (count > 0) composer.current?.scrollIntoView?.({ block: "nearest" });
  }, [count]);

  // A line still in the box is saved first; if it cannot be (no name yet, or the save failed), the step stays and
  // the composer says why.
  const finish = async () => {
    setFinishing(true);
    try {
      if (flush.current && !(await flush.current())) return;
      onFinish();
    } finally {
      setFinishing(false);
    }
  };

  return (
    <WelcomeFrame
      title="What's on your plate today?"
      lead="One per line. Don't organise anything — just get it out."
      footer={
        <>
          <Button variant="secondary" size="sheet" className={FOOTER_BUTTON} disabled={busy || finishing} onClick={() => void finish()}>
            I&rsquo;ll add things later
          </Button>
          <Button variant="primary" size="sheet" className={FOOTER_BUTTON} disabled={busy || finishing} onClick={() => void finish()}>
            {nextLabel(count)}
          </Button>
        </>
      }
    >
      {count > 0 && (
        <ul aria-label="On your plate" className="flex flex-col rounded-xl border border-line bg-surface">
          {added.map((a) => (
            <AddedRow key={a.id} draft={a.draft} ctx={ctx} />
          ))}
        </ul>
      )}
      {count >= BRAIN_DUMP_TODAY_LIMIT && <p className="text-body-sm text-pretty text-ink-2">{PLENTY_LINE}</p>}
      {/* On a phone the buttons hold the bottom edge (about 8 rem with the safe area): the box scrolls into view above them. */}
      <div ref={composer} className="max-sm:scroll-mb-[calc(8.5rem+env(safe-area-inset-bottom))] max-sm:[&_input]:scroll-mb-[calc(8.5rem+env(safe-area-inset-bottom))]">
        <QuickAddConnected
          open
          inline
          flushRef={flush}
          ctx={ctx}
          placeholder={placeholder}
          hint={
            <>
              Try <Token>3pm</Token>, <Token>~45m</Token>, <Token>#project</Token>, <Token>!1</Token> — we&rsquo;ll pick them up as you type.
            </>
          }
          shape={(draft) => brainDumpDraft(draft, ctx.today, count)}
          onClose={() => {}}
          onSubmit={onSubmit}
          onPasted={onPasted}
        />
      </div>
      {failure && (
        <p role="alert" className="text-body-sm text-pretty text-deadline">
          {failure}
        </p>
      )}
    </WelcomeFrame>
  );
}

function Token({ children }: { children: string }) {
  return <code className="rounded-xs bg-surface-2 px-1 font-sans text-ink-2 num">{children}</code>;
}

const TONE: Partial<Record<Fact["kind"], ChipTone>> = { time: "time", evening: "time", day: "time", project: "meet" };

/** A saved line: its title and what was read from it, and where a day of its own sent it. */
function AddedRow({ draft, ctx }: { draft: TaskDraft; ctx: QuickAddContext }) {
  // Today is where every row goes unless it says otherwise, so a "Today" chip on each would only be noise.
  const facts = interpret(draft, ctx.today).facts.filter((f) => !(f.kind === "day" && f.label === "Today"));
  const kept = keptForThen(draft, ctx.today);
  return (
    <li className="flex min-h-11 flex-col justify-center gap-0.5 border-t border-line px-3.5 py-2 first:border-t-0">
      <span className="flex min-w-0 items-center gap-2.5">
        <span aria-hidden="true" className="size-4 shrink-0 rounded-full border-[1.5px] border-line-control" />
        <span className="min-w-0 flex-1 truncate text-body text-ink">{draft.title}</span>
        <span className="flex shrink-0 items-center gap-1 max-sm:hidden">
          {facts.map((f, i) => (
            <span key={i} className={chipClass({ tone: TONE[f.kind] ?? "neutral" })}>
              {f.chip ?? f.label}
            </span>
          ))}
        </span>
      </span>
      {facts.length > 0 && (
        <span className="flex flex-wrap items-center gap-1 pl-6.5 sm:hidden">
          {facts.map((f, i) => (
            <span key={i} className={chipClass({ tone: TONE[f.kind] ?? "neutral", size: "sm" })}>
              {f.chip ?? f.label}
            </span>
          ))}
        </span>
      )}
      {kept && <span className="pl-6.5 text-body-sm text-ink-2">{kept}</span>}
    </li>
  );
}

/** The three examples, 2.5 s apart; the first one, still, for people who asked for less motion. */
function useCyclingPlaceholder(): string {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (prefersReducedMotion()) return;
    const id = setInterval(() => setI((n) => (n + 1) % PLACEHOLDERS.length), PLACEHOLDER_MS);
    return () => clearInterval(id);
  }, []);
  return PLACEHOLDERS[i];
}
