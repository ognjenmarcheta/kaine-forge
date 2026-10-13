import type { Exec } from "../ports";
import { runGit } from "./git.real";

/**
 * Exec bits on a host where git ignores them on disk (`core.fileMode=false`, the
 * Windows default). Git then keeps the bit only in the index, and `git add` of a
 * new file records 100644. These helpers carry the bit through the index.
 */

/** True when git ignores the exec bit on disk. */
export const fileModeIgnored = async (exec: Exec, cwd: string): Promise<boolean> =>
  (
    await runGit(exec, cwd, ["config", "--bool", "core.fileMode"], { okCodes: [1] })
  ).stdout.trim() === "false";

/** The exec bit of each of `files` in the index: `true` for 100755, `false` for 100644. */
export const indexExecBits = async (
  exec: Exec,
  cwd: string,
  files: readonly string[]
): Promise<Map<string, boolean>> => {
  const wanted = new Set(files);
  const bits = new Map<string, boolean>();
  const listed = (await runGit(exec, cwd, ["ls-files", "--stage", "-z"])).stdout;
  for (const entry of listed.split("\0")) {
    const match = /^(100755|100644) [0-9a-f]+ 0\t(.+)$/s.exec(entry);
    if (match?.[1] !== undefined && match[2] !== undefined && wanted.has(match[2])) {
      bits.set(match[2], match[1] === "100755");
    }
  }
  return bits;
};

/** Set exec bits in the index. A path the index does not hold yet is added. */
export const setIndexExecBits = async (
  exec: Exec,
  cwd: string,
  bits: ReadonlyMap<string, boolean>
): Promise<void> => {
  for (const executable of [true, false]) {
    const paths = [...bits].filter(([, bit]) => bit === executable).map(([file]) => file);
    if (paths.length > 0) {
      await runGit(exec, cwd, [
        "update-index",
        "--add",
        `--chmod=${executable ? "+" : "-"}x`,
        "--",
        ...paths
      ]);
    }
  }
};
