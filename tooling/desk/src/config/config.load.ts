import { readFile } from "node:fs/promises";

import { deskConfigSchema, type DeskConfig } from "../contracts";

export type DeskConfigLoadResult =
  | { readonly ok: true; readonly config: DeskConfig; readonly source: "defaults" | "file" }
  | {
      readonly ok: false;
      readonly reason: "unreadable" | "invalid-json" | "invalid-config";
      readonly detail: string;
    };

/**
 * Defaults plus an optional override file. The caller supplies the path. A
 * missing file means "use defaults": the default location is optional. An
 * unreadable, malformed, or invalid file is an error, never a silent fallback.
 */
export const loadDeskConfig = async (overridePath?: string): Promise<DeskConfigLoadResult> => {
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
