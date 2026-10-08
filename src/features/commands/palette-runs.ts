// The palette's own commands (SCREENS.md §12): the ones with no key, so the keyboard layer every shell carries never
// needs them (command-runs.ts holds the keyed ones). They load with the palette and the ? overlay through
// registry.ts, which gives them their words. Some answer inside the palette rather than closing it — Sign out's
// confirmation (§12 rules: never a destructive action without a confirm step in the same palette), Sync now's
// result — by returning a step; Add tag… types its prefix into the palette's field.
import { TODAY_SORTS } from "@/core/today/sort-options";
import type { LocalDatabase } from "@/data/powersync";
import { TagRepo } from "@/data/repositories/tag-repo";
import type { UndoRecorder } from "@/data/repositories/undo";
import { requestAddBlock } from "@/features/blocking/add-block-request";
import { requestTriageAll } from "@/features/inbox/triage-request";
import { requestOrganize } from "@/features/tasks/organize";
import { requestRow } from "@/features/tasks/row-request";
import { requestTimeline, timelineUnavailable } from "@/features/today/timeline-request";
import { requestToday } from "@/features/today/today-request";
import { ON_PROJECT, ON_TODAY, loadDays, onOne, onTargets, projectIn, snooze, type CommandContext, type CommandRun } from "./command-runs";

/** What only the palette has in hand: the local database and the undo stack (its writes' record). */
export interface PaletteExtras {
  db: LocalDatabase;
  history: UndoRecorder | null;
}
export type PaletteContext = CommandContext & PaletteExtras;

export interface StepAction {
  label: string;
  tone?: "destructive";
  /** What the palette says while `run` works ("Signing out…"). */
  working?: string;
  /** What the button does: another step to show, or nothing, and the palette closes. Without one the button closes it. */
  run?: () => Promise<PaletteStep | null | void> | PaletteStep | null | void;
}

/** A question or a result the palette shows in place of its list, its buttons first-is-default. */
export interface PaletteStep {
  text: string;
  note?: string;
  /** A result (Sync now's), read out politely; a question is not. */
  status?: boolean;
  /** Something went wrong: said in the deadline role (DESIGN_SYSTEM.md R1). */
  error?: boolean;
  actions: readonly StepAction[];
}

export interface PaletteRun extends CommandRun {
  /** A command that answers in the palette: it stays open on the step this resolves to, or closes on null. */
  step?: (ctx: PaletteContext) => Promise<PaletteStep | null>;
  /** What the palette says while the step works ("Syncing…"). */
  working?: string;
  /** Choosing it types this into the palette's field (Add tag… waits for the name) instead of running. */
  fill?: string;
}

/** The words that make the palette offer to create a tag: 'add tag calls', 'new tag @calls'. */
const TAG_QUERY = /^\s*(?:add|new|create)\s+tag\s+@?(\S.*?)\s*$/i;

/** The tag a palette query asks to create, or null. */
export function tagFromQuery(query: string): string | null {
  return TAG_QUERY.exec(query)?.[1] ?? null;
}

const SPACE_SQL = `select personal_space_id from users limit 1`;

/** 'Add tag "calls"': a tag on its own, which then shows in the @ suggestions and Search's filters; one undo. */
export async function addTag(ctx: Pick<PaletteContext, "db" | "history">, name: string): Promise<PaletteStep | null> {
  const space = (await ctx.db.getOptional<{ personal_space_id: string | null }>(SPACE_SQL))?.personal_space_id;
  if (!space) return { text: "Your account is still loading — try again in a moment.", error: true, actions: [{ label: "Done" }] };
  const out = await new TagRepo(ctx.db, ctx.history ?? undefined).create(space, name);
  return out && !out.created ? { text: `@${out.name} is already a tag.`, actions: [{ label: "Done" }] } : null;
}

/** Settings at one of its sections: on Settings already the hash alone changes, which Settings follows. */
const toSettings = (ctx: CommandContext, section: string) => {
  if (ctx.pathname === "/settings") window.location.hash = section;
  else ctx.go(`/settings#${section}`);
};

/** Sign out's confirmation, or the unsynced-changes warning Settings gives (features/account/sign-out.ts). */
async function signOutStep(db: LocalDatabase): Promise<PaletteStep> {
  const out = await import("@/features/account/sign-out");
  const leave = async (anyway: boolean): Promise<PaletteStep | null> => {
    const waiting = await out.signOutDevice(db, anyway);
    return waiting > 0 ? warning(waiting) : null;
  };
  const warning = (n: number): PaletteStep => ({
    text: out.unsyncedLine(n),
    note: out.UNSYNCED_NOTE,
    actions: [{ label: "Stay signed in" }, { label: out.loseLabel(n), tone: "destructive", working: "Signing out…", run: () => leave(true) }],
  });
  const { count } = await db.getUploadQueueStats();
  if (count > 0) return warning(count);
  return { text: "Sign out of Sparehour on this device?", note: out.SIGN_OUT_NOTE, actions: [{ label: "Sign out", working: "Signing out…", run: () => leave(false) }, { label: "Stay signed in" }] };
}

const CALENDARS_SQL = `select count(*) as n from calendar_connections where deleted_at is null`;

/** In the registry's order: the palette lists its words over these, by id. */
export const PALETTE_RUNS: readonly PaletteRun[] = [
  // ---- selected task
  { id: "task.nextweek", requiresSelection: true, run: snooze("nextweek") },
  // Move to… (SCREENS.md §3): the row's day picker; several ticked rows share the bulk date picker, and a row with
  // no picker of its own opens its detail at the do-date.
  {
    id: "task.move-day",
    requiresSelection: true,
    run: onTargets((ctx, ids) => {
      if (ids.length > 1) return ctx.editTicked("do");
      if (!requestRow(ids[0], "move")) ctx.openTask(ids[0], "do");
    }),
  },
  // PRODUCT_SPEC.md §6: the task's steps become tasks of a new project, which opens with the cursor in its add row.
  {
    id: "task.convert",
    requiresSelection: true,
    run: onOne(async (ctx, id) => {
      const out = await ctx.tasks.convertToProject(id);
      if (out) ctx.go(`/project/${encodeURIComponent(out.projectId)}?add=1`);
    }),
  },
  // Organising (SCREENS.md §24, §12): Duplicate and Copy link run in a lazy island (tasks/organize.tsx).
  { id: "task.duplicate", requiresSelection: true, run: onOne((_, id) => requestOrganize({ kind: "duplicate", id })) },
  { id: "task.copy-link", requiresSelection: true, run: onOne((_, id) => requestOrganize({ kind: "copy-link", id })) },
  {
    id: "project.duplicate",
    onlyOn: ON_PROJECT,
    run: (ctx) => {
      const id = projectIn(ctx.pathname);
      if (id) requestOrganize({ kind: "duplicate-project", id });
    },
  },
  // A repeat's series edits (SYSTEM_DESIGN.md §5.2), one task at a time; they do nothing to a task that does not repeat.
  // The logic loads with the recurrence engine (TaskRepo.series()), never with the shell.
  { id: "task.skip-occurrence", requiresSelection: true, run: onOne(async (ctx, id) => (await ctx.tasks.series()).skip(id)) },
  { id: "task.pause-repeats", requiresSelection: true, run: onOne((ctx, id) => ctx.openTask(id, "pause")) },
  { id: "task.resume-repeats", requiresSelection: true, run: onOne(async (ctx, id) => (await ctx.tasks.series()).resume(id)) },

  // ---- create
  // Add task to Inbox: quick add with nothing filled in, which files a task with no date and no project in the Inbox.
  { id: "create.inbox", run: (ctx) => ctx.quickAdd() },
  { id: "create.project", run: (ctx) => ctx.go("/browse?add=project") },
  { id: "create.area", run: (ctx) => ctx.go("/browse?add=area") },
  // Add tag… waits for the name: the palette then offers 'Add tag "calls"' (tagFromQuery, addTag).
  { id: "create.tag", fill: "Add tag ", run: () => undefined },
  // Add time block: on today's timeline, at once or as soon as Today shows today (blocking/add-block-request.ts).
  {
    id: "create.block",
    run: (ctx) => {
      // Another page, or Today stepped to another day (`?day=`): today's own page first.
      const elsewhere = ctx.pathname !== "/today" || new URLSearchParams(window.location.search).has("day");
      requestAddBlock();
      if (elsewhere) ctx.go("/today");
    },
  },

  // ---- go to
  { id: "go.browse", run: (ctx) => ctx.go("/browse") },
  // Triage all (SCREENS.md §5): the Inbox's walk, at once or as soon as the Inbox is open.
  { id: "inbox.triage-all", run: (ctx) => void (requestTriageAll() || ctx.go("/inbox")) },

  // ---- day
  // Trim today (PRODUCT_SPEC.md §9.4): Today opens its panel, at once or as soon as Today is open. The ellipsis says a
  // panel opens (and keeps "today" finding Go to Today first).
  { id: "day.trim", run: (ctx) => void (requestToday({ kind: "trim" }) || ctx.go("/today")) },
  // Clear the slate (PRODUCT_SPEC.md §8.5): Today's own confirmation, with its two scopes and counts.
  { id: "day.clear-slate", run: (ctx) => void (requestToday({ kind: "slate" }) || ctx.go("/today")) },
  { id: "day.replan", run: (ctx) => ctx.planDay("replan") },
  // Today on another day (SCREENS.md §12 Day, §2.1): tomorrow and yesterday by name, any day through Jump to date's
  // typed date, which Today opens at once or as soon as it is open.
  { id: "day.tomorrow", run: async (ctx) => (await loadDays()).openDay(ctx.today.add({ days: 1 }), ctx.today, ctx) },
  { id: "day.yesterday", run: async (ctx) => (await loadDays()).openDay(ctx.today.subtract({ days: 1 }), ctx.today, ctx) },
  { id: "day.jump", run: (ctx) => void (requestToday({ kind: "jump" }) || ctx.go("/today")) },

  // ---- list
  { id: "list.clear-checks", run: (ctx) => ctx.clearChecks() },

  // ---- view
  // Sort and Show completed are Today's view preferences (DECISIONS.md "Sort", 2026-10-06): Today only. "Sort by…"
  // types the five sorts' prefix into the field.
  { id: "view.sort", onlyOn: ON_TODAY, fill: "Sort Today by ", run: () => undefined },
  ...TODAY_SORTS.map(
    (o): PaletteRun => ({
      id: `view.sort-${o.value}`,
      onlyOn: ON_TODAY,
      run: () => void requestToday({ kind: "sort", sort: o.value }),
    }),
  ),
  { id: "view.show-completed", onlyOn: ON_TODAY, run: () => void requestToday({ kind: "completed" }) },
  // The selected block's Move to…, Duplicate and Rename: no single key (DECISIONS.md "`M` on the timeline"), the toolbar and here.
  ...(["move", "duplicate", "rename"] as const).map((b): PaletteRun => ({ id: `block.${b}`, run: () => void requestTimeline(`${b}-block`), unavailable: () => timelineUnavailable(true) })),
  { id: "view.theme-light", run: (ctx) => ctx.setTheme("light") },
  { id: "view.theme-dark", run: (ctx) => ctx.setTheme("dark") },
  { id: "view.theme-system", run: (ctx) => ctx.setTheme("system") },

  // ---- app
  // Sync now (SCREENS.md §20): the sync chip's own path — the data, then the calendar — with its words, in the palette.
  {
    id: "app.sync",
    working: "Syncing…",
    run: () => undefined,
    step: async (ctx) => {
      const { syncEverything } = await import("@/features/shell/sync-everything");
      const calendars = (await ctx.db.getOptional<{ n: number }>(CALENDARS_SQL))?.n ?? 0;
      const outcome = await syncEverything(calendars > 0);
      return { text: outcome.message, status: true, error: !outcome.ok, actions: [{ label: "Done" }] };
    },
  },
  // Export data: Settings › Data, whose first row is the export.
  { id: "app.export", run: (ctx) => toSettings(ctx, "data") },
  { id: "app.connect-calendar", run: (ctx) => toSettings(ctx, "calendar") },
  { id: "app.signout", run: () => undefined, step: (ctx) => signOutStep(ctx.db) },
];
