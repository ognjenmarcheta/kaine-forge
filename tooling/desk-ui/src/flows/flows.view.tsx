import type { FlowView } from "@repo/desk/contracts";
import { Badge, Button, Card, Plus, buttonVariants } from "@repo/ui";
import { useState } from "react";

import { activeIssuesOn } from "./flows.model";
import { useFlowsData } from "./flows.use";
import { CloneDialog, type CloneSource } from "../agents/agents.clone-dialog";
import { DefinitionBadges, DefinitionProblems } from "../agents/agents.view";
import { BUILTIN_FLOW_ID } from "../flow/flow.steps";
import { useT } from "../i18n/i18n.t";
import { usePaletteActions } from "../shell/shell.palette";
import { RouteLink, useRouter } from "../shell/shell.router";
import { FailureText, LoadingLines, Muted } from "../shell/shell.ui";
import { useDesk } from "../state/desk.provider";

const OPEN_LINK = buttonVariants({ appearance: "subtle", spacing: "compact" });

/** The flow a new flow copies: the built-in default, else the first flow. */
export const starterOf = (flows: readonly FlowView[]): FlowView | undefined =>
  flows.find((flow) => flow.definition.id === BUILTIN_FLOW_ID) ?? flows[0];

/** A clone dialog that says "New flow": an empty flow is not valid, so a new one starts as a copy. */
export function NewFlowDialog({
  open,
  flows,
  onOpenChange
}: {
  readonly open: boolean;
  readonly flows: readonly FlowView[];
  readonly onOpenChange: (open: boolean) => void;
}) {
  const t = useT();
  const starter = starterOf(flows);
  return (
    <CloneDialog
      kind="flow"
      source={open ? (starter?.definition ?? null) : null}
      taken={flows.map((flow) => flow.definition.id)}
      title={t("desk.flows.new")}
      onOpenChange={onOpenChange}
    />
  );
}

/** New flow, and Open for each flow the page knows, under "Actions here". */
export function useFlowPaletteActions(flows: readonly FlowView[], onNew: () => void): void {
  const t = useT();
  const { navigate } = useRouter();
  usePaletteActions([
    { id: "flow-new", label: t("desk.flows.new"), run: onNew },
    ...flows.map(({ definition }) => ({
      id: `flow-open-${definition.id}`,
      label: t("desk.flows.openNamed", { name: definition.name }),
      detail: definition.id,
      run: () => navigate({ view: "flow", flowId: definition.id })
    }))
  ]);
}

function FlowRow({
  view,
  running,
  onClone
}: {
  readonly view: FlowView;
  readonly running: number;
  readonly onClone: () => void;
}) {
  const t = useT();
  const { definition } = view;
  return (
    <li className="desk-agent">
      <div className="desk-agent__head">
        <h2 className="desk-agent__name">{definition.name}</h2>
        <code className="desk-agent__id">{definition.id}</code>
        <DefinitionBadges view={view} />
        {definition.id === BUILTIN_FLOW_ID && (
          <Badge appearance="information">{t("desk.flows.default")}</Badge>
        )}
      </div>
      <p className="desk-agent__desc">{definition.description}</p>
      <div className="desk-flows__steps">
        <span className="desk-muted">
          {t("desk.flows.stepCount", { count: definition.steps.length })}
        </span>
        <ol className="desk-flows__kinds" aria-label={t("desk.flows.kindsLabel")}>
          {definition.steps.map((step) => (
            <li key={step.id} className="desk-flows__kind" data-kind={step.kind} title={step.label}>
              {t(`desk.flows.kind.${step.kind}`)}
            </li>
          ))}
        </ol>
      </div>
      <div className="desk-agent__foot">
        <span className="desk-muted">
          {running > 0 ? t("desk.flows.usedBy", { count: running }) : null}
        </span>
        <span className="desk-agent__actions">
          <RouteLink
            to={{ view: "flow", flowId: definition.id }}
            className={OPEN_LINK}
            aria-label={t("desk.flows.openNamed", { name: definition.name })}
          >
            {t("desk.agents.open")}
          </RouteLink>
          <Button
            type="button"
            appearance="subtle"
            spacing="compact"
            aria-label={t("desk.agents.cloneNamed", { name: definition.name })}
            onClick={onClone}
          >
            {t("desk.agents.clone")}
          </Button>
        </span>
      </div>
    </li>
  );
}

/**
 * The flow library: every flow the desk can run an issue on, where its file comes from, its
 * steps in order, and how many issues on the desk run on it now. Names, descriptions, and
 * labels are the owner's words and show as they are.
 */
export function FlowsView() {
  const t = useT();
  const { state } = useFlowsData();
  const { state: desk } = useDesk();
  const [cloning, setCloning] = useState<CloneSource | null>(null);
  const [creating, setCreating] = useState(false);
  const flows = state.status === "ok" ? state.flows.flows : [];
  const issues = Object.values(desk.issues);
  useFlowPaletteActions(flows, () => setCreating(true));

  return (
    <>
      <div className="desk-heading">
        <div>
          <h1>{t("desk.flows.title")}</h1>
          <p className="desk-muted">{t("desk.flows.intro")}</p>
        </div>
        <Button type="button" disabled={flows.length === 0} onClick={() => setCreating(true)}>
          <Plus aria-hidden="true" className="desk-icon" />
          {t("desk.flows.new")}
        </Button>
      </div>
      {state.status === "loading" && <LoadingLines label={t("desk.flows.loading")} lines={4} />}
      {state.status === "error" && <FailureText code={state.code} detail={state.detail} />}
      {state.status === "ok" && (
        <>
          <DefinitionProblems problems={state.flows.problems} kind="flow" />
          {flows.length === 0 ? (
            <Card className="desk-panel">
              <Muted>{t("desk.flows.empty")}</Muted>
            </Card>
          ) : (
            <ul className="desk-agents" aria-label={t("desk.flows.title")}>
              {flows.map((view) => (
                <FlowRow
                  key={view.definition.id}
                  view={view}
                  running={activeIssuesOn(issues, view.definition.id)}
                  onClone={() => setCloning(view.definition)}
                />
              ))}
            </ul>
          )}
        </>
      )}
      <CloneDialog
        kind="flow"
        source={cloning}
        taken={flows.map((view) => view.definition.id)}
        onOpenChange={(open) => {
          if (!open) setCloning(null);
        }}
      />
      <NewFlowDialog open={creating} flows={flows} onOpenChange={setCreating} />
    </>
  );
}
