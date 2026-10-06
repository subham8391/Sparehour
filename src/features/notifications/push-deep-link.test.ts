import { describe, expect, it } from "vitest";
import { parseDeepLink } from "./push";
import { fromNotification } from "./push-deep-link";

describe("fromNotification", () => {
  it("mounts the handler for every link parseDeepLink acts on, and for no URL without the marker", () => {
    const links = [
      "src=push&kind=block_start&task=t1&block=b1",
      "src=push&kind=deadline_eve&task=t1&action=tomorrow",
      "src=push&kind=morning&action=plan",
      "src=push&kind=shutdown",
    ];
    for (const q of links) {
      const params = new URLSearchParams(q);
      expect(parseDeepLink(params)).not.toBeNull();
      expect(fromNotification(params)).toBe(true);
    }
    for (const q of ["", "kind=block_start&task=t1", "src=mail&kind=morning", "add=project"]) {
      const params = new URLSearchParams(q);
      expect(parseDeepLink(params)).toBeNull();
      expect(fromNotification(params)).toBe(false);
    }
  });
});
