import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests",
  testMatch: "**/*.e2e.ts",
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:4178",
    browserName: "chromium",
    screenshot: "only-on-failure",
    trace: "retain-on-failure"
  },
  webServer: {
    command: "node --import tsx .ai/factory-ui-browser-fixture.ts",
    cwd: "../..",
    url: "http://127.0.0.1:4178",
    reuseExistingServer: false
  }
});
