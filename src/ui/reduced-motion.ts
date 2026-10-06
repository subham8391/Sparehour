// Whether to cut movement now (DESIGN_SYSTEM.md §7, SCREENS.md §18
// Appearance): the system's prefers-reduced-motion, or this device's
// Settings › Appearance › Reduce, which the head script stamps on <html> as
// data-motion="reduce" before the first paint. For motion made in script
// (a delayed exit, a smooth scroll) that the CSS variants cannot reach.
export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  if (document.documentElement.dataset.motion === "reduce") return true;
  return typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** A scroll's behaviour: smooth, or an instant jump for people who asked for less motion. */
export function scrollMotion(): ScrollBehavior {
  return prefersReducedMotion() ? "auto" : "smooth";
}
