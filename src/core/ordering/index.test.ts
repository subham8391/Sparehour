import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { compare, evenKeys, keyBetween, keyForMove, keysBetween, needsRebalance, sorted, type Orderable } from "./index";

const list = (n: number): Orderable[] => evenKeys(n).map((sortKey, i) => ({ id: `t${i}`, sortKey }));

describe("keys", () => {
  it("generates keys that sort between their neighbours", () => {
    const a = keyBetween(null, null);
    const c = keyBetween(a, null);
    const b = keyBetween(a, c);
    expect(a < b && b < c).toBe(true);
    expect(keyBetween(null, a) < a).toBe(true);
  });

  it("generates n ordered keys", () => {
    const ks = keysBetween(null, null, 5);
    expect(ks).toHaveLength(5);
    for (let i = 1; i < ks.length; i++) expect(ks[i - 1] < ks[i]).toBe(true);
    expect(keysBetween(null, null, 0)).toEqual([]);
  });

  it("flags containers with long keys for the nightly rebalance", () => {
    expect(needsRebalance([{ id: "a", sortKey: "a0" }])).toBe(false);
    expect(needsRebalance([{ id: "a", sortKey: "a".repeat(41) }])).toBe(true);
  });
});

describe("keyForMove", () => {
  it("moves an item to the front, middle and end with one key", () => {
    const items = list(4); // t0 t1 t2 t3
    const front = keyForMove(items, "t3", 0);
    expect(sorted([...items.filter((x) => x.id !== "t3"), { id: "t3", sortKey: front }]).map((x) => x.id)).toEqual(["t3", "t0", "t1", "t2"]);
    const mid = keyForMove(items, "t0", 2);
    expect(sorted([...items.filter((x) => x.id !== "t0"), { id: "t0", sortKey: mid }]).map((x) => x.id)).toEqual(["t1", "t2", "t0", "t3"]);
    const end = keyForMove(items, "t1", 99);
    expect(sorted([...items.filter((x) => x.id !== "t1"), { id: "t1", sortKey: end }]).map((x) => x.id)).toEqual(["t0", "t2", "t3", "t1"]);
  });
});

describe("properties", () => {
  it("any sequence of moves matches a plain array model", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 12 }),
        fc.array(fc.tuple(fc.nat(), fc.nat()), { maxLength: 30 }),
        (n, moves) => {
          let items = list(n);
          const model = items.map((x) => x.id);
          for (const [fromRaw, toRaw] of moves) {
            const from = fromRaw % n;
            const to = toRaw % n;
            const id = model[from];
            model.splice(from, 1);
            model.splice(to, 0, id);
            const key = keyForMove(items, id, to);
            items = items.map((x) => (x.id === id ? { ...x, sortKey: key } : x));
            expect(sorted(items).map((x) => x.id)).toEqual(model);
          }
          expect(model).toHaveLength(n);
        },
      ),
    );
  });

  it("compare is a strict total order", () => {
    const arbItem = fc.record({ id: fc.string({ minLength: 1, maxLength: 3 }), sortKey: fc.constantFrom(...evenKeys(5), "a0", "a1") });
    fc.assert(
      fc.property(arbItem, arbItem, arbItem, (a, b, c) => {
        expect(compare(a, a)).toBe(0);
        // `|| 0` folds the -0 that negating 0 produces: two equal items compare 0 both ways.
        expect(compare(a, b)).toBe(-compare(b, a) || 0);
        if (compare(a, b) < 0 && compare(b, c) < 0) expect(compare(a, c)).toBe(-1);
      }),
    );
  });

  it("two clients inserting at the same position converge to one order with no lost items", () => {
    fc.assert(
      fc.property(fc.integer({ min: 2, max: 8 }), fc.integer({ min: 1, max: 6 }), (n, k) => {
        const base = list(n);
        const gap = k % (n - 1);
        const before = base[gap].sortKey;
        const after = base[gap + 1].sortKey;
        const a = { id: "client-a", sortKey: keyBetween(before, after) };
        const b = { id: "client-b", sortKey: keyBetween(before, after) };
        const merged = sorted([...base, a, b]);
        expect(merged).toHaveLength(n + 2);
        expect(sorted([...base, b, a])).toEqual(merged);
        const ids = merged.map((x) => x.id);
        expect(ids.indexOf("client-a")).toBeGreaterThan(gap);
        expect(ids.indexOf("client-b")).toBeGreaterThan(gap);
        expect(ids.indexOf("client-a")).toBeLessThan(gap + 3);
        expect(ids.indexOf("client-b")).toBeLessThan(gap + 3);
      }),
    );
  });

  it("a rebalance preserves the visible order exactly", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 20 }), fc.array(fc.nat(), { maxLength: 40 }), (n, inserts) => {
        let items = list(n);
        // pile inserts into one gap so keys grow
        for (const raw of inserts) {
          const at = raw % (items.length + 1);
          const s = sorted(items);
          items = [...items, { id: `n${items.length}`, sortKey: keyBetween(s[at - 1]?.sortKey ?? null, s[at]?.sortKey ?? null) }];
        }
        const order = sorted(items).map((x) => x.id);
        const fresh = evenKeys(items.length);
        const rebalanced = sorted(items).map((x, i) => ({ ...x, sortKey: fresh[i] }));
        expect(sorted(rebalanced).map((x) => x.id)).toEqual(order);
      }),
    );
  });
});
