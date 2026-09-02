import { defineConfig, devices } from "@playwright/test";

/**
 * The E2E layer covers consequence, not coverage.
 *
 * These tests are slow and they run on a machine nobody logs into, so they are
 * spent only on the paths where a failure means a real person is misled: the
 * booking funnel end to end, and the race two buyers can lose.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false, // These tests share one database and one calendar.
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [["html"], ["list"]] : "list",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://127.0.0.1:3200",
    trace: "retain-on-failure",
    // A failure on a runner is a failure you cannot reproduce by hand, so the
    // trace and screenshot are the whole investigation.
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run start -- -p 3200",
    url: "http://127.0.0.1:3200",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
