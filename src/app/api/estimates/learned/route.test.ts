// The learned-estimates route: only for someone signed in, each table asked for its newest rows with a length,
// one space when one is named, and an older database (no finished_tasks yet) still answers from the rest.
import { beforeEach, describe, expect, it, vi } from "vitest";

type Answer = { data: unknown[] | null; error: { code: string; message: string } | null };

const { state } = vi.hoisted(() => ({
  state: {
    user: { id: "u1" } as { id: string } | null,
    answers: {} as Record<string, Answer>,
    calls: [] as { table: string; steps: unknown[][] }[],
  },
}));

vi.mock("@/server/auth/supabase", () => ({
  createUserScopedClient: async () => ({
    auth: { getUser: async () => ({ data: { user: state.user } }) },
    from: (table: string) => {
      const call = { table, steps: [] as unknown[][] };
      state.calls.push(call);
      const step =
        (name: string) =>
        (...args: unknown[]) => {
          call.steps.push([name, ...args]);
          return query;
        };
      const query = {
        select: step("select"),
        eq: step("eq"),
        is: step("is"),
        not: step("not"),
        order: step("order"),
        limit: step("limit"),
        then: (resolve: (a: Answer) => unknown) => Promise.resolve(state.answers[table] ?? { data: [], error: null }).then(resolve),
      };
      return query;
    },
  }),
}));

import { GET } from "./route";

const SPACE = "ff5e630b-3fe7-4331-bf3f-5262fa898bce";
const get = (query = "") => GET(new Request(`https://sparehour.test/api/estimates/learned${query}`));
const took = (estimate_min: number | null, actual_min: number, completed_at: string, project_id: string | null = null) => ({ estimate_min, actual_min, project_id, completed_at });

beforeEach(() => {
  state.user = { id: "u1" };
  state.answers = {};
  state.calls = [];
});

describe("GET /api/estimates/learned", () => {
  it("is for someone signed in", async () => {
    state.user = null;
    expect((await get()).status).toBe(401);
    expect(state.calls).toEqual([]);
  });

  it("refuses a space that is not an id before asking the database", async () => {
    expect((await get("?space=mine")).status).toBe(400);
    expect(state.calls).toEqual([]);
  });

  it("learns from the week's tasks, repeats' finished days and what was finished before", async () => {
    state.answers = {
      tasks: { data: [took(30, 60, "2026-11-14T10:00:00Z"), took(30, 60, "2026-11-13T10:00:00Z")], error: null },
      task_completions: { data: [{ actual_min: 120, completed_at: "2026-11-12T10:00:00Z", task: { estimate_min: 60, project_id: "p1" } }], error: null },
      finished_tasks: { data: [took(30, 60, "2026-10-01T10:00:00Z"), took(null, 40, "2026-09-01T10:00:00Z")], error: null },
    };
    const res = await get(`?space=${SPACE}`);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(await res.json()).toEqual({
      learned: { estimated: { 30: { n: 3, ratio: 2 }, 60: { n: 1, ratio: 2 } }, unestimated: { n: 1, minutes: 40 }, projects: { p1: { estimated: { 60: { n: 1, ratio: 2 } }, unestimated: null } } },
    });
    expect(state.calls.map((c) => c.table)).toEqual(["tasks", "task_completions", "finished_tasks"]);
    for (const call of state.calls) {
      expect(call.steps).toContainEqual(["not", "actual_min", "is", null]);
      expect(call.steps).toContainEqual(["eq", "space_id", SPACE]);
      expect(call.steps).toContainEqual(["order", "completed_at", { ascending: false }]);
      expect(call.steps).toContainEqual(["limit", 200]);
    }
    // Only finished tasks count from the synced table, and nothing deleted.
    expect(state.calls[0].steps).toContainEqual(["eq", "state", "done"]);
    expect(state.calls[0].steps).toContainEqual(["is", "deleted_at", null]);
  });

  it("asks across the person's spaces when none is named", async () => {
    await get();
    for (const call of state.calls) expect(call.steps.some((s) => s[0] === "eq" && s[1] === "space_id")).toBe(false);
  });

  it("answers from the rest where finished_tasks is not there yet, and fails plainly on anything else", async () => {
    state.answers = {
      tasks: { data: Array.from({ length: 5 }, () => took(30, 45, "2026-11-14T10:00:00Z")), error: null },
      finished_tasks: { data: null, error: { code: "PGRST205", message: "Could not find the table" } },
    };
    expect(await (await get()).json()).toEqual({ learned: { estimated: { 30: { n: 5, ratio: 1.5 } }, unestimated: null, projects: {} } });

    state.answers.tasks = { data: null, error: { code: "XX000", message: "boom" } };
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await get()).status).toBe(500);
    log.mockRestore();
  });
});
