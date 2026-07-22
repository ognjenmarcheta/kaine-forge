# Domain Knowledge as Agent Infrastructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close gaps so agents and day-one contributors can work productively with near-zero prompter context, and ship template machinery (REVIEW install path, encode skill, doctor structure gates, day-one ramp, ADR) so every Kaine Forge adoption inherits the same loop.

**Architecture:** Canonical `.ai/review.md` installs to tracked root `REVIEW.md` (same generate/drift model as Serena memories). `pnpm ai:doctor` treats missing or malformed canonical structure as lint **errors** (CI fail) and installed `REVIEW.md` drift as advisory. A new `kaine-encode-knowledge` skill productizes the promotion ladder (repeated failure → lint/test/REVIEW/skill/CONTEXT). Day-one docs + guide section + ADR 0009 document the why; gap audit records residual machine-check opportunities without inventing speculative linters.

**Tech Stack:** Existing `.ai/*` TypeScript tooling (tsx, Vitest, chalk), markdown sources under `.ai/` and `docs/`, `pnpm ai:install` / `pnpm ai:doctor` / `pnpm ai:test`.

## Global Constraints

- Edit only canonical `.ai/` sources and docs; never hand-edit generated assistant outputs except as the installer's job (commit generated `REVIEW.md`, `AGENTS.md`, `CLAUDE.md`, `.serena/*` after `pnpm ai:install`).
- Strict TypeScript: no `any`; use `unknown` with narrowing when needed.
- Surgical changes: no new ESLint packages or CI jobs unless the gap audit finds a trivial, already-proven machine check (default: none in this plan).
- Team skills must use the `kaine-` prefix under `.ai/skills/`.
- Keep org-specific automation out of the template.
- After every `.ai/` source change in a task: run `pnpm ai:install` then `pnpm ai:doctor` before claiming the task done.
- Hard automation (new lint rules/e2e) is out of scope unless the residual audit identifies a one-line existing gate fix.

---

## File Structure

| Path | Responsibility |
|------|----------------|
| `.ai/ai.util.ts` | `REVIEW_SRC`, required headings/constants, `renderReviewDoc`, pure linters for domain-knowledge structure |
| `.ai/ai.util.spec.ts` | Unit tests for render + structure linters |
| `.ai/install.ts` | Write root `REVIEW.md` from `.ai/review.md` |
| `.ai/doctor.ts` | Call structure linters; show REVIEW in shared-docs status; include REVIEW in shared drift |
| `.ai/review.md` | Canonical review checklist (G1–G10 under 8 headings) |
| `REVIEW.md` | Generated tracked install output (do not edit by hand) |
| `.ai/skills/kaine-encode-knowledge.md` | Promotion ladder skill |
| `.ai/skills/kaine-review.md` | Method skill; must apply REVIEW checklist |
| `.ai/skills/kaine-sync-docs.md` | Include REVIEW in sync workflow |
| `.ai/guide.md` | Required reading, philosophy section, skill list, canonical sources list |
| `docs/adr/0009-domain-knowledge-as-agent-infra.md` | Decision record |
| `docs/agents/day-one.md` | Day-one / agent-assisted contribution ramp |
| `docs/agents/skill-authoring.md` | How to add product skills |
| `docs/agents/automation-gap-audit.md` | Residual gaps after B pass |
| `docs/agents/domain.md` | Point at REVIEW in read order |
| `docs/README.md` | Index new docs + ADR |
| `CONTRIBUTING.md` | Short day-one agent ramp + AI file list |
| `MONOREPO_GUIDE.md` §18 | Canonical sources + REVIEW output |
| `.ai/serena-memories/*.md` | Consistency: encode loop, REVIEW pointers |
| `.ai/template-adoption.util.ts` | Add `.ai/review.md` (and name-bearing docs if needed) to `adoptionTargets` |
| `.ai/template-adoption.util.spec.ts` | Assert new adoption target |

---

### Task 1: REVIEW render helper + unit tests

**Files:**
- Modify: `.ai/ai.util.ts`
- Modify: `.ai/ai.util.spec.ts`

**Interfaces:**
- Consumes: existing `HTML_HEADER`, `AI_DIR`, `join`
- Produces:
  - `REVIEW_SRC: string` — path to `.ai/review.md`
  - `REVIEW_OUT: string` — path to root `REVIEW.md` (or compute as `join(REPO_ROOT, "REVIEW.md")` at call sites)
  - `REVIEW_REQUIRED_HEADINGS: readonly string[]`
  - `renderReviewDoc(source: string): string` — HTML gen notice + trimmed body + trailing newline

- [ ] **Step 1: Write the failing tests**

Add to `.ai/ai.util.spec.ts` imports: `renderReviewDoc`, `REVIEW_REQUIRED_HEADINGS` (and later linters in Task 2).

```typescript
describe("renderReviewDoc", () => {
  it("wraps the source with the HTML generated-file notice", () => {
    expect(renderReviewDoc("# Review\n\nBody.")).toBe(
      "<!-- GENERATED FILE. Do not edit directly. Run: pnpm ai:install -->\n\n# Review\n\nBody.\n"
    );
  });

  it("trims surrounding whitespace on the source body", () => {
    expect(renderReviewDoc("\n\n## Correctness\n\n- x\n\n")).toContain("## Correctness\n\n- x\n");
    expect(renderReviewDoc("\n\n## Correctness\n\n- x\n\n").startsWith("<!--")).toBe(true);
  });
});

describe("REVIEW_REQUIRED_HEADINGS", () => {
  it("lists the eight compact-hybrid headings in order", () => {
    expect([...REVIEW_REQUIRED_HEADINGS]).toEqual([
      "Correctness",
      "Security, Auth & Tenancy",
      "Architecture & Boundaries",
      "Data & GraphQL",
      "UI & i18n",
      "Quality Gates",
      "Domain Language",
      "Template & AI Hygiene"
    ]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm ai:test -- renderReviewDoc`
Expected: FAIL — `renderReviewDoc` / `REVIEW_REQUIRED_HEADINGS` not exported.

- [ ] **Step 3: Minimal implementation**

In `.ai/ai.util.ts`, after `CURSOR_RULES_SRC` (or near other path constants):

```typescript
export const REVIEW_SRC = join(AI_DIR, "review.md");
export const REVIEW_OUT = join(REPO_ROOT, "REVIEW.md");

export const REVIEW_REQUIRED_HEADINGS = [
  "Correctness",
  "Security, Auth & Tenancy",
  "Architecture & Boundaries",
  "Data & GraphQL",
  "UI & i18n",
  "Quality Gates",
  "Domain Language",
  "Template & AI Hygiene"
] as const;
```

Near `renderSerenaMemory`:

```typescript
export const renderReviewDoc = (source: string): string =>
  `${HTML_HEADER}\n\n${source.trim()}\n`;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm ai:test -- renderReviewDoc`
Expected: PASS for the new describe blocks.

- [ ] **Step 5: Commit**

```bash
git add .ai/ai.util.ts .ai/ai.util.spec.ts
git commit -m "feat(ai): add REVIEW render helper and required headings"
```

---

### Task 2: Structure linters (R1–R8) + unit tests

**Files:**
- Modify: `.ai/ai.util.ts`
- Modify: `.ai/ai.util.spec.ts`

**Interfaces:**
- Consumes: `LintIssue`, `REVIEW_REQUIRED_HEADINGS`, `GUIDE_SRC`, skill discovery patterns
- Produces:
  - `lintReviewSource(content: string | null, file?: string): LintIssue[]`
  - `lintContextSource(content: string | null, file?: string): LintIssue[]`
  - `lintDomainKnowledgeArtifacts(input: DomainKnowledgeLintInput): LintIssue[]`
  - Types for pure, injectable checks so tests do not require a full repo tree

- [ ] **Step 1: Write the failing tests**

```typescript
import {
  // ...existing
  lintReviewSource,
  lintContextSource,
  lintDomainKnowledgeArtifacts,
  REVIEW_REQUIRED_HEADINGS
} from "./ai.util";

const fullReview = [
  "# Review Checklist",
  "",
  ...REVIEW_REQUIRED_HEADINGS.flatMap((h) => [`## ${h}`, "", "- rule", ""]),
  ""
].join("\n");

describe("lintReviewSource", () => {
  it("errors when the source is missing", () => {
    const issues = lintReviewSource(null);
    expect(issues.some((i) => i.level === "error" && i.message.includes("missing"))).toBe(true);
  });

  it("errors when a required heading is absent", () => {
    const issues = lintReviewSource("# Review\n\n## Correctness\n\n- x\n");
    expect(issues.some((i) => i.message.includes("Security, Auth & Tenancy"))).toBe(true);
  });

  it("passes a complete checklist", () => {
    expect(lintReviewSource(fullReview)).toEqual([]);
  });
});

describe("lintContextSource", () => {
  it("errors when CONTEXT is missing", () => {
    expect(lintContextSource(null).length).toBeGreaterThan(0);
  });

  it("errors when Language, Relationships, or Example dialogue is missing", () => {
    const issues = lintContextSource("# Context\n\n## Language\n\n");
    expect(issues.some((i) => i.message.includes("Relationships"))).toBe(true);
  });

  it("passes a minimal valid CONTEXT shape", () => {
    const content = [
      "# Context",
      "",
      "## Language",
      "",
      "**Org**:",
      "",
      "## Relationships",
      "",
      "- A relates to B.",
      "",
      "## Example dialogue",
      "",
      "> example",
      ""
    ].join("\n");
    expect(lintContextSource(content)).toEqual([]);
  });
});

describe("lintDomainKnowledgeArtifacts", () => {
  const base = {
    reviewContent: fullReview,
    contextContent: [
      "# C",
      "",
      "## Language",
      "",
      "x",
      "",
      "## Relationships",
      "",
      "y",
      "",
      "## Example dialogue",
      "",
      "z"
    ].join("\n"),
    skillNames: ["kaine-encode-knowledge", "kaine-review", "kaine-sync-docs"],
    kaineReviewBody: "Apply the checklist in `REVIEW.md` (installed from `.ai/review.md`).",
    contributingContent: "## Day-one agent ramp\n\nSee `docs/agents/day-one.md`.\n",
    dayOneExists: true,
    serenaMemoryNames: [
      "architecture_patterns.md",
      "coding_standards.md",
      "domain_overview.md",
      "environment_setup.md",
      "project_overview.md",
      "quality_expectations.md",
      "suggested_commands.md",
      "task_completion_checklist.md"
    ]
  };

  it("errors when kaine-encode-knowledge is missing from skills", () => {
    const issues = lintDomainKnowledgeArtifacts({
      ...base,
      skillNames: ["kaine-review"]
    });
    expect(issues.some((i) => i.message.includes("kaine-encode-knowledge"))).toBe(true);
  });

  it("errors when kaine-review does not reference REVIEW", () => {
    const issues = lintDomainKnowledgeArtifacts({
      ...base,
      kaineReviewBody: "Review the diff only."
    });
    expect(issues.some((i) => i.message.toLowerCase().includes("review"))).toBe(true);
  });

  it("errors when day-one doc is missing or CONTRIBUTING lacks the ramp section", () => {
    expect(
      lintDomainKnowledgeArtifacts({ ...base, dayOneExists: false }).some((i) =>
        i.message.includes("day-one")
      )
    ).toBe(true);
    expect(
      lintDomainKnowledgeArtifacts({
        ...base,
        contributingContent: "# Contributing\n\nNo ramp.\n"
      }).some((i) => i.message.includes("Day-one") || i.message.includes("day-one"))
    ).toBe(true);
  });

  it("errors when a required Serena memory is missing", () => {
    const issues = lintDomainKnowledgeArtifacts({
      ...base,
      serenaMemoryNames: ["project_overview.md"]
    });
    expect(issues.some((i) => i.message.includes("architecture_patterns"))).toBe(true);
  });

  it("passes a complete artifact set", () => {
    expect(lintDomainKnowledgeArtifacts(base)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm ai:test -- lintReviewSource`
Expected: FAIL — exports missing.

- [ ] **Step 3: Minimal implementation**

Add to `.ai/ai.util.ts`:

```typescript
export const CONTEXT_OUT = join(REPO_ROOT, "CONTEXT.md");
export const DAY_ONE_DOC = join(REPO_ROOT, "docs", "agents", "day-one.md");
export const CONTRIBUTING_OUT = join(REPO_ROOT, "CONTRIBUTING.md");

export const CONTEXT_REQUIRED_HEADINGS = ["Language", "Relationships", "Example dialogue"] as const;

export const REQUIRED_SERENA_MEMORIES = [
  "architecture_patterns.md",
  "coding_standards.md",
  "domain_overview.md",
  "environment_setup.md",
  "project_overview.md",
  "quality_expectations.md",
  "suggested_commands.md",
  "task_completion_checklist.md"
] as const;

export const DAY_ONE_CONTRIBUTING_MARKER = "Day-one agent ramp";

export interface DomainKnowledgeLintInput {
  reviewContent: string | null;
  contextContent: string | null;
  skillNames: string[];
  kaineReviewBody: string | null;
  contributingContent: string | null;
  dayOneExists: boolean;
  serenaMemoryNames: string[];
  reviewFile?: string;
  contextFile?: string;
  contributingFile?: string;
  skillsDir?: string;
  dayOneFile?: string;
  serenaDir?: string;
}

export const lintReviewSource = (
  content: string | null,
  file: string = REVIEW_SRC
): LintIssue[] => {
  if (content === null) {
    return [{ file, level: "error", message: "missing .ai/review.md (canonical REVIEW source)" }];
  }
  const issues: LintIssue[] = [];
  for (const heading of REVIEW_REQUIRED_HEADINGS) {
    const needle = `## ${heading}`;
    if (!content.includes(needle)) {
      issues.push({
        file,
        level: "error",
        message: `review source missing required heading '${needle}'`
      });
    }
  }
  return issues;
};

export const lintContextSource = (
  content: string | null,
  file: string = CONTEXT_OUT
): LintIssue[] => {
  if (content === null) {
    return [{ file, level: "error", message: "missing CONTEXT.md" }];
  }
  const issues: LintIssue[] = [];
  for (const heading of CONTEXT_REQUIRED_HEADINGS) {
    const needle = `## ${heading}`;
    if (!content.includes(needle)) {
      issues.push({
        file,
        level: "error",
        message: `CONTEXT.md missing required heading '${needle}'`
      });
    }
  }
  return issues;
};

export const lintDomainKnowledgeArtifacts = (input: DomainKnowledgeLintInput): LintIssue[] => {
  const reviewFile = input.reviewFile ?? REVIEW_SRC;
  const contextFile = input.contextFile ?? CONTEXT_OUT;
  const contributingFile = input.contributingFile ?? CONTRIBUTING_OUT;
  const skillsDir = input.skillsDir ?? SKILLS_SRC_DIR;
  const dayOneFile = input.dayOneFile ?? DAY_ONE_DOC;
  const serenaDir = input.serenaDir ?? SERENA_MEMORIES_SRC_DIR;

  const issues: LintIssue[] = [
    ...lintReviewSource(input.reviewContent, reviewFile),
    ...lintContextSource(input.contextContent, contextFile)
  ];

  if (!input.skillNames.includes("kaine-encode-knowledge")) {
    issues.push({
      file: skillsDir,
      level: "error",
      message: "skill 'kaine-encode-knowledge' is missing from .ai/skills"
    });
  }

  if (input.kaineReviewBody === null) {
    issues.push({
      file: join(skillsDir, "kaine-review.md"),
      level: "error",
      message: "skill 'kaine-review' is missing"
    });
  } else if (!/REVIEW\.md/i.test(input.kaineReviewBody) && !/\.ai\/review\.md/i.test(input.kaineReviewBody)) {
    issues.push({
      file: join(skillsDir, "kaine-review.md"),
      level: "error",
      message: "kaine-review must reference REVIEW.md or .ai/review.md checklist"
    });
  }

  if (!input.dayOneExists) {
    issues.push({
      file: dayOneFile,
      level: "error",
      message: "missing docs/agents/day-one.md"
    });
  }

  if (input.contributingContent === null) {
    issues.push({
      file: contributingFile,
      level: "error",
      message: "missing CONTRIBUTING.md"
    });
  } else if (!input.contributingContent.includes(DAY_ONE_CONTRIBUTING_MARKER)) {
    issues.push({
      file: contributingFile,
      level: "error",
      message: `CONTRIBUTING.md missing '${DAY_ONE_CONTRIBUTING_MARKER}' section`
    });
  }

  const presentMemories = new Set(input.serenaMemoryNames);
  for (const name of REQUIRED_SERENA_MEMORIES) {
    if (!presentMemories.has(name)) {
      issues.push({
        file: serenaDir,
        level: "error",
        message: `required Serena memory missing: ${name}`
      });
    }
  }

  return issues;
};

/** Disk-backed entry point used by ai:doctor */
export const lintDomainKnowledgeInfra = (): LintIssue[] => {
  const reviewContent = existsSync(REVIEW_SRC) ? readFileSync(REVIEW_SRC, "utf8") : null;
  const contextContent = existsSync(CONTEXT_OUT) ? readFileSync(CONTEXT_OUT, "utf8") : null;
  const contributingContent = existsSync(CONTRIBUTING_OUT)
    ? readFileSync(CONTRIBUTING_OUT, "utf8")
    : null;

  let skillNames: string[] = [];
  let kaineReviewBody: string | null = null;
  try {
    const skills = discoverSkills();
    skillNames = skills.map((s) => s.name);
    const reviewSkill = skills.find((s) => s.name === "kaine-review");
    kaineReviewBody = reviewSkill?.body ?? null;
  } catch {
    // discoverSkills throws on parse errors; skill dir lint already reports those
    skillNames = [];
    kaineReviewBody = null;
  }

  // If kaine-review failed parse, still try raw file for reference check
  const reviewSkillPath = join(SKILLS_SRC_DIR, "kaine-review.md");
  if (kaineReviewBody === null && existsSync(reviewSkillPath)) {
    kaineReviewBody = readFileSync(reviewSkillPath, "utf8");
  }

  const serenaMemoryNames = existsSync(SERENA_MEMORIES_SRC_DIR)
    ? readdirSync(SERENA_MEMORIES_SRC_DIR).filter((f) => f.endsWith(".md"))
    : [];

  return lintDomainKnowledgeArtifacts({
    reviewContent,
    contextContent,
    skillNames,
    kaineReviewBody,
    contributingContent,
    dayOneExists: existsSync(DAY_ONE_DOC),
    serenaMemoryNames
  });
};
```

Keep imports at top of `ai.util.ts` already including `existsSync`, `readdirSync`, `readFileSync`, `join`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm ai:test`
Expected: all previous + new structure tests PASS.

- [ ] **Step 5: Commit**

```bash
git add .ai/ai.util.ts .ai/ai.util.spec.ts
git commit -m "feat(ai): add domain-knowledge structure linters for doctor"
```

---

### Task 3: Wire install + doctor

**Files:**
- Modify: `.ai/install.ts`
- Modify: `.ai/doctor.ts`

**Interfaces:**
- Consumes: `REVIEW_SRC`, `REVIEW_OUT`, `renderReviewDoc`, `lintDomainKnowledgeInfra`
- Produces: root `REVIEW.md` on install; doctor lint errors include structure; drift includes REVIEW; shared-docs line for REVIEW.md

- [ ] **Step 1: Update `writeSharedOutputs` in install.ts**

Import `REVIEW_SRC`, `REVIEW_OUT`, `renderReviewDoc`, `existsSync` (already), `readFileSync` (already).

Inside `writeSharedOutputs`, after CLAUDE.md write:

```typescript
  if (existsSync(REVIEW_SRC)) {
    writeGenerated(
      REVIEW_OUT,
      renderReviewDoc(readFileSync(REVIEW_SRC, "utf8")),
      results
    );
  }
```

- [ ] **Step 2: Update doctor.ts**

Import `lintDomainKnowledgeInfra`, `REVIEW_SRC`, `REVIEW_OUT`, `renderReviewDoc`, `readFileSync`, `existsSync` as needed.

In `main`, after skill/agent lint, also push structure issues:

```typescript
  const lintIssues = [
    ...lintSkillsDir(),
    ...lintAgentDefinitionsDir(),
    ...lintDomainKnowledgeInfra()
  ];
```

**Note:** `lintDomainKnowledgeInfra` calls `discoverSkills` which throws if a skill is broken. Prefer calling structure lint only when skill lint has no errors, similar to `lintGuideSkillList`:

```typescript
  const lintIssues = [...lintSkillsDir(), ...lintAgentDefinitionsDir()];
  let lintErrors = lintIssues.filter((issue) => issue.level === "error");
  // ...
  if (lintErrors.length === 0) {
    lintIssues.push(
      ...lintGuideSkillList(
        readGuideSource(),
        skills.map((skill) => skill.name)
      ),
      ...lintDomainKnowledgeInfra()
    );
    lintErrors = lintIssues.filter((issue) => issue.level === "error");
  }
```

Shared docs status block — add:

```typescript
  console.log(`  ${passIcon(installed("REVIEW.md"))}  REVIEW.md`);
```

In `computeSharedDrift`, add expected entry when source exists:

```typescript
  if (existsSync(REVIEW_SRC)) {
    expectedAgents.push({
      label: "REVIEW.md",
      path: REVIEW_OUT,
      content: renderReviewDoc(readFileSync(REVIEW_SRC, "utf8"))
    });
  }
```

(Or a separate array merge — keep types consistent with existing `{ label, path, content }` loop.)

- [ ] **Step 3: Run unit tests + typecheck**

Run:

```bash
pnpm ai:test
pnpm ai:typecheck
```

Expected: PASS (doctor/install may still fail until content tasks land — that is OK until Task 4+).

- [ ] **Step 4: Commit**

```bash
git add .ai/install.ts .ai/doctor.ts
git commit -m "feat(ai): install REVIEW.md and enforce domain-knowledge structure in doctor"
```

---

### Task 4: Canonical `.ai/review.md` (G1–G10 checklist)

**Files:**
- Create: `.ai/review.md`

- [ ] **Step 1: Create the full checklist source**

Create `.ai/review.md` with exactly these `##` headings (doctor-enforced) and concise bullets (rule → pointer). Full content:

```markdown
# Review Checklist

Shared contract for humans and agents reviewing changes in this repository.
Canonical source: `.ai/review.md`. Installed output: `REVIEW.md` (run `pnpm ai:install`).
Use skill `kaine-review` for method and severity ordering; this file is the **what must be true** checklist.

## Correctness

- [ ] Behavior matches the request; no unrelated refactors or speculative features (`MONOREPO_GUIDE.md`, `.ai/guide.md` Working Rules).
- [ ] Edge cases for auth, empty states, and error paths are handled where the change touches them.
- [ ] No silent swallowing of errors that should surface to the user or logs.

## Security, Auth & Tenancy

- [ ] Organization-scoped data uses **Authenticated Organization Scope** / active organization from session — never a client-supplied organization id for scoped reads/writes (`CONTEXT.md`, `MONOREPO_GUIDE.md`).
- [ ] Authorization and membership checks remain correct for the touched paths.
- [ ] No secrets, tokens, or `.ai.local/` material committed; MCP config uses placeholders only (`SECURITY.md`, `.ai/guide.md`).
- [ ] CORS / trusted origins and cookie/session assumptions stay consistent with `@repo/auth` (ADR 0008).
- [ ] File/attachment access remains organization-scoped when relevant.

## Architecture & Boundaries

- [ ] Imports use `@repo/*` public exports only — no deep/internal package paths (`MONOREPO_GUIDE.md`).
- [ ] Feature code follows FDD naming: `{feature}.{purpose}.ts(x)` under feature folders.
- [ ] Web/desktop UI uses `@repo/ui`; React Native uses `@repo/mobile-ui` — no cross-imports.
- [ ] Changes stay within package boundaries; shared logic lives in the correct `@repo/*` package.
- [ ] Template changes avoid downstream product-specific assumptions (`CONTRIBUTING.md`).

## Data & GraphQL

- [ ] Schema/validators/types for persistence live in `@repo/db` when data shape changes.
- [ ] GraphQL SDL/resolvers/adapters follow feature layout; registry updated when adding features.
- [ ] Operations edited at source; `pnpm generate` run; generated GraphQL outputs not hand-edited.
- [ ] Organization scoping enforced in resolvers/adapters for tenant data.

## UI & i18n

- [ ] Styling is token-only (`--ds-*` via repo Tailwind utilities); no raw colors/spacing hacks (`DESIGN_SYSTEM.md`).
- [ ] User-facing strings live in translation JSON and are accessed via i18n helpers (`@repo/translation`).
- [ ] Accessibility and component patterns match `DESIGN_SYSTEM.md` for the surface (web vs mobile).

## Quality Gates

- [ ] Tests cover new or changed behavior at the nearest useful layer; risky auth/tenancy/GraphQL paths have tests.
- [ ] No new `any`; prefer precise types or `unknown` with narrowing.
- [ ] Relevant checks run (workspace test/typecheck; root `pnpm check` for broad changes; e2e for user-visible web/API flows).
- [ ] Changesets included for releasable `apps/**`, `packages/**`, `tooling/**` changes unless `release:skip-changeset`.

## Domain Language

- [ ] Public names (types, APIs, UI copy keys, issue text) use `CONTEXT.md` terms (**Organization**, **Active Organization**, **Invitation**, etc.) and avoid listed synonyms.
- [ ] New durable concepts are added to `CONTEXT.md` (and ADRs when architectural) rather than left only in chat or PR comments.
- [ ] No contradiction of accepted ADRs under `docs/adr/` without calling it out explicitly.

## Template & AI Hygiene

- [ ] Assistant guidance edited only under `.ai/`; then `pnpm ai:install` and `pnpm ai:doctor` (`MONOREPO_GUIDE.md` §18).
- [ ] Generated agent files (`AGENTS.md`, `CLAUDE.md`, `REVIEW.md`, `.serena/*`, local skill installs) not hand-edited.
- [ ] Deployable app changes on `main` consider `pnpm release:apps` / Dockerfile contracts.
- [ ] Domain review rejections or repeated agent mistakes are promoted via `kaine-encode-knowledge` (lint/test/REVIEW/skill/CONTEXT) rather than one-off re-prompts only.
```

- [ ] **Step 2: Do not run full doctor yet** if day-one/encode skill still missing — optional smoke: unit test `lintReviewSource` against file content.

Run:

```bash
pnpm exec tsx -e "
import { readFileSync } from 'node:fs';
import { lintReviewSource, REVIEW_SRC } from './.ai/ai.util.ts';
const issues = lintReviewSource(readFileSync(REVIEW_SRC,'utf8'));
console.log(issues);
process.exit(issues.length ? 1 : 0);
"
```

Expected: exit 0, empty issues array.

- [ ] **Step 3: Commit**

```bash
git add .ai/review.md
git commit -m "docs(ai): add canonical REVIEW checklist covering template failure modes"
```

---

### Task 5: `kaine-encode-knowledge` skill

**Files:**
- Create: `.ai/skills/kaine-encode-knowledge.md`

- [ ] **Step 1: Create the skill**

```markdown
---
name: kaine-encode-knowledge
description: Promote a repeated review rejection or agent mistake into durable infrastructure (lint, test, REVIEW, skill, CONTEXT, or docs) so the class of issue stops being one-off busywork.
argument-hint: failure mode, PR feedback, or recurring mistake
---

# Encode Domain Knowledge

Use this skill when:

- Code review rejected a change for a **domain or template** reason (wrong framework, missing org scope, wrong package boundary, missing i18n, etc.).
- An agent fixed the same class of issue more than once in a session or across PRs.
- A contributor had to learn something from a human that is not in REVIEW, CONTEXT, skills, or tests.

Do **not** use this skill for one-off product bugs with no reuse; fix those directly.

## Goal

Move knowledge from heads and chat into infrastructure, preferring the strongest automation that still fits:

1. **Machine check** (existing ESLint/type/test/CI gate) — if the failure is already expressible and a gap is proven.
2. **New focused test** — when behavior/regression can be asserted without a new framework.
3. **REVIEW.md checklist item** — when humans/agents must judge context (edit `.ai/review.md`, then `pnpm ai:install`).
4. **Skill or guide rule** — when the workflow is procedural (multi-step how-to).
5. **CONTEXT.md / ADR** — when the issue is vocabulary or an architectural decision.
6. **Serena memory** — only for stable, cross-session project facts that complement (not replace) the above.

Prefer encoding **once** over re-prompting agents to rediscover the rule.

## Workflow

1. **State the failure mode** in one sentence (what went wrong, who caught it, how often).
2. **Classify** using the ladder above. If two levels fit, pick the higher (more automatic) one that is still honest.
3. **Find the canonical home** (do not edit generated outputs):
   - Review bullets → `.ai/review.md`
   - Agent always-on rules → `.ai/guide.md`
   - Workflows → `.ai/skills/kaine-*.md` or product skills (see `docs/agents/skill-authoring.md`)
   - Vocabulary → `CONTEXT.md`
   - Architecture decisions → `docs/adr/`
   - Tests → nearest workspace test file
4. **Implement the smallest encoding** that would have caught or prevented the failure.
5. **Install and verify** when `.ai/` changed:

```bash
pnpm ai:install
pnpm ai:doctor
```

6. **Point the original fix PR** at the new encoding (checklist item, test name, or skill) so review can confirm the loop closed.
7. If only a residual gap remains (needs a large new linter), add a line to `docs/agents/automation-gap-audit.md` instead of inventing speculative infra.

## Output

End with:

- Failure mode (one line)
- Chosen rung on the ladder and why
- Files changed
- Commands run and results
- Whether a residual audit line was added
```

- [ ] **Step 2: Commit**

```bash
git add .ai/skills/kaine-encode-knowledge.md
git commit -m "feat(ai): add kaine-encode-knowledge promotion skill"
```

---

### Task 6: Update `kaine-review` and `kaine-sync-docs`

**Files:**
- Modify: `.ai/skills/kaine-review.md`
- Modify: `.ai/skills/kaine-sync-docs.md`

- [ ] **Step 1: Replace `kaine-review` body** so it references REVIEW and encode skill

```markdown
---
name: kaine-review
description: Perform code-review style analysis focused on bugs, regressions, missing tests, security, and template-rule violations.
argument-hint: diff, branch, PR, or path
---

# Review Workflow

Use this skill when asked to review code or assess a patch.

## Contract

- Apply the checklist in **`REVIEW.md`** (canonical source `.ai/review.md`). That file is the shared human/agent contract for what must be true.
- Use the priorities below for **ordering and severity**, not as a replacement for the checklist.
- If the same domain rejection will recur, recommend `kaine-encode-knowledge` instead of only requesting a one-off fix.

## Review Priorities

Findings should lead the response, ordered by severity:

- Correctness bugs and regressions.
- Security issues, especially auth, CORS, secrets, tenancy, and file access.
- Missing organization scoping or authorization.
- Missing tests for risky behavior.
- GraphQL schema/codegen drift.
- TypeScript looseness, especially `any`.
- Unnecessary complexity, scope creep, or speculative abstractions beyond what was requested.
- UI violations of `DESIGN_SYSTEM.md`, including hardcoded styles or untranslated strings.
- Template-specific mistakes that would leak project-specific assumptions downstream.
- Domain language drift vs `CONTEXT.md`.

## Method

- Read the diff and surrounding code.
- Walk `REVIEW.md` sections relevant to the diff (skip unrelated sections briefly).
- Verify assumptions against `MONOREPO_GUIDE.md`, `DESIGN_SYSTEM.md`, and `CONTEXT.md`.
- Reference exact files and tight line ranges.
- Do not spend review budget on harmless style unless it can hide a bug.
- If no issues are found, say so and mention residual test gaps.
```

- [ ] **Step 2: Update `kaine-sync-docs`**

In Workflow step 1 and Installed Outputs, include review:

- Canonical: `.ai/review.md`
- Installed: `REVIEW.md`

Example installed list addition:

```markdown
- `REVIEW.md`
```

And step 1:

```markdown
1. Read `.ai/guide.md`, `.ai/review.md`, `.ai/skills/`, `.ai/mcp.json`, `.ai/cursor-rules.md`, `.ai/serena-project.yml`, and `.ai/serena-memories/` as needed.
```

- [ ] **Step 3: Commit**

```bash
git add .ai/skills/kaine-review.md .ai/skills/kaine-sync-docs.md
git commit -m "feat(ai): bind kaine-review and sync-docs to REVIEW contract"
```

---

### Task 7: Guide philosophy, required reading, skill list, canonical sources

**Files:**
- Modify: `.ai/guide.md`

- [ ] **Step 1: Update Required Reading**

After existing bullets, add:

```markdown
- Read `CONTEXT.md` before naming domain concepts or shaping organization-scoped APIs.
- Read `REVIEW.md` before reviewing code or when acting as a reviewer (canonical source `.ai/review.md`).
- Read `docs/agents/day-one.md` when contributing with an agent for the first time or with little repo context.
```

- [ ] **Step 2: Add philosophy section** (place after Working Rules or before AI Skills — prefer immediately before `## AI Skills`)

```markdown
## Domain Knowledge as Infrastructure

Agents and day-one contributors move faster when domain knowledge is encoded as infrastructure, not left in heads or chat.

- Prefer encoding a class of mistake once (test, REVIEW item, skill, guide rule, CONTEXT/ADR) over re-fixing it every session.
- After a domain or template review rejection, run or follow `kaine-encode-knowledge` so the next person does not hit the same wall.
- Required shared contract for reviews: `REVIEW.md` (from `.ai/review.md`).
- Product-specific workflows belong in skills (see `docs/agents/skill-authoring.md`); keep `kaine-*` for template-wide skills.
- Hard automation (new lint/CI) is best when the failure mode is proven and machine-checkable; until then, checklist and tests are valid infrastructure.
- See ADR 0009 for the decision record.
```

- [ ] **Step 3: Update skill list** under “Use skills when they match the task:”

Add (alphabetically or after review):

```markdown
- `kaine-encode-knowledge`: promote repeated review/agent failures into durable infra (lint, test, REVIEW, skill, CONTEXT).
```

Keep the list complete and matching every file in `.ai/skills/` (doctor `lintGuideSkillList`).

- [ ] **Step 4: Update canonical sources sentence**

Include `.ai/review.md`:

```markdown
Canonical AI sources are `.ai/guide.md`, `.ai/review.md`, `.ai/skills/*.md`, `.ai/mcp.json`, `.ai/cursor-rules.md`, `.ai/serena-project.yml`, and `.ai/serena-memories/*.md`.
```

- [ ] **Step 5: Commit**

```bash
git add .ai/guide.md
git commit -m "docs(ai): document domain-knowledge loop and REVIEW in guide"
```

---

### Task 8: ADR 0009

**Files:**
- Create: `docs/adr/0009-domain-knowledge-as-agent-infra.md`
- Modify: `docs/README.md` (Architecture Decisions list)

- [ ] **Step 1: Write the ADR**

```markdown
# ADR 0009: Domain Knowledge as Agent Infrastructure

- Status: Accepted
- Date: 2026-07-22

## Context

High-leverage engineering has long meant automating work: editor tooling, lint rules, tests, and encoded conventions. Agent-assisted development raises the stakes: every missing rule is paid not only by humans but by every agent session in tokens and missed cases. Domain knowledge that lives only in people's heads blocks day-one contributors and causes review rejections for "not how we do things here."

Kaine Forge already ships an AI scaffold (`.ai/guide.md`, skills, Serena memories, `pnpm ai:install` / `pnpm ai:doctor`). Gaps remained: no first-class shared review contract, no explicit promotion ladder from repeated failures to durable infra, and doctor checks that validated file drift more than domain-knowledge structure.

## Decision

Treat domain knowledge as infrastructure for humans and agents:

1. **Review contract:** Canonical `.ai/review.md` installs to tracked root `REVIEW.md`. `kaine-review` is the review *method*; REVIEW is the shared checklist.
2. **Promotion ladder:** Skill `kaine-encode-knowledge` walks failure mode → test/lint/REVIEW/skill/CONTEXT/ADR encoding.
3. **Structure gates:** `pnpm ai:doctor` fails CI on missing or malformed canonical structure (REVIEW source and required headings, CONTEXT required sections, encode skill present, kaine-review references REVIEW, day-one ramp docs, required Serena memories). Installed `REVIEW.md` drift remains advisory like other generated shared files.
4. **Day-one ramp:** `docs/agents/day-one.md` plus a short CONTRIBUTING section so agent-assisted contributors have a zero-extra-context path.
5. **Hard automation:** Prefer machine checks when failure modes are proven; do not invent speculative linters. Residual gaps live in `docs/agents/automation-gap-audit.md`.

## Alternatives Considered

- Review skill only (no REVIEW.md): rejected — humans and non-Claude tools miss the contract; essay and ramp fail.
- Root-only REVIEW without install/doctor: rejected — drifts from the template's canonical `.ai/` model.
- Automation-debt issue tracker as product: rejected — process overhead for a template; skills + audit doc suffice.
- Doctor thinness heuristics (line counts): rejected — noisy false positives.

## Consequences

- Pros:
  - agents and humans share one review contract
  - repeated domain failures have a named encode path
  - CI blocks silent rot of required agent artifacts
  - adopters inherit the loop via template sources
- Cons:
  - more canonical AI surface area to maintain
  - CONTRIBUTING/day-one/REVIEW must stay aligned when rules change
  - structure checks do not guarantee prose quality of checklist items
```

- [ ] **Step 2: Index in `docs/README.md`**

Under Architecture Decisions:

```markdown
- `adr/0009-domain-knowledge-as-agent-infra.md`: encode domain knowledge as agent/review infrastructure.
```

Under AI Assistant Docs, add:

```markdown
- `../.ai/review.md`: generated into root `REVIEW.md` review checklist.
- `agents/day-one.md`: day-one agent-assisted contribution ramp.
- `agents/skill-authoring.md`: how to add product-specific skills.
- `agents/automation-gap-audit.md`: residual automation opportunities.
```

- [ ] **Step 3: Commit**

```bash
git add docs/adr/0009-domain-knowledge-as-agent-infra.md docs/README.md
git commit -m "docs(adr): accept domain knowledge as agent infrastructure"
```

---

### Task 9: Day-one ramp + skill-authoring docs

**Files:**
- Create: `docs/agents/day-one.md`
- Create: `docs/agents/skill-authoring.md`
- Modify: `docs/agents/domain.md`

- [ ] **Step 1: Write `docs/agents/day-one.md`**

Keep ≤ ~150 lines. Required content outline:

```markdown
# Day-one Agent-Assisted Contribution

This ramp is for engineers and non-engineers contributing with a coding agent when they do not yet hold the repo in their head. Encoded infrastructure — not chat memory — is the source of truth.

## 1. Install assistant files

```bash
pnpm ai:install
# or full bootstrap: pnpm quick-setup (needs Docker services)
```

## 2. Health check

```bash
pnpm ai:doctor
```

Fix lint errors on canonical `.ai/` sources before coding. Drift warnings: re-run `pnpm ai:install`.

## 3. Read order (minimum)

1. `CONTEXT.md` — domain vocabulary
2. `REVIEW.md` — what reviews will enforce
3. `MONOREPO_GUIDE.md` — architecture and package rules
4. `DESIGN_SYSTEM.md` — only if the change touches UI

Optional: `docs/adr/` for decisions in the area you touch; `docs/agents/domain.md` for how agents consume domain docs.

## 4. Prefer skills over freeform

| Job | Skill |
|-----|--------|
| Tests | `kaine-test` |
| Review | `kaine-review` |
| PR | `kaine-open-pr` |
| Encode a repeated failure | `kaine-encode-knowledge` |
| Sync AI files | `kaine-sync-docs` |
| Rebase / CI / release | `kaine-rebase`, `kaine-fix-ci`, `kaine-release-apps` |

Product-specific skills: see `docs/agents/skill-authoring.md`.

## 5. Validation tiers

| Change type | Minimum checks |
|-------------|----------------|
| Docs / `.ai/` only | `pnpm ai:doctor`, `pnpm format:check` |
| Package/app code | `pnpm check` (or focused workspace test + typecheck); `pnpm build:core` if API/web runtime |
| User-visible web/API flows | add `pnpm test:e2e` when appropriate |

## 6. When review bounces for "how we do things"

Do not only re-prompt. Run **`kaine-encode-knowledge`** so the rule becomes REVIEW/skill/test/CONTEXT for the next contributor.

## 7. What this ramp is not

Encoded context multiplies agents and people; it does not remove the need for judgment, security care, or running the checks above.
```

- [ ] **Step 2: Write `docs/agents/skill-authoring.md`**

Cover:

- Canonical location: `.ai/skills/<name>.md`
- Team/template skills: `kaine-` prefix; product skills may use product prefix but installer only auto-manages `kaine-*` in some agent paths — document current rule: **canonical skills in `.ai/skills` must use `kaine-` prefix** (enforced by discoverSkills). Product forks either add `kaine-*` template skills or local non-canonical skills in agent dirs (not in `.ai/skills`).
- Frontmatter: `name`, `description`, optional `argument-hint`, `agents`, etc. (mirror an existing skill)
- After add: list skill in `.ai/guide.md` skill list; `pnpm ai:install`; `pnpm ai:doctor`
- Prefer `kaine-encode-knowledge` to decide whether a skill is the right rung vs REVIEW/test

Be accurate to `parseSkillFile` / `KAINE_PREFIX` enforcement: **files under `.ai/skills/` must be `kaine-*`**. Downstream product workflows that are template-wide still use `kaine-` or live only in local agent skill dirs. State this clearly so adopters do not create non-prefixed files under `.ai/skills/`.

- [ ] **Step 3: Update `docs/agents/domain.md`**

In “Before exploring, read these”, add:

```markdown
- **`REVIEW.md`** for the shared review checklist (canonical `.ai/review.md`).
```

- [ ] **Step 4: Commit**

```bash
git add docs/agents/day-one.md docs/agents/skill-authoring.md docs/agents/domain.md
git commit -m "docs(agents): add day-one ramp and skill-authoring guide"
```

---

### Task 10: CONTRIBUTING day-one section + AI file list

**Files:**
- Modify: `CONTRIBUTING.md`

- [ ] **Step 1: Add section after “AI Assistant Files” (or before Pull Requests)**

Exact heading text must include marker **`Day-one agent ramp`** (doctor-enforced):

```markdown
## Day-one agent ramp

If you (or an agent) are new to this repo:

1. `pnpm ai:install` then `pnpm ai:doctor`
2. Read `CONTEXT.md` → `REVIEW.md` → `MONOREPO_GUIDE.md` (and `DESIGN_SYSTEM.md` for UI)
3. Prefer skills (`kaine-test`, `kaine-review`, `kaine-open-pr`, `kaine-encode-knowledge`) over freeform prompts for known workflows
4. Full walkthrough: `docs/agents/day-one.md`

When review rejects a change for domain or template reasons, use `kaine-encode-knowledge` so the rule is encoded for the next contributor.
```

- [ ] **Step 2: Extend AI Assistant Files list**

- Canonical: `.ai/review.md`
- Tracked output: `REVIEW.md`

- [ ] **Step 3: Commit**

```bash
git add CONTRIBUTING.md
git commit -m "docs: add day-one agent ramp to CONTRIBUTING"
```

---

### Task 11: Consistency pass (MONOREPO_GUIDE, Serena, task completion)

**Files:**
- Modify: `MONOREPO_GUIDE.md` §18
- Modify: `.ai/serena-memories/task_completion_checklist.md`
- Modify: `.ai/serena-memories/quality_expectations.md`
- Modify: `.ai/serena-memories/coding_standards.md` (light pointer only)
- Modify: `.ai/serena-memories/domain_overview.md` (pointer to CONTEXT + REVIEW if missing)

- [ ] **Step 1: MONOREPO_GUIDE §18**

Add to canonical sources:

```markdown
- `.ai/review.md`
```

Add to tracked shared outputs:

```markdown
- `REVIEW.md`
```

Optional one-liner under the section:

```markdown
Shared review contract: `REVIEW.md`. Promote repeated domain failures with skill `kaine-encode-knowledge` (ADR 0009).
```

- [ ] **Step 2: task_completion_checklist.md**

Add bullets:

```markdown
- For reviews, apply `REVIEW.md` (from `.ai/review.md`).
- After domain/template review rejections, prefer `kaine-encode-knowledge` over one-off re-prompts only.
```

- [ ] **Step 3: quality_expectations.md**

Add:

```markdown
- Review changes against `REVIEW.md` as well as tests and CI.
- Domain vocabulary must match `CONTEXT.md`.
```

- [ ] **Step 4: coding_standards.md**

Add under Technical Standards:

```markdown
- Treat repeated template/domain mistakes as encode candidates (`kaine-encode-knowledge`), not only chat corrections.
```

- [ ] **Step 5: Commit**

```bash
git add MONOREPO_GUIDE.md .ai/serena-memories/
git commit -m "docs: align guide surfaces and Serena memories with REVIEW encode loop"
```

---

### Task 12: Residual automation gap audit

**Files:**
- Create: `docs/agents/automation-gap-audit.md`

- [ ] **Step 1: Write the audit** after a real pass over existing gates

Run a lightweight audit while writing (implementer should verify each row against the repo):

```bash
# examples of evidence gathering
rg "organizationId" apps/api/src --glob '*.ts' -n | head
rg "from \"@repo/" packages apps --glob '*.ts' -n | head
ls packages/ui/src/styles/design-system.contract.test.ts
```

Document residual gaps **without implementing new linters**, for example:

```markdown
# Automation Gap Audit

Snapshot of template rules that are encoded as docs/REVIEW/skills but not fully machine-checked.
Update when a gap is closed or a new proven failure mode appears.
Last reviewed: 2026-07-22 (ADR 0009 work).

| Gap | Encoded today | Residual risk | Candidate future check |
|-----|---------------|---------------|------------------------|
| Client-supplied org id on scoped APIs | REVIEW, CONTEXT, tests on some resolvers | New resolvers may forget | Shared test helper / lint for resolver context usage |
| Deep `@repo/*/internal` imports | REVIEW, package exports | Depends on package `exports` field strictness | ESLint `no-restricted-imports` if patterns emerge |
| Hand-edited GraphQL generated files | REVIEW, generate workflow | Possible in PRs | CI diff check on generated paths |
| Hardcoded UI colors | DESIGN_SYSTEM contract test (partial), REVIEW | Non-token styles outside tested surfaces | Expand contract tests |
| Untranslated user strings | REVIEW | Easy to miss in new components | i18n lint if noise is tolerable |
| Agent guide/skill drift | ai:doctor | Covered for structure | — |
| REVIEW prose quality | Human maintenance | Stale bullets | Periodic encode-knowledge + audit refresh |

## Closed by this work

- Missing shared REVIEW contract → `.ai/review.md` + install/doctor
- Missing promotion ladder → `kaine-encode-knowledge`
- Missing day-one agent ramp → `docs/agents/day-one.md` + CONTRIBUTING
- Doctor silent on domain-knowledge structure → `lintDomainKnowledgeInfra`
```

Adjust rows to match what the implementer actually finds; do not invent claims without evidence.

- [ ] **Step 2: Commit**

```bash
git add docs/agents/automation-gap-audit.md
git commit -m "docs(agents): record residual automation gaps after encode-infra pass"
```

---

### Task 13: Template adoption target

**Files:**
- Modify: `.ai/template-adoption.util.ts`
- Modify: `.ai/template-adoption.util.spec.ts`

- [ ] **Step 1: Write failing test**

```typescript
expect(adoptionTargets).toContain(".ai/review.md");
expect(adoptionTargets).not.toContain("REVIEW.md");
```

- [ ] **Step 2: Run test — expect FAIL**

Run: `pnpm ai:test -- adoptionTargets`

- [ ] **Step 3: Add to `adoptionTargets` array** near `.ai/guide.md`:

```typescript
  ".ai/review.md",
```

Also add if they contain template identity strings and should rename on adopt (optional, only if content has "Kaine Forge"):

```typescript
  "docs/agents/day-one.md",
  "docs/adr/0009-domain-knowledge-as-agent-infra.md",
```

Prefer including day-one + ADR 0009 if they mention Kaine Forge (they do).

- [ ] **Step 4: Run tests — PASS**

- [ ] **Step 5: Commit**

```bash
git add .ai/template-adoption.util.ts .ai/template-adoption.util.spec.ts
git commit -m "feat(ai): include review and agent docs in template adoption targets"
```

---

### Task 14: Install generated outputs + full verification

**Files:**
- Generate/update: `REVIEW.md`, `AGENTS.md`, `CLAUDE.md`, `.serena/memories/*` (via install)

- [ ] **Step 1: Install**

```bash
pnpm ai:install --non-interactive
```

Expected: `REVIEW.md` created/updated; AGENTS includes new skill index entry and guide section.

- [ ] **Step 2: Doctor green on structure**

```bash
pnpm ai:doctor
```

Expected: no lint errors; structure checks pass. Drift only if local agent skill dirs stale (advisory).

- [ ] **Step 3: Full AI package checks**

```bash
pnpm ai:test
pnpm ai:typecheck
pnpm ai:lint
```

Expected: all pass.

- [ ] **Step 4: Format**

```bash
pnpm format:check
```

If needed: `pnpm format` on touched markdown/ts.

- [ ] **Step 5: Commit generated tracked outputs**

```bash
git add REVIEW.md AGENTS.md CLAUDE.md .serena/
git status
git commit -m "chore(ai): install REVIEW and regenerate assistant outputs"
```

- [ ] **Step 6: Optional broader check** (if time; docs-only change may skip build)

```bash
pnpm check
```

Expected: pass, or note failures unrelated to this work.

---

### Task 15: Final consistency self-check

**Files:** none new — verification only

- [ ] **Step 1: Verify doctor R1–R8 mentally against repo**

| ID | Check | Command / evidence |
|----|--------|-------------------|
| R1 | `.ai/review.md` + install REVIEW | `test -f .ai/review.md && test -f REVIEW.md` |
| R2 | Required headings | `pnpm ai:doctor` |
| R3 | CONTEXT shape | already valid; doctor |
| R4 | Guide skill list | doctor lintGuideSkillList |
| R5 | encode skill | `test -f .ai/skills/kaine-encode-knowledge.md` |
| R6 | kaine-review references REVIEW | `rg 'REVIEW' .ai/skills/kaine-review.md` |
| R7 | Serena set | doctor |
| R8 | day-one + CONTRIBUTING marker | `rg 'Day-one agent ramp' CONTRIBUTING.md` |

- [ ] **Step 2: Confirm adoption does not list installed REVIEW.md**

```bash
rg 'REVIEW.md' .ai/template-adoption.util.ts
```

Expected: only `.ai/review.md` in targets, not root `REVIEW.md`.

- [ ] **Step 3: No further commit unless fixes needed**

If fixes: small follow-up commit with message describing the fix.

---

## Self-Review (plan author)

**1. Spec coverage (locked grill decisions)**

| Decision | Tasks |
|----------|-------|
| Full B + C | Tasks 4–12 content/B; 1–3,5–7,9–10,13 machinery/C |
| REVIEW install B+D | Tasks 1,3,4,6 |
| encode skill + doctor structure | Tasks 2,3,5 |
| R1–R8 lint errors; REVIEW drift advisory | Tasks 2–3 |
| Headings C hybrid | Tasks 1–2,4 |
| G1–G10 in REVIEW | Task 4 |
| B = compile + consistency + gap audit | Tasks 4,11,12 |
| Day-one E | Tasks 9–10 |
| Skill authoring doc only | Task 9 |
| ADR + guide philosophy | Tasks 7–8 |
| Adoption source only | Task 13 |
| Hard automation only if proven | Task 12 (document only) |

**2. Placeholder scan:** No TBD/TODO steps; REVIEW and skill bodies fully specified.

**3. Type consistency:** `renderReviewDoc`, `lintDomainKnowledgeInfra`, `lintDomainKnowledgeArtifacts`, `REVIEW_SRC`/`REVIEW_OUT`, `DAY_ONE_CONTRIBUTING_MARKER` used consistently across tasks.

**4. Note for implementers:** Until Tasks 4–10 land, `pnpm ai:doctor` will fail structure checks after Task 3 by design. Prefer finishing content tasks before relying on doctor green, or implement Tasks 4–10 before wiring doctor if you need green CI on an intermediate branch (alternative order: 1→2→4→5→6→7→9→10→11→3→13→12→14→15). **Recommended order if CI must stay green:** complete content files (4–11) before Task 3 doctor wiring, or land machinery + content in one PR without pushing intermediate red doctor commits.

**CI-safe reorder (optional):** Tasks 1–2 → 4–11 → 5–6 already nested → 3 → 13 → 12 → 14–15.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-22-domain-knowledge-as-agent-infra.md`.

**Two execution options:**

1. **Subagent-Driven (recommended)** — dispatch a fresh subagent per task, review between tasks, fast iteration. Required sub-skill: `superpowers:subagent-driven-development`.
2. **Inline Execution** — execute tasks in this session with `superpowers:executing-plans`, batch execution with checkpoints.

**Which approach?**
