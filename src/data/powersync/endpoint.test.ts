import { describe, expect, it } from "vitest";
import { resolvePowerSyncUrl } from "./endpoint";

describe("resolvePowerSyncUrl", () => {
  it("a path means this origin, an absolute URL is used as given, and the trailing slash the SDK rejects is dropped", () => {
    expect(resolvePowerSyncUrl("/powersync", "http://localhost:52141")).toBe("http://localhost:52141/powersync");
    expect(resolvePowerSyncUrl("/powersync/", "https://sparehour.app")).toBe("https://sparehour.app/powersync");
    expect(resolvePowerSyncUrl("https://sync.sparehour.app/", "http://localhost:3000")).toBe("https://sync.sparehour.app");
    expect(resolvePowerSyncUrl(undefined, "http://localhost:3000")).toBe("http://localhost:8080");
  });
});
