import { defineConfig } from "@playwright/test";

const port = 4179;
export default defineConfig({
  testDir: "./tests",
  testMatch: "**/*.e2e.ts",
  workers: 1,
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    browserName: "chromium",
    screenshot: "only-on-failure",
    trace: "retain-on-failure"
  },
  webServer: {
    // The real desk server over a temporary store with a scripted runner, plus a control server on the next port.
    command: "node --import tsx tooling/desk-ui/tests/fixture.server.ts",
    cwd: "../..",
    env: { DESK_FIXTURE_PORT: String(port) },
    url: `http://127.0.0.1:${port + 1}/ready`,
    reuseExistingServer: false
  }
});
