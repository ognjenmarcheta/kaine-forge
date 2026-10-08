import {
  ACTION_NAMES,
  FLOW_NODE_IDS,
  LOOP_KINDS,
  NODE_KINDS,
  NODE_STATUSES,
  STAGES
} from "@repo/desk/contracts";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { THEMES } from "../shell/shell.preferences";
import { CHIP_STATES } from "../status/status.model";

const SRC = path.resolve(import.meta.dirname, "..");
const LOCALES = path.resolve(SRC, "../../../packages/translation/src/locales");

const readLocale = (locale: string): Record<string, string> =>
  JSON.parse(readFileSync(path.join(LOCALES, locale, "desk.json"), "utf8"));

const sources = (directory: string): string[] =>
  readdirSync(directory).flatMap((name) => {
    const full = path.join(directory, name);
    if (statSync(full).isDirectory()) return name === "test" ? [] : sources(full);
    return /\.(ts|tsx)$/.test(name) && !/\.test\./.test(name) ? [full] : [];
  });

const code = sources(SRC)
  .map((file) => readFileSync(file, "utf8"))
  .join("\n");

const en = readLocale("en");

/** Every `desk.*` string in the source: a whole key, or the start of a key built with `${...}`. */
const literals = [...code.matchAll(/"(desk\.[A-Za-z0-9._-]+)"/g)].map((match) => match[1] ?? "");
const prefixes = [...code.matchAll(/`(desk\.[A-Za-z0-9._-]+)\$\{/g)].map((match) => match[1] ?? "");

describe("desk translations", () => {
  it("has every key that the source uses by its full name", () => {
    expect(
      literals.filter((key) => !(key in en) && !prefixes.some((p) => key.startsWith(p)))
    ).toEqual([]);
  });

  it("covers every value of the contracts that build a key from a value", () => {
    const families: Record<string, readonly string[]> = {
      "desk.flow.node.": FLOW_NODE_IDS,
      "desk.flow.status.": NODE_STATUSES,
      "desk.inspector.subtitle.": NODE_KINDS,
      "desk.stage.": STAGES,
      "desk.action.done.": ACTION_NAMES,
      "desk.flow.loop.": ["check", "review", "feedback"],
      "desk.feedback.target.": ["plan", "build", "review"],
      "desk.chip.state.": CHIP_STATES,
      "desk.gate.title.": [
        "plan-gate",
        "pr-review",
        "needs-you",
        "working",
        "shipped",
        "cancelled",
        "idle"
      ],
      "desk.gate.intro.": [
        "plan-gate",
        "pr-review",
        "needs-you",
        "working",
        "shipped",
        "cancelled",
        "idle"
      ],
      "desk.board.group.": ["needs-you", "waiting", "running", "done"],
      "desk.board.groupHelp.": ["needs-you", "waiting", "running", "done"],
      "desk.board.columnEmpty.": ["needs-you", "waiting", "running", "done"],
      "desk.connection.": ["connecting", "live", "reconnecting"],
      "desk.review.severity.": ["Critical", "Consider", "Nit", "FYI"],
      "desk.review.verdict.": ["approve", "changes-requested"],
      "desk.health.status.": ["ok", "warn", "error"],
      "desk.ship.changesetKind.": ["none", "file", "skip-label", "invalid"],
      "desk.ship.step.": ["checking", "review", "confirm", "shipping", "shipped", "failed"],
      "desk.plan.action.": ["create", "modify", "delete"],
      "desk.build.result.": ["pass", "fail", "not-run"],
      "desk.check.kind.": ["loop", "ship"],
      "desk.prefs.theme.": THEMES,
      "desk.prefs.language.": ["en", "de", "sr"]
    };
    const missing = Object.entries(families).flatMap(([prefix, values]) =>
      values.map((value) => `${prefix}${value}`).filter((key) => !(key in en))
    );
    expect(missing).toEqual([]);
    expect(LOOP_KINDS).toContain("check");
  });

  it("has no key that nothing uses", () => {
    const used = (key: string): boolean =>
      code.includes(`"${key}"`) ||
      prefixes.some((prefix) => key.startsWith(prefix)) ||
      key.startsWith("desk.error.");
    expect(Object.keys(en).filter((key) => !used(key))).toEqual([]);
  });

  it.each(["de", "sr"])("has the same keys and the same placeholders in %s", (locale) => {
    const other = readLocale(locale);
    expect(Object.keys(other).sort()).toEqual(Object.keys(en).sort());
    const placeholders = (text: string): string[] =>
      [...text.matchAll(/\{\{(\w+)\}\}/g)].map((match) => match[1] ?? "").sort();
    for (const [key, value] of Object.entries(en)) {
      expect(placeholders(other[key] ?? ""), key).toEqual(placeholders(value));
    }
  });
});
