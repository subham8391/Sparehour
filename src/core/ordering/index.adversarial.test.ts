// Adversarial tests for fractional ordering: keys strictly between neighbours
// under heavy insertion at one spot, the promised jitter, duplicate keys,
// invalid keys, and byte-order comparison.
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { compare, evenKeys, keyBetween, keyForMove, keysBetween, needsRebalance, sorted, type Orderable } from "./index";

const list = (n: number): Orderable[] => evenKeys(n).map((sortKey, i) => ({ id: `t${i}`, sortKey }));

describe("keys between neighbours", () => {
  it("300 inserts at the same spot stay strictly ordered and grow by at most a few characters each", () => {
    let lo = keyBetween(null, null);
    const hi = keyBetween(lo, null);
    const chain = [lo];
    for (let i = 0; i < 300; i++) {
      const k = keyBetween(lo, hi);
      expect(k > lo && k < hi, `${lo} < ${k} < ${hi}`).toBe(true);
      chain.push(k);
      lo = k;
    }
    expect(chain.at(-1)!.length).toBeLessThan(400);
    for (let i = 1; i < chain.length; i++) expect(chain[i] > chain[i - 1]).toBe(true);
  });

  it("300 inserts at the front and at the back keep going without running out of room", () => {
    let first = keyBetween(null, null);
    let last = first;
    for (let i = 0; i < 300; i++) {
      const f = keyBetween(null, first);
      const l = keyBetween(last, null);
      expect(f < first).toBe(true);
      expect(l > last).toBe(true);
      first = f;
      last = l;
    }
    expect(first < last).toBe(true);
    expect(first.length).toBeLessThan(20);
    expect(last.length).toBeLessThan(20);
  });

  it("property: keyBetween is strictly between, and keysBetween is a strictly increasing run inside the gap", () => {
    const arbKeyPair = fc.tuple(fc.integer({ min: 0, max: 200 }), fc.integer({ min: 0, max: 200 })).filter(([a, b]) => a !== b).map(([a, b]) => [Math.min(a, b), Math.max(a, b)] as const);
    const keys = evenKeys(201);
    fc.assert(
      fc.property(arbKeyPair, fc.integer({ min: 1, max: 20 }), ([a, b], n) => {
        const lo = keys[a];
        const hi = keys[b];
        const k = keyBetween(lo, hi);
        expect(lo < k && k < hi).toBe(true);
        const run = keysBetween(lo, hi, n);
        expect(run).toHaveLength(n);
        expect(lo < run[0] && run[n - 1] < hi).toBe(true);
        for (let i = 1; i < n; i++) expect(run[i - 1] < run[i]).toBe(true);
      }),
    );
  });

  it("SYSTEM_DESIGN §5.6: two clients inserting between the same neighbours get different (jittered) keys", () => {
    // The module comment promises "jitter keeps two offline clients from generating identical keys".
    const seen = new Set<string>();
    for (let i = 0; i < 25; i++) seen.add(keyBetween("a0", "a1"));
    expect(seen.size, `25 calls produced only ${[...seen].join(", ")}`).toBeGreaterThan(1);
  });
});

describe("duplicate and invalid keys", () => {
  it("keyForMove copes with neighbours that share a key (ties are legal: `id` breaks them)", () => {
    const items: Orderable[] = [{ id: "a", sortKey: "a0" }, { id: "b", sortKey: "a0" }, { id: "c", sortKey: "a1" }];
    let key = "";
    expect(() => {
      key = keyForMove(items, "c", 1);
    }).not.toThrow();
    const moved = sorted(items.map((x) => (x.id === "c" ? { ...x, sortKey: key } : x))).map((x) => x.id);
    expect(moved.indexOf("c")).toBeLessThanOrEqual(1);
  });

  it("documents: the library throws on empty, equal or inverted keys — callers must never pass them", () => {
    expect(() => keyBetween("", null)).toThrow();
    expect(() => keyBetween("a0", "a0")).toThrow();
    expect(() => keyBetween("a1", "a0")).toThrow();
    expect(() => keysBetween("a1", "a0", 2)).toThrow();
  });

  it("keyForMove clamps the index, ignores an unknown id, and works on a one-item list", () => {
    const items = list(3);
    const front = keyForMove(items, "t2", -5);
    expect(front < items[0].sortKey).toBe(true);
    const back = keyForMove(items, "t0", 999);
    expect(back > items[2].sortKey).toBe(true);
    const stranger = keyForMove(items, "nope", 1);
    expect(items[0].sortKey < stranger && stranger < items[1].sortKey).toBe(true);
    expect(keyForMove([{ id: "only", sortKey: "a0" }], "only", 0)).toBeTruthy();
    expect(keyForMove([], "x", 0)).toBeTruthy();
  });

  it("keysBetween with n ≤ 0 is empty; evenKeys(0) is empty; evenKeys(2000) is strictly increasing and short", () => {
    expect(keysBetween(null, null, 0)).toEqual([]);
    expect(keysBetween(null, null, -1)).toEqual([]);
    expect(evenKeys(0)).toEqual([]);
    const ks = evenKeys(2000);
    for (let i = 1; i < ks.length; i++) expect(ks[i - 1] < ks[i]).toBe(true);
    expect(Math.max(...ks.map((k) => k.length))).toBeLessThanOrEqual(6);
  });
});

describe("compare", () => {
  it("uses byte order, so keys before 'a0' (upper-case head) sort first", () => {
    const front = keyBetween(null, "a0");
    expect(front[0]).toMatch(/[A-Z]/);
    expect(sorted([{ id: "x", sortKey: "a0" }, { id: "y", sortKey: front }]).map((x) => x.id)).toEqual(["y", "x"]);
    expect(compare({ id: "x", sortKey: "a0V" }, { id: "y", sortKey: "a0v" })).toBe(-1);
  });

  it("is antisymmetric and transitive over random keys and ids", () => {
    const arb = fc.record({ id: fc.string({ maxLength: 3 }), sortKey: fc.constantFrom("a0", "a0V", "a0v", "Zz", "Zy", "a1", "A0", "b00") });
    fc.assert(
      fc.property(arb, arb, arb, (a, b, c) => {
        expect(compare(a, b)).toBe(-compare(b, a) || 0);
        if (compare(a, b) <= 0 && compare(b, c) <= 0) expect(compare(a, c)).toBeLessThanOrEqual(0);
        if (compare(a, b) === 0) expect(a).toEqual(b);
      }),
    );
  });

  it("needsRebalance is a strict > on the longest key", () => {
    expect(needsRebalance([{ id: "a", sortKey: "a".repeat(40) }])).toBe(false);
    expect(needsRebalance([{ id: "a", sortKey: "a".repeat(41) }])).toBe(true);
    expect(needsRebalance([])).toBe(false);
    expect(needsRebalance([{ id: "a", sortKey: "a".repeat(6) }], 5)).toBe(true);
  });
});
