import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { deskConfigSchema } from "../contracts";

/**
 * Sets `"allowCodexBuilder": true` in the local config file and keeps every other key as the
 * owner wrote it. A missing file is created. A file that is not a valid config is left alone.
 */
export const allowCodexBuilderIn = async (
  configFile: string
): Promise<{ readonly ok: boolean; readonly detail: string }> => {
  let raw = "{}";
  try {
    raw = await readFile(configFile, "utf8");
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) {
      return { ok: false, detail: `Cannot read ${configFile}.` };
    }
  }
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return { ok: false, detail: `${configFile} is not valid JSON. Fix it, then try again.` };
  }
  if (typeof json !== "object" || json === null || Array.isArray(json)) {
    return { ok: false, detail: `${configFile} is not a JSON object.` };
  }
  const next = { ...json, allowCodexBuilder: true };
  if (!deskConfigSchema.safeParse(next).success) {
    return { ok: false, detail: `${configFile} is not a valid desk config. Run pnpm desk doctor.` };
  }
  await mkdir(path.dirname(configFile), { recursive: true });
  await writeFile(configFile, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  return { ok: true, detail: "Codex may change code now." };
};
