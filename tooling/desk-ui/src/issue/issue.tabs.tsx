import type {
  FlowModel,
  FlowNodeId,
  FlowSnapshot,
  HistoryEvent,
  NodeKind
} from "@repo/desk/contracts";
import { Button, Card, Checkbox, Label, Tabs, TabsContent, TabsList, TabsTrigger } from "@repo/ui";
import { useId, useState, type Ref } from "react";

import {
  OUTCOME_TONE,
  activityGroups,
  isKnownEvent,
  type ActivityGroup,
  type ActivityRow
} from "./issue.activity";
import { LogPanel } from "./issue.log";
import type { Trace, TraceFilter } from "./issue.trace";
import { Handoffs, TraceView, type TraceFocus } from "./issue.waterfall";
import { StageIcon } from "../flow/flow.icon";
import { useStageNames } from "../flow/flow.names";
import { useLanguage, useT } from "../i18n/i18n.t";
import { formatClock, formatDuration, formatElapsed } from "../shell/shell.format";
import { useNow } from "../shell/shell.now";
import { OverflowTooltip, useOverflow } from "../shell/shell.overflow";
import { StatusChip } from "../status/status.chip";

function Row({ row }: { readonly row: ActivityRow }) {
  const t = useT();
  const { language } = useLanguage();
  const [noteRef, noteCut] = useOverflow<HTMLSpanElement>(row.note ?? "");
  return (
    <li className="desk-activity__row" data-outcome={row.outcome}>
      <time dateTime={row.at} className="desk-activity__time">
        {formatClock(row.at, language)}
      </time>
      <span className="desk-activity__event">
        {isKnownEvent(row.event) ? t(`desk.activity.event.${row.event}`) : row.event}
      </span>
      {row.note === null ? (
        <span className="desk-activity__note" />
      ) : (
        <OverflowTooltip text={row.note} overflowing={noteCut}>
          <span ref={noteRef} className="desk-activity__note">
            {row.note}
          </span>
        </OverflowTooltip>
      )}
      <span className="desk-activity__duration">
        {row.durationMs === null
          ? ""
          : row.ongoing
            ? t("desk.activity.ongoing", { duration: formatDuration(row.durationMs, language) })
            : formatDuration(row.durationMs, language)}
      </span>
      <span className="desk-activity__pill">
        <StatusChip tone={OUTCOME_TONE[row.outcome]}>
          {t(`desk.activity.outcome.${row.outcome}`)}
        </StatusChip>
      </span>
    </li>
  );
}

function Group({
  group,
  kind
}: {
  readonly group: ActivityGroup;
  readonly kind: NodeKind | undefined;
}) {
  const t = useT();
  const names = useStageNames();
  const name = group.node === null ? names.stage(group.stage) : names.node(group.node);
  return (
    <li className="desk-activity__group">
      <h3 className="desk-activity__head">
        {kind !== undefined && <StageIcon kind={kind} />}
        <span>
          {group.round > 1 ? t("desk.activity.round", { stage: name, round: group.round }) : name}
        </span>
      </h3>
      <ol className="desk-activity__rows">
        {group.rows.map((row) => (
          <Row key={row.id} row={row} />
        ))}
      </ol>
    </li>
  );
}

/** The history as runs of a stage, newest first: what happened, how long it took, how it ended. */
function Activity({
  history,
  flow,
  snapshot,
  running
}: {
  readonly history: readonly HistoryEvent[];
  readonly flow: FlowModel;
  readonly snapshot: FlowSnapshot;
  readonly running: boolean;
}) {
  const t = useT();
  const now = useNow();
  const groups = activityGroups(history, now, running, snapshot);
  if (groups.length === 0) return <p className="desk-muted">{t("desk.activity.empty")}</p>;
  return (
    <ol className="desk-activity" aria-label={t("desk.activity.label")}>
      {groups.map((group) => (
        <Group
          key={group.id}
          group={group}
          kind={flow.nodes.find((node) => node.id === group.node)?.kind}
        />
      ))}
    </ol>
  );
}

export type HistoryTab = "trace" | "log";
const isHistoryTab = (value: string): value is HistoryTab => value === "trace" || value === "log";

/** What the History card shows. The issue page owns it, so the incident and the palette can steer it. */
export interface HistoryControl {
  readonly open: boolean;
  readonly setOpen: (open: boolean) => void;
  readonly tab: HistoryTab;
  readonly setTab: (tab: HistoryTab) => void;
  readonly filter: TraceFilter;
  readonly setFilter: (filter: TraceFilter) => void;
  readonly everyEvent: boolean;
  readonly setEveryEvent: (everyEvent: boolean) => void;
  readonly focus: TraceFocus | null;
  /** Open the trace, and bring a step into view when one is named. */
  readonly showTrace: (stepId: string | null) => void;
}

/**
 * The state of the History card. It follows `defaultOpen` (the issue runs, needs you, or is in
 * intake) until the engineer shows or hides it.
 */
export function useHistoryControl(defaultOpen: boolean): HistoryControl {
  const [chosen, setOpen] = useState<boolean | null>(null);
  const [tab, setTab] = useState<HistoryTab>("trace");
  const [filter, setFilter] = useState<TraceFilter>("all");
  const [everyEvent, setEveryEvent] = useState(false);
  const [focus, setFocus] = useState<TraceFocus | null>(null);
  return {
    open: chosen ?? defaultOpen,
    setOpen,
    tab,
    setTab,
    filter,
    setFilter,
    everyEvent,
    setEveryEvent,
    focus,
    showTrace: (stepId) => {
      setOpen(true);
      setTab("trace");
      setEveryEvent(false);
      if (stepId === null) return;
      // A step that the filter hides comes back with every step.
      setFilter((current) => (current === "agents" ? "all" : current));
      setFocus((current) => ({ id: stepId, count: (current?.count ?? 0) + 1 }));
    }
  };
}

export interface IssueHistoryProps {
  readonly issueNumber: number;
  readonly history: readonly HistoryEvent[];
  readonly flow: FlowModel;
  /** The issue's flow: it places each event on its stage. */
  readonly snapshot: FlowSnapshot;
  readonly trace: Trace;
  readonly running: boolean;
  readonly needsYou: boolean;
  readonly control: HistoryControl;
  readonly onJump: () => void;
  readonly onInspect: (node: FlowNodeId) => void;
  readonly sectionRef: Ref<HTMLElement>;
}

/**
 * The history of the issue below the decision: one line of summary, and on demand the trace
 * (every step on one time axis, or every raw event) and the live log.
 */
export function IssueHistory({
  issueNumber,
  history,
  flow,
  snapshot,
  trace,
  running,
  needsYou,
  control,
  onJump,
  onInspect,
  sectionRef
}: IssueHistoryProps) {
  const t = useT();
  const { language } = useLanguage();
  const id = useId();
  const summary = [
    t("desk.history.summary", {
      steps: trace.steps.length,
      agents: formatElapsed(trace.agentMs, language),
      you: formatElapsed(trace.youMs, language)
    }),
    trace.problems > 0
      ? t("desk.history.problems", { count: trace.problems })
      : t("desk.history.clean")
  ].join(" · ");
  return (
    <section
      ref={sectionRef}
      tabIndex={-1}
      className="desk-history"
      aria-labelledby={`${id}-title`}
    >
      <Card className="desk-panel">
        <div className="desk-history__head">
          <h2 id={`${id}-title`}>{t("desk.history.title")}</h2>
          <span className="desk-history__summary">{summary}</span>
          <Button
            appearance="ghost"
            spacing="compact"
            className="desk-history__toggle"
            aria-expanded={control.open}
            aria-controls={control.open ? `${id}-body` : undefined}
            onClick={() => control.setOpen(!control.open)}
          >
            {t(control.open ? "desk.history.hide" : "desk.history.show")}
          </Button>
        </div>
        {control.open && (
          <Tabs
            id={`${id}-body`}
            value={control.tab}
            onValueChange={(value) => {
              if (isHistoryTab(value)) control.setTab(value);
            }}
            className="desk-tabs"
          >
            <div className="desk-history__bar">
              <TabsList className="desk-tabs__list">
                <TabsTrigger value="trace">{t("desk.trace.title")}</TabsTrigger>
                <TabsTrigger value="log">{t("desk.log.title")}</TabsTrigger>
              </TabsList>
              {control.tab === "trace" && (
                <div className="desk-check-row desk-history__every">
                  <Checkbox
                    id={`${id}-every`}
                    checked={control.everyEvent}
                    onCheckedChange={(next) => control.setEveryEvent(next === true)}
                  />
                  <Label htmlFor={`${id}-every`}>{t("desk.trace.everyEvent")}</Label>
                </div>
              )}
            </div>
            <TabsContent value="trace" className="desk-tabs__panel">
              {control.everyEvent ? (
                <Activity history={history} flow={flow} snapshot={snapshot} running={running} />
              ) : (
                <TraceView
                  issueNumber={issueNumber}
                  trace={trace}
                  needsYou={needsYou}
                  filter={control.filter}
                  onFilter={control.setFilter}
                  focus={control.focus}
                  onJump={onJump}
                  onInspect={onInspect}
                />
              )}
              <Handoffs steps={trace.steps} />
            </TabsContent>
            <TabsContent value="log" className="desk-tabs__panel">
              <LogPanel issueNumber={issueNumber} />
            </TabsContent>
          </Tabs>
        )}
      </Card>
    </section>
  );
}
