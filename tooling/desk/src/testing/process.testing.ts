import { spawn } from "node:child_process";

/**
 * Start a process group leader that is not a child of the test process, like an
 * agent that outlived its desk. A child of the test process would stay a zombie
 * until Node reaps it, and a zombie still answers `kill(pid, 0)`. The leader
 * runs for a minute at most, so a failed test cannot leave it behind for long.
 */
export const spawnOrphanLeader = (): Promise<number> =>
  new Promise((resolve, reject) => {
    const launcher = `
      const { spawn } = require("node:child_process");
      const child = spawn(process.execPath, ["-e", "setTimeout(() => {}, 60000)"], {
        detached: true,
        stdio: "ignore"
      });
      child.unref();
      process.stdout.write(String(child.pid));
    `;
    const parent = spawn(process.execPath, ["-e", launcher], {
      stdio: ["ignore", "pipe", "ignore"]
    });
    let out = "";
    parent.stdout.on("data", (chunk: Buffer) => {
      out += chunk.toString("utf8");
    });
    parent.once("error", reject);
    parent.once("close", () => {
      const pid = Number(out);
      if (Number.isInteger(pid) && pid > 0) resolve(pid);
      else reject(new Error(`the launcher printed '${out}' instead of a pid`));
    });
  });
