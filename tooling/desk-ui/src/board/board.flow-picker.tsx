import type { FlowView } from "@repo/desk/contracts";
import { Badge, Label, RadioGroup, RadioGroupItem } from "@repo/ui";
import { useId } from "react";

import type { FlowListState } from "../flow/flow.use";
import { useT } from "../i18n/i18n.t";
import { FailureText, Loading, Muted } from "../shell/shell.ui";

/**
 * The flow a start runs the issue on. Only the registry's valid flows are offered; each shows
 * where its file comes from, and the one the desk would pick for the issue says so. No choice
 * leaves the pick to the desk (the issue's labels, then the default flow). Flow names and
 * descriptions are the owner's words and show as they are.
 */
export function FlowPicker({
  state,
  suggested,
  value,
  onChange
}: {
  readonly state: FlowListState;
  /** The flow the desk picks for the issue without a choice, when known. */
  readonly suggested: string | null;
  readonly value: string | null;
  readonly onChange: (flowId: string) => void;
}) {
  const t = useT();
  const id = useId();
  const flows: readonly FlowView[] = state.status === "ok" ? state.list.flows : [];
  return (
    <fieldset className="desk-fieldset desk-flowpick" aria-describedby={`${id}-help`}>
      <legend>{t("desk.start.flow")}</legend>
      {state.status === "loading" && <Loading />}
      {state.status === "error" && <FailureText code={state.code} detail={state.detail} />}
      {state.status === "ok" && flows.length === 0 && <Muted>{t("desk.start.noFlows")}</Muted>}
      {flows.length > 0 && (
        <RadioGroup
          value={value ?? ""}
          onValueChange={(next) => {
            if (flows.some((flow) => flow.definition.id === next)) onChange(next);
          }}
          className="desk-flowpick__list"
        >
          {flows.map(({ definition, source }) => (
            <div
              key={definition.id}
              className="desk-flowpick__item"
              data-checked={definition.id === value ? "true" : undefined}
            >
              <RadioGroupItem
                value={definition.id}
                id={`${id}-${definition.id}`}
                aria-describedby={`${id}-${definition.id}-about`}
              />
              <Label htmlFor={`${id}-${definition.id}`} className="desk-flowpick__name">
                {definition.name}
              </Label>
              <span id={`${id}-${definition.id}-about`} className="desk-flowpick__about">
                <Badge appearance="default">{t(`desk.flow.source.${source}`)}</Badge>
                {definition.id === suggested && (
                  <Badge appearance="information">{t("desk.start.flowDefault")}</Badge>
                )}
                <span className="desk-muted">{definition.description}</span>
              </span>
            </div>
          ))}
        </RadioGroup>
      )}
      <p id={`${id}-help`} className="desk-muted">
        {t("desk.start.flowHelp")}
      </p>
    </fieldset>
  );
}
