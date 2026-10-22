import type { AgentList, AgentView } from "@repo/desk/contracts";
import { Button, Card, Modal } from "@repo/ui";
import { useId, useLayoutEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { CloneDialog } from "./agents.clone-dialog";
import { AgentForm } from "./agents.form";
import {
  EMPTY_DRAFT,
  definitionOf,
  draftOf,
  draftProblems,
  serverProblems,
  type AgentDraft,
  type AgentField,
  type DraftProblem,
  type ServerProblem
} from "./agents.model";
import { CapabilityPreview } from "./agents.preview";
import { useAgentList } from "./agents.use";
import { DefinitionBadges, DefinitionProblems, useAgentPaletteActions } from "./agents.view";
import { toApiError, type DeskApiError } from "../api/api.client";
import { useT, type Translate } from "../i18n/i18n.t";
import { RouteLink, useLeaveGuard, useRouter } from "../shell/shell.router";
import { FailureText, LoadingLines, Pre } from "../shell/shell.ui";
import { useDesk } from "../state/desk.provider";

const problemText = (t: Translate, problem: DraftProblem, draft: AgentDraft): string => {
  switch (problem.kind) {
    case "taken":
      return t("desk.agents.error.idTaken");
    case "preset":
      return t(
        draft.output === "change"
          ? "desk.agents.presetChangeNeedsEdit"
          : "desk.agents.presetOnlyChange"
      );
    case "invalid":
      switch (problem.field) {
        case "id":
          return t("desk.agents.error.id");
        case "name":
        case "description":
        case "prompt":
          return t("desk.agents.error.required");
        case "timeoutMinutes":
          return t("desk.agents.error.timeout");
        default:
          return t("desk.agents.error.invalid");
      }
  }
};

type Dialog = "override" | "promote" | "overwrite" | "delete" | null;

interface Refusal {
  readonly flows: readonly string[];
  readonly detail: string | null;
}

/**
 * One agent: its fields on the left and what a run gets on the right. A local agent saves,
 * promotes, and deletes. A repo agent is read-only until "Edit locally"; its save writes a local
 * override after a confirmation. A built-in agent changes only through a copy.
 */
function EditorBody({
  view,
  list,
  reload,
  onPromoted
}: {
  /** `null`: a new agent. */
  readonly view: AgentView | null;
  readonly list: AgentList;
  readonly reload: () => void;
  readonly onPromoted: (path: string) => void;
}) {
  const t = useT();
  const base = useId();
  const { api } = useDesk();
  const { navigate } = useRouter();
  const baseline = view === null ? EMPTY_DRAFT : draftOf(view.definition);
  const [draft, setDraft] = useState<AgentDraft>(baseline);
  const [editing, setEditing] = useState(view === null || view.source === "local");
  const [touched, setTouched] = useState<ReadonlySet<AgentField>>(new Set());
  const [submitted, setSubmitted] = useState(false);
  const [server, setServer] = useState<readonly ServerProblem[]>([]);
  const [failure, setFailure] = useState<DeskApiError | null>(null);
  const [pending, setPending] = useState(false);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [overwriteDetail, setOverwriteDetail] = useState<string | null>(null);
  const [refusal, setRefusal] = useState<Refusal | null>(null);
  const [cloning, setCloning] = useState(false);

  const isNew = view === null;
  const agentId = view?.definition.id ?? draft.id.trim();
  const dirty = editing && JSON.stringify(draft) !== JSON.stringify(baseline);
  const taken = list.agents.map((entry) => entry.definition.id);
  const problems = draftProblems(draft, isNew ? taken : null);

  // A save or a delete that moves on is not leaving unsaved work behind.
  const leaving = useRef(false);
  const unsaved = useRef(dirty);
  useLayoutEffect(() => {
    unsaved.current = dirty;
  });
  useLeaveGuard(() => unsaved.current && !leaving.current, t("desk.agents.leave"));

  const errorOf = (field: AgentField): string | null => {
    const fromServer = server.filter((problem) => problem.field === field);
    if (fromServer.length > 0) return fromServer.map((problem) => problem.message).join(" ");
    const problem = problems.find((candidate) => candidate.field === field);
    if (problem === undefined || !(submitted || touched.has(field))) return null;
    return problemText(t, problem, draft);
  };

  const fail = (error: unknown): void => {
    const converted = toApiError(error);
    if (converted.code === "invalid-definition") {
      setServer(serverProblems(converted.detail));
    } else {
      setFailure(converted);
    }
  };

  const save = (confirmed: boolean): void => {
    setSubmitted(true);
    const first = problems[0];
    if (first !== undefined) {
      document.getElementById(`${base}-${first.field}`)?.focus();
      return;
    }
    if (view?.source === "repo" && !confirmed) {
      setDialog("override");
      return;
    }
    setDialog(null);
    setPending(true);
    setServer([]);
    setFailure(null);
    api
      .saveAgent(definitionOf(draft))
      .then(
        (result) => {
          toast.success(t("desk.agents.saved"), { description: result.path });
          if (isNew) {
            leaving.current = true;
            navigate({ view: "agent", agentId: result.id });
          } else {
            reload();
          }
        },
        (error: unknown) => fail(error)
      )
      .finally(() => setPending(false));
  };

  const promote = (confirm: boolean): void => {
    setPending(true);
    setFailure(null);
    api
      .promoteDefinition("agent", agentId, confirm)
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
    setRefusal(null);
    api
      .deleteDefinition("agent", agentId)
      .then(
        (result) => {
          setDialog(null);
          toast.success(t("desk.agents.delete.done"), { description: result.path });
          leaving.current = true;
          navigate({ view: "agents" });
        },
        async (error: unknown) => {
          setDialog(null);
          const converted = toApiError(error);
          if (converted.code !== "definition-refused") {
            setFailure(converted);
            return;
          }
          // The refusal names the flows by id; the owner knows them by name.
          const flows = await api.flows().then(
            (found) =>
              found.flows
                .filter(({ definition }) =>
                  definition.steps.some((step) => step.kind === "agent" && step.agent === agentId)
                )
                .map(({ definition }) => definition.name),
            () => []
          );
          setRefusal({ flows, detail: converted.detail });
        }
      )
      .finally(() => setPending(false));
  };

  const update = (next: AgentDraft, field: AgentField): void => {
    setDraft(next);
    setTouched((was) => new Set([...was, field]));
    setServer([]);
  };

  const formLevel = server.filter((problem) => problem.field === null);
  const title = isNew ? t("desk.agents.new") : (view?.definition.name ?? "");

  return (
    <>
      <div className="desk-heading desk-editor__heading">
        <div>
          <RouteLink to={{ view: "agents" }} className="desk-editor__back">
            {t("desk.agents.back")}
          </RouteLink>
          <h1>{title}</h1>
          {view !== null && (
            <p className="desk-editor__facts">
              <code className="desk-agent__id">{view.definition.id}</code>
              <DefinitionBadges view={view} />
            </p>
          )}
        </div>
        {view !== null && (
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
          </div>
        )}
      </div>
      {view !== null && <DefinitionProblems problems={view.problems} />}
      {view?.source === "builtin" && <p className="desk-note">{t("desk.agents.builtinNote")}</p>}
      {view?.source === "repo" && !editing && (
        <p className="desk-note">{t("desk.agents.repoNote")}</p>
      )}
      {view?.source === "repo" && editing && (
        <p className="desk-warning">{t("desk.agents.overrideNote")}</p>
      )}
      {failure !== null && <FailureText code={failure.code} detail={failure.detail} />}
      {formLevel.length > 0 && (
        <div className="desk-failure" role="alert">
          <p>{t("desk.error.invalid-definition")}</p>
          <ul>
            {formLevel.map((problem) => (
              <li key={problem.message}>{problem.message}</li>
            ))}
          </ul>
        </div>
      )}
      {refusal !== null && (
        <div className="desk-failure" role="alert">
          <p>{t("desk.agents.delete.usedBy")}</p>
          {refusal.flows.length > 0 && (
            <ul>
              {refusal.flows.map((name) => (
                <li key={name}>{name}</li>
              ))}
            </ul>
          )}
          {refusal.detail !== null && <Pre>{refusal.detail}</Pre>}
        </div>
      )}
      <div className="desk-editor">
        <Card className="desk-panel">
          <AgentForm
            base={base}
            draft={draft}
            isNew={isNew}
            editable={editing}
            installed={list.installed}
            errorOf={errorOf}
            onChange={update}
            onSubmit={() => save(false)}
          >
            {editing && (
              <div className="desk-editor__save">
                <Button type="submit" disabled={pending}>
                  {pending ? t("desk.common.working") : t("desk.agents.save")}
                </Button>
                {view?.source === "repo" && (
                  <Button
                    type="button"
                    appearance="subtle"
                    onClick={() => {
                      setDraft(baseline);
                      setEditing(false);
                      setServer([]);
                      setSubmitted(false);
                    }}
                  >
                    {t("desk.agents.discard")}
                  </Button>
                )}
                {view?.source === "local" && (
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
                {view?.source === "local" && dirty && (
                  <p id={`${base}-save-first`} className="desk-muted">
                    {t("desk.agents.promote.saveFirst")}
                  </p>
                )}
              </div>
            )}
          </AgentForm>
        </Card>
        <aside className="desk-editor__aside">
          <CapabilityPreview
            draft={draft}
            resolved={view !== null && !dirty ? view.resolved : null}
          />
        </aside>
      </div>
      <Modal
        open={dialog === "override"}
        onOpenChange={(open) => setDialog(open ? "override" : null)}
        title={t("desk.agents.override.title")}
        description={t("desk.agents.override.body", {
          path: `.ai.local/desk/agents/${agentId}.md`
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
        onOpenChange={(open) => setDialog(open ? "promote" : null)}
        title={t("desk.agents.promote.title", { name: title })}
        description={t("desk.agents.promote.body", { path: `.desk/agents/${agentId}.md` })}
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
        onOpenChange={(open) => setDialog(open ? "overwrite" : null)}
        title={t("desk.agents.overwrite.title")}
        description={t("desk.agents.overwrite.body", { path: `.desk/agents/${agentId}.md` })}
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
        onOpenChange={(open) => setDialog(open ? "delete" : null)}
        title={t("desk.agents.delete.title", { name: title })}
        description={
          view?.shadows === null || view?.shadows === undefined
            ? t("desk.agents.delete.body")
            : t("desk.agents.delete.bodyShadow", {
                source: t(`desk.flow.source.${view.shadows}`)
              })
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
        kind="agent"
        source={cloning ? (view?.definition ?? null) : null}
        taken={taken}
        onOpenChange={(open) => setCloning(open)}
      />
    </>
  );
}

/** The editor of `agentId`, or of a new agent. It reads the whole list: the ids in use and the installed names come from it. */
export function AgentEditor({ agentId }: { readonly agentId: string | null }) {
  const t = useT();
  const { state, reload } = useAgentList();
  const [promoted, setPromoted] = useState<string | null>(null);
  const agents = state.status === "ok" ? state.list.agents : [];
  useAgentPaletteActions(agents);

  if (state.status === "loading")
    return <LoadingLines label={t("desk.agents.loading")} lines={6} />;
  if (state.status === "error") return <FailureText code={state.code} detail={state.detail} />;
  const view = agentId === null ? null : agents.find((entry) => entry.definition.id === agentId);
  if (view === undefined) {
    return (
      <>
        <RouteLink to={{ view: "agents" }} className="desk-editor__back">
          {t("desk.agents.back")}
        </RouteLink>
        <h1>{t("desk.agents.missingTitle")}</h1>
        <p className="desk-muted">{t("desk.agents.missing", { id: agentId ?? "" })}</p>
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
        key={view === null ? "new" : `${view.source}-${view.hash}`}
        view={view}
        list={state.list}
        reload={reload}
        onPromoted={setPromoted}
      />
    </>
  );
}
