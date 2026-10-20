// Which drawing of the day a look asks for (DECISIONS.md, amendment 2026-10-20: "the shapes follow as ribbon
// variants"). Four looks were designed with another shape; every other look draws the standard ribbon. Read from the
// look stamped on <html>, so a switch in Settings redraws at once. Tiny: the ribbon in every Today shell asks it.
import { useSyncExternalStore } from "react";

export type RibbonShape = "bar" | "ring" | "wave" | "arc" | "metro";

const SHAPES: Record<string, RibbonShape> = { pulse: "ring", tide: "wave", sundial: "arc", metro: "metro" };

export const shapeOf = (look: string | undefined): RibbonShape => (look ? (SHAPES[look] ?? "bar") : "bar");

function subscribe(onChange: () => void): () => void {
  const watch = new MutationObserver(onChange);
  watch.observe(document.documentElement, { attributes: true, attributeFilter: ["data-look"] });
  return () => watch.disconnect();
}

export function useRibbonShape(): RibbonShape {
  return useSyncExternalStore(
    subscribe,
    () => shapeOf(document.documentElement.dataset.look),
    () => "bar",
  );
}
