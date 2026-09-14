// The suite's `test`: Playwright's, plus the page's console errors and
// uncaught exceptions printed and attached when a test fails, so a failure in
// CI explains itself without a trace viewer.
import { test as base } from "@playwright/test";

export const test = base.extend<{ consoleErrors: string[] }>({
  consoleErrors: [
    async ({ page }, use, testInfo) => {
      const errors: string[] = [];
      page.on("console", (m) => {
        if (m.type() === "error" || m.type() === "warning") errors.push(`[${m.type()}] ${m.text()}`);
      });
      page.on("pageerror", (e) => errors.push(`[pageerror] ${e.message}`));
      await use(errors);
      if (testInfo.status !== testInfo.expectedStatus && errors.length > 0) {
        const body = errors.join("\n");
        console.log(`\n--- browser console for "${testInfo.title}" ---\n${body}\n`);
        await testInfo.attach("browser-console", { body, contentType: "text/plain" });
      }
    },
    { auto: true },
  ],
});

export { expect } from "@playwright/test";
