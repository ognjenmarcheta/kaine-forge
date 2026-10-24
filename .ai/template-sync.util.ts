import { existsSync, readFileSync } from "node:fs";
import { z } from "zod";

import { parseTemplateAdoptionConfig, type TemplateAdoptionConfig } from "./template-adoption.util";

export const TEMPLATE_UPSTREAM_URL = "https://github.com/ognjenmarcheta/kaine-forge.git";
export const TEMPLATE_UPSTREAM_REF = "main";
/** Project-owned AI sources. Upstream never ships this folder and sync never writes it. */
export const PROJECT_AI_PATH = ".ai/project";
export const TEMPLATE_CONFIG_PATH = `${PROJECT_AI_PATH}/template.json`;

const COMMIT_PATTERN = /^[0-9a-f]{40}$/;

const templateConfigSchema = z.object({
  schemaVersion: z.literal(1),
  adoption: z.record(z.string(), z.unknown()),
  upstream: z.object({ url: z.string().min(1), ref: z.string().min(1) }),
  base: z.string().regex(COMMIT_PATTERN).optional()
});

export interface TemplateConfig {
  schemaVersion: 1;
  adoption: TemplateAdoptionConfig;
  upstream: { url: string; ref: string };
  /** Upstream commit the project last synced from. Absent until the first sync resolves it. */
  base?: string;
}

export const parseTemplateConfig = (raw: unknown): TemplateConfig => {
  const parsed = templateConfigSchema.parse(raw);
  return {
    schemaVersion: 1,
    adoption: parseTemplateAdoptionConfig(parsed.adoption),
    upstream: parsed.upstream,
    ...(parsed.base ? { base: parsed.base } : {})
  };
};

export const renderTemplateConfig = (config: TemplateConfig): string =>
  `${JSON.stringify(config, null, 2)}\n`;

export const readTemplateConfig = (file: string): TemplateConfig | null =>
  existsSync(file) ? parseTemplateConfig(JSON.parse(readFileSync(file, "utf8"))) : null;

/** Adoption record for a project: keeps the upstream and base of an earlier record. */
export const nextTemplateConfig = (
  adoption: TemplateAdoptionConfig,
  previous: TemplateConfig | null
): TemplateConfig => ({
  schemaVersion: 1,
  adoption,
  upstream: previous?.upstream ?? { url: TEMPLATE_UPSTREAM_URL, ref: TEMPLATE_UPSTREAM_REF },
  ...(previous?.base ? { base: previous.base } : {})
});
