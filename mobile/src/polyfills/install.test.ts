// The phone's stand-ins for what Hermes lacks: a scope with no `crypto` gets one backed by the given source, one that
// has its own keeps it, and the zone list is the full IANA list. The whole phone test run goes without Node's own
// (test-setup.ts), which the first test proves.
import { installPolyfills } from "./install";
import { TIME_ZONES } from "./time-zones";

const source = { randomUUID: jest.fn(() => "11111111-2222-4333-8444-555555555555"), getRandomValues: jest.fn(<T,>(a: T) => a) };

describe("installPolyfills", () => {
  it("is what every phone test runs with: Node's own crypto is gone, and shared code still makes ids", () => {
    expect(Object.keys(globalThis.crypto)).toEqual(["randomUUID", "getRandomValues"]);
    expect(crypto.randomUUID()).toMatch(/^[0-9a-f-]{36}$/);
    expect((crypto as unknown as { subtle?: unknown }).subtle).toBeUndefined();
  });

  it("gives a scope without crypto one, backed by the phone's random source", () => {
    const scope: { crypto?: { randomUUID: () => string; getRandomValues: (a: Uint8Array) => Uint8Array } } = {};
    installPolyfills(source, scope);
    expect(scope.crypto!.randomUUID()).toBe("11111111-2222-4333-8444-555555555555");
    const bytes = new Uint8Array(4);
    expect(scope.crypto!.getRandomValues(bytes)).toBe(bytes);
    expect(source.getRandomValues).toHaveBeenCalledWith(bytes);
  });

  it("leaves a crypto that is already there alone", () => {
    const own = { randomUUID: () => "own", getRandomValues: <T,>(a: T) => a };
    const scope = { crypto: own };
    installPolyfills(source, scope);
    expect(scope.crypto.randomUUID()).toBe("own");
  });

  it("lists every IANA zone where the engine has no list, and refuses any other list", () => {
    const zones = Intl.supportedValuesOf("timeZone");
    expect(zones).toEqual([...TIME_ZONES]);
    expect(zones.length).toBeGreaterThan(400);
    expect(zones).toEqual(expect.arrayContaining(["Europe/London", "Asia/Calcutta", "America/New_York", "Australia/Sydney"]));
    expect(() => Intl.supportedValuesOf("currency")).toThrow(RangeError);
  });
});
