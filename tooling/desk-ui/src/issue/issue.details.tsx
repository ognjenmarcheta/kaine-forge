import type { FlowModel, FlowNodeId, IssueDetail, RunRecord } from "@repo/desk/contracts";
import { Button, Checkbox, Label, Tabs, TabsContent, TabsList, TabsTrigger } from "@repo/ui";
import { Fragment, useId, useState, type Ref } from "react";

import { Activity } from "./issue.tabs";
import type { Trace, TraceFilter } from "./issue.trace";
import { Handoffs, TraceView, type TraceFocus } from "./issue.waterfall";
import { useStageNames } from "../flow/flow.names";
import { agentName } from "../flow/flow.steps";
import { useLanguage, useT } from "../i18n/i18n.t";
import { CapabilityReceipt } from "../inspector/inspector.capabilities";
import { stageRoleOf } from "../inspector/inspector.model";
import { StageResult } from "../inspector/inspector.result";
import { formatCount, formatDuration, formatUsd } from "../shell/shell.format";

export const DETAIL_TABS = ["history", "outputs", "runs"] as const;
export type DetailTab = (typeof DETAIL_TABS)[number];
const isDetailTab = (value: string): value is DetailTab => DETAIL_TABS.some((tab) => tab === value);

/** What the Details card shows. The item page owns it, so the rail and the palette can steer it. */
export interface DetailsControl {
  readonly tab: DetailTab;
  readonly setTab: (tab: DetailTab) => void;
  /** The step whose output shows on Files and outputs. */
  readonly output: FlowNodeId | null;
  readonly setOutput: (node: FlowNodeId | null) => void;
  readonly focus: TraceFocus | null;
  /** Open Agent runs on the trace of a step. */
  readonly showTrace: (stepId: string | null) => void;
}

export function useDetailsControl(): DetailsControl {
  const [tab, setTab] = useState<DetailTab>("history");
  const [output, setOutput] = useState<FlowNodeId | null>(null);
  const [focus, setFocus] = useState<TraceFocus | null>(null);
  return {
    tab,
    setTab,
    output,
    setOutput,
    focus,
    showTrace: (stepId) => {
      setTab("runs");
      if (stepId !== null) {
        setFocus((current) => ({ id: stepId, count: (current?.count ?? 0) + 1 }));
      }
    }
  };
}

/** Steps whose output the page can show: the ones with a result of their own that ran. */
const outputSteps = (flow: FlowModel, detail: IssueDetail): FlowNodeId[] =>
  flow.nodes
    .filter((node) => node.status !== "idle" && stageRoleOf(detail, node.id) !== null)
    .map((node) => node.id);

function Outputs({
  flow,
  detail,
  revision,
  control
}: {
  readonly flow: FlowModel;
  readonly detail: IssueDetail;
  readonly revision: string;
  readonly control: DetailsControl;
}) {
  const t = useT();
  const names = useStageNames();
  const steps = outputSteps(flow, detail);
  const chosen =
    control.output !== null && steps.includes(control.output) ? control.output : steps.at(-1);
  const node = flow.nodes.find((entry) => entry.id === chosen);
  if (node === undefined) return <p className="dk-t-sub">{t("desk.details.noOutputs")}</p>;
  return (
    <div className="dk-stack">
      <div className="dk-row" role="group" aria-label={t("desk.details.outputs")}>
        {steps.map((step) => (
          <Button
            key={step}
            appearance="ghost"
            className="dk-bare dk-fchip"
            aria-pressed={step === chosen}
            onClick={() => control.setOutput(step)}
          >
            {names.node(step)}
          </Button>
        ))}
      </div>
      <StageResult node={node} detail={detail} revision={revision} />
      <p className="dk-t-small dk-t-sub">{t("desk.details.asWritten")}</p>
    </div>
  );
}

/** The trace step a run belongs to: the step of its role that was running when it started. */
const stepOfRun = (trace: Trace, run: RunRecord): string | null => {
  const at = Date.parse(run.at);
  return (
    trace.steps.find((step) => step.role === run.role && step.startMs <= at && at <= step.endMs)
      ?.id ?? null
  );
};

function AgentRuns({
  detail,
  trace,
  needsYou,
  control,
  onInspect
}: {
  readonly detail: IssueDetail;
  readonly trace: Trace;
  readonly needsYou: boolean;
  readonly control: DetailsControl;
  readonly onInspect: (node: FlowNodeId) => void;
}) {
  const t = useT();
  const { language } = useLanguage();
  const [receipt, setReceipt] = useState<number | null>(null);
  const [traced, setTraced] = useState<number | null>(null);
  const [filter, setFilter] = useState<TraceFilter>("all");
  const none = t("desk.inspector.kpi.empty");
  if (detail.runs.length === 0) {
    return (
      <div className="dk-empty">
        <p>{t("desk.details.noRuns")}</p>
      </div>
    );
  }
  return (
    <div className="dk-stack">
      <div className="dk-tbl-wrap">
        <table className="dk-tbl">
          <thead>
            <tr>
              <th scope="col">{t("desk.details.col.run")}</th>
              <th scope="col">{t("desk.details.col.agent")}</th>
              <th scope="col" className="dk-n">
                {t("desk.details.col.time")}
              </th>
              <th scope="col" className="dk-n">
                {t("desk.details.col.tokens")}
              </th>
              <th scope="col" className="dk-n">
                {t("desk.details.col.turns")}
              </th>
              <th scope="col" className="dk-n">
                {t("desk.details.col.cost")}
              </th>
              <th scope="col">{t("desk.details.col.result")}</th>
            </tr>
          </thead>
          <tbody>
            {detail.runs.map((run, index) => {
              const step = stepOfRun(trace, run);
              const tokens =
                run.usage === null
                  ? none
                  : t("desk.details.tokens", {
                      input: formatCount(
                        run.usage.inputTokens + run.usage.cachedInputTokens,
                        language
                      ),
                      output: formatCount(run.usage.outputTokens, language)
                    });
              return (
                <Fragment key={`${run.at}-${String(index)}`}>
                  <tr>
                    <td>
                      <Button
                        appearance="link"
                        spacing="compact"
                        className="dk-bare dk-linkbtn"
                        aria-expanded={receipt === index}
                        disabled={run.capabilities === undefined}
                        onClick={() => setReceipt(receipt === index ? null : index)}
                      >
                        {t("desk.details.runName", { n: index + 1 })}
                      </Button>
                      {receipt === index && run.capabilities !== undefined && (
                        <CapabilityReceipt profile={run.capabilities} />
                      )}
                    </td>
                    <td>
                      {agentName(
                        t,
                        run.agentId === undefined ? null : { id: run.agentId },
                        run.role
                      )}{" "}
                      <span className="dk-t-sub dk-dot">
                        {run.model ?? t("desk.rail.defaultModel")}
                      </span>
                    </td>
                    <td className="dk-n">{formatDuration(run.durationMs, language)}</td>
                    <td className="dk-n">{tokens}</td>
                    <td className="dk-n">
                      {run.turns === null ? none : formatCount(run.turns, language)}
                    </td>
                    <td className="dk-n">
                      {run.costUsd === null ? none : formatUsd(run.costUsd, language)}
                    </td>
                    <td>
                      {t(run.accepted ? "desk.details.accepted" : "desk.details.notAccepted")}{" "}
                      {step !== null && (
                        <Button
                          appearance="link"
                          spacing="compact"
                          className="dk-bare dk-linkbtn dk-t-small"
                          aria-expanded={traced === index}
                          onClick={() => setTraced(traced === index ? null : index)}
                        >
                          {t(
                            traced === index ? "desk.details.hideTrace" : "desk.details.showTrace"
                          )}
                        </Button>
                      )}
                    </td>
                  </tr>
                  {traced === index && step !== null && (
                    <tr>
                      <td colSpan={7}>
                        <TraceView
                          issueNumber={detail.summary.issueNumber}
                          trace={trace}
                          needsYou={needsYou}
                          filter={filter}
                          onFilter={setFilter}
                          focus={{ id: step, count: 1 }}
                          onJump={() => control.showTrace(step)}
                          onInspect={onInspect}
                        />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      <Handoffs steps={trace.steps} />
      <p className="dk-t-small dk-t-sub">{t("desk.details.runsHelp")}</p>
    </div>
  );
}

export interface DetailsProps {
  readonly detail: IssueDetail;
  readonly flow: FlowModel;
  readonly trace: Trace;
  readonly revision: string;
  readonly running: boolean;
  readonly needsYou: boolean;
  readonly control: DetailsControl;
  readonly onInspect: (node: FlowNodeId) => void;
  readonly sectionRef: Ref<HTMLElement>;
}

/** The details under the decision: every step run, what each step wrote, and the agent runs. */
export function Details({
  detail,
  flow,
  trace,
  revision,
  running,
  control,
  needsYou,
  onInspect,
  sectionRef
}: DetailsProps) {
  const t = useT();
  const id = useId();
  const [newestFirst, setNewestFirst] = useState(true);
  return (
    <section
      ref={sectionRef}
      tabIndex={-1}
      className="dk-card"
      aria-label={t("desk.details.label")}
    >
      <Tabs
        value={control.tab}
        onValueChange={(value) => {
          if (isDetailTab(value)) control.setTab(value);
        }}
      >
        <TabsList className="dk-tabs">
          {DETAIL_TABS.map((tab) => (
            <TabsTrigger key={tab} value={tab} className="dk-bare">
              {t(`desk.details.tab.${tab}`)}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="history" className="dk-tab-panel">
          <div className="dk-row">
            <span className="dk-t-small dk-t-sub dk-grow">{t("desk.details.historyHelp")}</span>
            <div className="dk-check">
              <Checkbox
                id={`${id}-order`}
                checked={newestFirst}
                onCheckedChange={(next) => setNewestFirst(next === true)}
              />
              <Label htmlFor={`${id}-order`}>{t("desk.details.newestFirst")}</Label>
            </div>
          </div>
          <Activity
            history={detail.state.history}
            flow={flow}
            snapshot={detail.state.flowSnapshot}
            running={running}
            newestFirst={newestFirst}
          />
        </TabsContent>
        <TabsContent value="outputs" className="dk-tab-panel">
          <Outputs flow={flow} detail={detail} revision={revision} control={control} />
        </TabsContent>
        <TabsContent value="runs" className="dk-tab-panel">
          <AgentRuns
            detail={detail}
            trace={trace}
            needsYou={needsYou}
            control={control}
            onInspect={onInspect}
          />
        </TabsContent>
      </Tabs>
    </section>
  );
}
