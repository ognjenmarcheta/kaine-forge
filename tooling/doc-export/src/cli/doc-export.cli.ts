import { fileURLToPath } from "node:url";

import { runCli } from "./doc-export.run";

/** Entry of `pnpm doc:export`. The repository is the one this file is in. */
const repoRoot = fileURLToPath(new URL("../../../../", import.meta.url));

void runCli(process.argv.slice(2), {
  repoRoot,
  cwd: process.cwd(),
  out: (text) => void process.stdout.write(text),
  err: (text) => void process.stderr.write(text)
}).then((code) => {
  process.exitCode = code;
});
