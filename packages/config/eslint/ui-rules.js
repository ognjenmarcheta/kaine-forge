// UI rules from docs/ui/guidelines.md that ESLint can check on class strings and JSX.
// Each message names its rule ID, so a finding points at the reason.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const tokensCss = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../ui/src/styles/tokens.generated.css"
);

/** The `ds-` utility names the generated tokens define, by Tailwind namespace. */
function readThemeUtilities() {
  let css = "";
  try {
    css = readFileSync(tokensCss, "utf8");
  } catch {
    return null;
  }
  const names = (namespace) =>
    new Set(
      Array.from(css.matchAll(new RegExp(`--${namespace}-(ds-[a-z0-9-]+):`, "g")), (m) => m[1])
    );
  return { colors: names("color"), spacing: names("spacing") };
}

const COLOR_UTILITY =
  /(?:^|[\s:"'`])-?(?:bg|text|border(?:-[trblxyse])?|ring(?:-offset)?|outline|fill|stroke|divide|placeholder|decoration|caret|accent|from|to|via|shadow)-(ds-[a-z0-9-]+?)(?:\/\d+)?(?=$|[\s"'`])/g;
const SPACING_UTILITY =
  /(?:^|[\s:"'`])-?(?:p[xytrblse]?|m[xytrblse]?|gap(?:-[xy])?|space-[xy]|w|h|size|min-w|min-h|max-w|max-h|inset(?:-[xy])?|top|bottom|left|right|start|end|translate-[xy]|basis)-(ds-[a-z0-9-]+)(?=$|[\s"'`])/g;

function stringsOf(node) {
  if (node.type === "Literal" && typeof node.value === "string") return [node.value];
  if (node.type === "TemplateElement") return [node.value.raw];
  return [];
}

const noUnknownToken = {
  meta: {
    type: "problem",
    docs: { description: "A ds- utility must name a token the themes define (COLOR-5, SPACE-1)." },
    schema: []
  },
  create(context) {
    const utilities = readThemeUtilities();
    if (!utilities) return {};
    const check = (node) => {
      for (const text of stringsOf(node)) {
        for (const [, name] of text.matchAll(COLOR_UTILITY)) {
          if (!utilities.colors.has(name)) {
            context.report({
              node,
              message: `COLOR-5: "${name}" is not a theme color. Use a role such as ds-text-subtle or ds-bg-neutral; DESIGN_SYSTEM.md section 9 lists them.`
            });
          }
        }
        for (const [, name] of text.matchAll(SPACING_UTILITY)) {
          if (!utilities.spacing.has(name)) {
            context.report({
              node,
              message: `SPACE-1: "${name}" is not a theme spacing step. Use ds-025 to ds-1000 or ds-control-*.`
            });
          }
        }
      }
    };
    return { Literal: check, TemplateElement: check };
  }
};

const noTransitionAll = {
  meta: {
    type: "problem",
    docs: { description: "Transitions name their properties (MOTION-2)." },
    schema: []
  },
  create(context) {
    const check = (node) => {
      for (const text of stringsOf(node)) {
        if (/(?:^|[\s:"'`])transition-all(?=$|[\s"'`])/.test(text)) {
          context.report({
            node,
            message:
              "MOTION-2: transition-all animates layout properties by accident. Use transition-colors, transition-opacity, or transition-transform."
          });
        }
      }
    };
    return { Literal: check, TemplateElement: check };
  }
};

const noOutlineNone = {
  meta: {
    type: "problem",
    docs: { description: "Removing the outline needs a focus-visible style (A11Y-1)." },
    schema: []
  },
  create(context) {
    // The class list of a cn() or cva() call is all its string arguments together.
    const classList = (node) =>
      node.parent?.type === "CallExpression"
        ? node.parent.arguments.flatMap(stringsOf).join(" ")
        : stringsOf(node).join(" ");
    const check = (node) => {
      for (const text of stringsOf(node)) {
        if (
          /(?:^|\s)outline-none(?=$|\s)/.test(text) &&
          !/focus(?:-visible|-within)?:/.test(classList(node))
        ) {
          context.report({
            node,
            message:
              "A11Y-1: outline-none hides the focus ring. Add a focus-visible: ring or border in the same class list."
          });
        }
      }
    };
    return { Literal: check, TemplateElement: check };
  }
};

const LABEL_PROPS = new Set(["aria-label", "aria-labelledby", "title"]);

const iconButtonLabel = {
  meta: {
    type: "problem",
    docs: { description: "A button with only an icon needs an accessible name (A11Y-3)." },
    schema: []
  },
  create(context) {
    return {
      JSXElement(node) {
        const name = node.openingElement.name;
        if (name.type !== "JSXIdentifier" || (name.name !== "Button" && name.name !== "button")) {
          return;
        }
        const hasLabel = node.openingElement.attributes.some(
          (attribute) =>
            attribute.type === "JSXSpreadAttribute" ||
            (attribute.name?.type === "JSXIdentifier" && LABEL_PROPS.has(attribute.name.name)) ||
            attribute.name?.name === "asChild"
        );
        const children = node.children.filter(
          (child) => !(child.type === "JSXText" && child.value.trim() === "")
        );
        // An icon is a self-closing component, such as <Trash2 />, with no text beside it.
        const onlyIcons =
          children.length > 0 &&
          children.every(
            (child) =>
              child.type === "JSXElement" &&
              child.openingElement.name.type === "JSXIdentifier" &&
              /^[A-Z]/.test(child.openingElement.name.name) &&
              child.openingElement.selfClosing
          );
        if (onlyIcons && !hasLabel) {
          context.report({
            node: node.openingElement,
            message: "A11Y-3: this button holds only an icon. Give it a translated aria-label."
          });
        }
      }
    };
  }
};

export const uiRules = {
  rules: {
    "icon-button-label": iconButtonLabel,
    "no-outline-none": noOutlineNone,
    "no-transition-all": noTransitionAll,
    "no-unknown-token": noUnknownToken
  }
};
