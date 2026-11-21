// What Settings › Calendar offers about connecting: which button is drawn, when it can be pressed, and what Google
// offers on top, for the web's panel and the Android app's alike.
import { describe, expect, it } from "vitest";
import { canConnect, canReconnect, connectMoreLabel, offersFullAccess, offersProvider, offersShowBlocks } from "./connect-offers";
import { appConnectNotice, consentOutcome } from "./consent-outcome";

const google = { provider: "google" as const, status: "ok" as const, canWrite: true, titles: true, writesOwn: true };
const outlook = { provider: "microsoft" as const, status: "ok" as const, canWrite: false, titles: false, writesOwn: false };

describe("connecting a provider", () => {
  it("draws Google's button unless only Outlook can be connected, and Outlook's only where the server can", () => {
    expect(offersProvider("google", { configured: true, outlook: false })).toBe(true);
    expect(offersProvider("google", { configured: null, outlook: false })).toBe(true);
    expect(offersProvider("google", { configured: false, outlook: false })).toBe(true);
    expect(offersProvider("google", { configured: false, outlook: true })).toBe(false);
    expect(offersProvider("microsoft", { configured: true, outlook: false })).toBe(false);
    expect(offersProvider("microsoft", { configured: false, outlook: true })).toBe(true);
  });

  it("connects Google only once the server has said yes; reconnecting waits only for a no", () => {
    expect(canConnect("google", { configured: null, outlook: true })).toBe(false);
    expect(canConnect("google", { configured: true, outlook: false })).toBe(true);
    expect(canConnect("microsoft", { configured: true, outlook: false })).toBe(false);
    expect(canReconnect("google", { configured: null, outlook: false })).toBe(true);
    expect(canReconnect("google", { configured: false, outlook: false })).toBe(false);
    expect(canReconnect("microsoft", { configured: true, outlook: false })).toBe(false);
  });

  it("names the button under the accounts for what it adds", () => {
    expect(connectMoreLabel("google", [google])).toBe("Add another Google account");
    expect(connectMoreLabel("microsoft", [google])).toBe("Connect Outlook");
    expect(connectMoreLabel("microsoft", [outlook])).toBe("Add another Outlook account");
    expect(connectMoreLabel("google", [outlook])).toBe("Connect Google Calendar");
  });
});

describe("what Google offers on top", () => {
  it("offers to show blocks while a Google account is connected and nothing writes yet", () => {
    expect(offersShowBlocks([{ ...google, canWrite: false }])).toBe(true);
    expect(offersShowBlocks([google])).toBe(false);
    expect(offersShowBlocks([outlook])).toBe(false);
    expect(offersShowBlocks([])).toBe(false);
  });

  it("offers full access while a working Google account reads busy times only or keeps blocks to its own calendar", () => {
    expect(offersFullAccess([google])).toBe(false);
    expect(offersFullAccess([{ ...google, titles: false }])).toBe(true);
    expect(offersFullAccess([{ ...google, writesOwn: false }])).toBe(true);
    expect(offersFullAccess([{ ...google, titles: false, status: "needs_reauth" }])).toBe(false);
    expect(offersFullAccess([outlook])).toBe(false);
  });
});

describe("what a consent came to, for the Android app", () => {
  it("says the web's sentence for the same outcome", () => {
    expect(appConnectNotice("connected")).toBe(consentOutcome("?calendar=connected"));
    expect(appConnectNotice("connected", "write")).toBe(consentOutcome("?calendar=connected"));
    expect(appConnectNotice("connected", "full")).toBe(consentOutcome("?calendar=full"));
    expect(appConnectNotice("cancelled")).toBe(consentOutcome("?calendar=denied"));
    expect(appConnectNotice("cancelled", "write")).toBe(consentOutcome("?calendar=write_denied"));
    expect(appConnectNotice("cancelled", "full")).toBe(consentOutcome("?calendar=full_denied"));
    expect(appConnectNotice("failed")).toBe(consentOutcome("?calendar=error"));
    expect(appConnectNotice("unavailable")).toBe(consentOutcome("?calendar=unavailable"));
  });
});
