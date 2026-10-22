import {
  AGENT_OUTPUT_KINDS,
  DEFINITION_SOURCES,
  type AgentView,
  type DefinitionKind,
  type DefinitionProblem
} from "@repo/desk/contracts";
import { Badge, Button, Card, Input, Plus, Search, X, buttonVariants } from "@repo/ui";
import { useRef, useState } from "react";

import { CloneDialog } from "./agents.clone-dialog";
import {
  filterAgents,
  type AgentFilter,
  type OutputFilter,
  type SourceFilter
} from "./agents.model";
import { useAgentList } from "./agents.use";
import { useT } from "../i18n/i18n.t";
import { usePaletteActions } from "../shell/shell.palette";
import { RouteLink, useRouter } from "../shell/shell.router";
import { FailureText, LoadingLines, Muted } from "../shell/shell.ui";
import { StatusChip } from "../status/status.chip";

const OPEN_LINK = buttonVariants({ appearance: "subtle", spacing: "compact" });

/** Where an agent or a flow comes from, what it overrides, and whether it loads. */
export function DefinitionBadges({
  view
}: {
  readonly view: Pick<AgentView, "source" | "shadows" | "readOnly" | "problems">;
}) {
  const t = useT();
  return (
    <span className="desk-agent__badges">
      <Badge appearance={view.source === "local" ? "information" : "default"}>
        {t(`desk.flow.source.${view.source}`)}
      </Badge>
      {view.shadows !== null && (
        <span className="desk-muted">
          {t("desk.agents.shadows", { source: t(`desk.flow.source.${view.shadows}`) })}
        </span>
      )}
      {view.readOnly && <Badge appearance="default">{t("desk.agents.readOnly")}</Badge>}
      {view.problems.length > 0 && (
        <Badge appearance="danger">
          {t("desk.agents.problemCount", { count: view.problems.length })}
        </Badge>
      )}
    </span>
  );
}

/** Files of an agent or a flow that do not load. The errors are the engine's words. */
export function DefinitionProblems({
  problems,
  kind = "agent"
}: {
  readonly problems: readonly DefinitionProblem[];
  readonly kind?: DefinitionKind;
}) {
  const t = useT();
  if (problems.length === 0) return null;
  return (
    <div className="desk-failure" role="alert">
      <p>{t(kind === "agent" ? "desk.agents.problems" : "desk.flows.problems")}</p>
      <ul className="desk-agent__problems">
        {problems.map((problem) => (
          <li key={problem.path}>
            <code>{problem.path}</code>{" "}
            <Badge appearance="default">{t(`desk.flow.source.${problem.source}`)}</Badge>
            <ul>
              {problem.errors.map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** New agent, and Open for each agent the page knows, under "Actions here". */
export function useAgentPaletteActions(agents: readonly AgentView[]): void {
  const t = useT();
  const { navigate } = useRouter();
  usePaletteActions([
    {
      id: "agent-new",
      label: t("desk.agents.new"),
      run: () => navigate({ view: "agent", agentId: null })
    },
    ...agents.map(({ definition }) => ({
      id: `agent-open-${definition.id}`,
      label: t("desk.agents.openNamed", { name: definition.name }),
      detail: definition.id,
      run: () => navigate({ view: "agent", agentId: definition.id })
    }))
  ]);
}

/** Pressed chips with a count; a chip with no match hides unless it is the chosen one. */
function Chips<T extends string>({
  label,
  options,
  value,
  count,
  name,
  onChange
}: {
  readonly label: string;
  readonly options: readonly T[];
  readonly value: T;
  readonly count: (option: T) => number;
  readonly name: (option: T) => string;
  readonly onChange: (option: T) => void;
}) {
  return (
    <div className="desk-chips" role="group" aria-label={label}>
      {options
        .map((option) => ({ option, total: count(option) }))
        .filter(({ option, total }) => option === "all" || option === value || total > 0)
        .map(({ option, total }) => (
          <Button
            key={option}
            type="button"
            appearance="ghost"
            className="desk-chips__chip"
            aria-pressed={option === value}
            onClick={() => onChange(option)}
          >
            {name(option)} <span className="desk-chips__count">{total}</span>
          </Button>
        ))}
    </div>
  );
}

function AgentRow({ view, onClone }: { readonly view: AgentView; readonly onClone: () => void }) {
  const t = useT();
  const { definition, resolved } = view;
  const { capabilities } = definition;
  const isolated = resolved.sandbox === "docker";
  return (
    <li className="desk-agent">
      <div className="desk-agent__head">
        <h2 className="desk-agent__name">{definition.name}</h2>
        <code className="desk-agent__id">{definition.id}</code>
        <DefinitionBadges view={view} />
      </div>
      <p className="desk-agent__desc">{definition.description}</p>
      <dl className="desk-agent__meta">
        <div>
          <dt>{t("desk.agents.field.output")}</dt>
          <dd>{t(`desk.agents.output.${definition.output}`)}</dd>
        </div>
        <div>
          <dt>{t("desk.caps.provider")}</dt>
          <dd>
            {t("desk.caps.providerValue", {
              provider: t(`desk.agents.provider.${definition.provider}`),
              model: definition.model ?? t("desk.caps.defaultModel")
            })}
          </dd>
        </div>
        <div>
          <dt>{t("desk.caps.preset")}</dt>
          <dd>{t(`desk.caps.preset.${capabilities.preset}`)}</dd>
        </div>
        <div>
          <dt>{t("desk.agents.summary")}</dt>
          <dd>
            {t("desk.agents.counts", {
              mcp: capabilities.mcp.length,
              skills: capabilities.skills.length
            })}
          </dd>
        </div>
      </dl>
      <div className="desk-agent__foot">
        <StatusChip tone={isolated ? "success" : "warning"}>
          {t(isolated ? "desk.caps.isolated" : "desk.caps.onHost")}
        </StatusChip>
        <span className="desk-agent__actions">
          <RouteLink
            to={{ view: "agent", agentId: definition.id }}
            className={OPEN_LINK}
            aria-label={t("desk.agents.openNamed", { name: definition.name })}
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

const SOURCE_FILTERS: readonly SourceFilter[] = ["all", ...DEFINITION_SOURCES];
const OUTPUT_FILTERS: readonly OutputFilter[] = ["all", ...AGENT_OUTPUT_KINDS];

/**
 * The agent library: every agent the desk can run, where its file comes from, and what a run
 * of it gets now. Names, descriptions, and prompts are the owner's words and show as they are.
 */
export function AgentsView() {
  const t = useT();
  const { state } = useAgentList();
  const [filter, setFilter] = useState<AgentFilter>({ query: "", source: "all", output: "all" });
  const [cloning, setCloning] = useState<AgentView | null>(null);
  const searchBox = useRef<HTMLInputElement>(null);
  const agents = state.status === "ok" ? state.list.agents : [];
  useAgentPaletteActions(agents);

  const found = filterAgents(agents, filter);
  const searched = filterAgents(agents, { ...filter, source: "all", output: "all" });

  return (
    <>
      <div className="desk-heading">
        <div>
          <h1>{t("desk.agents.title")}</h1>
          <p className="desk-muted">{t("desk.agents.intro")}</p>
        </div>
        <RouteLink
          to={{ view: "agent", agentId: null }}
          className={buttonVariants({ appearance: "default" })}
        >
          <Plus aria-hidden="true" className="desk-icon" />
          {t("desk.agents.new")}
        </RouteLink>
      </div>
      {state.status === "loading" && <LoadingLines label={t("desk.agents.loading")} lines={4} />}
      {state.status === "error" && <FailureText code={state.code} detail={state.detail} />}
      {state.status === "ok" && (
        <>
          <DefinitionProblems problems={state.list.problems} />
          <div className="desk-toolbar">
            <div className="desk-search" role="search">
              <Search aria-hidden="true" className="desk-icon desk-search__icon" />
              <Input
                ref={searchBox}
                type="search"
                className="desk-search__input"
                aria-label={t("desk.agents.search")}
                placeholder={t("desk.agents.searchPlaceholder")}
                value={filter.query}
                onChange={(event) => setFilter({ ...filter, query: event.target.value })}
              />
              {filter.query !== "" && (
                <Button
                  appearance="ghost"
                  spacing="compact"
                  className="desk-search__clear"
                  aria-label={t("desk.board.searchClear")}
                  onClick={() => {
                    setFilter({ ...filter, query: "" });
                    searchBox.current?.focus();
                  }}
                >
                  <X aria-hidden="true" className="desk-icon" />
                </Button>
              )}
            </div>
            <Chips
              label={t("desk.agents.filter.source")}
              options={SOURCE_FILTERS}
              value={filter.source}
              count={(source) => filterAgents(searched, { ...filter, query: "", source }).length}
              name={(source) =>
                source === "all" ? t("desk.agents.filter.all") : t(`desk.flow.source.${source}`)
              }
              onChange={(source) => setFilter({ ...filter, source })}
            />
            <Chips
              label={t("desk.agents.filter.output")}
              options={OUTPUT_FILTERS}
              value={filter.output}
              count={(output) => filterAgents(searched, { ...filter, query: "", output }).length}
              name={(output) =>
                output === "all" ? t("desk.agents.filter.all") : t(`desk.agents.output.${output}`)
              }
              onChange={(output) => setFilter({ ...filter, output })}
            />
          </div>
          {found.length === 0 ? (
            <Card className="desk-panel">
              <Muted>{t(agents.length === 0 ? "desk.agents.empty" : "desk.agents.noMatch")}</Muted>
            </Card>
          ) : (
            <ul className="desk-agents" aria-label={t("desk.agents.title")}>
              {found.map((view) => (
                <AgentRow key={view.definition.id} view={view} onClone={() => setCloning(view)} />
              ))}
            </ul>
          )}
        </>
      )}
      <CloneDialog
        kind="agent"
        source={cloning?.definition ?? null}
        taken={agents.map((view) => view.definition.id)}
        onOpenChange={(open) => {
          if (!open) setCloning(null);
        }}
      />
    </>
  );
}
