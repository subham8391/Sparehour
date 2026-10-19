// Service worker build (SYSTEM_DESIGN.md §10.1). Next 16 builds with
// Turbopack, which the @serwist/next webpack plugin cannot hook, so the
// worker is bundled by the Serwist CLI after `next build`
// (`serwist build`): it compiles src/app/sw.ts with esbuild and injects the
// precache manifest of the built shell.
import { serwist } from "@serwist/next/config";

export default serwist.withNextConfig(() => ({
  swSrc: "src/app/sw.ts",
  swDest: "public/sw.js",
  precachePrerendered: true,
  // Looks other than Sky and their faces load when chosen and are cached at run time (src/app/sw.ts), not precached.
  globIgnores: ["public/looks/**/*", "public/fonts/**/*"],
}));
