import { RETURN_GRACE_MS, browserSession, type BrowserSessionDeps } from "./browser-session";

jest.mock("expo-web-browser", () => ({ openAuthSessionAsync: jest.fn() }));

const LINK = "sparehour://calendar-connected";

/** A browser that answers `result`, and a link listener the test can fire. */
function fake(result: { type: string; url?: string }, during?: (fire: (url: string) => void) => void) {
  let onUrl: ((url: string) => void) | null = null;
  const remove = jest.fn(() => (onUrl = null));
  const waits: number[] = [];
  const deps: BrowserSessionDeps = {
    open: jest.fn(async () => {
      during?.((url) => onUrl?.(url));
      return result;
    }),
    listen: (cb) => {
      onUrl = cb;
      return { remove };
    },
    wait: jest.fn(async (ms: number) => {
      waits.push(ms);
    }),
  };
  return { deps, remove, waits, fire: (url: string) => onUrl?.(url) };
}

describe("browserSession", () => {
  it("opens the address with the link to come back to, and hands over what the link carried", async () => {
    const { deps, remove, waits } = fake({ type: "success", url: `${LINK}?ticket=abc` });
    expect(await browserSession("https://accounts.google.com/o/oauth2/v2/auth?x=1", LINK, deps)).toEqual({ type: "returned", params: { ticket: "abc" } });
    expect(deps.open).toHaveBeenCalledWith("https://accounts.google.com/o/oauth2/v2/auth?x=1", LINK);
    expect(waits).toEqual([]);
    expect(remove).toHaveBeenCalledTimes(1);
  });

  it("is closed when the person closes the browser, after a short wait for a link that may still be on its way", async () => {
    for (const type of ["cancel", "dismiss", "locked"]) {
      const { deps, remove, waits } = fake({ type });
      expect(await browserSession("https://example.com/", LINK, deps)).toEqual({ type: "closed" });
      expect(waits).toEqual([RETURN_GRACE_MS]);
      expect(remove).toHaveBeenCalledTimes(1);
    }
  });

  it("takes the link when the app came to the front a moment before it (Android)", async () => {
    // The link arrived while the browser was still reported open…
    const early = fake({ type: "dismiss" }, (fire) => fire(`${LINK}?ticket=early`));
    expect(await browserSession("https://example.com/", LINK, early.deps)).toEqual({ type: "returned", params: { ticket: "early" } });
    expect(early.waits).toEqual([]);
    // …or just after the session said it was dismissed.
    const late = fake({ type: "dismiss" });
    (late.deps.wait as jest.Mock).mockImplementation(() => new Promise<void>(() => undefined)); // the wait never ends: only the link can
    const pending = browserSession("https://example.com/", LINK, late.deps);
    await Promise.resolve();
    await Promise.resolve();
    late.fire(`${LINK}?error=denied`);
    expect(await pending).toEqual({ type: "returned", params: { error: "denied" } });
    expect(late.remove).toHaveBeenCalledTimes(1);
  });

  it("does not take an address that only begins like the link, from the session or from anywhere else", async () => {
    // expo-web-browser matches by prefix: a longer host would pass it.
    const lookalike = fake({ type: "success", url: "sparehour://calendar-connected.evil?ticket=t" });
    expect(await browserSession("https://example.com/", LINK, lookalike.deps)).toEqual({ type: "closed" });
    const other = fake({ type: "dismiss" }, (fire) => {
      fire("sparehour://auth/callback?code=c");
      fire("sparehour://task/1");
      fire("evil://calendar-connected?ticket=t");
    });
    expect(await browserSession("https://example.com/", LINK, other.deps)).toEqual({ type: "closed" });
  });

  it("stops listening even when the browser cannot be opened", async () => {
    const { deps, remove } = fake({ type: "cancel" });
    (deps.open as jest.Mock).mockRejectedValueOnce(new Error("WebBrowser is already open, only one can be open at a time"));
    await expect(browserSession("https://example.com/", LINK, deps)).rejects.toThrow("already open");
    expect(remove).toHaveBeenCalledTimes(1);
  });
});
