import type { FlowNodeId } from "@repo/desk/contracts";
import { Button, ChevronRight } from "@repo/ui";
import { useEffect, useId, useRef, useState } from "react";

import {
  TRACE_FILTERS,
  filterSteps,
  isProblem,
  linesByStep,
  opensByDefault,
  type Trace,
  type TraceFilter,
  type TraceLine,
  type TraceStep
} from "./issue.trace";
import { useLanguage, useT, type Translate } from "../i18n/i18n.t";
import { formatClock, formatElapsed, formatUsd } from "../shell/shell.format";
import { Segmented } from "../shell/shell.layout";
import { useDesk } from "../state/desk.provider";
import { StatusChip } from "../status/status.chip";
import { NODE_TONE, nodeStatusKey } from "../status/status.model";

const EMPTY: readonly never[] = [];

/** A step to bring into view. The count makes a second jump to the same step scroll again. */
export interface TraceFocus {
  readonly id: string;
  readonly count: number;
}

/** "Check · round 2", or "Needs you" for a stop. */
export const stepName = (t: Translate, step: TraceStep): string => {
  const stage =
    step.key === "needs-you" || step.key === "cancelled"
      ? t(`desk.stage.${step.key}`)
      : t(`desk.flow.node.${step.key}`);
  return step.round > 1 ? t("desk.activity.round", { stage, round: step.round }) : stage;
};

/** How the bar draws: hatched while it waits on you, amber when it went back, red when it stopped. */
const barOf = (step: TraceStep): "ok" | "run" | "wait" | "back" | "stop" => {
  if (step.outcome === "failed") return "stop";
  if (step.outcome === "looped") return "back";
  if (step.outcome === "running") return "run";
  return step.outcome === "waiting" || step.kind === "human" ? "wait" : "ok";
};

const percent = (value: number): string => `${value.toFixed(2)}%`;

/** The bar of one step on the issue's time axis. SVG attributes, not a style: the CSP blocks those. */
function Bar({ step, trace }: { readonly step: TraceStep; readonly trace: Trace }) {
  const hatch = `desk-hatch-${useId().replace(/[^A-Za-z0-9_-]/g, "")}`;
  const span = Math.max(1, trace.endMs - trace.startMs);
  const left = Math.min(99.4, Math.max(0, ((step.startMs - trace.startMs) / span) * 100));
  const width = Math.min(100 - left, Math.max(0.6, ((step.endMs - step.startMs) / span) * 100));
  const bar = barOf(step);
  return (
    <svg className="desk-trace__track" aria-hidden="true" focusable="false">
      {bar === "wait" && (
        <defs>
          <pattern
            id={hatch}
            width="6"
            height="6"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)"
          >
            <rect className="desk-trace__hatch" width="2" height="6" />
          </pattern>
        </defs>
      )}
      <rect
        className="desk-trace__bar"
        data-bar={bar}
        x={percent(left)}
        y="12.5%"
        width={percent(width)}
        height="75%"
        rx="3"
        fill={bar === "wait" ? `url(#${hatch})` : undefined}
      />
    </svg>
  );
}

function Lines({ lines, label }: { readonly lines: readonly TraceLine[]; readonly label: string }) {
  const t = useT();
  const { language } = useLanguage();
  if (lines.length === 0) return <p className="desk-muted">{t("desk.trace.noLines")}</p>;
  return (
    <ol className="desk-trace__log" aria-label={label}>
      {lines.map(({ entry, byTime }) => (
        <li key={entry.seq} className="desk-trace__line" data-kind={entry.kind}>
          <time dateTime={entry.at} className="desk-log__time">
            {formatClock(entry.at, language)}
          </time>
          <span>{entry.text}</span>
          {byTime && <span className="desk-trace__bytime">{t("desk.trace.byTime")}</span>}
        </li>
      ))}
    </ol>
  );
}

interface StepRowProps {
  readonly step: TraceStep;
  readonly trace: Trace;
  readonly open: boolean;
  readonly highlighted: boolean;
  readonly lines: readonly TraceLine[];
  readonly onToggle: () => void;
  readonly onInspect: (node: FlowNodeId) => void;
  readonly buttonRef: (element: HTMLButtonElement | null) => void;
}

function StepRow({
  step,
  trace,
  open,
  highlighted,
  lines,
  onToggle,
  onInspect,
  buttonRef
}: StepRowProps) {
  const t = useT();
  const { language } = useLanguage();
  const linesId = useId();
  const name = stepName(t, step);
  const duration = formatElapsed(step.endMs - step.startMs, language);
  const costed = step.kind === "agent" || step.runs > 0;
  const { node } = step;
  return (
    <li
      className="desk-trace__step"
      data-problem={isProblem(step) ? "true" : undefined}
      data-highlight={highlighted ? "true" : undefined}
      data-live={step.ongoing ? "true" : undefined}
    >
      <div className="desk-trace__row">
        <Button
          ref={buttonRef}
          appearance="ghost"
          className="desk-trace__name"
          aria-expanded={open}
          aria-controls={open ? linesId : undefined}
          onClick={onToggle}
        >
          <ChevronRight aria-hidden="true" className="desk-icon desk-trace__caret" />
          <span className="desk-trace__kind" data-kind={step.kind}>
            {t(`desk.trace.kind.${step.kind === "stop" ? "human" : step.kind}`)}
          </span>
          <span className="desk-trace__stage">{name}</span>
        </Button>
        <Bar step={step} trace={trace} />
        <span className="desk-trace__metric">
          {step.ongoing ? t("desk.activity.ongoing", { duration }) : duration}
        </span>
        <span className="desk-trace__metric">
          {!costed ? null : step.costUsd === null ? (
            <span title={t("desk.trace.costUnknown")}>{t("desk.trace.costNone")}</span>
          ) : (
            formatUsd(step.costUsd, language)
          )}
        </span>
        <span className="desk-trace__outcome">
          <StatusChip tone={NODE_TONE[step.outcome]}>{t(nodeStatusKey(step.outcome))}</StatusChip>
        </span>
      </div>
      {open && (
        <div id={linesId} className="desk-trace__lines">
          <Lines lines={lines} label={t("desk.trace.lines", { step: name })} />
          <div className="desk-trace__foot">
            <span className="desk-muted">
              {t("desk.trace.started", { time: formatClock(step.at, language) })}
            </span>
            {node !== null && (
              <Button appearance="link" spacing="compact" onClick={() => onInspect(node)}>
                {t("desk.trace.inspect")}
              </Button>
            )}
          </div>
        </div>
      )}
    </li>
  );
}

export interface TraceViewProps {
  readonly issueNumber: number;
  readonly trace: Trace;
  /** The issue needs you: "Jump" goes to the failure that stopped it. */
  readonly needsYou: boolean;
  readonly filter: TraceFilter;
  readonly onFilter: (filter: TraceFilter) => void;
  readonly focus: TraceFocus | null;
  readonly onJump: () => void;
  readonly onInspect: (node: FlowNodeId) => void;
}

/**
 * The steps of the issue, newest first, each with a bar on one time axis, how long it took,
 * what its agent runs cost, and how it ended. A step opens to its log lines.
 */
export function TraceView({
  issueNumber,
  trace,
  needsYou,
  filter,
  onFilter,
  focus,
  onJump,
  onInspect
}: TraceViewProps) {
  const t = useT();
  const { language } = useLanguage();
  const { state } = useDesk();
  const entries = state.logs[issueNumber] ?? EMPTY;
  const [opened, setOpened] = useState<Readonly<Record<string, boolean>>>({});
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  const { steps } = trace;
  const shown = [...filterSteps(steps, filter)].reverse();
  const { byStep, unassigned } = linesByStep(steps, entries);

  useEffect(() => {
    if (focus === null) return;
    setOpened((current) => ({ ...current, [focus.id]: true }));
    const button = buttons.current.get(focus.id);
    button?.scrollIntoView({ block: "center" });
    button?.focus({ preventScroll: true });
  }, [focus]);

  const span = trace.endMs - trace.startMs;
  return (
    <div className="desk-trace">
      <div className="desk-trace__top">
        <Segmented
          label={t("desk.trace.filter.label")}
          value={filter}
          options={TRACE_FILTERS}
          name={(option) =>
            option === "problems" && trace.problems > 0
              ? t("desk.trace.filter.problemsCount", { count: trace.problems })
              : t(`desk.trace.filter.${option}`)
          }
          onChange={onFilter}
        />
        {trace.problems > 0 && (
          <Button appearance="ghost" spacing="compact" onClick={onJump}>
            {t(needsYou ? "desk.trace.jump.failure" : "desk.trace.jump.first")}
          </Button>
        )}
      </div>
      {shown.length === 0 ? (
        <p className="desk-empty">
          {t(
            filter === "problems"
              ? "desk.trace.empty.problems"
              : filter === "agents"
                ? "desk.trace.empty.agents"
                : "desk.activity.empty"
          )}
        </p>
      ) : (
        <>
          <div className="desk-trace__axis" aria-hidden="true">
            <span />
            <span className="desk-trace__ticks">
              <span>{formatElapsed(0, language)}</span>
              <span>{formatElapsed(span / 2, language)}</span>
              <span>{formatElapsed(span, language)}</span>
            </span>
          </div>
          <ol className="desk-trace__steps" aria-label={t("desk.trace.label")}>
            {shown.map((step) => (
              <StepRow
                key={step.id}
                step={step}
                trace={trace}
                open={opened[step.id] ?? opensByDefault(step, steps)}
                highlighted={focus?.id === step.id}
                lines={byStep.get(step.id) ?? EMPTY}
                onToggle={() =>
                  setOpened((current) => ({
                    ...current,
                    [step.id]: !(current[step.id] ?? opensByDefault(step, steps))
                  }))
                }
                onInspect={onInspect}
                buttonRef={(element) => {
                  if (element === null) buttons.current.delete(step.id);
                  else buttons.current.set(step.id, element);
                }}
              />
            ))}
          </ol>
        </>
      )}
      <p className="desk-muted desk-trace__note">{t("desk.trace.note")}</p>
      {unassigned > 0 && (
        <p className="desk-muted desk-trace__note">
          {t("desk.trace.unassigned", { count: unassigned })}
        </p>
      )}
    </div>
  );
}

/** Who a step hands the work to: an agent role, you, or the engine stage. */
const whoOf = (t: Translate, step: TraceStep): string => {
  if (step.kind === "human" || step.kind === "stop") return t("desk.handoff.you");
  return step.role === null
    ? t(`desk.flow.node.${step.key}`)
    : t(`desk.inspector.role.${step.role}`);
};

/** The run as a chain of who handed the work to whom, oldest first, with how each step ended. */
export function Handoffs({ steps }: { readonly steps: readonly TraceStep[] }) {
  const t = useT();
  const id = useId();
  if (steps.length === 0) return null;
  return (
    <section className="desk-handoffs" aria-labelledby={`${id}-title`}>
      <h3 id={`${id}-title`}>{t("desk.handoff.title")}</h3>
      <ol className="desk-handoffs__chain">
        {steps.map((step) => (
          <li
            key={step.id}
            className="desk-handoffs__hop"
            data-problem={isProblem(step) ? "true" : undefined}
            data-live={step.ongoing ? "true" : undefined}
          >
            <b>{whoOf(t, step)}</b>
            <span>
              {t("desk.handoff.step", {
                stage: stepName(t, step),
                outcome: t(nodeStatusKey(step.outcome))
              })}
            </span>
          </li>
        ))}
      </ol>
      <p className="desk-muted">{t("desk.handoff.note")}</p>
    </section>
  );
}
