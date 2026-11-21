// The hook screens call: what it says while it finds out which calendars can be connected, and that one connect
// runs at a time. The steps of a connect are connect-flow.test.ts.
import { act, renderHook, waitFor } from "@testing-library/react-native";
import { apiFetch } from "~/api";
import { browserSession } from "~/auth/browser-session";
import { useCalendarConnect } from "./connect";

jest.mock("~/api", () => ({ apiFetch: jest.fn() }));
jest.mock("~/auth/browser-session", () => ({ browserSession: jest.fn() }));

const json = (body: unknown, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body }) as unknown as Response;
const api = apiFetch as jest.MockedFunction<typeof apiFetch>;
const session = browserSession as jest.MockedFunction<typeof browserSession>;

describe("useCalendarConnect", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    api.mockImplementation(async (path) => {
      if (path === "/api/calendar/config") return json({ google: true, microsoft: false });
      if (path.endsWith("/app-start")) return json({ url: "https://accounts.google.com/o/oauth2/v2/auth?state=s" });
      return json({ outcome: "connected" });
    });
    session.mockResolvedValue({ type: "returned", params: { ticket: "T" } });
  });

  it("does not know which calendars can be connected until the server has said", async () => {
    const { result } = await renderHook(() => useCalendarConnect());
    await waitFor(() => expect(result.current.available).toEqual({ google: true, microsoft: false }));
    expect(result.current.busy).toBe(false);
  });

  it("connects through the server and the browser, busy while it does, and reads as the default connect without a purpose", async () => {
    let finishBrowser: (back: { type: "returned"; params: Record<string, string> }) => void = () => undefined;
    session.mockImplementation(() => new Promise((resolve) => (finishBrowser = resolve)));
    const { result } = await renderHook(() => useCalendarConnect());
    let outcome: Promise<string> = Promise.resolve("");
    await act(async () => {
      outcome = result.current.connect("google");
    });
    await waitFor(() => expect(session).toHaveBeenCalledTimes(1));
    expect(result.current.busy).toBe(true);
    // A second tap while the browser is open starts nothing.
    expect(await result.current.connect("google", "full")).toBe("cancelled");
    expect(session).toHaveBeenCalledTimes(1);
    await act(async () => {
      finishBrowser({ type: "returned", params: { ticket: "T" } });
      await outcome;
    });
    expect(await outcome).toBe("connected");
    expect(result.current.busy).toBe(false);
    const start = api.mock.calls.find(([path]) => path.endsWith("/app-start"))!;
    expect(JSON.parse(start[1]!.body as string)).toEqual({ purpose: "read" });
    // And it can be used again afterwards.
    session.mockResolvedValue({ type: "returned", params: { ticket: "T2" } });
    await act(async () => {
      expect(await result.current.connect("google", "write")).toBe("connected");
    });
  });
});
