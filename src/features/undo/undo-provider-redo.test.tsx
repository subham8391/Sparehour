// @vitest-environment jsdom
// The generic redo's capture is an island (redo-capture.ts, fetched in idle time): a repository's write recorded
// before it is in still goes on the stack at once, undoes, and is made redoable the moment the capture arrives; once
// it is in, a write is made redoable as it is recorded.
import { act, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { localSqlite } from "@/test/local-sqlite";

const local = vi.hoisted(() => ({ db: null as unknown }));
vi.mock("@/data/powersync", () => ({ useLocalDatabase: () => local.db }));

type Provider = typeof import("./undo-provider");

/** A fresh copy of the provider's module, so the capture starts out not loaded. */
async function freshProvider(): Promise<Provider> {
  vi.resetModules();
  return import("./undo-provider");
}

function setup({ UndoProvider, useUndo }: Provider) {
  const s = localSqlite();
  s.insert("tasks", { id: "t1", space_id: "s1", title: "Draft", state: "active", sort_key: "a0" });
  local.db = s.db;
  const api: { current: ReturnType<typeof useUndo> | null } = { current: null };
  function Peek() {
    api.current = useUndo();
    return <p>can redo: {String(api.current.canRedo)}</p>;
  }
  render(
    <UndoProvider>
      <Peek />
    </UndoProvider>,
  );
  /** A rename as a repository makes it: the write, then its record with the rows it changed. */
  const rename = async (to: string) => {
    const from = s.row("tasks", "t1")?.title as string;
    await s.db.execute("update tasks set title = ? where id = ?", [to, "t1"]);
    act(() => api.current!.record({ label: `Renamed to ${to}`, toast: false, rows: { tasks: ["t1"] }, undo: () => s.db.execute("update tasks set title = ? where id = ?", [from, "t1"]).then(() => undefined) }));
  };
  const title = () => s.row("tasks", "t1")?.title;
  return { api, rename, title };
}

beforeEach(() => {
  local.db = null;
});

describe("<UndoProvider> with the redo capture as an island", () => {
  it("a write recorded before the capture is in undoes and redoes like any other", async () => {
    const provider = await freshProvider();
    const { api, rename, title } = setup(provider);
    await rename("Draft the proposal");
    expect(api.current!.canUndo).toBe(true);
    await act(async () => void (await api.current!.undo()));
    expect(title()).toBe("Draft");
    await waitFor(() => expect(screen.getByText("can redo: true")).toBeInTheDocument());
    await act(async () => void (await api.current!.redo()));
    expect(title()).toBe("Draft the proposal");
  });

  it("once the capture is in, a write is made redoable as it is recorded", async () => {
    const provider = await freshProvider();
    const { api, rename, title } = setup(provider);
    // An earlier write (or the idle prefetch) has brought the capture in before this one.
    await act(async () => {
      await rename("warm-up");
      await api.current!.undo();
    });
    await rename("Draft the proposal");
    await act(async () => void (await api.current!.undo()));
    expect(title()).toBe("Draft");
    await waitFor(() => expect(screen.getByText("can redo: true")).toBeInTheDocument());
    await act(async () => void (await api.current!.redo()));
    expect(title()).toBe("Draft the proposal");
  });
});
