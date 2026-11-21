// What "every look keeps text readable" means, as a rule (DECISIONS.md, amendment 2026-10-20): one theme's tokens are
// held to WCAG AA on the page and on cards, the controls' ring to 3:1, and the controls' own text to AA on the fill
// the look gives it (the primary button, the phone's add button, the segmented control). Pure and free of any test
// runner, so the web's check over its stylesheets (contrast.test.ts) and the Android app's check over the values
// generated from them (mobile/src/ui/looks/generated.test.ts) hold a look to the same thing.

/** One theme's custom properties by name, without the leading dashes: `{ paper: "#e8f0fa", "ink-2": "#34496b", … }`. */
export type Tokens = Record<string, string>;

const hex = (v: string | undefined) => (v && /^#[0-9a-f]{6}$/i.test(v) ? v : null);

export function luminance(h: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** A colour token followed through its `var()` references; null for anything else (transparent, a wash, a mix). */
function resolve(t: Tokens, value: string | undefined, depth = 0): string | null {
  const ref = value && /^var\(--([a-z0-9-]+)\)$/.exec(value.trim());
  if (ref) return depth > 8 ? null : resolve(t, t[ref[1]], depth + 1);
  return hex(value);
}

export const ratio = (a: string, b: string): number => {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

/**
 * Everything that breaks the rule in one theme's tokens (the look's own over the defaults it does not redefine), each
 * as a sentence; an empty list is a look that holds.
 */
export function contrastProblems(name: string, t: Tokens): string[] {
  const problems: string[] = [];
  const hold = (fg: string, bg: string, least: number, what: string) => {
    if (!(ratio(fg, bg) >= least)) problems.push(`${name}: ${what} is ${ratio(fg, bg).toFixed(2)}:1, under ${least}:1`);
  };
  const grounds = ["paper", "surface"].map((k) => [k, hex(t[k])] as const).filter((g): g is readonly [string, string] => g[1] !== null);
  if (grounds.length !== 2) problems.push(`${name}: paper and surface are plain colours`);
  for (const [g, bg] of grounds) {
    for (const text of ["ink", "ink-2", "ink-3", "spare", "meet", "over", "deadline"]) {
      const fg = hex(t[text]);
      if (!fg) continue;
      hold(fg, bg, 4.5, `${text} ${fg} on ${g} ${bg}`);
    }
    const ring = hex(t["line-control"]);
    if (ring) hold(ring, bg, 3, `line-control ${ring} on ${g} ${bg}`);
    for (const edge of ["check-line", "switch-off"]) {
      const c = resolve(t, t[edge]);
      if (c === null) problems.push(`${name}: ${edge} is a plain colour`);
      else hold(c, bg, 3, `${edge} ${c} on ${g} ${bg}`);
    }
  }
  // Text on a fill that is not a plain colour (an outline's transparent, the dark rail's wash) is held on what shows
  // through it: the segmented tile's on the rail, the rest on the page and the card.
  const rail = resolve(t, t.seg);
  const under = (fill: string): string[] => {
    const own = resolve(t, t[fill]);
    if (own) return [own];
    if (fill === "seg-on" && rail) return [rail];
    return grounds.map((g) => g[1]);
  };
  for (const [text, fill] of [["btn-ink", "btn"], ["fab-ink", "fab"], ["btn-2-ink", "surface"], ["seg-ink", "seg"], ["seg-on-ink", "seg-on"]]) {
    const fg = resolve(t, t[text]);
    if (fg === null) {
      problems.push(`${name}: ${text} is a plain colour`);
      continue;
    }
    for (const bg of under(fill)) hold(fg, bg, 4.5, `${text} ${fg} on ${fill} ${bg}`);
  }
  return problems;
}
