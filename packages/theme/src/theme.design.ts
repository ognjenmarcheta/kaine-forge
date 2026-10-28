import { colorRoles } from "./theme.roles";
import type { ColorRole, ThemeDefinition, TypeStepName } from "./theme.schema";

/**
 * DESIGN.md export. Each theme folder holds a DESIGN.md: hand-written prose in the spec's
 * section order, with a generated YAML front matter and a generated color table. The spec
 * has no color modes, so the front matter carries the light values and the table both.
 */

const TABLE_START = "<!-- theme:build color-table -->";
const TABLE_END = "<!-- /theme:build -->";
const FRONT_MATTER = /^---\n[\s\S]*?\n---\n/;

const typeSteps: readonly TypeStepName[] = [
  "display",
  "heading-xlarge",
  "heading-large",
  "heading-medium",
  "heading-small",
  "heading-xsmall",
  "heading-xxsmall",
  "body-large",
  "body",
  "body-small",
  "body-xsmall",
  "code-small"
];

/** The roles the color table lists, with what each one is for. */
const tableRoles: readonly (readonly [ColorRole, string])[] = [
  ["background-brand-bold", "primary actions and selected fills"],
  ["text-brand-inverse", "text and icons on primary fills"],
  ["text-brand", "brand text and links"],
  ["border-focused", "focus rings"],
  ["surface", "the page"],
  ["surface-sunken", "wells and the sidebar"],
  ["surface-raised", "cards"],
  ["surface-overlay", "menus, popovers, and dialogs"],
  ["text", "body text and headings"],
  ["text-subtle", "secondary text"],
  ["text-subtlest", "metadata and placeholders"],
  ["border", "dividers and card hairlines"],
  ["border-bold", "field borders and other controls (3:1)"],
  ["background-selected", "selected rows and navigation"],
  ["text-success", "success messages"],
  ["text-warning", "warnings"],
  ["text-danger", "errors and destructive actions"],
  ["text-information", "help and neutral notices"]
];

const REFERENCE = /^var\(--ds-([a-z0-9-]+)\)$/;
const colorRoleNames: ReadonlySet<string> = new Set(colorRoles);
const isColorRole = (name: string): name is ColorRole => colorRoleNames.has(name);

/** Follows var(--ds-<token>) through the scale and component tokens to a concrete value. */
function resolveValue(theme: ThemeDefinition, value: string): string {
  const name = REFERENCE.exec(value)?.[1];
  if (name === undefined) return value;

  const scale: Readonly<Record<string, string>> = theme.scale;
  const components: Readonly<Record<string, string>> = theme.components;
  const next = scale[name] ?? components[name];

  return next === undefined ? value : resolveValue(theme, next);
}

/** The first family of a CSS font stack, without quotes. */
function firstFamily(stack: string): string {
  return (stack.split(",")[0] ?? stack).trim().replace(/^["']|["']$/g, "");
}

const quote = (value: string): string => JSON.stringify(value);
const key = (name: string): string => (/^[a-zA-Z][a-zA-Z0-9-]*$/.test(name) ? name : quote(name));

function yamlMap(entries: readonly (readonly [string, string | number])[], indent: string): string {
  return entries
    .map(
      ([name, value]) =>
        `${indent}${key(name)}: ${typeof value === "number" ? value : quote(value)}`
    )
    .join("\n");
}

export function emitDesignFrontMatter(theme: ThemeDefinition): string {
  const light = theme.modes.light;
  const family = (step: TypeStepName): string =>
    firstFamily(resolveValue(theme, theme.scale[`font-family-${theme.type[step].family}`]));
  const lineHeight = (value: string): string | number =>
    /^[\d.]+$/.test(value) ? Number(value) : value;
  const component = (name: string): string => resolveValue(theme, `var(--ds-${name})`);
  const typography = typeSteps
    .map((step) => {
      const { lineHeight: height, size, weight } = theme.type[step];
      return `  ${step}:\n${yamlMap(
        [
          ["fontFamily", family(step)],
          ["fontSize", size],
          ["fontWeight", weight],
          ["lineHeight", lineHeight(height)]
        ],
        "    "
      )}`;
    })
    .join("\n");
  const rounded: [string, string][] = [
    ["sm", theme.scale["radius-050"]],
    ["md", theme.scale["radius-100"]],
    ["lg", theme.scale["radius-200"]],
    ["xl", theme.scale["radius-300"]],
    ["full", theme.scale["radius-pill"]],
    ["button", component("button-radius")],
    ["field", component("field-radius")],
    ["card", component("card-radius")],
    ["overlay", component("overlay-radius")],
    ["dialog", component("dialog-radius")],
    ["badge", component("badge-radius")]
  ];
  const spacing: [string, string][] = [
    ...Object.entries(theme.scale)
      .filter(([name]) => /^space-\d+$/.test(name) && name !== "space-0")
      .map(([name, value]): [string, string] => [name.slice("space-".length), value]),
    ["card-padding", component("card-padding")]
  ];
  const badge = (status: "success" | "warning" | "danger" | "information") => ({
    backgroundColor: `{colors.background-${status}}`,
    textColor: `{colors.text-${status}}`,
    rounded: "{rounded.badge}"
  });
  const components: Record<string, Record<string, string>> = {
    page: { backgroundColor: "{colors.surface}", textColor: "{colors.text}" },
    sidebar: { backgroundColor: "{colors.surface-sunken}", textColor: "{colors.text-subtle}" },
    "button-primary": {
      backgroundColor: "{colors.primary}",
      textColor: "{colors.text-brand-inverse}",
      rounded: "{rounded.button}",
      height: theme.scale["control-medium"]
    },
    "button-primary-hover": { backgroundColor: "{colors.background-brand-bold-hovered}" },
    "button-primary-active": { backgroundColor: "{colors.background-brand-bold-pressed}" },
    "button-danger": {
      backgroundColor: "{colors.background-danger-bold}",
      textColor: "{colors.text-inverse}",
      rounded: "{rounded.button}",
      height: theme.scale["control-medium"]
    },
    "input-field": {
      backgroundColor: "{colors.surface}",
      textColor: "{colors.text}",
      rounded: "{rounded.field}",
      height: theme.scale["control-large"]
    },
    card: {
      backgroundColor: "{colors.surface-raised}",
      textColor: "{colors.text}",
      rounded: "{rounded.card}",
      padding: "{spacing.card-padding}"
    },
    menu: {
      backgroundColor: "{colors.surface-overlay}",
      textColor: "{colors.text}",
      rounded: "{rounded.overlay}"
    },
    dialog: {
      backgroundColor: "{colors.surface-overlay}",
      textColor: "{colors.text}",
      rounded: "{rounded.dialog}"
    },
    "badge-success": badge("success"),
    "badge-warning": badge("warning"),
    "badge-danger": badge("danger"),
    "badge-information": badge("information"),
    "navigation-selected": {
      backgroundColor: "{colors.background-selected}",
      textColor: "{colors.text-selected}"
    },
    link: { textColor: "{colors.link}" },
    metadata: { textColor: "{colors.text-subtlest}" }
  };
  // The palette is every color a component above uses; primary is the brand fill.
  const referenced = new Set(
    Object.values(components).flatMap((props) =>
      Object.values(props).flatMap((value) => /^\{colors\.([a-z-]+)\}$/.exec(value)?.[1] ?? [])
    )
  );
  const colors = [...referenced].map((name): [string, string] => {
    if (name === "primary") return [name, light["background-brand-bold"]];
    if (!isColorRole(name))
      throw new Error(`DESIGN.md component color "${name}" is not a color role`);
    return [name, light[name]];
  });

  return [
    "---",
    "version: alpha",
    `name: ${quote(theme.label)}`,
    `description: ${quote(theme.description)}`,
    "colors:",
    yamlMap(colors, "  "),
    "typography:",
    typography,
    "rounded:",
    yamlMap(rounded, "  "),
    "spacing:",
    yamlMap(spacing, "  "),
    "components:",
    Object.entries(components)
      .map(([name, props]) => `  ${key(name)}:\n${yamlMap(Object.entries(props), "    ")}`)
      .join("\n"),
    "---",
    ""
  ].join("\n");
}

export function emitDesignColorTable(theme: ThemeDefinition): string {
  const rows = tableRoles.map(
    ([role, use]) =>
      `| \`${role}\` | ${use} | \`${theme.modes.light[role]}\` | \`${theme.modes.dark[role]}\` |`
  );

  return [
    TABLE_START,
    "",
    "| Token | Use | Light | Dark |",
    "| --- | --- | --- | --- |",
    ...rows,
    "",
    TABLE_END
  ].join("\n");
}

/** Rewrites the generated parts of a theme's DESIGN.md and keeps its prose. */
export function withDesignTokens(current: string, theme: ThemeDefinition): string {
  const body = current.replace(FRONT_MATTER, "");
  const start = body.indexOf(TABLE_START);
  const end = body.indexOf(TABLE_END);

  if (start < 0 || end < start) {
    throw new Error(`${theme.name} DESIGN.md needs a "${TABLE_START}" ... "${TABLE_END}" region`);
  }

  return (
    emitDesignFrontMatter(theme) +
    body.slice(0, start) +
    emitDesignColorTable(theme) +
    body.slice(end + TABLE_END.length)
  );
}

/** The repository root copy of the default theme's DESIGN.md, with a note on where to edit it. */
export function rootDesignCopy(themeDesign: string, sourcePath: string): string {
  const frontMatter = FRONT_MATTER.exec(themeDesign)?.[0] ?? "";
  const body = themeDesign.slice(frontMatter.length);
  const note = `> Generated from \`${sourcePath}\` by \`pnpm theme:build\`. Edit that file, not this copy.\n\n`;

  return `${frontMatter}\n${note}${body.replace(/^\n+/, "")}`;
}
