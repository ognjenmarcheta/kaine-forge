import type { AgentView, FlowView, StepKind } from "@repo/desk/contracts";
import { Badge, Button, Card, Modal } from "@repo/ui";
import { useId, useLayoutEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { FlowCanvas } from "./flows.canvas";
import { FlowForm } from "./flows.form";
import {
  definitionOf,
  draftOf,
  flowProblems,
  hasProblems,
  insertStep,
  isChanged,
  serverProblems,
  type FlowDraft,
  type RuleProblem
} from "./flows.model";
import { useFlowsData } from "./flows.use";
import { NewFlowDialog, useFlowPaletteActions } from "./flows.view";
import { CloneDialog } from "../agents/agents.clone-dialog";
import { DefinitionBadges, DefinitionProblems } from "../agents/agents.view";
import { toApiError, type DeskApiError } from "../api/api.client";
import { StartDialog } from "../board/board.start-dialog";
import { BUILTIN_FLOW_ID } from "../flow/flow.steps";
import { useT } from "../i18n/i18n.t";
import { RouteLink, useLeaveGuard, useRouter } from "../shell/shell.router";
import { FailureText, LoadingLines, Pre } from "../shell/shell.ui";
import { useDesk } from "../state/desk.provider";

type Dialog = "override" | "promote" | "overwrite" | "delete" | null;

/**
 * One flow: its steps as a list on the left and as a graph on the right, both over one draft.
 * A local flow saves, promotes, and deletes. A repo flow is read-only until "Edit locally"; its
 * save writes a local override after a confirmation. A built-in flow changes only through a copy.
 * The rules run as the owner types; Save stays off while any of them fails.
 */
function EditorBody({
  view,
  flows,
  agents,
  reload,
  onPromoted
}: {
  readonly view: FlowView;
  readonly flows: readonly FlowView[];
  readonly agents: readonly AgentView[];
  readonly reload: () => void;
  readonly onPromoted: (path: string) => void;
}) {
  const t = useT();
  const base = useId();
  const { api } = useDesk();
  const { navigate } = useRouter();
  const baseline = view.definition;
  const flowId = baseline.id;
  const [draft, setDraft] = useState<FlowDraft>(() => draftOf(baseline));
  const [editing, setEditing] = useState(view.source === "local");
  const [selected, setSelected] = useState<string | null>(null);
  const [focus, setFocus] = useState<{ readonly key: string; readonly seq: number } | null>(null);
  const [server, setServer] = useState<readonly RuleProblem[]>([]);
  const [failure, setFailure] = useState<DeskApiError | null>(null);
  const [pending, setPending] = useState(false);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [overwriteDetail, setOverwriteDetail] = useState<string | null>(null);
  const [cloning, setCloning] = useState(false);
  const [starting, setStarting] = useState(false);

  const dirty = editing && isChanged(draft, baseline);
  const problems = flowProblems(
    draft,
    agents.map(({ definition }) => definition)
  );
  const rules = [...problems.rules, ...server];
  const blocked = hasProblems(problems);
  const total = problems.fields.length + problems.rules.length;
  const invalidKeys = new Set(
    [...problems.fields, ...rules].flatMap((problem) => (problem.key === null ? [] : [problem.key]))
  );
  const flowRules = rules.filter((problem) => problem.key === null);

  // A delete that moves on is not leaving unsaved work behind.
  const leaving = useRef(false);
  const unsaved = useRef(dirty);
  useLayoutEffect(() => {
    unsaved.current = dirty;
  });
  useLeaveGuard(() => unsaved.current && !leaving.current, t("desk.flows.leave"));

  const change = (next: FlowDraft): void => {
    setDraft(next);
    setServer([]);
  };

  const open = (key: string): void => {
    setSelected(key);
    setFocus((was) => ({ key, seq: (was?.seq ?? 0) + 1 }));
  };

  const insert = (kind: StepKind, at: number): void => {
    const agent =
      agents.find(({ definition }) => definition.output !== "intake")?.definition.id ?? "";
    const added = insertStep(draft, at, { kind, label: t(`desk.flows.kind.${kind}`), agent });
    change(added.draft);
    open(added.key);
  };

  const fail = (error: unknown): void => {
    const converted = toApiError(error);
    if (converted.code === "invalid-definition") {
      setServer(serverProblems(draft, converted.detail));
    } else {
      setFailure(converted);
    }
  };

  const save = (confirmed: boolean): void => {
    if (blocked) return;
    if (view.source === "repo" && !confirmed) {
      setDialog("override");
      return;
    }
    setDialog(null);
    setPending(true);
    setServer([]);
    setFailure(null);
    api
      .saveFlow(definitionOf(draft))
      .then(
        (result) => {
          toast.success(t("desk.agents.saved"), { description: result.path });
          reload();
        },
        (error: unknown) => fail(error)
      )
      .finally(() => setPending(false));
  };

  const promote = (confirm: boolean): void => {
    setPending(true);
    setFailure(null);
    api
      .promoteDefinition("flow", flowId, confirm)
      .then(
        (result) => {
          setDialog(null);
          toast.success(t("desk.agents.promote.done"), { description: result.path });
          onPromoted(result.path);
          reload();
        },
        (error: unknown) => {
          const converted = toApiError(error);
          if (converted.code === "definition-refused" && !confirm) {
            setOverwriteDetail(converted.detail);
            setDialog("overwrite");
            return;
          }
          setDialog(null);
          fail(converted);
        }
      )
      .finally(() => setPending(false));
  };

  const remove = (): void => {
    setPending(true);
    setFailure(null);
    api
      .deleteDefinition("flow", flowId)
      .then(
        (result) => {
          setDialog(null);
          toast.success(t("desk.flows.delete.done"), { description: result.path });
          leaving.current = true;
          navigate({ view: "flows" });
        },
        (error: unknown) => {
          setDialog(null);
          setFailure(toApiError(error));
        }
      )
      .finally(() => setPending(false));
  };

  const name = baseline.name;
  const reason = `${base}-blocked`;

  return (
    <>
      <div className="desk-heading desk-editor__heading">
        <div>
          <RouteLink to={{ view: "flows" }} className="desk-editor__back">
            {t("desk.flows.back")}
          </RouteLink>
          <h1>{name}</h1>
          <p className="desk-editor__facts">
            <code className="desk-agent__id">{flowId}</code>
            <DefinitionBadges view={view} />
            {flowId === BUILTIN_FLOW_ID && (
              <Badge appearance="information">{t("desk.flows.default")}</Badge>
            )}
          </p>
        </div>
        <div className="desk-editor__actions">
          {view.source === "builtin" && (
            <Button type="button" onClick={() => setCloning(true)}>
              {t("desk.agents.cloneToEdit")}
            </Button>
          )}
          {view.source === "repo" && !editing && (
            <Button type="button" onClick={() => setEditing(true)}>
              {t("desk.agents.editLocally")}
            </Button>
          )}
          {view.source !== "builtin" && (
            <Button type="button" appearance="subtle" onClick={() => setCloning(true)}>
              {t("desk.agents.clone")}
            </Button>
          )}
          <Button
            type="button"
            appearance="subtle"
            disabled={dirty}
            onClick={() => setStarting(true)}
          >
            {t("desk.flows.start")}
          </Button>
        </div>
      </div>
      <DefinitionProblems problems={view.problems} kind="flow" />
      {view.source === "builtin" && <p className="desk-note">{t("desk.flows.builtinNote")}</p>}
      {view.source === "repo" && !editing && (
        <p className="desk-note">{t("desk.flows.repoNote")}</p>
      )}
      {view.source === "repo" && editing && (
        <p className="desk-warning">{t("desk.flows.overrideNote")}</p>
      )}
      {failure !== null && <FailureText code={failure.code} detail={failure.detail} />}
      {editing && (blocked || flowRules.length > 0) && (
        <div className="desk-failure" role="status">
          <p>
            {blocked
              ? t("desk.flows.problemSummary", { count: total })
              : t("desk.error.invalid-definition")}
          </p>
          {flowRules.length > 0 && (
            <ul>
              {flowRules.map((problem) => (
                <li key={problem.message}>{problem.message}</li>
              ))}
            </ul>
          )}
        </div>
      )}
      <div className="desk-flows-editor">
        <Card className="desk-panel">
          <FlowForm
            base={base}
            draft={draft}
            editable={editing}
            agents={agents}
            fields={problems.fields}
            rules={rules}
            selected={selected}
            focus={focus}
            onChange={change}
            onSelect={setSelected}
            onInsert={insert}
            onSubmit={() => save(false)}
          >
            {editing && (
              <div className="desk-editor__save">
                <Button
                  type="submit"
                  disabled={pending || blocked}
                  aria-describedby={blocked ? reason : undefined}
                >
                  {pending ? t("desk.common.working") : t("desk.agents.save")}
                </Button>
                {view.source === "repo" && (
                  <Button
                    type="button"
                    appearance="subtle"
                    onClick={() => {
                      setDraft(draftOf(baseline));
                      setEditing(false);
                      setServer([]);
                    }}
                  >
                    {t("desk.agents.discard")}
                  </Button>
                )}
                {view.source === "local" && (
                  <>
                    <Button
                      type="button"
                      appearance="subtle"
                      disabled={pending || dirty}
                      aria-describedby={dirty ? `${base}-save-first` : undefined}
                      onClick={() => setDialog("promote")}
                    >
                      {t("desk.agents.promote")}
                    </Button>
                    <Button
                      type="button"
                      appearance="danger"
                      disabled={pending}
                      onClick={() => setDialog("delete")}
                    >
                      {t("desk.agents.delete")}
                    </Button>
                  </>
                )}
                {blocked && (
                  <p id={reason} className="desk-muted">
                    {t("desk.flows.saveBlocked")}
                  </p>
                )}
                {view.source === "local" && dirty && (
                  <p id={`${base}-save-first`} className="desk-muted">
                    {t("desk.agents.promote.saveFirst")}
                  </p>
                )}
              </div>
            )}
          </FlowForm>
        </Card>
        <section className="desk-flows-editor__canvas" aria-labelledby={`${base}-graph`}>
          <h2 id={`${base}-graph`}>{t("desk.flows.graph")}</h2>
          <p className="desk-muted">
            {t(editing ? "desk.flows.graphHelp" : "desk.flows.graphHelpReadOnly")}
          </p>
          <FlowCanvas
            draft={draft}
            editable={editing}
            invalid={invalidKeys}
            selected={selected}
            onSelect={open}
            onChange={change}
            onInsert={insert}
          />
        </section>
      </div>
      <Modal
        open={dialog === "override"}
        onOpenChange={(next) => setDialog(next ? "override" : null)}
        title={t("desk.agents.override.title")}
        description={t("desk.flows.override.body", {
          path: `.ai.local/desk/flows/${flowId}.yaml`
        })}
        closeButtonLabel={t("desk.common.close")}
        size="sm"
        actions={[
          { appearance: "subtle", label: t("desk.common.back"), onClick: () => setDialog(null) },
          {
            appearance: "default",
            label: t("desk.agents.override.confirm"),
            disabled: pending,
            onClick: () => save(true)
          }
        ]}
      />
      <Modal
        open={dialog === "promote"}
        onOpenChange={(next) => setDialog(next ? "promote" : null)}
        title={t("desk.agents.promote.title", { name })}
        description={t("desk.agents.promote.body", { path: `.desk/flows/${flowId}.yaml` })}
        closeButtonLabel={t("desk.common.close")}
        size="sm"
        actions={[
          { appearance: "subtle", label: t("desk.common.back"), onClick: () => setDialog(null) },
          {
            appearance: "default",
            label: t("desk.agents.promote.confirm"),
            disabled: pending,
            onClick: () => promote(false)
          }
        ]}
      />
      <Modal
        open={dialog === "overwrite"}
        onOpenChange={(next) => setDialog(next ? "overwrite" : null)}
        title={t("desk.flows.overwrite.title")}
        description={t("desk.agents.overwrite.body", { path: `.desk/flows/${flowId}.yaml` })}
        closeButtonLabel={t("desk.common.close")}
        size="sm"
        actions={[
          { appearance: "subtle", label: t("desk.common.back"), onClick: () => setDialog(null) },
          {
            appearance: "danger",
            label: t("desk.agents.overwrite.confirm"),
            disabled: pending,
            onClick: () => promote(true)
          }
        ]}
      >
        {overwriteDetail !== null && <Pre>{overwriteDetail}</Pre>}
      </Modal>
      <Modal
        open={dialog === "delete"}
        onOpenChange={(next) => setDialog(next ? "delete" : null)}
        title={t("desk.agents.delete.title", { name })}
        description={
          view.shadows === null
            ? t("desk.agents.delete.body")
            : t("desk.flows.delete.bodyShadow", { source: t(`desk.flow.source.${view.shadows}`) })
        }
        closeButtonLabel={t("desk.common.close")}
        size="sm"
        actions={[
          { appearance: "subtle", label: t("desk.common.back"), onClick: () => setDialog(null) },
          {
            appearance: "danger",
            label: t("desk.agents.delete.confirm"),
            disabled: pending,
            onClick: remove
          }
        ]}
      />
      <CloneDialog
        kind="flow"
        source={cloning ? baseline : null}
        taken={flows.map((flow) => flow.definition.id)}
        onOpenChange={setCloning}
      />
      <StartDialog open={starting} flowId={flowId} onOpenChange={setStarting} />
    </>
  );
}

/** The editor of `flowId`. It reads every flow (the ids in use) and every agent (the steps name them). */
export function FlowEditor({ flowId }: { readonly flowId: string }) {
  const t = useT();
  const { state, reload } = useFlowsData();
  const [promoted, setPromoted] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const flows = state.status === "ok" ? state.flows.flows : [];
  useFlowPaletteActions(flows, () => setCreating(true));
  const dialog = <NewFlowDialog open={creating} flows={flows} onOpenChange={setCreating} />;

  if (state.status === "loading") return <LoadingLines label={t("desk.flows.loading")} lines={6} />;
  if (state.status === "error") return <FailureText code={state.code} detail={state.detail} />;
  const view = flows.find((entry) => entry.definition.id === flowId);
  if (view === undefined) {
    return (
      <>
        <RouteLink to={{ view: "flows" }} className="desk-editor__back">
          {t("desk.flows.back")}
        </RouteLink>
        <h1>{t("desk.flows.missingTitle")}</h1>
        <p className="desk-muted">{t("desk.flows.missing", { id: flowId })}</p>
        {dialog}
      </>
    );
  }
  return (
    <>
      {promoted !== null && (
        <p className="desk-note" role="status">
          {t("desk.agents.uncommitted", { path: promoted })}
        </p>
      )}
      <EditorBody
        key={`${view.source}-${view.hash}`}
        view={view}
        flows={flows}
        agents={state.agents.agents}
        reload={reload}
        onPromoted={setPromoted}
      />
      {dialog}
    </>
  );
}
