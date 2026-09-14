// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useRef } from "react";
import { describe, expect, it, vi } from "vitest";
import { BlockingProvider, useBlocking } from "./blocking-provider";

function Probe({ handler }: { handler: (id: string) => void }) {
  const b = useBlocking();
  const releaseRef = useRef<(() => void) | null>(null);
  return (
    <>
      <span data-testid="state">{b.available ? "available" : "unavailable"}</span>
      <button
        type="button"
        onClick={() => {
          releaseRef.current = b.register(handler);
        }}
      >
        register
      </button>
      <button type="button" onClick={() => releaseRef.current?.()}>
        release
      </button>
      <button type="button" onClick={() => b.blockTask("t1")}>
        block
      </button>
    </>
  );
}

describe("<BlockingProvider>", () => {
  it("is unavailable until a screen registers, routes B to that screen, and lets go when it leaves", async () => {
    const user = userEvent.setup();
    const handler = vi.fn();
    render(
      <BlockingProvider>
        <Probe handler={handler} />
      </BlockingProvider>,
    );
    expect(screen.getByTestId("state")).toHaveTextContent("unavailable");
    await user.click(screen.getByRole("button", { name: "block" }));
    expect(handler).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "register" }));
    expect(screen.getByTestId("state")).toHaveTextContent("available");
    await user.click(screen.getByRole("button", { name: "block" }));
    expect(handler).toHaveBeenCalledWith("t1");

    await user.click(screen.getByRole("button", { name: "release" }));
    expect(screen.getByTestId("state")).toHaveTextContent("unavailable");
    await user.click(screen.getByRole("button", { name: "block" }));
    expect(handler).toHaveBeenCalledTimes(1);
  });
});
