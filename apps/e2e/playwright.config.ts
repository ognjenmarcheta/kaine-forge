import { defineConfig, devices } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const isCI = Boolean(process.env.CI);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

export default defineConfig({
  testDir: "./tests",
  testMatch: ["**/*.@(spec|test).?(c|m)[jt]s?(x)", "**/*.e2e.ts"],
  // Do not raise these without first isolating test data. Four of the five specs
  // sign in as the same seeded user (test@test.test), and web-organizations.e2e.ts
  // switches that user's active organization while web-auth-todos and
  // web-notes-flows operate on organization-scoped rows. Concurrent workers would
  // race on activeOrganizationId and read another spec's org. CI scales this by
  // sharding across jobs instead — each shard gets its own Postgres service.
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
        "pnpm --filter @repo/api exec node --import tsx src/index.ts",
      env: {
        API_PORT: "4010",
        // UI flows share one loopback IP. Rate-limit behavior has dedicated API tests.
        API_RATE_LIMIT_MAX: "1000",
        BETTER_AUTH_URL: "http://127.0.0.1:4010",
        API_CORS_ORIGINS: "http://127.0.0.1:3010"
      },
      cwd: repoRoot,
      url: "http://127.0.0.1:4010/api/auth/get-session",
      reuseExistingServer: true,
      timeout: 180_000
    },
    {
      command:
        // The repo .env pins VITE_GRAPHQL_URL to the dev API (port 4000), which
        // would bypass the Vite proxy in the browser. e2e must stay same-origin,
        // so force the relative /graphql endpoint; process env outranks .env.
        "pnpm --filter @repo/web exec vite --host 127.0.0.1 --port 3010 --strictPort",
      env: {
        VITE_API_PROXY_TARGET: "http://127.0.0.1:4010",
        VITE_GRAPHQL_URL: "/graphql"
      },
      cwd: repoRoot,
      url: "http://127.0.0.1:3010/auth",
      reuseExistingServer: true,
      timeout: 180_000
    }
  ]
});
