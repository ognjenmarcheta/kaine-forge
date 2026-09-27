import console from "node:console";
import { readFileSync, writeFileSync } from "node:fs";
import net from "node:net";
import process from "node:process";

// Protected data uses synthetic markers; the Git probe reads only HEAD or a worktree pointer.
const [readable, writable, protectedFile, outsideFile, port, mode, environmentFile, gitFile] =
  process.argv.slice(2);
const denied = (operation) => {
  try {
    operation();
    return false;
  } catch (error) {
    return ["EACCES", "EPERM"].includes(error.code);
  }
};
const allowedRead = readFileSync(readable, "utf8") === "kaine-sandbox-control";
let writeSucceeded = false;
const writeDenied = denied(() => {
  writeFileSync(writable, "probe");
  writeSucceeded = readFileSync(writable, "utf8") === "probe";
});
const protectedDenied = denied(() => readFileSync(protectedFile, "utf8"));
const environmentFileDenied = denied(() => readFileSync(environmentFile, "utf8"));
const gitDenied = denied(() => readFileSync(gitFile, "utf8"));
const outsideReadDenied = denied(() => readFileSync(outsideFile, "utf8"));
const environmentIsolated =
  process.env.KAINE_PROBE_SECRET === undefined && process.env.OPENAI_API_KEY === undefined;
const outsideWriteDenied = denied(() => writeFileSync(outsideFile, "probe"));
const networkEvidence = await new Promise((resolve) => {
  const socket = net.connect({ host: "127.0.0.1", port: Number(port) });
  socket.setTimeout(2000);
  socket.once("connect", () => {
    socket.destroy();
    resolve("allowed");
  });
  socket.once("error", (error) => {
    socket.destroy();
    resolve(["EACCES", "EPERM"].includes(error.code) ? "denied" : "inconclusive");
  });
  socket.once("timeout", () => {
    socket.destroy();
    resolve("inconclusive");
  });
});
console.log(
  JSON.stringify({
    allowedRead,
    expectedWrite: mode === "edit" ? writeSucceeded : writeDenied,
    protectedDenied,
    environmentFileDenied,
    gitDenied,
    outsideReadDenied,
    environmentIsolated,
    outsideWriteDenied,
    networkDenied: networkEvidence === "denied",
    networkEvidence
  })
);
