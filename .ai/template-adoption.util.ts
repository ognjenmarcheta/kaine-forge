export interface TemplateAdoptionInput {
  productName?: string;
  packageName?: string;
  repoSlug?: string;
  dockerImagePrefix?: string;
  s3Bucket?: string;
  webTitle?: string;
  mobileName?: string;
  mobileSlug?: string;
  mobileScheme?: string;
  desktopProductName?: string;
  desktopWindowTitle?: string;
  desktopIdentifier?: string;
  compatibilityPolicy?: string;
  designCompatibilityPolicy?: string;
}

export interface TemplateAdoptionConfig {
  productName: string;
  packageName: string;
  repoSlug: string;
  dockerImagePrefix: string;
  s3Bucket: string;
  webTitle: string;
  mobileName: string;
  mobileSlug: string;
  mobileScheme: string;
  desktopProductName: string;
  desktopWindowTitle: string;
  desktopIdentifier: string;
  compatibilityPolicy: string;
  designCompatibilityPolicy: string;
}

export interface ChangedFile {
  path: string;
  replacements: number;
}

export interface TemplateReference {
  path: string;
  line: number;
  match: string;
}

export interface TemplateAdoptionResult {
  files: Map<string, string>;
  changedFiles: ChangedFile[];
}

const PACKAGE_NAME_PATTERN = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/;
const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]*$/;
const DESKTOP_IDENTIFIER_PATTERN = /^[A-Za-z][A-Za-z0-9_-]*(?:\.[A-Za-z][A-Za-z0-9_-]*)+$/;

export const adoptionTargets = [
  "package.json",
  "README.md",
  "CONTEXT.md",
  "CONTRIBUTING.md",
  "MONOREPO_GUIDE.md",
  "DESIGN_SYSTEM.md",
  "docker-compose.yml",
  ".env.example",
  "docs/README.md",
  "docs/release-checklist.md",
  "docs/adr/0008-adopt-better-auth.md",
  "apps/web/index.html",
  "apps/mobile/app.json",
  "apps/desktop/src-tauri/tauri.conf.json",
  "apps/desktop/src-tauri/Cargo.toml",
  "apps/web/src/features/auth/auth.definition.ts",
  "apps/web/src/providers/organization.provider.tsx",
  "apps/web/src/providers/translation.provider.tsx",
  "apps/web/src/stores/theme.store.ts",
  "apps/web/src/stores/theme.store.test.ts",
  "apps/mobile/src/features/auth/auth.definition.ts",
  "apps/mobile/src/providers/organization.provider.tsx",
  "apps/mobile/src/providers/theme.provider.tsx",
  "apps/mobile/src/providers/translation.provider.tsx",
  "apps/mobile/src/stores/sidebar.store.ts",
  "apps/mobile/src/stores/theme.store.ts",
  "apps/mobile/src/features/auth/auth.config.ts",
  "apps/mobile/src/lib/auth-api.ts",
  "apps/desktop/src-tauri/src/main.rs",
  "apps/desktop/src-tauri/Cargo.lock",
  "packages/auth/src/auth.instance.ts",
  "packages/auth/src/auth.instance.test.ts",
  "packages/auth/src/auth.instance.hooks.test.ts",
  "packages/auth/src/auth.server.test.ts",
  "packages/persistence/src/persistence.test.ts",
  "packages/translation/src/locales/en/common.json",
  "packages/translation/src/locales/de/common.json",
  "packages/translation/src/locales/sr/common.json",
  "packages/translation/src/translation.config.test.ts",
  ".ai/guide.md",
  ".ai/review.md",
  ".ai/cursor-rules.md",
  ".ai/serena-project.yml",
  ".ai/serena-memories/project_overview.md",
  ".ai/serena-memories/suggested_commands.md",
  ".ai/skills/kaine-open-pr.md",
  ".ai/skills/kaine-test.md",
  ".ai/agents/kaine-explorer.md",
  ".ai/agents/kaine-implementer.md",
  ".ai/ai.util.ts",
  ".ai/ai.util.spec.ts",
  ".ai/session-start-hook.spec.ts",
  ".ai/hooks/session-start.mjs",
  "docs/agents/day-one.md",
  "docs/agents/domain.md",
  "docs/agents/issue-tracker.md",
  "docs/troubleshooting.md",
  "docs/adr/0009-domain-knowledge-as-agent-infra.md"
] as const;

const templateReferencePatterns: ReadonlyArray<readonly [RegExp, string]> = [
  [/\bKaine Forge\b/g, "Kaine Forge"],
  [/\bkaine-forge\b/g, "kaine-forge"],
  // No trailing \b: must also match inside kaineforge:// and kaine_forge_desktop.
  [/kaineforge/g, "kaineforge"],
  [/kaine_forge/g, "kaine_forge"],
  [/\bcom\.kaine\.forge\b/g, "com.kaine.forge"],
  [/"kaine\./g, '"kaine.'],
  [/`kaine\./g, "`kaine."],
  [/"kaine"/g, '"kaine"']
];

const normalizePath = (path: string): string => path.replace(/\\/g, "/").replace(/^\.\//, "");

const compactWhitespace = (value: string): string => value.trim().replace(/\s+/g, " ");

export const slugify = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const requireText = (field: string, value: string): string => {
  const normalized = compactWhitespace(value);
  if (!normalized) {
    throw new Error(`template adoption config field '${field}' must not be empty`);
  }
  return normalized;
};

const validateSlug = (field: string, value: string): string => {
  if (!SLUG_PATTERN.test(value)) {
    throw new Error(`template adoption config field '${field}' must be a lowercase URL slug`);
  }
  return value;
};

const validatePackageName = (value: string): string => {
  if (!PACKAGE_NAME_PATTERN.test(value)) {
    throw new Error(
      "template adoption config field 'packageName' must be a valid lowercase npm package name"
    );
  }
  return value;
};

const MOBILE_SCHEME_PATTERN = /^[a-z][a-z0-9]*$/;

const validateMobileScheme = (value: string): string => {
  if (!MOBILE_SCHEME_PATTERN.test(value)) {
    throw new Error(
      "template adoption config field 'mobileScheme' must be lowercase letters and digits"
    );
  }
  return value;
};

const validateDesktopIdentifier = (value: string): string => {
  if (!DESKTOP_IDENTIFIER_PATTERN.test(value)) {
    throw new Error(
      "template adoption config field 'desktopIdentifier' must be a reverse-DNS identifier"
    );
  }
  return value;
};

export const deriveTemplateAdoptionConfig = (
  input: TemplateAdoptionInput
): TemplateAdoptionConfig => {
  const productName = requireText("productName", input.productName ?? "");
  const productSlug = slugify(productName);

  if (!productSlug) {
    throw new Error("template adoption config field 'productName' must contain letters or numbers");
  }

  const packageName = validatePackageName(input.packageName ?? productSlug);
  const repoSlug = validateSlug("repoSlug", input.repoSlug ?? productSlug);
  const mobileSlug = validateSlug("mobileSlug", input.mobileSlug ?? `${productSlug}-mobile`);

  return {
    productName,
    packageName,
    repoSlug,
    dockerImagePrefix: requireText("dockerImagePrefix", input.dockerImagePrefix ?? repoSlug),
    s3Bucket: requireText("s3Bucket", input.s3Bucket ?? `${repoSlug}-dev`),
    webTitle: requireText("webTitle", input.webTitle ?? productName),
    mobileName: requireText("mobileName", input.mobileName ?? `${productName} Mobile`),
    mobileSlug,
    mobileScheme: validateMobileScheme(input.mobileScheme ?? repoSlug.replace(/-/g, "")),
    desktopProductName: requireText("desktopProductName", input.desktopProductName ?? productName),
    desktopWindowTitle: requireText(
      "desktopWindowTitle",
      input.desktopWindowTitle ?? `${productName} Desktop`
    ),
    desktopIdentifier: validateDesktopIdentifier(input.desktopIdentifier ?? ""),
    compatibilityPolicy: requireText(
      "compatibilityPolicy",
      input.compatibilityPolicy ??
        `${productName} compatibility and versioning policy is owned by the product team. Document supported upgrade paths and breaking-change handling here.`
    ),
    designCompatibilityPolicy: requireText(
      "designCompatibilityPolicy",
      input.designCompatibilityPolicy ??
        `${productName} design compatibility policy is owned by the product team. Document visual compatibility expectations and migration rules here.`
    )
  };
};

const stringField = (
  raw: Record<string, unknown>,
  field: keyof TemplateAdoptionInput
): string | undefined => {
  const value = raw[field];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string") {
    throw new Error(`template adoption config field '${field}' must be a string`);
  }
  return value;
};

export const parseTemplateAdoptionConfig = (raw: unknown): TemplateAdoptionConfig => {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new Error("template adoption config must be a JSON object");
  }

  const object = raw as Record<string, unknown>;
  const input: TemplateAdoptionInput = {};
  const fields: Array<keyof TemplateAdoptionInput> = [
    "productName",
    "packageName",
    "repoSlug",
    "dockerImagePrefix",
    "s3Bucket",
    "webTitle",
    "mobileName",
    "mobileSlug",
    "mobileScheme",
    "desktopProductName",
    "desktopWindowTitle",
    "desktopIdentifier",
    "compatibilityPolicy",
    "designCompatibilityPolicy"
  ];

  for (const field of fields) {
    const value = stringField(object, field);
    if (value !== undefined) {
      input[field] = value;
    }
  }

  return deriveTemplateAdoptionConfig(input);
};

const replaceAll = (source: string, search: string, replacement: string): [string, number] => {
  if (!search || !source.includes(search)) {
    return [source, 0];
  }
  const count = source.split(search).length - 1;
  return [source.split(search).join(replacement), count];
};

const replacePolicyBlock = (source: string, replacement: string): [string, number] => {
  const blockPattern =
    /\n?<!-- TEMPLATE_POLICY_BLOCK_START -->\n[\s\S]*?\n<!-- TEMPLATE_POLICY_BLOCK_END -->\n?/g;
  let count = 0;
  const updated = source.replace(blockPattern, () => {
    count += 1;
    return `\n\n${replacement.trim()}\n\n`;
  });
  return [updated, count];
};

const replacementsForConfig = (
  config: TemplateAdoptionConfig
): ReadonlyArray<readonly [string, string]> => [
  ["com.kaine.forge.desktop", config.desktopIdentifier],
  ["Kaine Forge Mobile", config.mobileName],
  ["Kaine Forge Desktop", config.desktopWindowTitle],
  ["kaine-forge-mobile", config.mobileSlug],
  ["kaine-forge-api", `${config.dockerImagePrefix}-api`],
  ["kaine-forge-web", `${config.dockerImagePrefix}-web`],
  ["kaine-forge-dev", config.s3Bucket],
  // Concatenated and snake_case identity forms carry no dash, so the generic
  // kaine-forge pair below never reaches them.
  ["kaineforge", config.mobileScheme],
  ["kaine_forge", config.repoSlug.replace(/-/g, "_")],
  ['"kaine.', `"${config.repoSlug}.`],
  ["`kaine.", `\`${config.repoSlug}.`],
  ['"kaine"', `"${config.repoSlug}"`],
  ["Kaine Forge", config.productName],
  ["kaine-forge", config.repoSlug]
];

const policyForPath = (path: string, config: TemplateAdoptionConfig): string | null => {
  if (path === "MONOREPO_GUIDE.md") {
    return config.compatibilityPolicy;
  }
  if (path === "DESIGN_SYSTEM.md") {
    return config.designCompatibilityPolicy;
  }
  return null;
};

export const excludedFromTemplateAdoption = (path: string): boolean => {
  const normalized = normalizePath(path);
  const segments = normalized.split("/");
  if (
    normalized === "pnpm-lock.yaml" ||
    normalized.startsWith(".git/") ||
    normalized.startsWith(".worktrees/") ||
    normalized.startsWith(".ai.local/") ||
    normalized.startsWith(".ai/template-adoption") ||
    // Historical planning records document the template's own development.
    normalized.startsWith("docs/superpowers/") ||
    normalized === ".ai/skills/kaine-adopt-template.md" ||
    normalized.includes("/skills/kaine-adopt-template/SKILL.md") ||
    segments.includes("node_modules") ||
    segments.includes("dist") ||
    segments.includes("coverage") ||
    segments.includes(".turbo") ||
    normalized.startsWith("apps/desktop/src-tauri/target/") ||
    normalized.endsWith("CHANGELOG.md") ||
    normalized.includes("/graphql/generated/")
  ) {
    return true;
  }
  return false;
};

export const applyTemplateAdoption = (
  files: ReadonlyMap<string, string>,
  config: TemplateAdoptionConfig
): TemplateAdoptionResult => {
  const nextFiles = new Map(files);
  const changedFiles: ChangedFile[] = [];

  for (const path of adoptionTargets) {
    const source = files.get(path);
    if (source === undefined || excludedFromTemplateAdoption(path)) {
      continue;
    }

    let next = source;
    let replacements = 0;
    const policy = policyForPath(path, config);
    if (policy) {
      const [updated, count] = replacePolicyBlock(next, policy);
      next = updated;
      replacements += count;
    }

    for (const [search, replacement] of replacementsForConfig(config)) {
      const [updated, count] = replaceAll(next, search, replacement);
      next = updated;
      replacements += count;
    }

    if (next !== source) {
      nextFiles.set(path, next);
      changedFiles.push({ path, replacements });
    }
  }

  return { files: nextFiles, changedFiles };
};

export const activeTemplateReferences = (
  files: ReadonlyMap<string, string>
): TemplateReference[] => {
  const references: TemplateReference[] = [];

  for (const [path, source] of files) {
    if (excludedFromTemplateAdoption(path)) {
      continue;
    }

    const lines = source.split(/\r?\n/);
    for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
      const line = lines[lineIndex]!;
      for (const [pattern, label] of templateReferencePatterns) {
        pattern.lastIndex = 0;
        if (pattern.test(line)) {
          references.push({ path, line: lineIndex + 1, match: label });
        }
      }
    }
  }

  return references.sort((left, right) =>
    left.path === right.path ? left.line - right.line : left.path.localeCompare(right.path)
  );
};
