// Where a quick-add line goes (PRODUCT_SPEC.md §5.2 "#name", §5.3 rule 7): the project a typed `#name` files the task
// in, and the line read again with the token kept as title words when it files nothing. Pure, so the sheet and the
// MCP server's add_task (src/server/mcp) file a line the same way.
import { parse, type ParseContext, type ParseResult, type Range, type TaskDraft } from "@/core/quickadd";
import { bestProjectMatch, projectMatches, projectsNamed, type QuickAddProject } from "./interpret";

export interface QuickAddSubmission {
  draft: TaskDraft;
  projectId: string | null;
  /** Set when the user asked for a project that does not exist yet. */
  createProjectName: string | null;
}

export type Parsed = Extract<ParseResult, { ok: true }>;

/** One line made ready to save: the submission, and the words the notice uses to say where it went. */
export interface Filed {
  submission: QuickAddSubmission;
  title: string;
  /** The project it is filed in (found, guessed from a partial name, or to be created). */
  project: string | null;
  /** A `#name` that filed nothing, kept in the title; and whether it was because several projects fit. */
  unfiled: { name: string; several: boolean } | null;
}

/** What a typed `#name` files into, worked out the same way for the strip and the save. */
export interface ProjectChoice {
  /** The project the task is filed in: named exactly, picked from the suggestions, or the one a partial name fits. */
  project: QuickAddProject | null;
  /** A new project of this name is made on save. */
  create: boolean;
  /** Two or more projects carry exactly this name (in different areas): none is guessed and none is created (§5.4). */
  collision: QuickAddProject[];
}

/**
 * Where a parsed line goes (PRODUCT_SPEC.md §5.2 "#name"): the project picked from the suggestions while its name
 * still reads the same; else the one project named exactly; else the one a partial name fits ("#Q4" → Q4
 * planning); else a new one when asked for. A name two projects share files nowhere until one is picked.
 */
export function chooseProject(draft: TaskDraft, projects: readonly QuickAddProject[], picked: QuickAddProject | null, createAsked: boolean): ProjectChoice {
  const name = draft.projectName;
  if (!name) return { project: null, create: false, collision: [] };
  if (picked && projectsNamed(name, [picked]).length === 1) return { project: picked, create: false, collision: [] };
  const named = projectsNamed(name, projects);
  if (named.length === 1) return { project: named[0], create: false, collision: [] };
  if (named.length > 1) return { project: null, create: false, collision: named };
  const create = createAsked || draft.projectCreate;
  return { project: create ? null : bestProjectMatch(name, projects), create, collision: [] };
}

/**
 * A line made ready to save. A `#name` that files nothing keeps its words in the title rather than vanish (§5.3
 * rule 7): the line is read again with that token as literal text.
 */
export function fileLine(text: string, parsed: Parsed, projects: readonly QuickAddProject[], ctx: ParseContext, choice: ProjectChoice, literal: readonly Range[] = []): Filed {
  const { draft } = parsed;
  const name = draft.projectName;
  const { project, create } = choice;
  if (name && !project && !create) {
    const again = parse(text, ctx, { literal: [...literal, ...parsed.spans.filter((s) => s.kind === "project")] });
    const kept = again.ok ? again.draft : { ...draft, projectName: null, projectCreate: false };
    const several = choice.collision.length > 1 || projectMatches(name, projects).length > 1;
    return { submission: { draft: kept, projectId: null, createProjectName: null }, title: kept.title, project: null, unfiled: { name, several } };
  }
  return {
    submission: { draft: { ...draft, projectCreate: create }, projectId: project?.id ?? null, createProjectName: create ? name : null },
    title: draft.title,
    project: project?.name ?? (create ? name : null),
    unfiled: null,
  };
}

/** "Added “Email the accountant” to Q4 planning", or why a #name stayed in the title. */
export function addedNotice(f: Filed): string {
  const added = `Added “${f.title}”${f.project ? ` to ${f.project}` : ""}`;
  if (!f.unfiled) return added;
  return `${added} — ${f.unfiled.several ? `#${f.unfiled.name} fits more than one project` : `no project is called “${f.unfiled.name}”`}, so it stays in the title`;
}

