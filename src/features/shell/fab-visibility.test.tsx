// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState, type ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { FabRoomContext, useHideQuickAddFab } from "./fab-visibility";

/** The shell's wiring, as Frame does it: the view asks through the context, the FAB reads the state. */
function Shell({ children, detailOpen = false }: { children: ReactNode; detailOpen?: boolean }) {
  const [viewHidesFab, setViewHidesFab] = useState(false);
  return (
    <>
      <FabRoomContext.Provider value={setViewHidesFab}>{children}</FabRoomContext.Provider>
      <button type="button" aria-label="Add a task" data-testid="fab" hidden={detailOpen || viewHidesFab} />
    </>
  );
}

/** Today's List | Day choice, reduced to what the shell sees. */
function TodayView() {
  const [view, setView] = useState<"list" | "day">("list");
  useHideQuickAddFab(view === "day");
  return (
    <button type="button" onClick={() => setView(view === "list" ? "day" : "list")}>
      {view === "list" ? "Day" : "List"}
    </button>
  );
}

const fab = () => screen.getByTestId("fab");

describe("useHideQuickAddFab", () => {
  it("hides the FAB while Today shows the Day view, and brings it back with the List", async () => {
    const user = userEvent.setup();
    render(
      <Shell>
        <TodayView />
      </Shell>,
    );
    expect(fab()).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Day" }));
    expect(fab()).not.toBeVisible();
    await user.click(screen.getByRole("button", { name: "List" }));
    expect(fab()).toBeVisible();
  });

  it("gives the FAB back when the view goes away, as on leaving Today for another list", async () => {
    const user = userEvent.setup();
    function Routes() {
      const [onToday, setOnToday] = useState(true);
      return (
        <>
          {onToday && <TodayView />}
          <button type="button" onClick={() => setOnToday(false)}>
            Inbox
          </button>
        </>
      );
    }
    render(
      <Shell>
        <Routes />
      </Shell>,
    );
    await user.click(screen.getByRole("button", { name: "Day" }));
    expect(fab()).not.toBeVisible();
    await user.click(screen.getByRole("button", { name: "Inbox" }));
    expect(fab()).toBeVisible();
  });

  it("does nothing outside the shell", () => {
    render(<TodayView />);
    expect(screen.getByRole("button", { name: "Day" })).toBeInTheDocument();
  });
});
