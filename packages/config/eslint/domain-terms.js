import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dirname, "..", "..", "..");
export const BANNED_TERM_SCOPES = ["product", "desk", "names"];

/**
 * The rows of the `## Banned terms` table in CONTEXT.md. A copy of the template
 * without that section has no banned terms; a row with an unknown scope throws,
 * so a typo cannot switch a row off.
 */
export function parseBannedTerms(markdown) {
  const section = /^## Banned terms\n([\s\S]*?)(?=^## |(?![\s\S]))/m.exec(markdown)?.[1] ?? "";
  return section
    .split("\n")
    .filter((line) => line.startsWith("|") && !/^\|\s*(-|Word\s*\|)/.test(line))
    .map((line) => {
      const [word, use, appliesTo] = line
        .split("|")
        .slice(1, -1)
        .map((cell) => cell.trim());
      const scopes = [...appliesTo.matchAll(/`([^`]+)`/g)].map((match) => match[1]);
      for (const scope of scopes) {
        if (!BANNED_TERM_SCOPES.includes(scope)) {
          throw new Error(`CONTEXT.md Banned terms: "${word}" has unknown scope "${scope}".`);
        }
      }
      return { word: word.toLowerCase(), use: use.replaceAll("**", ""), scopes };
    });
}

/** The banned terms of this checkout's CONTEXT.md, or none when it has no CONTEXT.md. */
export function readBannedTerms(root = REPO_ROOT) {
  const file = join(root, "CONTEXT.md");
  return existsSync(file) ? parseBannedTerms(readFileSync(file, "utf8")) : [];
}

const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The first term that copy uses as whole words, any case, with an optional plural. */
export function findBannedInCopy(text, terms) {
  return terms.find(({ word }) =>
    new RegExp(`\\b${word.split(" ").map(escapeRegExp).join("\\s+")}s?\\b`, "i").test(text)
  );
}

/** `inviteLinkId`, `InviteLinkID` and `INVITE_LINK_ID` all read as `invite link id`. */
const nameWords = (name) =>
  name
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((word) => word.toLowerCase());

/** The first term whose words appear in a row in a name; the last may be plural. */
export function findBannedInName(name, terms) {
  const words = nameWords(name);
  return terms.find(({ word }) => {
    const wanted = word.split(" ");
    const last = wanted.length - 1;
    return words.some((_, start) =>
      wanted.every((part, index) => {
        const actual = words[start + index];
        return actual === part || (index === last && actual === `${part}s`);
      })
    );
  });
}

const keyName = (key) => {
  if (!key) return undefined;
  if (key.type === "Identifier") return key.name;
  return key.type === "Literal" && typeof key.value === "string" ? key.value : undefined;
};

const bannedTerms = {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Disallow the CONTEXT.md Banned terms in declared names, so code keeps the ubiquitous language."
    },
    schema: [
      {
        type: "object",
        properties: {
          terms: {
            type: "array",
            items: {
              type: "object",
              properties: { word: { type: "string" }, use: { type: "string" } },
              required: ["word", "use"],
              additionalProperties: false
            }
          }
        },
        required: ["terms"],
        additionalProperties: false
      }
    ],
    messages: {
      banned: '"{{name}}" uses "{{word}}", a CONTEXT.md Banned term. Name it with {{use}} instead.'
    }
  },
  create(context) {
    const terms = context.options[0]?.terms ?? [];
    if (terms.length === 0) return {};
    const check = (node) => {
      const name = keyName(node);
      const term = name && findBannedInName(name, terms);
      if (term) context.report({ node, messageId: "banned", data: { name, ...term } });
    };
    const checkId = (node) => check(node.id);
    const checkKey = (node) => {
      if (!node.computed) check(node.key);
    };
    return {
      VariableDeclarator: (node) => {
        if (node.id.type === "Identifier") check(node.id);
      },
      FunctionDeclaration: checkId,
      ClassDeclaration: checkId,
      TSInterfaceDeclaration: checkId,
      TSTypeAliasDeclaration: checkId,
      TSEnumDeclaration: checkId,
      TSEnumMember: checkId,
      TSPropertySignature: checkKey,
      TSMethodSignature: checkKey,
      PropertyDefinition: checkKey,
      MethodDefinition: checkKey
    };
  }
};

export const domainTermsPlugin = {
  meta: { name: "domain" },
  rules: { "banned-terms": bannedTerms }
};

const nameTerms = readBannedTerms()
  .filter(({ scopes }) => scopes.includes("names"))
  .map(({ word, use }) => ({ word, use }));

// Product code only: tooling and the AI scaffold have their own language, where
// "team" is the developer team that shares the kaine-* skills.
export default [
  {
    files: ["apps/**/*.{ts,tsx,mts,cts}", "packages/**/*.{ts,tsx,mts,cts}"],
    plugins: { domain: domainTermsPlugin },
    rules: { "domain/banned-terms": ["error", { terms: nameTerms }] }
  }
];
