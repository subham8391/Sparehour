#!/usr/bin/env node
// Bundle budgets (SYSTEM_DESIGN.md §11.6): what each prerendered shell asks
// the browser to download before it can paint, gzipped. Runs after
// `next build`. `target` is the design's number; `ceiling` is what fails CI
// today and only ever moves down.
import { existsSync, readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";

const ROUTES = [
  { route: "today", target: 320, ceiling: 320 },
  { route: "inbox", target: 320, ceiling: 320 },
  { route: "settings", target: 320, ceiling: 320 },
  { route: "search", target: 320, ceiling: 320 },
  { route: "login", target: 200, ceiling: 270 },
];

const KB = 1024;
let failed = false;
const rows = [];
for (const { route, target, ceiling } of ROUTES) {
  const html = `.next/server/app/${route}.html`;
  if (!existsSync(html)) {
    rows.push({ route, kb: null, target, ceiling, status: "missing (not prerendered?)" });
    failed = true;
    continue;
  }
  const refs = [...new Set(readFileSync(html, "utf8").match(/\/_next\/static\/[^"' ]+\.(?:js|css)/g) ?? [])];
  const sizes = refs
    .map((ref) => {
      const file = `.next${ref.slice("/_next".length)}`;
      return existsSync(file) ? { ref, bytes: gzipSync(readFileSync(file)).length } : null;
    })
    .filter(Boolean)
    .sort((a, b) => b.bytes - a.bytes);
  const total = sizes.reduce((s, x) => s + x.bytes, 0);
  const kb = total / KB;
  const status = kb > ceiling ? "OVER CEILING" : kb > target ? "over target" : "ok";
  if (kb > ceiling) failed = true;
  rows.push({ route, kb, target, ceiling, status, top: sizes.slice(0, 4) });
}

const pad = (s, n) => String(s).padEnd(n);
console.log(`${pad("route", 10)}${pad("gzipped", 10)}${pad("target", 8)}${pad("ceiling", 9)}status`);
for (const r of rows) console.log(`${pad(r.route, 10)}${pad(r.kb === null ? "—" : `${r.kb.toFixed(1)} KB`, 10)}${pad(`${r.target}`, 8)}${pad(`${r.ceiling}`, 9)}${r.status}`);
const worst = rows.filter((r) => r.top).sort((a, b) => b.kb - a.kb)[0];
if (worst) {
  console.log(`\nLargest assets on /${worst.route}:`);
  for (const x of worst.top) console.log(`  ${(x.bytes / KB).toFixed(1).padStart(7)} KB  ${x.ref}`);
}
if (failed) {
  console.error("\nA shell is over its ceiling. Trim it, or lower the ceiling only when it is a deliberate call (SYSTEM_DESIGN.md §11.6).");
  process.exit(1);
}
