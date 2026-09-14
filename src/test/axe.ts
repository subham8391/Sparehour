// axe-core in jsdom (SYSTEM_DESIGN.md §11.5): every rule that does not need
// layout. Colour contrast is checked at the token level instead, and the
// landmark rules do not apply to a fragment rendered on its own.
import axe from "axe-core";

const SKIPPED = ["color-contrast", "region", "landmark-one-main", "page-has-heading-one"];

/** Human-readable violations, empty when the fragment is clean. */
export async function a11yViolations(container: Element): Promise<string[]> {
  const result = await axe.run(container, {
    rules: Object.fromEntries(SKIPPED.map((id) => [id, { enabled: false }])),
    resultTypes: ["violations"],
  });
  return result.violations.map((v) => `${v.id} (${v.impact}): ${v.help}\n  ${v.nodes.map((n) => n.target.join(" ")).join("\n  ")}`);
}
