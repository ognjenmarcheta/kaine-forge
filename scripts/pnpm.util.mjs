import process from "node:process";

/**
 * Reuse the package manager that launched this script. This avoids Windows
 * .cmd shims and keeps filenames and other arguments out of a shell.
 * @param {readonly string[]} args
 * @param {string | undefined} executable
 * @param {string} platform
 * @returns {{ command: string, args: string[] }}
 */
export function pnpmInvocation(
  args,
  executable = process.env.npm_execpath,
  platform = process.platform
) {
  if (executable) {
    return /\.exe$/i.test(executable)
      ? { command: executable, args: [...args] }
      : { command: process.execPath, args: [executable, ...args] };
  }
  if (platform !== "win32") return { command: "pnpm", args: [...args] };
  // Preflight also runs directly before installation. Only this fixed probe
  // needs a shell; arbitrary arguments must use the lifecycle executable.
  if (args.length === 1 && args[0] === "--version") {
    return {
      command: process.env.ComSpec ?? "cmd.exe",
      args: ["/d", "/s", "/c", "pnpm --version"]
    };
  }
  throw new Error("Run this command through a pnpm package script on Windows.");
}
