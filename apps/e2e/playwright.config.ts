import { defineConfig, devices } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const isCI = Boolean(process.env.CI);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

export default defineConfig({
  testDir: "./tests",
  testMatch: ["**/*.@(spec|test).?(c|m)[jt]s?(x)", "**/*.e2e.ts"],
  fullyParallel: false,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  workers: 1,
  reporter: isCI
    ? [["list"], ["html", { outputFolder: "playwright-report", open: "never" }]]
    : [["list"]],
  use: {
    baseURL: "http://127.0.0.1:3010",
    trace: "retain-on-failure"
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] }
    }
  ],
  webServer: [
    {
      command:
        // API_CORS_ORIGINS feeds better-auth's trustedOrigins; the browser hits
        // the API through the Vite proxy, so its Origin header is the web origin.
        "API_PORT=4010 BETTER_AUTH_URL=http://127.0.0.1:4010 API_CORS_ORIGINS=http://127.0.0.1:3010 pnpm --filter @repo/api exec node --import tsx src/index.ts",
      cwd: repoRoot,
      url: "http://127.0.0.1:4010/api/auth/get-session",
      reuseExistingServer: true,
      timeout: 180_000
    },
    {
      command:
        "VITE_API_PROXY_TARGET=http://127.0.0.1:4010 pnpm --filter @repo/web exec vite --host 127.0.0.1 --port 3010 --strictPort",
      cwd: repoRoot,
      url: "http://127.0.0.1:3010/auth",
      reuseExistingServer: true,
      timeout: 180_000
    }
  ]
});
