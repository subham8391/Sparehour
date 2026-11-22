// What the shared code takes from a browser that the phone's JavaScript engine (Hermes) does not have, put in
// place before anything runs (the first import of app/_layout.tsx). Only what the shared code is known to use:
//   - `crypto.randomUUID()`: every new row's id (data/repositories/*), and `crypto.getRandomValues()`.
//   - `Intl.supportedValuesOf("timeZone")`: the zone list in Settings (features/settings/settings-rules.ts).
// The computer's Node has both, so the phone's tests take them away first (test-setup.ts) and put these in: a use
// of something else from `crypto` or `Intl` fails a test instead of the phone.
import { TIME_ZONES } from "./time-zones";

export interface RandomSource {
  randomUUID: () => string;
  getRandomValues: <T extends ArrayBufferView | null>(array: T) => T;
}

type Holder = { crypto?: Partial<RandomSource> };
type IntlWithValues = typeof Intl & { supportedValuesOf?: (key: string) => string[] };

export function installPolyfills(random: RandomSource, scope: object = globalThis): void {
  const g = scope as Holder;
  if (!g.crypto) Object.defineProperty(g, "crypto", { value: {}, configurable: true, writable: true });
  const c = g.crypto as Partial<RandomSource>;
  if (typeof c.randomUUID !== "function") c.randomUUID = () => random.randomUUID();
  if (typeof c.getRandomValues !== "function") c.getRandomValues = (array) => random.getRandomValues(array);

  const intl = Intl as IntlWithValues;
  if (typeof intl.supportedValuesOf !== "function") {
    intl.supportedValuesOf = (key: string) => {
      if (key === "timeZone") return [...TIME_ZONES];
      throw new RangeError(`Intl.supportedValuesOf("${key}") is not on the phone`);
    };
  }
}
