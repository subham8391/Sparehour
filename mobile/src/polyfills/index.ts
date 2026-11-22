// Imported first by app/_layout.tsx: the phone's stand-ins for the browser features the shared code uses
// (install.ts), with Expo's native random source behind `crypto`.
import * as ExpoCrypto from "expo-crypto";
import { installPolyfills } from "./install";

installPolyfills({
  randomUUID: () => ExpoCrypto.randomUUID(),
  getRandomValues: (array) => ExpoCrypto.getRandomValues(array as Parameters<typeof ExpoCrypto.getRandomValues>[0]) as unknown as typeof array,
});
