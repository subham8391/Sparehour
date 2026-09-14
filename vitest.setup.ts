// Shared test setup: jest-dom matchers (toBeInTheDocument, toHaveAttribute…)
// and DOM cleanup between component tests. Without `globals: true`, Testing
// Library cannot register its own afterEach, so it is done here. Harmless in
// node-environment tests.
import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";

afterEach(async () => {
  if (typeof document === "undefined") return;
  const { cleanup } = await import("@testing-library/react");
  cleanup();
});
