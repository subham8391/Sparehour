// The Sparehour MCP server's tools (DECISIONS.md, amendments 2026-10-23, 2026-11-14 and 2026-11-22): everything a
// person does in the app's own screens with tasks, days, blocks, repeats, projects, areas and planning settings, each
// a thin call into the Planner with its answer in plain text. Adding a task asks first: draft_task says what is not
// set with the real choices, and add_task writes nothing until it is told the person has answered. A write on a
// read-only connection is refused here with the way to change it, before anything reaches Postgres (which refuses it
// too: migration 20261023000100).
import { McpServer, type CallToolResult } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import { formatAdded, formatDayView, formatDraft, formatInbox, formatLog, formatPlace, formatPlan, formatProjects, formatSearch, formatSettings, formatSomeday, formatTags, formatTask, formatToday, formatUpcoming } from "./format";
import { Refusal, type Changed, type Planner } from "./planner";

export type Access = "read" | "write";

/** Follow-ups a write asks of the route, run after the answer is sent (`after()`): the calendar push. */
export interface Effects {
  calendarChanged(): void;
}

export const SERVER_INSTRUCTIONS = `Sparehour is a calm, time-aware personal planner. A task has a do-date (the day the person plans to do it), maybe a time, an optional deadline (only a missed deadline is late), an estimate, a project or an area, tags, steps, a repeat and a priority. Today shows the day's tasks, This evening, Carried over (tasks whose day passed; say "carried over", never "overdue") and the spare time left after meetings, a buffer and what is planned.
Adding a task: always call draft_task first with the person's own words and whatever else they told you. It adds nothing; it says what is not set and gives their real choices (days with the spare time on each, their projects and tags, how long such tasks take them). Put those choices to the person in one short message, as tappable options if you can show them, and wait. They may answer only some, or say "add as is". Then call add_task with each task's draft code, their answers and confirmed: true. A task they mention while answering has not been asked about yet: draft it and ask. Never fill in a project, day, time, estimate, priority, deadline or tag they did not give, and never confirm on their behalf. Several tasks at once are drafted and asked about together.
Look with get_today, get_day, get_inbox, get_upcoming, get_project and search; act with the ids they return (titles work too when only one matches). When a request could mean two things (which task, which day, done or dropped), ask before changing anything. plan_day is the app's own Plan my day for the rest of today and changes nothing; show it, and call apply_day_plan only when the person agrees. Ask before dropping, archiving, deleting an area or changing settings. Say in one line what changed. Keep answers calm and short.`;

const READ = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } as const;
const WRITE = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false } as const;

const ok = (text: string): CallToolResult => ({ content: [{ type: "text", text }] });
const refused = (text: string): CallToolResult => ({ content: [{ type: "text", text }], isError: true });

const READ_ONLY =
  "This connection is read only, so Sparehour changed nothing. To let this app make changes, open Sparehour › Settings › Connected apps and set this app to “Read and change”.";

const taskRef = z.string().min(1).max(500).describe("The task's id (from any listing), or its title when only one open task has it.");
/** One task or several: the same change to each. */
const taskRefs = z.union([taskRef, z.array(taskRef).min(1).max(50)]).describe("The task's id or title, or a list of them to do the same to each.");
const dayWords = z.string().min(1).max(100);
const missed = z.enum(["carry", "skip", "expire"]);
const tagNames = z.array(z.string().min(1).max(100)).max(20);

const taskInput = z.object({
  draft: z.string().max(20).optional().describe("For add_task: the draft code draft_task gave for this very task."),
  text: z.string().min(1).max(500).optional().describe("The person's own words as one line; dates, times, #project, @tag, ~45m, !2 and {deadline} in it are read as Sparehour's quick add reads them."),
  title: z.string().min(1).max(500).optional().describe("The exact title, when words in it must not be read as a date or a tag. Give text or title (both: title wins for the name)."),
  do: dayWords.optional().describe("The day, maybe with a time: “tomorrow”, “fri 3pm”, “tonight”, 2026-11-02, “someday”, or “none” when the person wants no day."),
  estimate: z.union([z.number().int().min(1).max(1440), z.string().max(20)]).nullable().optional().describe("How long: minutes, “45m” or “1h30”; null when the person wants none."),
  project: z.string().max(200).nullable().optional().describe("An existing project's name or id; “none” when the person wants no project."),
  new_project: z.string().min(1).max(200).optional().describe("The name of a project to make for it."),
  area: z.string().max(200).optional().describe("An area to file it in directly, or the area of new_project."),
  heading: z.string().max(200).optional().describe("A heading inside the project; made if it is new."),
  tags: tagNames.optional().describe("Tag names, made if new; [] when the person wants none."),
  priority: z.number().int().min(0).max(3).optional().describe("1 (highest) to 3; 0 when the person wants none."),
  deadline: dayWords.nullable().optional().describe("The day it is really due; “none” when there is none."),
  start: dayWords.nullable().optional().describe("Hidden from lists until this day."),
  repeat: z.string().max(100).nullable().optional().describe("“every monday”, “every 2 weeks”, “every! 3 days” (counted from each completion); “none” for no repeat."),
  if_missed: missed.optional().describe("What happens when its day passes undone: carry to the next day, skip (wait undated) or expire."),
  steps: z.array(z.string().min(1).max(500)).max(50).optional().describe("Checklist steps, in order; [] when the person wants none."),
  notes: z.string().max(10000).nullable().optional().describe("A note (Markdown)."),
});
const taskInputs = z.array(taskInput).min(1).max(20).describe("The task, or several to draft or add together.");

export function registerTools(server: McpServer, planner: Planner, access: Access, effects: Effects): void {
  const run = (fn: () => Promise<string>) =>
    fn().then(ok, (e: unknown) => {
      if (e instanceof Refusal) return refused(e.message);
      console.error("mcp tool failed", e);
      return refused("Sparehour couldn't do that just now (a server error). Try again in a moment.");
    });
  /** A change, with the calendar asked for when blocks moved. */
  const changed = async (p: Promise<Changed>) => {
    const r = await p;
    if (r.blocksChanged) effects.calendarChanged();
    return r.said;
  };
  /** The same change to each task: one line each, and a refusal among several said on its own line. */
  const each = async (refs: string | string[], fn: (ref: string) => Promise<Changed>): Promise<string> => {
    const list = typeof refs === "string" ? [refs] : [...new Set(refs)];
    if (list.length === 1) return changed(fn(list[0]));
    const lines: string[] = [];
    let failed = 0;
    for (const ref of list) {
      try {
        lines.push(await changed(fn(ref)));
      } catch (e) {
        if (!(e instanceof Refusal)) throw e;
        failed++;
        lines.push(`Not changed: ${e.message}`);
      }
    }
    if (failed === list.length) throw new Refusal(lines.join("\n"));
    return lines.join("\n");
  };
  const write = (fn: () => Promise<string>) => (access === "write" ? run(fn) : Promise.resolve(refused(READ_ONLY)));

  // ---------------------------------------------------------------- reads

  server.registerTool(
    "get_today",
    {
      title: "Today",
      description: "Today as Sparehour shows it: the spare time left (working hours less meetings, a buffer and what is planned), the calendar, time blocks, today's tasks, this evening's and the ones carried over from earlier days.",
      inputSchema: z.object({}),
      annotations: READ,
    },
    () => run(async () => formatToday(await planner.todayView())),
  );

  server.registerTool(
    "get_inbox",
    { title: "Inbox", description: "Tasks not yet given a day or a project, newest first.", inputSchema: z.object({}), annotations: READ },
    () => run(async () => formatInbox(await planner.inbox(), await planner.today())),
  );

  server.registerTool(
    "get_upcoming",
    {
      title: "Upcoming",
      description: "The days after today, each with its tasks and spare time, then the open tasks with no day yet (Not yet planned).",
      inputSchema: z.object({ days: z.number().int().min(1).max(31).default(7).describe("How many days after today; 7 unless asked.") }),
      annotations: READ,
    },
    ({ days }) => run(async () => formatUpcoming(await planner.upcoming(days))),
  );

  server.registerTool(
    "get_task",
    { title: "Task details", description: "One task with its note, steps, dates, estimate, project, tags and repeat.", inputSchema: z.object({ task: taskRef }), annotations: READ },
    ({ task }) => run(async () => formatTask(await planner.task(task), await planner.today())),
  );

  server.registerTool(
    "search",
    {
      title: "Search",
      description:
        "Finds open tasks (title or note), projects and areas containing every word of the query. Narrow it, with or without words, by tag, project, area, priority, deadline, a missing estimate or a repeat.",
      inputSchema: z.object({
        query: z.string().max(200).default("").describe("Words to look for; may be empty when a filter is given."),
        tag: z.string().max(100).optional(),
        project: z.string().max(200).optional().describe("A project's name or id."),
        area: z.string().max(200).optional().describe("An area's name or id: its own tasks and its projects'."),
        priority: z.number().int().min(0).max(3).optional().describe("1 (highest) to 3, or 0 for none."),
        due_by: dayWords.optional().describe("A deadline on or before this day."),
        no_estimate: z.boolean().optional().describe("Only tasks with no estimate yet."),
        repeating: z.boolean().optional().describe("Only tasks that repeat."),
        include_done: z.boolean().default(false).describe("Also finished and dropped tasks. Finished ones are kept: this week's can be reopened by id, older ones are listed with the day they were finished and are reopened in the app's Logbook."),
      }),
      annotations: READ,
    },
    ({ query, include_done, tag, project, area, priority, due_by, no_estimate, repeating }) =>
      run(async () => formatSearch(await planner.search(query, include_done, { tag, project, area, priority, dueBy: due_by, noEstimate: no_estimate || undefined, repeating: repeating || undefined }), query, await planner.today())),
  );

  server.registerTool(
    "get_day",
    {
      title: "One day",
      description: "Any day, past or ahead: its tasks, calendar, time blocks (with their ids), spare time, and what was finished on it.",
      inputSchema: z.object({ day: dayWords.describe("“tomorrow”, “fri”, “yesterday” or 2026-11-02.") }),
      annotations: READ,
    },
    ({ day }) => run(async () => formatDayView(await planner.blocks.day(day))),
  );

  server.registerTool(
    "get_someday",
    { title: "Someday", description: "What is parked: tasks and projects with no day, kept for later.", inputSchema: z.object({}), annotations: READ },
    () => run(async () => formatSomeday(await planner.places.someday(), await planner.today())),
  );

  server.registerTool(
    "get_logbook",
    {
      title: "Logbook",
      description: "What was finished over the last days, newest first. Use it for a weekly review or “what did I do”.",
      inputSchema: z.object({ days: z.number().int().min(1).max(31).default(7).describe("How many days back, today included.") }),
      annotations: READ,
    },
    ({ days }) => run(async () => formatLog(await planner.blocks.log(days))),
  );

  server.registerTool(
    "get_project",
    {
      title: "A project or an area",
      description: "One project with its note, deadline, headings and open tasks, or one area with its projects and its own tasks.",
      inputSchema: z.object({ project: z.string().min(1).max(200).describe("The project's or the area's name or id.") }),
      annotations: READ,
    },
    ({ project }) => run(async () => formatPlace(await planner.places.place(project), await planner.today())),
  );

  server.registerTool(
    "list_tags",
    { title: "Tags", description: "Every tag, with how many open tasks carry it.", inputSchema: z.object({}), annotations: READ },
    () => run(async () => formatTags(await planner.places.tags())),
  );

  server.registerTool(
    "get_settings",
    { title: "Planning settings", description: "Working hours, buffer, default estimate, evening, reminders and what happens to a task that misses its day.", inputSchema: z.object({}), annotations: READ },
    () => run(async () => formatSettings(await planner.account.settings())),
  );

  server.registerTool(
    "draft_task",
    {
      title: "Draft a task",
      description:
        "The first step of adding any task. Adds nothing: it shows how Sparehour reads the person's words, what they have not said (day, how long, project, deadline, priority, tags), the real choices for each, and anything worth telling them (no room that day, a clash, the same task already there). Put its choices to the person, then call add_task.",
      inputSchema: z.object({ tasks: taskInputs }),
      annotations: READ,
    },
    ({ tasks }) => run(async () => formatDraft(await planner.drafts.draft(tasks))),
  );

  server.registerTool(
    "list_projects",
    { title: "Areas and projects", description: "Every area with its projects, and the projects in no area, with how many tasks are open in each.", inputSchema: z.object({}), annotations: READ },
    () => run(async () => formatProjects(await planner.projects())),
  );

  server.registerTool(
    "plan_day",
    {
      title: "Plan my day",
      description:
        "Sparehour's own Plan my day for the rest of today: a time block for each open task that fits (a set time first, then what is due today, then by priority and how often it was carried over), each with its reason, then what did not fit and the time left unplanned. Meetings, locked blocks and blocks made by hand stay where they are. Changes nothing: show it to the person, and call apply_day_plan when they agree.",
      inputSchema: z.object({}),
      annotations: READ,
    },
    () => run(async () => formatPlan(await planner.planDay())),
  );

  // ---------------------------------------------------------------- task writes

  server.registerTool(
    "apply_day_plan",
    {
      title: "Put the plan on the timeline",
      description:
        "Writes Plan my day's blocks for the rest of today to the timeline (and to the person's calendar when they have that on), replacing the plan's own earlier blocks that have not started. The plan is worked out again at this moment, so the answer lists exactly what was placed. Call plan_day first and ask the person before using this.",
      inputSchema: z.object({}),
      annotations: WRITE,
    },
    () =>
      write(async () => {
        const plan = await planner.applyPlan();
        if (plan.applied) effects.calendarChanged();
        return formatPlan(plan);
      }),
  );

  server.registerTool(
    "add_task",
    {
      title: "Add tasks",
      description: [
        "Adds a task, or several, once the person has answered what draft_task asked (or said to add it as it is). Each task needs the draft code draft_task gave for it. Without confirmed: true, or without its code, a task is not added and its draft comes back instead.",
        "`text` is one line of Sparehour's quick add, read exactly as the app reads it: a day or time (today, tomorrow, fri, next week, 21 oct, 3pm, tonight, evening) sets the do-date;",
        "~45m or ~1h30 is the estimate; #Project files it in a project (#+Name makes a new one); @tag adds a tag (made if new);",
        "!1, !2 or !3 is the priority (1 highest); {fri} is a deadline; 'after mon' a start date; 'every monday' or 'every 2 weeks' a repeat ('every!' repeats after each completion); '// …' at the end is a note.",
        "The other fields lay the person's answers over it. A task with a time goes on the timeline too. No day and no project puts it in the Inbox.",
      ].join(" "),
      inputSchema: z.object({
        tasks: taskInputs,
        confirmed: z.boolean().default(false).describe("true only when the person has seen these drafts and replied, or has said to add without questions. Never assume it, and never for a task they have only just mentioned."),
      }),
      annotations: WRITE,
    },
    ({ tasks, confirmed }) =>
      write(async () => {
        if (!confirmed) return formatDraft(await planner.drafts.draft(tasks), "unconfirmed");
        const today = await planner.today();
        const lines: string[] = [];
        let added = 0;
        const unasked: typeof tasks = [];
        for (const task of tasks) {
          try {
            if (!(await planner.drafts.drafted(task))) {
              unasked.push(task);
              continue;
            }
            const a = await planner.drafts.add(task);
            added++;
            if (a.blocksChanged) effects.calendarChanged();
            lines.push(formatAdded(a, today));
          } catch (e) {
            if (!(e instanceof Refusal) || tasks.length === 1) throw e;
            lines.push(`Not added “${task.title ?? task.text ?? ""}”: ${e.message}`);
          }
        }
        if (unasked.length) lines.push(...(lines.length ? [""] : []), formatDraft(await planner.drafts.draft(unasked), "undrafted"));
        else if (added === 0) throw new Refusal(lines.join("\n"));
        return lines.join("\n");
      }),
  );

  server.registerTool(
    "complete_task",
    {
      title: "Complete a task",
      description: "Marks a task, or several, done. A repeating task moves on to its next day. When the person says how long it took, pass that too: Sparehour learns how their estimates run from it.",
      inputSchema: z.object({
        task: taskRefs,
        took_minutes: z.number().int().min(1).max(1440).optional().describe("How long the task took, in minutes, only when the person said so. Never a guess."),
      }),
      annotations: WRITE,
    },
    ({ task, took_minutes }) => write(() => each(task, (t) => planner.complete(t, took_minutes))),
  );

  server.registerTool(
    "reopen_task",
    { title: "Reopen a task", description: "Un-completes a finished task, or brings back a dropped or archived one.", inputSchema: z.object({ task: taskRefs }), annotations: WRITE },
    ({ task }) => write(() => each(task, (t) => planner.reopen(t))),
  );

  server.registerTool(
    "reschedule_task",
    {
      title: "Move a task to another day",
      description:
        "Gives a task, or several, a new do-date, read like the app's Do field: “tomorrow”, “fri”, “fri 3pm”, “tonight”, “next week”, “in 3 days” or 2026-11-02. “someday” parks it in Someday; “none” takes the day off. A repeating task moves just this once; its repeat stays. Time blocks on the old day are let go, and a task with a time gets its block on the new day.",
      inputSchema: z.object({ task: taskRefs, when: dayWords }),
      annotations: WRITE,
    },
    ({ task, when }) => write(() => each(task, (t) => planner.reschedule(t, when))),
  );

  server.registerTool(
    "update_task",
    {
      title: "Edit a task",
      description: "Changes a task's title, note, time, deadline, start date, estimate, priority, project, area, heading, tags or what happens if it is missed; with several tasks, the same change to each. Only the fields given change. Its day is reschedule_task, its repeat change_repeat, its steps edit_steps.",
      inputSchema: z.object({
        task: taskRefs,
        title: z.string().min(1).max(500).optional(),
        notes: z.string().max(10000).nullable().optional().describe("Replaces the note; null or empty clears it."),
        time: z.string().max(20).nullable().optional().describe("A time of day, “15:00” or “3pm”; “none” or null takes the time off and keeps the day."),
        evening: z.boolean().optional().describe("Whether it sits under This evening."),
        deadline: z.string().max(100).nullable().optional().describe("A day in words or ISO; “none” or null clears it."),
        start: z.string().max(100).nullable().optional().describe("Hidden until this day; “none” or null clears it."),
        estimate: z.union([z.number().int().min(1).max(1440), z.string().max(20)]).nullable().optional().describe("Minutes, or “45m”, “1h30”; null clears it."),
        priority: z.number().int().min(0).max(3).optional().describe("1 (highest) to 3, or 0 for none."),
        project: z.string().max(200).nullable().optional().describe("A project's name or id; “none” or null takes it out of its project."),
        area: z.string().max(200).nullable().optional().describe("An area to file it in directly, with no project; “none” takes it out."),
        heading: z.string().max(200).nullable().optional().describe("A heading of its project; “none” for under no heading."),
        if_missed: missed.optional().describe("When its day passes undone: carry to the next day, skip (wait undated) or expire."),
        add_tags: tagNames.optional(),
        remove_tags: tagNames.optional(),
      }),
      annotations: WRITE,
    },
    ({ task, add_tags, remove_tags, if_missed, ...rest }) => write(() => each(task, (t) => planner.update(t, { ...rest, ifMissed: if_missed, addTags: add_tags, removeTags: remove_tags }))),
  );

  server.registerTool(
    "edit_steps",
    {
      title: "Edit a task's steps",
      description: "Adds, ticks, unticks, renames or removes the steps (checklist) of a task. Steps are named by their words.",
      inputSchema: z.object({
        task: taskRef,
        add: z.array(z.string().min(1).max(500)).max(50).optional(),
        check: z.array(z.string().min(1).max(500)).max(50).optional(),
        uncheck: z.array(z.string().min(1).max(500)).max(50).optional(),
        rename: z.array(z.object({ step: z.string().min(1).max(500), to: z.string().min(1).max(500) })).max(50).optional(),
        remove: z.array(z.string().min(1).max(500)).max(50).optional(),
      }),
      annotations: WRITE,
    },
    ({ task, ...rest }) => write(() => changed(planner.places.steps(task, rest))),
  );

  server.registerTool(
    "change_repeat",
    {
      title: "Change a repeat",
      description:
        "Makes a task repeat or changes its rule (set, with “every monday”, “every 2 weeks”, “every! 3 days”), stops it (the task itself stays), skips this one day, pauses it until a day, or resumes it. To move just one day, use reschedule_task.",
      inputSchema: z.object({
        task: taskRef,
        action: z.enum(["set", "stop", "skip", "pause", "resume"]),
        repeat: z.string().min(1).max(100).optional().describe("For set."),
        until: dayWords.optional().describe("For pause: the day it comes back."),
      }),
      annotations: WRITE,
    },
    ({ task, action, repeat, until }) =>
      write(async () => {
        if (action === "set" && !repeat) throw new Refusal("Say how it repeats: “every monday”, “every 2 weeks”.");
        if (action === "pause" && !until) throw new Refusal("Say until which day to pause it.");
        const r = planner.repeats;
        return changed(action === "set" ? r.set(task, repeat as string) : action === "stop" ? r.stop(task) : action === "skip" ? r.skip(task) : action === "pause" ? r.pause(task, until as string) : r.resume(task));
      }),
  );

  server.registerTool(
    "duplicate_task",
    { title: "Duplicate a task", description: "A copy right after it: its words, steps, tags, dates and repeat, none of its history.", inputSchema: z.object({ task: taskRef }), annotations: WRITE },
    ({ task }) => write(() => changed(planner.places.duplicateTask(task))),
  );

  server.registerTool(
    "make_task_a_project",
    {
      title: "Make a task a project",
      description: "Turns a task that is too big into a project: its steps become the project's tasks, and the task itself is archived. Ask before doing this.",
      inputSchema: z.object({ task: taskRef }),
      annotations: WRITE,
    },
    ({ task }) => write(() => changed(planner.places.toProject(task))),
  );

  server.registerTool(
    "drop_task",
    {
      title: "Drop a task",
      description: "Drops a task, or several, the person no longer wants: it leaves every list and stays in the Logbook under Dropped, and reopen_task brings it back. Ask before dropping.",
      inputSchema: z.object({ task: taskRefs }),
      annotations: { ...WRITE, destructiveHint: true },
    },
    ({ task }) => write(() => each(task, (t) => planner.drop(t))),
  );

  // ---------------------------------------------------------------- time blocks

  server.registerTool(
    "block_time",
    {
      title: "Block time",
      description:
        "Puts a time block on the timeline (and on the person's calendar when they have that on): for a task, or with a title for a block of their own. With no start, the next free gap that fits. Blocking a task on another day moves the task there. Says what it overlaps.",
      inputSchema: z.object({
        task: taskRef.optional(),
        title: z.string().min(1).max(500).optional().describe("The block's name, for a block with no task."),
        day: dayWords.optional().describe("The task's own day when left out, else today."),
        start: z.string().max(20).optional().describe("“14:30” or “2:30pm”; left out, the next free gap."),
        end: z.string().max(20).optional(),
        minutes: z.union([z.number().int().min(5).max(1440), z.string().max(20)]).optional().describe("Its length; the task's estimate when left out."),
        locked: z.boolean().optional().describe("Locked blocks stay where they are when the day is planned."),
      }),
      annotations: WRITE,
    },
    (input) => write(() => changed(planner.blocks.add(input))),
  );

  server.registerTool(
    "change_block",
    {
      title: "Change a time block",
      description: "Moves, resizes, renames, locks or unlocks a time block. Its task's own time is not changed.",
      inputSchema: z.object({
        block: z.string().min(1).max(500).describe("The block's id (get_today and get_day show it), or its title when only one is ahead."),
        day: dayWords.optional(),
        start: z.string().max(20).optional(),
        end: z.string().max(20).optional(),
        minutes: z.union([z.number().int().min(5).max(1440), z.string().max(20)]).optional(),
        title: z.string().max(500).nullable().optional(),
        locked: z.boolean().optional(),
      }),
      annotations: WRITE,
    },
    ({ block, ...rest }) => write(() => changed(planner.blocks.change(block, rest))),
  );

  server.registerTool(
    "remove_block",
    { title: "Remove a time block", description: "Takes a block off the timeline; its task stays where it was.", inputSchema: z.object({ block: z.string().min(1).max(500) }), annotations: WRITE },
    ({ block }) => write(() => changed(planner.blocks.remove(block))),
  );

  // ---------------------------------------------------------------- projects and areas

  server.registerTool(
    "add_project",
    {
      title: "Add a project",
      description: "Makes a project, with an area, a note, a deadline and headings when the person gave them. Ask which area when they have areas and did not say.",
      inputSchema: z.object({
        name: z.string().min(1).max(200),
        area: z.string().max(200).nullable().optional().describe("An existing area's name or id."),
        notes: z.string().max(10000).optional(),
        deadline: dayWords.optional(),
        headings: z.array(z.string().min(1).max(200)).max(30).optional(),
      }),
      annotations: WRITE,
    },
    (input) => write(() => changed(planner.places.addProject(input))),
  );

  server.registerTool(
    "update_project",
    {
      title: "Edit a project",
      description: "Renames a project, changes its note, deadline or area, completes it (done), parks it (someday), archives it or brings it back (active), and adds, renames or removes headings. Ask before completing or archiving.",
      inputSchema: z.object({
        project: z.string().min(1).max(200).describe("Its name or id."),
        name: z.string().min(1).max(200).optional(),
        notes: z.string().max(10000).nullable().optional(),
        deadline: z.string().max(100).nullable().optional().describe("“none” or null clears it."),
        area: z.string().max(200).nullable().optional().describe("“none” or null for no area."),
        state: z.enum(["active", "someday", "done", "archived"]).optional(),
        add_headings: z.array(z.string().min(1).max(200)).max(30).optional(),
        rename_heading: z.object({ from: z.string().min(1).max(200), to: z.string().min(1).max(200) }).optional(),
        remove_heading: z.string().min(1).max(200).optional().describe("Its tasks stay in the project."),
      }),
      annotations: WRITE,
    },
    ({ project, ...rest }) => write(() => changed(planner.places.updateProject(project, rest))),
  );

  server.registerTool(
    "duplicate_project",
    { title: "Duplicate a project", description: "A copy of a project with its headings and open tasks. Good for a checklist used again.", inputSchema: z.object({ project: z.string().min(1).max(200) }), annotations: WRITE },
    ({ project }) => write(() => changed(planner.places.duplicateProject(project))),
  );

  server.registerTool(
    "add_area",
    { title: "Add an area", description: "Makes an area (a part of life that does not end: Work, Home, Health).", inputSchema: z.object({ name: z.string().min(1).max(200) }), annotations: WRITE },
    ({ name }) => write(() => changed(planner.places.addArea(name))),
  );

  server.registerTool(
    "rename_area",
    { title: "Rename an area", description: "Gives an area a new name.", inputSchema: z.object({ area: z.string().min(1).max(200), name: z.string().min(1).max(200) }), annotations: WRITE },
    ({ area, name }) => write(() => changed(planner.places.renameArea(area, name))),
  );

  server.registerTool(
    "delete_area",
    {
      title: "Delete an area",
      description: "Deletes an area. Its projects and tasks stay, in no area. Ask before deleting.",
      inputSchema: z.object({ area: z.string().min(1).max(200) }),
      annotations: { ...WRITE, destructiveHint: true },
    },
    ({ area }) => write(() => changed(planner.places.removeArea(area))),
  );

  // ---------------------------------------------------------------- the account

  server.registerTool(
    "update_settings",
    {
      title: "Change planning settings",
      description: "Changes working hours, buffer, default estimate, evening, reminders or what happens to a missed task. Only the fields given change. Read get_settings first and ask before changing.",
      inputSchema: z.object({
        work_hours: z
          .array(z.object({ days: z.array(z.string().min(3).max(20)).min(1).describe("Monday to Sunday, “weekdays” or “weekend”."), hours: z.array(z.string().max(20)).max(3).describe("“09:00-13:00”; up to three; [] or “off” for a day off.") }))
          .max(7)
          .optional(),
        buffer_percent: z.number().int().optional().describe("0 to 30."),
        default_estimate_minutes: z.number().int().optional(),
        evening_starts_at: z.string().max(20).optional(),
        evening_ends_at: z.string().max(20).optional(),
        if_missed: missed.optional(),
        ask_after_carries: z.number().int().optional().describe("“Still want this?” after this many carries."),
        someday_after_days: z.number().int().optional().describe("Untouched tasks go to Someday after this many days."),
        morning_review: z.boolean().optional(),
        remind_block_start: z.boolean().optional(),
        remind_minutes_before: z.number().int().optional().describe("0, 5, 10 or 15."),
        remind_deadlines: z.boolean().optional(),
        morning_message: z.boolean().optional(),
        morning_message_at: z.string().max(20).nullable().optional().describe("null for its usual time."),
        shutdown_reminder: z.boolean().optional(),
        shutdown_reminder_at: z.string().max(20).nullable().optional(),
      }),
      annotations: WRITE,
    },
    (input) => write(() => changed(planner.account.update(input))),
  );

  server.registerTool(
    "close_day",
    {
      title: "Close the day",
      description: "The evening shutdown: closes today, with a highlight and a rating from 1 to 5 when the person gives them. First look at get_today and ask what to do with what is left.",
      inputSchema: z.object({ highlight: z.string().max(1000).optional(), rating: z.number().int().min(1).max(5).optional() }),
      annotations: WRITE,
    },
    (input) => write(() => changed(planner.account.closeDay(input))),
  );
}

const asPrompt = (text: string) => ({ messages: [{ role: "user" as const, content: { type: "text" as const, text } }] });

/** Ready-made requests, offered where the assistant lists them (Claude's + menu, a slash command). */
export function registerPrompts(server: McpServer): void {
  server.registerPrompt(
    "add_task",
    { title: "Add a task", description: "Draft it, answer a few choices, add it.", argsSchema: z.object({ task: z.string().optional().describe("The task, in your own words.") }) },
    ({ task }) => asPrompt(task ? `Add this to Sparehour: ${task}\nDraft it first with draft_task and ask me what is not set.` : "I want to add a task to Sparehour. Ask me what it is, then draft it with draft_task and ask me what is not set."),
  );
  server.registerPrompt("brain_dump", { title: "Brain dump", description: "Many things at once, sorted into tasks." }, () =>
    asPrompt("I want to empty my head into Sparehour. Ask me for everything on my mind, turn it into tasks, draft them all together with draft_task, ask me about what is not set in one go, and add them when I have answered."),
  );
  server.registerPrompt("plan_my_day", { title: "Plan my day", description: "See today, settle what carried over, plan the rest." }, () =>
    asPrompt("Help me plan today in Sparehour. Look at get_today, ask me what to do with each carried-over task, then show me plan_day and put it on the timeline only when I agree."),
  );
  server.registerPrompt("close_my_day", { title: "Close my day", description: "What got done, what moves, and the day's highlight." }, () =>
    asPrompt("Help me close my day in Sparehour. Show what I finished (get_day for today) and what is left (get_today), ask me where each thing left goes, then ask for a highlight and a rating from 1 to 5 and use close_day."),
  );
  server.registerPrompt("weekly_review", { title: "Weekly review", description: "The week behind, the week ahead, and what is stuck." }, () =>
    asPrompt("Run a weekly review with me in Sparehour, one step at a time: what I finished (get_logbook), the Inbox (get_inbox), what carried over (get_today), projects with nothing planned (list_projects), Someday (get_someday), then the week ahead (get_upcoming). Ask me before each change."),
  );
}

/** A fresh server for one request, its tools bound to the caller's planner and access. */
export function buildServer(planner: Planner, access: Access, effects: Effects): McpServer {
  const server = new McpServer({ name: "sparehour", title: "Sparehour", version: "2.0.0" }, { instructions: SERVER_INSTRUCTIONS });
  registerTools(server, planner, access, effects);
  registerPrompts(server);
  return server;
}
