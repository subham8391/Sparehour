import { AUTH_RETURN_LINK, CALENDAR_APP_LINK, readReturnLink, redirectSystemPath } from "./return-link";

describe("readReturnLink", () => {
  it("reads what the app's own link carries", () => {
    expect(readReturnLink("sparehour://calendar-connected?ticket=abc-_123", CALENDAR_APP_LINK)).toEqual({ ticket: "abc-_123" });
    expect(readReturnLink("sparehour://calendar-connected?error=denied", CALENDAR_APP_LINK)).toEqual({ error: "denied" });
    expect(readReturnLink("sparehour://auth/callback?code=5f3a-11", AUTH_RETURN_LINK)).toEqual({ code: "5f3a-11" });
    expect(readReturnLink("sparehour://calendar-connected", CALENDAR_APP_LINK)).toEqual({});
  });

  it("decodes values, and reads the part after # only for what the query does not say", () => {
    expect(readReturnLink("sparehour://auth/callback?error=access_denied&error_description=The+user%20said+no", AUTH_RETURN_LINK)).toEqual({ error: "access_denied", error_description: "The user said no" });
    expect(readReturnLink("sparehour://auth/callback?error=server_error#error=other&error_code=x1", AUTH_RETURN_LINK)).toEqual({ error: "server_error", error_code: "x1" });
    expect(readReturnLink("sparehour://auth/callback#error=access_denied", AUTH_RETURN_LINK)).toEqual({ error: "access_denied" });
    // A badly encoded pair is left out, not thrown on.
    expect(readReturnLink("sparehour://auth/callback?code=ok&bad=%E0%A4%A", AUTH_RETURN_LINK)).toEqual({ code: "ok" });
    expect(readReturnLink("sparehour://auth/callback?code=first&code=second", AUTH_RETURN_LINK)).toEqual({ code: "first" });
  });

  it("is not fooled by an address that only looks like the link", () => {
    for (const other of [
      "sparehour://calendar-connected.evil?ticket=t",
      "sparehour://calendar-connected/more?ticket=t",
      "sparehour://calendar-connectedx?ticket=t",
      "sparehour://calendar?ticket=t",
      "Sparehour://calendar-connected?ticket=t",
      "evil://calendar-connected?ticket=t",
      "https://sparehour.app/calendar-connected?ticket=t",
      "evil://x?next=sparehour://calendar-connected?ticket=t",
      "sparehour://auth/callback?ticket=t",
      "",
    ]) {
      expect(readReturnLink(other, CALENDAR_APP_LINK)).toBeNull();
    }
    expect(readReturnLink("sparehour://auth/callbacks?code=c", AUTH_RETURN_LINK)).toBeNull();
    expect(readReturnLink("sparehour://calendar-connected?code=c", AUTH_RETURN_LINK)).toBeNull();
  });

  it("gives back a plain bag: a parameter cannot stand in for something every object has", () => {
    const params = readReturnLink("sparehour://calendar-connected?__proto__=x&toString=y", CALENDAR_APP_LINK)!;
    expect(params.ticket).toBeUndefined();
    expect(params.error).toBeUndefined();
    expect(Object.keys(params).sort()).toEqual(["__proto__", "toString"]);
  });
});

describe("redirectSystemPath (Expo Router's +native-intent)", () => {
  it("keeps the router still for a return link while the app is open, and opens on Today when the link is what starts the app", () => {
    expect(redirectSystemPath({ path: "sparehour://calendar-connected?ticket=t", initial: false })).toBeNull();
    expect(redirectSystemPath({ path: "sparehour://auth/callback?code=c", initial: false })).toBeNull();
    expect(redirectSystemPath({ path: "sparehour://calendar-connected?ticket=t", initial: true })).toBe("/");
    expect(redirectSystemPath({ path: "sparehour://auth/callback?error=access_denied", initial: true })).toBe("/");
  });

  it("leaves every other link to the router as it came", () => {
    for (const path of ["sparehour://task/123", "sparehour://settings/calendar", "/task/123", "sparehour://", "sparehour://calendar-connected/else"]) {
      expect(redirectSystemPath({ path, initial: false })).toBe(path);
      expect(redirectSystemPath({ path, initial: true })).toBe(path);
    }
  });
});
