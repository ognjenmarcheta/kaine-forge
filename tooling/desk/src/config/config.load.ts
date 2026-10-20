import { readFile } from "node:fs/promises";

import { deskConfigSchema, type DeskConfig } from "../contracts";

export type DeskConfigLoadResult =
  | { readonly ok: true; readonly config: DeskConfig; readonly source: "defaults" | "file" }
  | {
      readonly ok: false;
      readonly reason: "unreadable" | "invalid-json" | "invalid-config";
      readonly detail: string;
    };

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * Defaults plus an optional override file. The caller supplies the path. A
 * missing file means "use defaults": the default location is optional. An
 * unreadable, malformed, or invalid file is an error, never a silent fallback.
 *
 * On a Windows host the default isolation is `docker`: in host mode some
 * repository tests fail on Windows, so the ship check (`pnpm check`) cannot
 * pass. An explicit `"isolation": "host"` still wins.
 */
export const loadDeskConfig = async (
  overridePath?: string,
  platform: NodeJS.Platform = process.platform
): Promise<DeskConfigLoadResult> => {
  let raw: string | null = null;
  if (overridePath !== undefined) {
    try {
      raw = await readFile(overridePath, "utf8");
    } catch (error) {
      const missing = error instanceof Error && "code" in error && error.code === "ENOENT";
      if (!missing) {
        return {
          ok: false,
          reason: "unreadable",
          detail: error instanceof Error ? error.message : `Could not read ${overridePath}`
        };
      }
    }
  }

  let json: unknown = {};
  if (raw !== null) {
    try {
      json = JSON.parse(raw);
    } catch (error) {
      return {
        ok: false,
        reason: "invalid-json",
        detail: error instanceof Error ? error.message : "Config is not valid JSON"
      };
    }
  }

  if (platform === "win32" && isObject(json) && !("isolation" in json)) {
    json = { ...json, isolation: "docker" };
  }
  const parsed = deskConfigSchema.safeParse(json);
  if (!parsed.success) {
    return {
      ok: false,
      reason: "invalid-config",
      detail: parsed.error.issues
        .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
        .join("; ")
    };
  }
  return { ok: true, config: parsed.data, source: raw === null ? "defaults" : "file" };
};
