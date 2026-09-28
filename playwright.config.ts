import { defineConfig } from "@playwright/test";

// End-to-end runs against the built export served by `serve`, not the dev server,
// so the suite exercises the same bytes the host will publish.
export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  use: {
    baseURL: "http://127.0.0.1:4004",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm run serve:out",
    url: "http://127.0.0.1:4004",
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
