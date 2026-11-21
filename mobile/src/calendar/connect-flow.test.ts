import type { BrowserReturn } from "~/auth/browser-session";
import { fetchAvailable, outcomeOf, runConnect, type ConnectDeps } from "./connect-flow";

const json = (body: unknown, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body }) as unknown as Response;
const GOOGLE = "https://accounts.google.com/o/oauth2/v2/auth?client_id=cid&state=s.sig";
const OUTLOOK = "https://login.microsoftonline.com/common/oauth2/v2.0/authorize?client_id=mid&state=s.sig";

/** The server and the browser, each answering what the test says. */
function world(over: { start?: Response; finish?: Response; back?: BrowserReturn } = {}) {
  const calls: { path: string; init?: RequestInit }[] = [];
  const api: ConnectDeps["api"] = jest.fn(async (path, init) => {
    calls.push({ path, init });
    if (path.endsWith("/app-start")) return over.start ?? json({ url: path.includes("microsoft") ? OUTLOOK : GOOGLE });
    return over.finish ?? json({ outcome: "connected" });
  });
  const session: ConnectDeps["session"] = jest.fn(async (): Promise<BrowserReturn> => over.back ?? { type: "returned", params: { ticket: "TICKET" } });
  return { deps: { api, session }, calls, api, session };
}

describe("runConnect", () => {
  it("asks the server for the consent, opens it in the browser for the app's own link, and finishes with the ticket that came back", async () => {
    const w = world();
    expect(await runConnect("google", "write", w.deps)).toBe("connected");
    expect(w.calls.map((c) => c.path)).toEqual(["/api/calendar/google/app-start", "/api/calendar/google/app-finish"]);
    expect(w.calls[0].init).toMatchObject({ method: "POST", headers: { "content-type": "application/json" } });
    expect(JSON.parse(w.calls[0].init!.body as string)).toEqual({ purpose: "write" });
    expect(w.session).toHaveBeenCalledWith(GOOGLE, "sparehour://calendar-connected");
    // The ticket goes back as it came, and nothing else of what the link carried.
    expect(JSON.parse(w.calls[1].init!.body as string)).toEqual({ ticket: "TICKET" });
  });

  it("goes to Outlook's routes for Outlook", async () => {
    const w = world();
    expect(await runConnect("microsoft", "read", w.deps)).toBe("connected");
    expect(w.calls.map((c) => c.path)).toEqual(["/api/calendar/microsoft/app-start", "/api/calendar/microsoft/app-finish"]);
    expect(w.session).toHaveBeenCalledWith(OUTLOOK, "sparehour://calendar-connected");
  });

  it("is unavailable where the server cannot connect that calendar, and opens nothing", async () => {
    for (const status of [503, 404]) {
      const w = world({ start: json({ error: "unavailable" }, status) });
      expect(await runConnect("google", "read", w.deps)).toBe("unavailable");
      expect(w.session).not.toHaveBeenCalled();
      expect(w.calls).toHaveLength(1);
    }
  });

  it("fails without opening the browser when the start is refused or answers no address", async () => {
    for (const start of [json({ error: "unauthenticated" }, 401), json({ error: "server" }, 500), json({}), json({ url: 7 }), json(null), json("https://accounts.google.com/")]) {
      const w = world({ start });
      expect(await runConnect("google", "read", w.deps)).toBe("failed");
      expect(w.session).not.toHaveBeenCalled();
    }
  });

  it("opens only the provider's own sign-in host, whatever the server answered", async () => {
    const elsewhere = ["https://evil.example/o/oauth2/v2/auth", "http://accounts.google.com/o/oauth2/v2/auth", "https://accounts.google.com.evil.example/", "https://accounts.google.com@evil.example/", "sparehour://calendar-connected?ticket=t", "javascript:alert(1)", OUTLOOK];
    for (const url of elsewhere) {
      const w = world({ start: json({ url }) });
      expect(await runConnect("google", "read", w.deps)).toBe("failed");
      expect(w.session).not.toHaveBeenCalled();
    }
    const w = world({ start: json({ url: GOOGLE }) });
    expect(await runConnect("microsoft", "read", w.deps)).toBe("failed");
    expect(w.session).not.toHaveBeenCalled();
  });

  it("is cancelled when the person closes the browser or says no, and never calls finish", async () => {
    for (const back of [{ type: "closed" }, { type: "returned", params: { error: "denied" } }] as BrowserReturn[]) {
      const w = world({ back });
      expect(await runConnect("google", "read", w.deps)).toBe("cancelled");
      expect(w.calls).toHaveLength(1);
    }
  });

  it("fails when the browser comes back with an error or without a ticket, and never calls finish", async () => {
    const carried: Record<string, string>[] = [{ error: "failed" }, {}, { ticket: "" }, { code: "a-code-is-not-a-ticket" }];
    for (const params of carried) {
      const w = world({ back: { type: "returned", params } });
      expect(await runConnect("google", "read", w.deps)).toBe("failed");
      expect(w.calls).toHaveLength(1);
    }
    // An error beside a ticket: the error is believed.
    const both = world({ back: { type: "returned", params: { error: "denied", ticket: "T" } } });
    expect(await runConnect("google", "read", both.deps)).toBe("cancelled");
    expect(both.calls).toHaveLength(1);
  });

  it("fails when the server refuses the ticket, and sends it once only", async () => {
    for (const finish of [json({ error: "forbidden" }, 403), json({ error: "invalid_ticket" }, 400), json({ error: "unauthenticated" }, 401), json({ error: "provider", reason: "Google didn't answer. Try again." }, 502), json({}), json({ outcome: "something-new" })]) {
      const w = world({ finish });
      expect(await runConnect("google", "read", w.deps)).toBe("failed");
      expect(w.calls.filter((c) => c.path.endsWith("/app-finish"))).toHaveLength(1);
    }
  });

  it("fails, and does not throw, when the network or the browser does", async () => {
    const offline = world();
    (offline.api as jest.Mock).mockRejectedValueOnce(new Error("Network request failed"));
    expect(await runConnect("google", "read", offline.deps)).toBe("failed");
    const stuck = world();
    (stuck.session as jest.Mock).mockRejectedValueOnce(new Error("WebBrowser is already open, only one can be open at a time"));
    expect(await runConnect("google", "read", stuck.deps)).toBe("failed");
    expect(stuck.calls).toHaveLength(1);
    const dropped = world();
    (dropped.api as jest.Mock).mockImplementationOnce(async () => json({ url: GOOGLE })).mockRejectedValueOnce(new Error("Network request failed"));
    expect(await runConnect("google", "read", dropped.deps)).toBe("failed");
  });
});

describe("outcomeOf", () => {
  it("is connected only when what was asked for was granted", () => {
    expect(outcomeOf("connected")).toBe("connected");
    expect(outcomeOf("full")).toBe("connected");
    // The person narrowed the consent on the provider's screen: their no.
    expect(outcomeOf("read_only")).toBe("cancelled");
    expect(outcomeOf("full_denied")).toBe("cancelled");
    expect(outcomeOf("no_read")).toBe("cancelled");
    expect(outcomeOf("unavailable")).toBe("failed");
    expect(outcomeOf(null)).toBe("failed");
  });
});

describe("fetchAvailable", () => {
  it("reads which calendars the server can connect, and takes anything else as none", async () => {
    const api = jest.fn(async () => json({ google: true, microsoft: false }));
    expect(await fetchAvailable(api)).toEqual({ google: true, microsoft: false });
    expect(api).toHaveBeenCalledWith("/api/calendar/config");
    expect(await fetchAvailable(async () => json({ google: "yes", microsoft: 1 }))).toEqual({ google: false, microsoft: false });
    expect(await fetchAvailable(async () => json({ error: "unauthenticated" }, 401))).toEqual({ google: false, microsoft: false });
    expect(await fetchAvailable(async () => json(null))).toEqual({ google: false, microsoft: false });
    expect(
      await fetchAvailable(async () => {
        throw new Error("Network request failed");
      }),
    ).toEqual({ google: false, microsoft: false });
  });
});
