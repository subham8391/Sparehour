// The Sparehour MCP server's tools (DECISIONS.md, amendment 2026-10-23): eight that read and nine that write, each
// a thin call into the Planner with its answer in plain text. A write on a read-only connection is refused here with
// the way to change it, before anything reaches Postgres (which refuses it too: migration 20261023000100).
import { McpServer, type CallToolResult } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import { formatAdded, formatInbox, formatList, formatLists, formatProjects, formatSearch, formatTask, formatToday, formatUpcoming } from "./format";
import { Refusal, type Planner } from "./planner";

export type Access = "read" | "write";

/** Follow-ups a write asks of the route, run after the answer is sent (`after()`): the calendar push, a link's preview. */
export interface Effects {
  calendarChanged(): void;
  linkSaved(itemId: string, url: string): void;
}

export const SERVER_INSTRUCTIONS = `Sparehour is a calm, time-aware personal planner. A task has a do-date (the day the person plans to do it), maybe a time, an optional deadline (only a missed deadline is late), an estimate, a project or an area, tags and a priority. Today shows the day's tasks, This evening, Carried over (tasks whose day passed; say "carried over", never "overdue") and the spare time left after meetings, a buffer and what is planned. Lists hold things that are not tasks (to read, to watch, ideas): items with a status (to do, doing, done), a 1–5 rating, a link, a note and tags; lists nest.
Look with get_today, get_inbox, get_upcoming, search, get_lists and get_list; act with the ids they return (titles work too when only one task matches). add_task takes one line in Sparehour's quick-add syntax, so pass the person's words through rather than rewriting them. Keep answers calm and short.`;

const READ = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } as const;
const WRITE = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false } as const;

const ok = (text: string): CallToolResult => ({ content: [{ type: "text", text }] });
const refused = (text: string): CallToolResult => ({ content: [{ type: "text", text }], isError: true });

const READ_ONLY =
  "This connection is read only, so Sparehour changed nothing. To let Claude make changes, open Sparehour › Settings › Connected apps and set this app to “Read and change”.";

const taskRef = z.string().min(1).max(500).describe("The task's id (from any listing), or its title when only one open task has it.");
const listRef = z.string().min(1).max(500).describe("The list's id, its name when only one list has it, or its path such as “Anime › Action”.");
const tagNames = z.array(z.string().min(1).max(100)).max(20);
const status = z.enum(["todo", "doing", "done"]);

export function registerTools(server: McpServer, planner: Planner, access: Access, effects: Effects): void {
  const run = (fn: () => Promise<string>) =>
    fn().then(ok, (e: unknown) => {
      if (e instanceof Refusal) return refused(e.message);
      console.error("mcp tool failed", e);
      return refused("Sparehour couldn't do that just now (a server error). Try again in a moment.");
    });
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
      description: "Finds open tasks (title or note), projects, areas, lists and list items containing every word of the query.",
      inputSchema: z.object({
        query: z.string().min(1).max(200),
        include_done: z.boolean().default(false).describe("Also finished and dropped tasks (the Logbook keeps finished ones for a week)."),
      }),
      annotations: READ,
    },
    ({ query, include_done }) => run(async () => formatSearch(await planner.search(query, include_done), query, await planner.today())),
  );

  server.registerTool(
    "list_projects",
    { title: "Areas and projects", description: "Every area with its projects, and the projects in no area, with how many tasks are open in each.", inputSchema: z.object({}), annotations: READ },
    () => run(async () => formatProjects(await planner.projects())),
  );

  server.registerTool(
    "get_lists",
    { title: "Lists", description: "Every list (for things that aren't tasks) as a tree, with how many items each holds and how many are not done.", inputSchema: z.object({}), annotations: READ },
    () => run(async () => formatLists(await planner.lists())),
  );

  server.registerTool(
    "get_list",
    {
      title: "A list",
      description: "One list: the lists inside it and its items in the list's own order, each with its status, rating, tags, link and note.",
      inputSchema: z.object({ list: listRef, status: z.enum(["all", "todo", "doing", "done"]).default("all").describe("Only items with this status.") }),
      annotations: READ,
    },
    ({ list, status }) => run(async () => formatList(await planner.list(list, status))),
  );

  // ---------------------------------------------------------------- task writes

  server.registerTool(
    "add_task",
    {
      title: "Add a task",
      description: [
        "Adds one task from a line of Sparehour's quick-add, read exactly as the app reads it.",
        "A day or time (today, tomorrow, fri, next week, 21 oct, 3pm, tonight, evening) sets the do-date;",
        "~45m or ~1h30 is the estimate; #Project files it in a project (#+Name makes a new one); @tag adds a tag (made if new);",
        "!1, !2 or !3 is the priority (1 highest); {fri} is a deadline; 'after mon' a start date; 'every monday' or 'every 2 weeks' a repeat ('every!' repeats after each completion);",
        "'// …' at the end is a note. Example: “Draft proposal fri 3pm ~45m #Acme @client !2 {mon}”. No day and no project puts it in the Inbox.",
      ].join(" "),
      inputSchema: z.object({
        text: z.string().min(1).max(500).describe("One line in quick-add syntax: the person's own words."),
        notes: z.string().max(10000).optional().describe("A note for the task (Markdown)."),
      }),
      annotations: WRITE,
    },
    ({ text, notes }) =>
      write(async () => {
        const added = await planner.addTask(text, notes);
        return formatAdded(added, await planner.today());
      }),
  );

  server.registerTool(
    "complete_task",
    { title: "Complete a task", description: "Marks a task done. A repeating task moves on to its next day.", inputSchema: z.object({ task: taskRef }), annotations: WRITE },
    ({ task }) => write(async () => (await planner.complete(task)).said),
  );

  server.registerTool(
    "reopen_task",
    { title: "Reopen a task", description: "Un-completes a finished task, or brings back a dropped one.", inputSchema: z.object({ task: taskRef }), annotations: WRITE },
    ({ task }) => write(async () => (await planner.reopen(task)).said),
  );

  server.registerTool(
    "reschedule_task",
    {
      title: "Move a task to another day",
      description:
        "Gives a task a new do-date, read like the app's Do field: “tomorrow”, “fri”, “fri 3pm”, “tonight”, “next week”, “in 3 days” or 2026-11-02. “someday” parks it in Someday; “none” takes the day off. A repeating task moves just this once; its repeat stays. Time blocks on the old day are let go.",
      inputSchema: z.object({ task: taskRef, when: z.string().min(1).max(100) }),
      annotations: WRITE,
    },
    ({ task, when }) =>
      write(async () => {
        const r = await planner.reschedule(task, when);
        if (r.blocksReleased) effects.calendarChanged();
        return r.said;
      }),
  );

  server.registerTool(
    "update_task",
    {
      title: "Edit a task",
      description: "Changes a task's title, note, deadline, estimate, priority, project or tags. Only the fields given change; use reschedule_task for its day.",
      inputSchema: z.object({
        task: taskRef,
        title: z.string().min(1).max(500).optional(),
        notes: z.string().max(10000).nullable().optional().describe("Replaces the note; null or empty clears it."),
        deadline: z.string().max(100).nullable().optional().describe("A day in words or ISO; “none” or null clears it."),
        estimate: z.union([z.number().int().min(1).max(1440), z.string().max(20)]).nullable().optional().describe("Minutes, or “45m”, “1h30”; null clears it."),
        priority: z.number().int().min(0).max(3).optional().describe("1 (highest) to 3, or 0 for none."),
        project: z.string().max(200).nullable().optional().describe("A project's name or id; “none” or null takes it out of its project."),
        add_tags: tagNames.optional(),
        remove_tags: tagNames.optional(),
      }),
      annotations: WRITE,
    },
    ({ task, add_tags, remove_tags, ...rest }) => write(async () => (await planner.update(task, { ...rest, addTags: add_tags, removeTags: remove_tags })).said),
  );

  server.registerTool(
    "drop_task",
    {
      title: "Drop a task",
      description: "Drops a task the person no longer wants: it leaves every list and stays in the Logbook under Dropped, and reopen_task brings it back. Ask before dropping.",
      inputSchema: z.object({ task: taskRef }),
      annotations: { ...WRITE, destructiveHint: true },
    },
    ({ task }) =>
      write(async () => {
        const r = await planner.drop(task);
        if (r.blocksReleased) effects.calendarChanged();
        return r.said;
      }),
  );

  // ---------------------------------------------------------------- list writes

  server.registerTool(
    "create_list",
    {
      title: "Create a list",
      description: "Makes a list for things that aren't tasks, at the top or inside another list.",
      inputSchema: z.object({
        name: z.string().min(1).max(200),
        parent: listRef.optional().describe("The list to put it inside; left out, it goes at the top."),
        emoji: z.string().max(16).optional(),
      }),
      annotations: WRITE,
    },
    ({ name, parent, emoji }) =>
      write(async () => {
        const made = await planner.createList(name, parent, emoji);
        return `Made the list ${made.path} [id ${made.id}]`;
      }),
  );

  server.registerTool(
    "add_list_items",
    {
      title: "Add to a list",
      description: "Adds items at the end of a list. Each item is a title, or an object with a title and optionally a note, a link, a status (todo, doing, done; new items are todo), a 1–5 rating and tags. A string with several lines is one item a line.",
      inputSchema: z.object({
        list: listRef,
        items: z
          .array(
            z.union([
              z.string().min(1).max(5000),
              z.object({
                title: z.string().min(1).max(500),
                note: z.string().max(10000).optional(),
                url: z.string().max(2048).optional(),
                status: status.optional(),
                rating: z.number().int().min(1).max(5).optional(),
                tags: tagNames.optional(),
              }),
            ]),
          )
          .min(1)
          .max(100),
      }),
      annotations: WRITE,
    },
    ({ list, items }) =>
      write(async () => {
        const r = await planner.addItems(list, items);
        for (const a of r.added) if (a.url) effects.linkSaved(a.id, a.url);
        return [`Added ${r.added.length} ${r.added.length === 1 ? "item" : "items"} to ${r.list}:`, ...r.added.map((a) => `- ${a.title} [id ${a.id}]`)].join("\n");
      }),
  );

  server.registerTool(
    "update_list_item",
    {
      title: "Edit a list item",
      description: "Changes an item's status, rating, title, note, link or tags, or moves it to another list. Only the fields given change.",
      inputSchema: z.object({
        item: z.string().min(1).max(500).describe("The item's id, or its title when only one item has it."),
        in_list: listRef.optional().describe("Where to look for the item by title."),
        title: z.string().min(1).max(500).optional(),
        note: z.string().max(10000).nullable().optional(),
        url: z.string().max(2048).nullable().optional(),
        status: status.optional(),
        rating: z.number().int().min(1).max(5).nullable().optional().describe("1–5 stars; null takes the rating off."),
        add_tags: tagNames.optional(),
        remove_tags: tagNames.optional(),
        move_to: listRef.optional().describe("Another list to move it to."),
      }),
      annotations: WRITE,
    },
    ({ item, in_list, add_tags, remove_tags, move_to, ...rest }) =>
      write(async () => {
        const r = await planner.updateItem(item, { ...rest, addTags: add_tags, removeTags: remove_tags, list: move_to }, in_list);
        if (r.url) effects.linkSaved(r.id, r.url);
        return r.said;
      }),
  );
}

/** A fresh server for one request, its tools bound to the caller's planner and access. */
export function buildServer(planner: Planner, access: Access, effects: Effects): McpServer {
  const server = new McpServer({ name: "sparehour", title: "Sparehour", version: "1.0.0" }, { instructions: SERVER_INSTRUCTIONS });
  registerTools(server, planner, access, effects);
  return server;
}
