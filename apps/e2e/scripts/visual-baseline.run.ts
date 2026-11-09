// Runs the @visual specs in the official Playwright container, so every
// machine renders screenshots with the same Chromium, fonts, and system
// libraries as CI. The test runner and the web/API servers stay on the host;
// the container browser reaches them through Playwright's loopback tunnel.
// Extra arguments go to `playwright test`, for example --update-snapshots.
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

// The port inside the container. Docker picks a free host port for it.
const port = 3333;
const require = createRequire(import.meta.url);
const manifest: unknown = JSON.parse(
  readFileSync(require.resolve("@playwright/test/package.json"), "utf8")
);
if (
  typeof manifest !== "object" ||
  manifest === null ||
  !("version" in manifest) ||
  typeof manifest.version !== "string"
) {
  throw new Error("Could not read the installed @playwright/test version.");
}
// The browser server and the test runner must be the same Playwright version.
const version = manifest.version;

function docker(args: string[]): string {
  const result = spawnSync("docker", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"]
  });
  if (result.error ?? result.status !== 0) {
    throw new Error(`docker ${args[0] ?? ""} failed. Start Docker and run the command again.`);
  }
  return result.stdout.trim();
}

// Docker publishes the port before the server listens, so wait for its log line.
// The container runs without --rm, so its logs survive a failed start.
async function waitForServer(container: string, deadline: number): Promise<void> {
  while (Date.now() < deadline) {
    const logs = spawnSync("docker", ["logs", container], { encoding: "utf8" });
    const output = `${logs.stdout}${logs.stderr}`;
    if (output.includes("Listening on")) return;
    if (docker(["inspect", "--format={{.State.Running}}", container]) !== "true") {
      process.stderr.write(output);
      throw new Error(`The Playwright browser container ${container} exited before it started.`);
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`The Playwright browser server did not start in container ${container}.`);
}

const container = docker([
  "run",
  "--detach",
  "--init",
  "--ipc=host",
  "--user=pwuser",
  "--workdir=/home/pwuser",
  `--publish=127.0.0.1::${String(port)}`,
  `mcr.microsoft.com/playwright:v${version}-noble`,
  "npx",
  "-y",
  `playwright@${version}`,
  "run-server",
  `--port=${String(port)}`,
  "--host=0.0.0.0"
]);

let status = 1;
try {
  // The first start downloads the playwright package inside the container.
  await waitForServer(container, Date.now() + 180_000);
  // For example "127.0.0.1:49153".
  const hostAddress = docker(["port", container, `${String(port)}/tcp`]).split("\n")[0];
  const result = spawnSync(
    "pnpm",
    ["exec", "playwright", "test", "--grep", "@visual", ...process.argv.slice(2)],
    {
      stdio: "inherit",
      env: {
        ...process.env,
        PW_TEST_CONNECT_WS_ENDPOINT: `ws://${hostAddress ?? ""}/`,
        PW_TEST_CONNECT_EXPOSE_NETWORK: "<loopback>"
      }
    }
  );
  if (result.error) console.error(`Could not run playwright test: ${result.error.message}`);
  if (result.signal) console.error(`playwright test stopped on signal ${result.signal}.`);
  status = result.status ?? 1;
} finally {
  // A cleanup failure only warns, so it cannot hide the error that ended the run.
  const removed = spawnSync("docker", ["rm", "--force", container], { encoding: "utf8" });
  if (removed.status !== 0) console.error(`Could not remove container ${container}.`);
}
process.exitCode = status;
