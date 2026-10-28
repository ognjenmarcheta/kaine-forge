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
  const names = (namespace, prefix = "ds-") =>
    new Set(
      Array.from(
        css.matchAll(new RegExp(`--${namespace}-(${prefix}[a-z0-9-]+):`, "g")),
        (m) => m[1]
      )
    );
  return {
    colors: names("color"),
    spacing: names("spacing"),
    radii: names("radius", ""),
    shadows: names("shadow", ""),
    fontWeights: names("font-weight", ""),
    textSizes: new Set(Array.from(css.matchAll(/@utility text-([a-z0-9-]+)/g), (m) => m[1]))
  };
}

const COLOR_UTILITY =
  /(?:^|[\s:"'`])-?(?:bg|text|border(?:-[trblxyse])?|ring(?:-offset)?|outline|fill|stroke|divide|placeholder|decoration|caret|accent|from|to|via|shadow)-(ds-[a-z0-9-]+?)(?:\/\d+)?(?=$|[\s"'`])/g;
const SPACING_UTILITY =
  /(?:^|[\s:"'`])-?(?:p[xytrblse]?|m[xytrblse]?|gap(?:-[xy])?|space-[xy]|w|h|size|min-w|min-h|max-w|max-h|inset(?:-[xy])?|top|bottom|left|right|start|end|translate-[xy]|basis)-(ds-[a-z0-9-]+)(?=$|[\s"'`])/g;

// Tailwind's default radii, shadows, type sizes, weights, and palette. The theme resets those
// namespaces, so a default name that the theme does not define generates no CSS and does nothing.
const RADIUS_CLASS = /^rounded(?:-(?:t|r|b|l|s|e|tl|tr|bl|br|ss|se|es|ee))?(?:-([a-z0-9-]+))?$/;
const SHADOW_CLASS = /^shadow(?:-([a-z0-9-]+))?$/;
const TEXT_SIZE_CLASS = /^text-(xs|sm|base|lg|[2-9]?xl)$/;
const FONT_WEIGHT_CLASS =
  /^font-(thin|extralight|light|normal|medium|semibold|bold|extrabold|black)$/;
const PALETTE_CLASS =
  /^(?:bg|text|border(?:-[trblxyse])?|ring(?:-offset)?|outline|fill|stroke|divide|placeholder|decoration|caret|accent|from|to|via|shadow)-(?:(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}|white|black)(?:\/\d+)?$/;

/** Why a class generates no CSS under the theme, or null when it does. */
function resetDefault(className, utilities) {
  // Arbitrary values set their own CSS; the variant prefix and important marker do not matter.
  if (/[[(]/.test(className)) return null;
  const name = className
    .slice(className.lastIndexOf(":") + 1)
    .replace(/^!|!$/g, "")
    .replace(/^-/, "");
  if (PALETTE_CLASS.test(name)) {
    return `COLOR-5: "${name}" is a default Tailwind color, which the theme removes. Use a role such as bg-ds-bg-danger or text-ds-text-inverse.`;
  }
  if (TEXT_SIZE_CLASS.test(name) && !utilities.textSizes.has(name.slice(5))) {
    return `TYPE-1: "${name}" is a default Tailwind size, which the theme removes. Use a type step such as text-body or text-heading-sm.`;
  }
  const weight = FONT_WEIGHT_CLASS.exec(name);
  if (weight && !utilities.fontWeights.has(weight[1])) {
    return `TYPE-1: "${name}" is not a theme weight. Use font-normal, font-medium, font-semibold, or font-bold.`;
  }
  const radius = RADIUS_CLASS.exec(name);
  if (radius && !["none", "full"].includes(radius[1] ?? "") && !utilities.radii.has(radius[1])) {
    return `"${name}" generates no CSS: the theme replaces Tailwind's default radii. Use rounded-sm to rounded-xl or a component radius such as rounded-card (DESIGN_SYSTEM.md section 9).`;
  }
  const shadow = SHADOW_CLASS.exec(name);
  if (
    shadow &&
    !shadow[1]?.startsWith("ds-") &&
    !["none", "inherit", "current", "transparent"].includes(shadow[1] ?? "") &&
    !utilities.shadows.has(shadow[1] ?? "")
  ) {
    return `"${name}" generates no CSS: the theme replaces Tailwind's default shadows. Use shadow-raised, shadow-overlay, shadow-floating, or shadow-card (DESIGN_SYSTEM.md section 9).`;
  }
  return null;
}

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

// Web only: the mobile NativeWind preset extends Tailwind's defaults instead of resetting them.
const noResetDefault = {
  meta: {
    type: "problem",
    docs: {
      description:
        "A Tailwind default that the web theme removes generates no CSS (COLOR-5, TYPE-1)."
    },
    schema: []
  },
  create(context) {
    const utilities = readThemeUtilities();
    if (!utilities) return {};
    const check = (node) => {
      for (const text of stringsOf(node)) {
        for (const className of text.split(/[\s"'`]+/)) {
          const message = className ? resetDefault(className, utilities) : null;
          if (message) context.report({ node, message });
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
    "no-reset-default": noResetDefault,
    "no-transition-all": noTransitionAll,
    "no-unknown-token": noUnknownToken
  }
};
