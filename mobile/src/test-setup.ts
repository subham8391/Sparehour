// Every phone test runs without what Node has and the phone's engine (Hermes) does not, so a use of it fails here
// instead of on the phone: the global `crypto` and `Intl.supportedValuesOf` are taken away, then the app's own
// stand-ins are put in (polyfills/install.ts), with Node's random source behind them.
import { installPolyfills } from "./polyfills/install";

// Node's own, asked for by name: this app's type check knows the phone's globals, not Node's.
const { randomUUID, getRandomValues } = require("crypto") as { randomUUID: () => string; getRandomValues: <T>(a: T) => T };

Object.defineProperty(globalThis, "crypto", { value: undefined, configurable: true, writable: true });
delete (Intl as { supportedValuesOf?: unknown }).supportedValuesOf;

installPolyfills({ randomUUID: () => randomUUID(), getRandomValues: (array) => getRandomValues(array) });
