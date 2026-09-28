import { createHash } from "node:crypto";
import path from "node:path";
import { z } from "zod";

export const factoryProviderSchema = z.enum(["codex", "claude"]);
export const factoryStageSchema = z.enum(["intake", "spec", "implement", "review", "learn"]);
export type FactoryProvider = z.infer<typeof factoryProviderSchema>;
export type FactoryStage = z.infer<typeof factoryStageSchema>;
const selection = z
  .object({ provider: factoryProviderSchema, model: z.string().trim().min(1) })
  .strict();
export const factoryConfigSchema = z
  .object({
    enabled: z.boolean(),
    repository: z.string().regex(/^[\w.-]+\/[\w.-]+$/),
    owner: z.string().regex(/^[\w-]+$/),
    image: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    stages: z
      .object({
        intake: selection,
        spec: selection,
        implement: selection,
        review: selection,
        learn: selection
      })
      .strict(),
    models: z.object({ codex: z.string().min(1), claude: z.string().min(1) }).strict(),
    watch: z.boolean().default(false)
  })
  .strict();
export type FactoryConfig = z.infer<typeof factoryConfigSchema>;
export const issueSchema = z.object({
  number: z.number().int().positive(),
  title: z.string(),
  body: z.string().nullable(),
  state: z.enum(["open", "closed"]),
  updated_at: z.string(),
  labels: z.array(z.object({ name: z.string() })),
  user: z.object({ login: z.string() })
});
export type FactoryIssue = z.infer<typeof issueSchema>;
export const eventSchema = z.object({
  id: z.number(),
  event: z.string(),
  created_at: z.string(),
  actor: z.object({ login: z.string() }).nullable(),
  label: z.object({ name: z.string() }).optional()
});
export const commentSchema = z.object({
  id: z.number(),
  body: z.string(),
  updated_at: z.string(),
  user: z.object({ login: z.string() })
});
export const factoryResultSchema = z
  .object({
    issue: z.number().int().positive(),
    revision: z.string().regex(/^[a-f0-9]{40}$/),
    status: z.enum(["completed", "blocked"]),
    summary: z.string().min(1).max(20000),
    nextAction: z.enum(["ready-for-agent", "needs-spec", "needs-info", "ready-for-human", "none"]),
    evidence: z
      .array(
        z
          .object({
            criterion: z.string().min(1),
            status: z.enum(["passed", "failed", "blocked", "untested"]),
            detail: z.string().min(1)
          })
          .strict()
      )
      .max(100),
    files: z
      .array(z.object({ path: z.string(), content: z.string().nullable() }).strict())
      .max(100),
    findings: z
      .array(
        z
          .object({
            path: z.string(),
            line: z.number().int().positive(),
            body: z.string().min(1).max(10000),
            blocking: z.boolean()
          })
          .strict()
      )
      .max(50)
  })
  .strict();
export type FactoryResult = z.infer<typeof factoryResultSchema>;
export const factoryRunSchema = z
  .object({
    cleanup: z
      .object({ status: z.enum(["passed", "cleanup-unverified"]), errors: z.array(z.string()) })
      .optional(),
    waiting: z.string().nullable().optional(),
    currentCommand: z
      .object({
        command: z.string(),
        startedAt: z.string(),
        lastOutputAt: z.string().nullable(),
        artifactId: z.string()
      })
      .nullable()
      .optional(),
    controller: z
      .object({
        version: z.string(),
        root: z.string(),
        checkout: z.string(),
        image: z.string(),
        fingerprint: z.string()
      })
      .optional(),
    id: z.string().uuid(),
    issue: z.number().int().positive(),
    actionId: z.string().uuid().optional(),
    retryOf: z.string().uuid().optional(),
    stage: factoryStageSchema,
    provider: factoryProviderSchema,
    model: z.string(),
    revision: z.string(),
    authorization: z.string(),
    snapshot: z.string(),
    startedAt: z.string(),
    finishedAt: z.string().nullable(),
    status: z.enum(["running", "blocked", "failed", "cancelled", "completed"]),
    detail: z.string(),
    branch: z.string(),
    pr: z.string().nullable(),
    statusComment: z.object({ id: z.number(), fingerprint: z.string() }).optional(),
    candidate: z
      .string()
      .regex(/^[a-f0-9]{40}$/)
      .optional(),
    validation: z.array(
      z.object({
        command: z.string(),
        passed: z.boolean(),
        artifact: z.string(),
        startedAt: z.string().optional(),
        finishedAt: z.string().optional()
      })
    ),
    result: factoryResultSchema.nullable(),
    invocations: z.array(
      z.object({
        provider: factoryProviderSchema,
        model: z.string(),
        cliVersion: z.string(),
        durationMs: z.number(),
        exitCode: z.number().nullable(),
        cleanup: z.boolean(),
        usage: z.record(z.string(), z.number())
      })
    )
  })
  .strict();
export type FactoryRun = z.infer<typeof factoryRunSchema>;

export function fingerprint(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function issueSnapshot(
  issue: FactoryIssue,
  comments: z.infer<typeof commentSchema>[],
  owner?: string,
  receipts: NonNullable<FactoryRun["statusComment"]>[] = []
): string {
  return fingerprint(
    JSON.stringify({
      title: issue.title,
      body: issue.body,
      comments: comments.filter(
        (entry) =>
          !(
            entry.user.login.toLowerCase() === owner?.toLowerCase() &&
            receipts.some(
              (receipt) =>
                receipt.id === entry.id && receipt.fingerprint === fingerprint(entry.body)
            )
          )
      )
    })
  );
}

export function readiness(body: string) {
  const sections = new Map<string, string>();
  const matches = [...body.matchAll(/^###?\s+(.+)\r?\n([\s\S]*?)(?=^###?\s|$(?![\s\S]))/gm)];
  for (const match of matches)
    sections.set((match[1] ?? "").trim().toLowerCase(), (match[2] ?? "").trim());
  const names = [
    "outcome",
    "acceptance criteria",
    "scope",
    "validation",
    "evidence",
    "out of scope"
  ];
  const missing = names.filter(
    (name) => !sections.get(name) || sections.get(name) === "_No response_"
  );
  const scope = (sections.get("scope") ?? "")
    .split(/\r?\n/)
    .map((line) =>
      line
        .replace(/^[-*]\s*/, "")
        .replaceAll("`", "")
        .trim()
    )
    .filter(Boolean);
  const criteria = (sections.get("acceptance criteria") ?? "")
    .split(/\r?\n/)
    .map((line) => line.replace(/^[-*]\s*(?:\[[ x]\]\s*)?/, "").trim())
    .filter(Boolean);
  const tier = z
    .enum(["docs", "code", "runtime", "web", "native"])
    .safeParse(sections.get("validation"));
  return { missing, scope, criteria, tier: tier.success ? tier.data : null };
}

export function approval(events: z.infer<typeof eventSchema>[], owner: string): string {
  const relevant = events.filter(
    (event) =>
      ["labeled", "unlabeled"].includes(event.event) && event.label?.name === "ready-for-agent"
  );
  const last = relevant.at(-1);
  if (!last || last.event !== "labeled" || last.actor?.login.toLowerCase() !== owner.toLowerCase())
    throw new Error("The configured owner must apply ready-for-agent");
  return String(last.id);
}

export function safeFile(file: string): string {
  if (
    !file ||
    file.includes("\\") ||
    file.includes(":") ||
    [...file].some((character) => character.charCodeAt(0) < 32) ||
    path.posix.isAbsolute(file) ||
    path.posix.normalize(file) !== file ||
    file.split("/").some((part) => part === ".." || part === "." || /[. ]$/.test(part))
  )
    throw new Error(`Unsafe path: ${file}`);
  if (
    file
      .split("/")
      .some((part) =>
        /^(?:\.git(?:hub)?|\.ai\.local|\.codex|\.claude|\.agents|node_modules|\.env(?:\..*)?|(?:con|prn|aux|nul|com\d|lpt\d)(?:\..*)?)$/i.test(
          part
        )
      )
  )
    throw new Error(`Protected path: ${file}`);
  if (
    /^tooling\/factory-ui(?:\/|$)/i.test(file) ||
    /^packages\/translation\/src\/locales\/(en|sr|de)\/factory\.json$/i.test(file) ||
    /^\.ai\/(?:factory|docker\/|permissions|hooks\/)/i.test(file) ||
    [".mcp.json", ".gitattributes", ".gitmodules"].includes(file.toLowerCase())
  )
    throw new Error(`Protected factory policy: ${file}`);
  return file;
}

export function validateChanges(result: FactoryResult, stage: FactoryStage, scope: string[]): void {
  const seen = new Set<string>();
  for (const file of result.files) {
    safeFile(file.path);
    if (seen.has(file.path.toLowerCase())) throw new Error("Duplicate file change");
    seen.add(file.path.toLowerCase());
    if (stage === "spec") {
      if (file.path !== `docs/specs/${result.issue}.md` || file.content === null)
        throw new Error("Specification may only write its issue document");
    } else if (
      stage !== "implement" ||
      !scope.some((prefix) => {
        const normalized = prefix.replace(/\/$/, "");
        return file.path === normalized || file.path.startsWith(`${normalized}/`);
      })
    )
      throw new Error(`Change outside approved scope: ${file.path}`);
  }
}

export function verifyAcceptance(result: FactoryResult, criteria: string[]): void {
  if (result.status !== "completed" || result.findings.some((finding) => finding.blocking))
    throw new Error("Review is blocked or has required findings");
  for (const criterion of criteria) {
    const evidence = result.evidence.filter((item) => item.criterion === criterion);
    if (evidence.length !== 1 || evidence[0]?.status !== "passed")
      throw new Error(`Acceptance criterion not verified: ${criterion}`);
  }
}

export function reviewLocations(result: FactoryResult, diff: string) {
  const lines = new Map<string, Set<number>>();
  let file = "";
  let line = 0;
  for (const text of diff.split("\n")) {
    if (text.startsWith("+++ b/")) {
      file = safeFile(text.slice(6));
      lines.set(file, new Set());
    } else if (text.startsWith("+++ /dev/null")) file = "";
    else if (text.startsWith("@@")) {
      const match = text.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      line = Number(match?.[1] ?? 0);
    } else if (file && line && (text.startsWith("+") || text.startsWith(" "))) {
      lines.get(file)?.add(line++);
    }
  }
  return result.findings.map((finding) => {
    safeFile(finding.path);
    if (!lines.get(finding.path)?.has(finding.line))
      throw new Error("Review location is outside the supplied diff");
    return {
      path: finding.path,
      line: finding.line,
      side: "RIGHT",
      body: `${finding.blocking ? "Required: " : ""}${finding.body}`
    };
  });
}

export function validationCommands(tier: string, files: string[]): string[][] {
  const code = files.some(
    (file) =>
      /^(apps|packages|tooling|scripts)\//.test(file) || /\.(?:[cm]?[jt]sx?|json|ya?ml)$/.test(file)
  );
  if (tier === "native")
    throw new Error("Native verification requires a supported human-run environment");
  const commands = [
    ["pnpm", "ai:install", "--", "--non-interactive"],
    ["pnpm", "ai:doctor"]
  ];
  if (code || tier !== "docs") commands.push(["pnpm", "generate"]);
  if (files.length)
    commands.push([
      "pnpm",
      "exec",
      "prettier",
      "--check",
      "--ignore-unknown",
      "--no-error-on-unmatched-pattern",
      "--",
      ...files
    ]);
  commands.push(code || tier !== "docs" ? ["pnpm", "check"] : ["pnpm", "format:check"]);
  if (["runtime", "web"].includes(tier) || files.some((file) => /^apps\/(api|web)\//.test(file)))
    commands.push(["pnpm", "build:core"]);
  if (tier === "web" || files.some((file) => /^apps\/web\//.test(file)))
    commands.push(
      ["pnpm", "db:prepare:local"],
      [
        "pnpm",
        "--filter",
        "@repo/e2e",
        "exec",
        "playwright",
        "test",
        "--config",
        "../../.ai.local/factory-playwright.config.ts"
      ]
    );
  return commands;
}
