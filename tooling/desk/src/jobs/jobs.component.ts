import type { ComponentJobResult, ComponentPlan, ComponentSpec } from "../contracts";
import { componentFileName, componentFiles } from "./jobs.permissions";

/**
 * The component job: plan one new `@repo/ui` component, wait for the owner, build it with its
 * test and a lab specimen, and open a draft PR. Its prompts, checks, changeset, and PR.
 */

/**
 * The names a module's source exports: declarations (`export function Card`) and export lists,
 * by their exported name (`export { useForm as useUiForm }` gives `useUiForm`).
 */
export const exportedNames = (source: string): string[] => {
  const names: string[] = [];
  const declaration =
    /^export\s+(?:declare\s+)?(?:default\s+)?(?:async\s+)?(?:abstract\s+)?(?:const|let|var|function\*?|class|interface|type|enum)\s+([A-Za-z_$][\w$]*)/gm;
  for (const match of source.matchAll(declaration))
    if (match[1] !== undefined) names.push(match[1]);
  for (const match of source.matchAll(/export\s+(?:type\s+)?\{([^}]*)\}/g)) {
    for (const entry of (match[1] ?? "").split(",")) {
      const name = entry
        .trim()
        .replace(/^type\s+/, "")
        .split(/\s+as\s+/)
        .at(-1)
        ?.trim();
      if (name !== undefined && name !== "") names.push(name);
    }
  }
  return names;
};

/** The lab route of a component's specimen. */
export const specimenRoute = (component: ComponentSpec): string =>
  `#/specimens/${componentFileName(component.name)}`;

const ownerNotes = (note: string, feedback: readonly string[]): string[] => [
  `Owner note: ${note.trim() === "" ? "none" : note.trim()}`,
  ...(feedback.length === 0
    ? []
    : [
        "",
        "The owner sent the last result back from a gate. Address every note, newest last:",
        ...feedback.map((entry) => `- ${entry}`)
      ])
];

export const componentPlanPrompt = (input: {
  readonly component: ComponentSpec;
  readonly note: string;
  readonly feedback: readonly string[];
}): string => {
  const { component } = input;
  return [
    `You are the agent desk's component job, plan step. Plan the new @repo/ui component ${component.name} in packages/ui/src/components/${component.layer}/.`,
    "",
    "Call the Skill tool with kaine-build-ui first. Read DESIGN_SYSTEM.md (section 11 lists every component and its options), docs/ui/guidelines.md, and the components it would sit beside.",
    "",
    "- Reuse before you build: when an existing component or one of its options already covers the need, say so in openQuestions and plan only what is missing.",
    "- Plan the exported props and variants (api), the components and tokens it builds on (reuse), and what its tests prove (tests). Styling is token-only, strings come in as props, and it is accessible with the keyboard and a screen reader.",
    "- Write nothing in this step. The owner approves the plan before the build starts.",
    "",
    ...ownerNotes(input.note, input.feedback)
  ].join("\n");
};

export const componentBuildPrompt = (input: {
  readonly component: ComponentSpec;
  readonly plan: ComponentPlan;
  readonly labUrl: string;
  readonly note: string;
  readonly feedback: readonly string[];
}): string => {
  const { component } = input;
  const [source, test, index, specimen] = componentFiles(component);
  const file = componentFileName(component.name);
  return [
    `You are the agent desk's component job, build step. Build the @repo/ui component ${component.name} as the owner approved it.`,
    "",
    "Call the Skill tool with kaine-build-ui first, and with kaine-test before you write the test.",
    "",
    "The approved plan:",
    JSON.stringify(input.plan, null, 2),
    "",
    `- Write only these files: ${source}, ${test}, ${index} (add the export in its place), ${specimen}, and DESIGN_SYSTEM.md (add the component and its options to section 11). The desk writes the changeset.`,
    `- The specimen exports \`specimen: LabSpecimen\` (from "../lab.registry") with id "${file}", title "${component.name}", and a Component that shows each variant and state.`,
    `- The job's lab server runs for you. The specimen is at ${input.labUrl}${specimenRoute(component)}. Look at it with the Playwright browser tools in light and dark mode, and with the keyboard.`,
    "- Before you answer, run `pnpm --filter @repo/ui test`, `pnpm --filter @repo/ui lint`, `pnpm --filter @repo/ui typecheck`, `pnpm --filter @repo/desk-ui typecheck`, and `pnpm ui:check`, and fix what fails in your files.",
    "- You may start subagents with the Agent tool, for example to audit the specimen with kaine-audit-ui. They have your permissions.",
    "- deviations: each place where the build differs from the approved plan, and why.",
    "",
    ...ownerNotes(input.note, input.feedback)
  ].join("\n");
};

/** What the engine runs after the build. Any failure stops the job with its output. */
export const componentChecks = (component: ComponentSpec): readonly (readonly string[])[] => {
  const [source, test] = componentFiles(component);
  const inUi = (entry: string | undefined): string => (entry ?? "").replace(/^packages\/ui\//, "");
  return [
    ["pnpm", "--filter", "@repo/ui", "exec", "vitest", "run", inUi(test)],
    ["pnpm", "--filter", "@repo/ui", "exec", "eslint", inUi(source), inUi(test), "src/index.ts"],
    ["pnpm", "--filter", "@repo/ui", "typecheck"],
    ["pnpm", "--filter", "@repo/desk-ui", "typecheck"],
    ["pnpm", "ui:check"]
  ];
};

/** The changeset the engine writes: a new export is a minor change of `@repo/ui`. */
export const componentChangeset = (
  component: ComponentSpec,
  result: ComponentJobResult
): { readonly path: string; readonly text: string } => ({
  path: `.changeset/ui-${componentFileName(component.name)}.md`,
  text: [
    "---",
    '"@repo/ui": minor',
    "---",
    "",
    `Add the ${component.name} component. ${result.summary.replace(/\s+/g, " ").trim()}`,
    ""
  ].join("\n")
});

export const componentPullRequest = (
  component: ComponentSpec,
  plan: ComponentPlan,
  result: ComponentJobResult
): { readonly title: string; readonly body: string } => ({
  title: `feat(ui): add the ${component.name} component`,
  body: [
    "## Summary",
    "",
    result.summary,
    "",
    `\`${component.name}\` in \`packages/ui/src/components/${component.layer}/\`, with its test, a lab specimen (\`?view=lab${specimenRoute(component)}\`), and its options in \`DESIGN_SYSTEM.md\`.`,
    "",
    "## API",
    "",
    ...plan.api.map((entry) => `- ${entry}`),
    "",
    "## Deviations from the plan",
    "",
    ...(result.deviations.length === 0
      ? ["None."]
      : result.deviations.map((entry) => `- ${entry}`)),
    "",
    "## In plain language",
    "",
    result.plainLanguage
  ].join("\n")
});
