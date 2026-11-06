import {
  ACTION_NAMES,
  AGENT_AVATAR_GLYPHS,
  AGENT_AVATAR_TONES,
  AGENT_OUTPUT_KINDS,
  AGENT_STAGE_ROLES,
  AGENT_TOOLS,
  CAPABILITY_PRESETS,
  CAPABILITY_SANDBOXES,
  DEFINITION_SOURCES,
  HEALTH_FIXES,
  INTAKE_RECOMMENDATIONS,
  COMPONENT_LAYERS,
  JOB_KINDS,
  JOB_STAGES,
  JOB_STATUSES,
  JOB_STOP_REASONS,
  NEEDS_YOU_CODES,
  ISSUE_SECTIONS,
  FLOW_NODE_IDS,
  LOOP_KINDS,
  NODE_KINDS,
  NODE_STATUSES,
  PLAN_RISKS,
  PROVIDERS,
  SPECIALIST_TARGET_KINDS,
  RUN_FAILURE_KINDS,
  SCORECARD_DISPOSITIONS,
  SCORECARD_MODES,
  STAGES,
  STEP_KINDS
} from "@repo/desk/contracts";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { BACK_KINDS } from "../flows/flows.model";
import { UNDOABLE_ACTIONS } from "../gates/gate.actions";
import { FILE_GROUPS } from "../gates/gate.model";
import { DETAIL_TABS } from "../issue/issue.details";
import { TRACE_FILTERS } from "../issue/issue.trace";
import { BANDS, FINDING_FILTERS, FINDING_SORTS, SORTS } from "../scorecard/scorecard.model";
import { DENSITIES, THEMES, WORK_VIEWS } from "../shell/shell.preferences";
import { CHIP_STATES, INBOX_GROUPS } from "../status/status.model";
import { TURN_GROUPS } from "../work/work.model";
import { WORK_FILTERS } from "../work/work.view";

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
        "gate",
        "needs-you",
        "working",
        "shipped",
        "cancelled",
        "finished",
        "idle"
      ],
      "desk.gate.intro.": [
        "plan-gate",
        "pr-review",
        "gate",
        "needs-you",
        "working",
        "shipped",
        "cancelled",
        "finished",
        "idle"
      ],
      "desk.inbox.group.": INBOX_GROUPS,
      "desk.inbox.groupNote.": TURN_GROUPS,
      "desk.stop.": NEEDS_YOU_CODES,
      "desk.work.filter.": WORK_FILTERS,
      "desk.work.view.": WORK_VIEWS,
      "desk.work.jobKind.": JOB_KINDS,
      "desk.job.gate.": JOB_KINDS,
      "desk.job.stopShort.": JOB_STOP_REASONS,
      "desk.inbox.action.job.": JOB_KINDS,
      "desk.inbox.reason.job.": JOB_KINDS,
      "desk.newWork.jobText.": JOB_KINDS,
      "desk.newWork.tab.": ["issue", "job"],
      "desk.details.tab.": DETAIL_TABS,
      "desk.prefs.density.": DENSITIES,
      "desk.nav.": ["inbox", "work", "flows", "agents", "setup", "insights", "scorecard", "lab"],
      "desk.nav.group.": ["work", "configure", "insights", "developer"],
      "desk.connection.": ["connecting", "live", "reconnecting"],
      "desk.review.severity.": ["Critical", "Consider", "Nit", "FYI"],
      "desk.review.verdict.": ["approve", "changes-requested"],
      "desk.health.status.": ["ok", "warn", "error"],
      "desk.health.fix.title.": HEALTH_FIXES,
      "desk.health.fix.description.": HEALTH_FIXES,
      "desk.health.fix.confirm.": HEALTH_FIXES,
      "desk.health.fix.name.": HEALTH_FIXES,
      "desk.inspector.role.": AGENT_STAGE_ROLES,
      "desk.draft.recommendation.": INTAKE_RECOMMENDATIONS,
      "desk.draft.section.": ISSUE_SECTIONS,
      "desk.stats.column.": [
        "agent",
        "provider",
        "model",
        "runs",
        "accepted",
        "stuck",
        "timeouts",
        "median",
        "tokensIn",
        "tokensOut",
        "turns",
        "edits",
        "costPerRun",
        "cost",
        "issue",
        "stage",
        "loops"
      ],
      "desk.ship.changesetKind.": ["none", "file", "skip-label", "invalid"],
      "desk.ship.step.": ["checking", "review", "confirm", "shipping", "shipped", "failed"],
      "desk.plan.action.": ["create", "modify", "delete"],
      "desk.build.result.": ["pass", "fail", "not-run"],
      "desk.check.kind.": ["loop", "ship"],
      "desk.prefs.appearance.": THEMES,
      "desk.prefs.language.": ["en", "de", "sr"],
      "desk.undo.pending.": UNDOABLE_ACTIONS,
      "desk.palette.section.": ["here", "recent", "turn", "goto", "issues"],
      "desk.incident.cause.": [...RUN_FAILURE_KINDS, "repeat"],
      "desk.diff.group.": FILE_GROUPS,
      "desk.record.": PLAN_RISKS,
      "desk.trace.filter.": TRACE_FILTERS,
      "desk.trace.kind.": NODE_KINDS,
      "desk.flow.source.": DEFINITION_SOURCES,
      "desk.caps.preset.": CAPABILITY_PRESETS,
      "desk.caps.sandbox.": CAPABILITY_SANDBOXES,
      "desk.caps.kind.": ["tool", "mcp", "skill"],
      "desk.agents.output.": AGENT_OUTPUT_KINDS,
      "desk.agents.outputAbout.": AGENT_OUTPUT_KINDS,
      "desk.agents.provider.": PROVIDERS,
      "desk.agents.presetAbout.": CAPABILITY_PRESETS,
      "desk.agents.toolAbout.": AGENT_TOOLS,
      "desk.agents.avatar.glyph.": AGENT_AVATAR_GLYPHS,
      "desk.agents.avatar.tone.": AGENT_AVATAR_TONES,
      "desk.flows.kind.": [...STEP_KINDS, "setup"],
      "desk.flows.commandSet.": ["loop", "ship", "custom"],
      "desk.flows.commandSetAbout.": ["loop", "ship", "custom"],
      "desk.flows.edge.": [...BACK_KINDS, ...BACK_KINDS.map((kind) => `${kind}Name`)],
      "desk.scorecard.band.": BANDS,
      "desk.scorecard.disposition.": SCORECARD_DISPOSITIONS,
      "desk.scorecard.mode.": SCORECARD_MODES,
      "desk.scorecard.delta.": ["up", "down", "held"],
      "desk.scorecard.sort.": SORTS,
      "desk.scorecard.findings.show.": FINDING_FILTERS,
      "desk.scorecard.findings.sortBy.": FINDING_SORTS,
      "desk.scorecard.tracking.issue.": ["open", "closed"],
      "desk.scorecard.tracking.fix.": ["open", "closed", "merged"],
      "desk.job.title.": JOB_KINDS,
      "desk.job.start.title.": JOB_KINDS,
      "desk.job.start.description.": JOB_KINDS,
      "desk.job.stage.": JOB_STAGES,
      "desk.job.status.": JOB_STATUSES,
      "desk.job.stop.": JOB_STOP_REASONS,
      "desk.job.stepState.": ["done", "current", "todo"],
      "desk.job.start.component.layer.": COMPONENT_LAYERS,
      "desk.job.auditReview.severity.": ["must", "should", "could"],
      "desk.job.start.specialist.targetKind.": SPECIALIST_TARGET_KINDS,
      "desk.job.start.specialist.targetValue.": SPECIALIST_TARGET_KINDS,
      "desk.job.start.specialist.targetHelp.": SPECIALIST_TARGET_KINDS,
      "desk.job.": [
        "cancel",
        "remove",
        "cancelConfirm.title",
        "cancelConfirm.text",
        "removeConfirm.title",
        "removeConfirm.text"
      ]
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
