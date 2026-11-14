import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { RuleTester } from "eslint";
import tseslint from "typescript-eslint";
import { describe, expect, it } from "vitest";

import {
  domainTermsPlugin,
  findBannedInCopy,
  findBannedInName,
  parseBannedTerms,
  readBannedTerms
} from "./domain-terms.js";

RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const localesDir = join(repoRoot, "packages/translation/src/locales/en");

const ruleTester = new RuleTester({
  languageOptions: { parser: tseslint.parser, ecmaVersion: 2022, sourceType: "module" }
});
const options = [
  {
    terms: [
      { word: "team", use: "Organization" },
      { word: "sync queue", use: "Outbox" }
    ]
  }
];
const banned = (name, word, use) => ({ messageId: "banned", data: { name, word, use } });

ruleTester.run("banned-terms", domainTermsPlugin.rules["banned-terms"], {
  valid: [
    // Whole words only: "steam" and "teammate" are not "team".
    { code: "const steamId = 1; const teammate = 2;", options },
    // An imported name belongs to its package; only declarations are checked.
    { code: 'import { teamId } from "lib"; use(teamId);', options },
    // Both words of a phrase must sit next to each other.
    { code: "const syncState = 1; const queue = [];", options },
    // A shorthand binding takes its name from the source object.
    { code: "const { teamId } = props;", options }
  ],
  invalid: [
    { code: "const teamId = 1;", options, errors: [banned("teamId", "team", "Organization")] },
    {
      code: "const { organizationId: teamId } = source;",
      options,
      errors: [banned("teamId", "team", "Organization")]
    },
    {
      code: "function select(teamId: string) {}",
      options,
      errors: [banned("teamId", "team", "Organization")]
    },
    {
      code: "const count = (...teams: string[]) => teams.length;",
      options,
      errors: [banned("teams", "team", "Organization")]
    },
    {
      code: "interface Props { teams: string[] }",
      options,
      errors: [banned("teams", "team", "Organization")]
    },
    {
      code: "type SyncQueueEntry = string;",
      options,
      errors: [banned("SyncQueueEntry", "sync queue", "Outbox")]
    },
    {
      code: "const SYNC_QUEUE_LIMIT = 5;",
      options,
      errors: [banned("SYNC_QUEUE_LIMIT", "sync queue", "Outbox")]
    },
    {
      code: "class Roster { teamName = ''; }",
      options,
      errors: [banned("teamName", "team", "Organization")]
    },
    {
      code: "enum Kind { Team = 'team' }",
      options,
      errors: [banned("Team", "team", "Organization")]
    }
  ]
});

describe("parseBannedTerms", () => {
  const table = (rows) =>
    `## Banned terms\n\nIntro.\n\n| Word | Use instead | Applies to |\n| ---- | ----------- | ---------- |\n${rows}\n\n## Next\n`;

  it("reads each row's word, term, and scopes", () => {
    expect(
      parseBannedTerms(table("| Invite Link | **Invitation** | `product`, `names` |"))
    ).toEqual([{ word: "invite link", use: "Invitation", scopes: ["product", "names"] }]);
  });

  it("reads no terms from a document without the section", () => {
    expect(parseBannedTerms("# Context\n\n## Language\n")).toEqual([]);
  });

  it("throws on an unknown scope, so a typo cannot switch a row off", () => {
    expect(() => parseBannedTerms(table("| team | **Organization** | `prodcut` |"))).toThrow(
      'unknown scope "prodcut"'
    );
  });
});

describe("CONTEXT.md Banned terms", () => {
  const terms = readBannedTerms(repoRoot);
  const inScope = (scope) => terms.filter(({ scopes }) => scopes.includes(scope));

  it("reads rows from the section when CONTEXT.md has one", () => {
    const hasSection = /^## Banned terms$/m.test(
      readFileSync(join(repoRoot, "CONTEXT.md"), "utf8")
    );
    expect(hasSection && terms.length === 0, "the section parsed to no rows").toBe(false);
  });

  it("keeps them out of the English copy", () => {
    const hits = readdirSync(localesDir)
      .filter((file) => file.endsWith(".json"))
      .flatMap((file) => {
        const scoped = inScope(file === "desk.json" ? "desk" : "product");
        return Object.entries(JSON.parse(readFileSync(join(localesDir, file), "utf8"))).flatMap(
          ([key, value]) => {
            const term = findBannedInCopy(String(value), scoped);
            return term ? [`${file}:${key} uses "${term.word}"; use ${term.use}`] : [];
          }
        );
      });
    expect(hits).toEqual([]);
  });

  it("keeps them out of the GraphQL schema names", () => {
    const sdl = readFileSync(join(repoRoot, "apps/api/schema.graphql"), "utf8")
      // Descriptions and string values are text, not names; both may hold escaped quotes.
      .replace(/"""(?:\\"""|[\s\S])*?"""/g, "")
      .replace(/"(?:\\.|[^"\\\n])*"/g, "");
    const names = new Set(sdl.match(/[A-Za-z_][A-Za-z0-9_]*/g));
    const hits = [...names].flatMap((name) => {
      const term = findBannedInName(name, inScope("names"));
      return term ? [`${name} uses "${term.word}"; use ${term.use}`] : [];
    });
    expect(hits).toEqual([]);
  });
});
