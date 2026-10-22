import { STEP_KINDS, type AgentView, type StepKind } from "@repo/desk/contracts";
import {
  Badge,
  Button,
  Checkbox,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Input,
  Label,
  Plus,
  RadioGroup,
  RadioGroupItem,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea
} from "@repo/ui";
import { useEffect, useLayoutEffect, useRef, type KeyboardEvent, type ReactNode } from "react";

import { KindIcon, stepTitle } from "./flows.kind";
import {
  defaultLoopBack,
  earlierSteps,
  moveStep,
  parseCommands,
  removeStep,
  updateStep,
  type CommandSet,
  type FieldProblem,
  type FlowDraft,
  type RuleProblem,
  type StepDraft
} from "./flows.model";
import { useT, type Translate } from "../i18n/i18n.t";

/** The element id of a step field: `<base>-<step key>-<field>`. */
export const stepFieldId = (base: string, key: string, field: string): string =>
  `${base}-${key}-${field}`;

const fieldText = (t: Translate, field: FieldProblem["field"]): string => {
  switch (field) {
    case "name":
    case "description":
    case "label":
      return t("desk.agents.error.required");
    case "commands":
      return t("desk.flows.error.commands");
    case "maxRounds":
      return t("desk.flows.error.rounds");
  }
};

/** A help line, or the error in its place. */
function Hint({
  id,
  help,
  error
}: {
  readonly id: string;
  readonly help: string | null;
  readonly error: string | null;
}) {
  if (error !== null) {
    return (
      <p id={`${id}-hint`} className="desk-field__error">
        {error}
      </p>
    );
  }
  return help === null ? null : (
    <p id={`${id}-hint`} className="desk-muted">
      {help}
    </p>
  );
}

function TextField({
  id,
  label,
  help,
  value,
  editable,
  error,
  mono = false,
  numeric = false,
  onChange
}: {
  readonly id: string;
  readonly label: string;
  readonly help: string | null;
  readonly value: string;
  readonly editable: boolean;
  readonly error: string | null;
  readonly mono?: boolean;
  readonly numeric?: boolean;
  readonly onChange: (value: string) => void;
}) {
  return (
    <div className="desk-field">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        className={mono ? "desk-mono" : undefined}
        autoComplete="off"
        spellCheck={!mono && !numeric}
        inputMode={numeric ? "numeric" : undefined}
        value={value}
        readOnly={!editable}
        aria-invalid={error !== null}
        aria-describedby={help === null && error === null ? undefined : `${id}-hint`}
        onChange={(event) => onChange(event.target.value)}
      />
      <Hint id={id} help={help} error={error} />
    </div>
  );
}

/**
 * One earlier step by its id. A value that names no earlier step (after a move) stays listed,
 * marked, so the select still shows what the flow says.
 */
function StepSelect({
  id,
  label,
  help,
  value,
  options,
  editable,
  onChange
}: {
  readonly id: string;
  readonly label: string;
  readonly help: string | null;
  readonly value: string;
  readonly options: readonly StepDraft[];
  readonly editable: boolean;
  readonly onChange: (value: string) => void;
}) {
  const t = useT();
  const listed = options.some((step) => step.id.trim() === value);
  return (
    <div className="desk-field">
      <Label htmlFor={id}>{label}</Label>
      <Select value={value} onValueChange={onChange} disabled={!editable}>
        <SelectTrigger id={id} aria-describedby={help === null ? undefined : `${id}-hint`}>
          <SelectValue placeholder={t("desk.flows.chooseStep")} />
        </SelectTrigger>
        <SelectContent>
          {options
            .filter((step) => step.id.trim() !== "")
            .map((step) => (
              <SelectItem key={step.key} value={step.id.trim()}>
                {t("desk.flows.stepOption", { label: stepTitle(step), id: step.id.trim() })}
              </SelectItem>
            ))}
          {!listed && value !== "" && (
            <SelectItem value={value}>{t("desk.flows.notEarlier", { id: value })}</SelectItem>
          )}
        </SelectContent>
      </Select>
      <Hint id={id} help={help} error={null} />
    </div>
  );
}

/** "Add a step" as a menu of the five kinds. */
export function AddStepMenu({
  label,
  appearance = "subtle",
  onAdd
}: {
  readonly label: string;
  readonly appearance?: "subtle" | "default";
  readonly onAdd: (kind: StepKind) => void;
}) {
  const t = useT();
  // The step comes once the menu has closed: its focus trap would take back the focus that the
  // new step's field gets. A menu closed without a pick gives focus back to its button.
  const picked = useRef<StepKind | null>(null);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" appearance={appearance} spacing="compact" aria-label={label}>
          <Plus aria-hidden="true" className="desk-icon" />
          {appearance === "default" ? label : t("desk.flows.addAfterShort")}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="desk-menu"
        onCloseAutoFocus={(event) => {
          const kind = picked.current;
          picked.current = null;
          if (kind === null) return;
          event.preventDefault();
          onAdd(kind);
        }}
      >
        {STEP_KINDS.map((kind) => (
          <DropdownMenuItem
            key={kind}
            onSelect={() => {
              picked.current = kind;
            }}
          >
            <KindIcon kind={kind} />
            {t(`desk.flows.kind.${kind}`)}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const COMMAND_SETS: readonly CommandSet[] = ["loop", "ship", "custom"];

interface StepProps {
  readonly base: string;
  readonly draft: FlowDraft;
  readonly step: StepDraft;
  readonly index: number;
  readonly editable: boolean;
  readonly agents: readonly AgentView[];
  readonly fields: readonly FieldProblem[];
  readonly rules: readonly RuleProblem[];
  readonly selected: boolean;
  readonly onChange: (next: FlowDraft) => void;
  readonly onSelect: (key: string) => void;
  readonly onInsert: (kind: StepKind, at: number) => void;
  /** Keep focus on `element` after the step moved in the list. */
  readonly keepFocus: (element: Element | null) => void;
}

/** The fields of one kind. */
function KindFields({
  base,
  draft,
  step,
  editable,
  agents,
  fields,
  onChange
}: Pick<StepProps, "base" | "draft" | "step" | "editable" | "agents" | "fields" | "onChange">) {
  const t = useT();
  const id = (field: string): string => stepFieldId(base, step.key, field);
  const set = (patch: Partial<Omit<StepDraft, "key" | "kind">>): void =>
    onChange(updateStep(draft, step.key, patch));
  const fieldError = (field: FieldProblem["field"]): string | null =>
    fields.some((problem) => problem.field === field) ? fieldText(t, field) : null;
  const earlier = earlierSteps(draft, step.key);

  switch (step.kind) {
    case "agent": {
      const choices = agents.filter(({ definition }) => definition.output !== "intake");
      const known = choices.some(({ definition }) => definition.id === step.agent);
      return (
        <div className="desk-field">
          <Label htmlFor={id("agent")}>{t("desk.flows.field.agent")}</Label>
          <Select value={step.agent} onValueChange={(agent) => set({ agent })} disabled={!editable}>
            <SelectTrigger id={id("agent")} aria-describedby={`${id("agent")}-hint`}>
              <SelectValue placeholder={t("desk.flows.chooseAgent")} />
            </SelectTrigger>
            <SelectContent>
              {choices.map(({ definition }) => (
                <SelectItem key={definition.id} value={definition.id}>
                  {t("desk.flows.agentOption", {
                    name: definition.name,
                    output: t(`desk.agents.output.${definition.output}`),
                    provider: t(`desk.agents.provider.${definition.provider}`)
                  })}
                </SelectItem>
              ))}
              {!known && step.agent !== "" && (
                <SelectItem value={step.agent}>
                  {t("desk.flows.agentMissing", { id: step.agent })}
                </SelectItem>
              )}
            </SelectContent>
          </Select>
          <Hint id={id("agent")} help={t("desk.flows.field.agentHelp")} error={null} />
        </div>
      );
    }
    case "gate": {
      const extra = step.sendBack.filter(
        (target) => !earlier.some((entry) => entry.id.trim() === target)
      );
      return (
        <fieldset className="desk-fieldset" aria-describedby={`${id("sendBack")}-hint`}>
          <legend>{t("desk.flows.field.sendBack")}</legend>
          {earlier.length === 0 && extra.length === 0 ? (
            <p className="desk-muted">{t("desk.flows.noEarlier")}</p>
          ) : (
            <ul className="desk-namelist">
              {earlier.map((entry) => {
                const target = entry.id.trim();
                const optionId = id(`sendBack-${entry.key}`);
                return (
                  <li key={entry.key} className="desk-check-row">
                    <Checkbox
                      id={optionId}
                      checked={step.sendBack.includes(target)}
                      disabled={!editable || target === ""}
                      onCheckedChange={(checked) =>
                        set({
                          sendBack:
                            checked === true
                              ? [...step.sendBack, target]
                              : step.sendBack.filter((value) => value !== target)
                        })
                      }
                    />
                    <Label htmlFor={optionId}>
                      {t("desk.flows.stepOption", { label: stepTitle(entry), id: target })}
                    </Label>
                  </li>
                );
              })}
              {extra.map((target) => {
                const optionId = id(`sendBack-extra-${target}`);
                return (
                  <li key={target} className="desk-check-row">
                    <Checkbox
                      id={optionId}
                      checked
                      disabled={!editable}
                      onCheckedChange={() =>
                        set({ sendBack: step.sendBack.filter((value) => value !== target) })
                      }
                    />
                    <Label htmlFor={optionId}>{t("desk.flows.notEarlier", { id: target })}</Label>
                  </li>
                );
              })}
            </ul>
          )}
          <Hint id={id("sendBack")} help={t("desk.flows.field.sendBackHelp")} error={null} />
        </fieldset>
      );
    }
    case "check": {
      const commands = parseCommands(step.commands);
      const error = fieldError("commands");
      return (
        <fieldset className="desk-fieldset">
          <legend id={`${id("commandSet")}-legend`}>{t("desk.flows.field.commands")}</legend>
          <RadioGroup
            value={step.commandSet}
            aria-labelledby={`${id("commandSet")}-legend`}
            className="desk-flowpick__list"
            onValueChange={(next) => {
              const commandSet = COMMAND_SETS.find((candidate) => candidate === next);
              if (commandSet !== undefined) set({ commandSet });
            }}
          >
            {COMMAND_SETS.map((option) => {
              const optionId = id(`commandSet-${option}`);
              return (
                <div
                  key={option}
                  className="desk-flowpick__item"
                  data-checked={option === step.commandSet ? "true" : undefined}
                >
                  <RadioGroupItem
                    value={option}
                    id={optionId}
                    disabled={!editable}
                    aria-describedby={`${optionId}-about`}
                  />
                  <Label htmlFor={optionId} className="desk-flowpick__name">
                    {t(`desk.flows.commandSet.${option}`)}
                  </Label>
                  <span id={`${optionId}-about`} className="desk-flowpick__about desk-muted">
                    {t(`desk.flows.commandSetAbout.${option}`)}
                  </span>
                </div>
              );
            })}
          </RadioGroup>
          {step.commandSet === "custom" && (
            <div className="desk-field">
              <Label htmlFor={id("commands")}>{t("desk.flows.field.commandLines")}</Label>
              <Textarea
                id={id("commands")}
                className="desk-mono"
                rows={3}
                spellCheck={false}
                value={step.commands}
                readOnly={!editable}
                aria-invalid={error !== null}
                aria-describedby={`${id("commands")}-hint`}
                onChange={(event) => set({ commands: event.target.value })}
              />
              <Hint
                id={id("commands")}
                help={t("desk.flows.field.commandLinesHelp")}
                error={error}
              />
              {commands.length > 0 && (
                <ol className="desk-flows-argv" aria-label={t("desk.flows.parsed")}>
                  {commands.map((argv, line) => (
                    <li key={`${String(line)}-${argv.join(" ")}`}>
                      {argv.map((word, position) => (
                        <code key={`${String(position)}-${word}`}>{word}</code>
                      ))}
                    </li>
                  ))}
                </ol>
              )}
            </div>
          )}
        </fieldset>
      );
    }
    case "ship":
      return (
        <div className="desk-field">
          <div className="desk-check-row">
            <Checkbox
              id={id("auto")}
              checked={step.auto}
              disabled={!editable}
              aria-describedby={`${id("auto")}-hint`}
              onCheckedChange={(checked) => set({ auto: checked === true })}
            />
            <Label htmlFor={id("auto")}>{t("desk.flows.field.auto")}</Label>
          </div>
          {step.auto ? (
            <p id={`${id("auto")}-hint`} className="desk-warning" role="status">
              {t("desk.flows.autoWarning")}
            </p>
          ) : (
            <p id={`${id("auto")}-hint`} className="desk-muted">
              {t("desk.flows.field.autoHelp")}
            </p>
          )}
        </div>
      );
    case "pr-wait":
      return (
        <div className="desk-flows-step__pair">
          <TextField
            id={id("maxRounds")}
            label={t("desk.flows.field.maxRounds")}
            help={t("desk.flows.field.maxRoundsHelp")}
            value={step.maxRounds}
            editable={editable}
            error={fieldError("maxRounds")}
            numeric
            onChange={(maxRounds) => set({ maxRounds })}
          />
          <StepSelect
            id={id("backTo")}
            label={t("desk.flows.field.backTo")}
            help={t("desk.flows.field.backToHelp")}
            value={step.backTo}
            options={earlier}
            editable={editable}
            onChange={(backTo) => set({ backTo })}
          />
        </div>
      );
  }
}

/** The optional automatic loop back of any step. */
function LoopBackFields({
  base,
  draft,
  step,
  editable,
  onChange
}: Pick<StepProps, "base" | "draft" | "step" | "editable" | "onChange">) {
  const t = useT();
  const id = (field: string): string => stepFieldId(base, step.key, field);
  const { loopBack } = step;
  return (
    <fieldset className="desk-fieldset desk-flows-step__loop">
      <legend className="desk-sr-only">{t("desk.flows.field.loopBack")}</legend>
      <div className="desk-check-row">
        <Checkbox
          id={id("loopBack")}
          checked={loopBack !== null}
          disabled={!editable}
          aria-describedby={`${id("loopBack")}-hint`}
          onCheckedChange={(checked) =>
            onChange(
              updateStep(draft, step.key, {
                loopBack: checked === true ? defaultLoopBack(draft, step.key) : null
              })
            )
          }
        />
        <Label htmlFor={id("loopBack")}>{t("desk.flows.field.loopBack")}</Label>
      </div>
      <p id={`${id("loopBack")}-hint`} className="desk-muted">
        {t("desk.flows.field.loopBackHelp")}
      </p>
      {loopBack !== null && (
        <div className="desk-flows-step__pair">
          <StepSelect
            id={id("loopTo")}
            label={t("desk.flows.field.loopTo")}
            help={null}
            value={loopBack.to}
            options={earlierSteps(draft, step.key)}
            editable={editable}
            onChange={(to) =>
              onChange(updateStep(draft, step.key, { loopBack: { ...loopBack, to } }))
            }
          />
          <TextField
            id={id("limit")}
            label={t("desk.flows.field.limit")}
            help={t("desk.flows.field.limitHelp")}
            value={loopBack.limit}
            editable={editable}
            error={null}
            numeric
            onChange={(limit) =>
              onChange(updateStep(draft, step.key, { loopBack: { ...loopBack, limit } }))
            }
          />
          <div className="desk-check-row">
            <Checkbox
              id={id("sameFailure")}
              checked={loopBack.stopOnSameFailure}
              disabled={!editable}
              onCheckedChange={(checked) =>
                onChange(
                  updateStep(draft, step.key, {
                    loopBack: { ...loopBack, stopOnSameFailure: checked === true }
                  })
                )
              }
            />
            <Label htmlFor={id("sameFailure")}>{t("desk.flows.field.sameFailure")}</Label>
          </div>
        </div>
      )}
    </fieldset>
  );
}

function StepCard(props: StepProps) {
  const t = useT();
  const { base, draft, step, index, editable, fields, rules, selected } = props;
  const { onChange, onSelect, onInsert, keepFocus } = props;
  const id = (field: string): string => stepFieldId(base, step.key, field);
  const title = stepTitle(step);
  const count = draft.steps.length;
  const move = (to: number): void => {
    if (to < 0 || to >= count) return;
    keepFocus(document.activeElement);
    onChange(moveStep(draft, step.key, to));
  };
  const onKeyDown = (event: KeyboardEvent<HTMLLIElement>): void => {
    if (!editable || !event.altKey) return;
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    event.preventDefault();
    move(index + (event.key === "ArrowUp" ? -1 : 1));
  };
  const labelError = fields.some((problem) => problem.field === "label")
    ? t("desk.agents.error.required")
    : null;
  const invalid = fields.length > 0 || rules.length > 0;

  return (
    <li
      className="desk-flows-step"
      data-selected={selected ? "true" : undefined}
      data-invalid={invalid ? "true" : undefined}
      aria-labelledby={id("title")}
      aria-describedby={rules.length > 0 ? id("problems") : undefined}
      onKeyDown={onKeyDown}
      onFocus={() => onSelect(step.key)}
    >
      <div className="desk-flows-step__head">
        <span className="desk-flows-step__icon">
          <KindIcon kind={step.kind} />
        </span>
        <h3 id={id("title")} className="desk-flows-step__title">
          {t("desk.flows.stepHeading", { index: index + 1, title })}
        </h3>
        <Badge appearance="default">{t(`desk.flows.kind.${step.kind}`)}</Badge>
        {editable && (
          <span className="desk-flows-step__tools">
            <Button
              type="button"
              appearance="subtle"
              spacing="compact"
              disabled={index === 0}
              aria-label={t("desk.flows.moveUpNamed", { title })}
              aria-keyshortcuts="Alt+ArrowUp"
              onClick={() => move(index - 1)}
            >
              {t("desk.flows.moveUp")}
            </Button>
            <Button
              type="button"
              appearance="subtle"
              spacing="compact"
              disabled={index === count - 1}
              aria-label={t("desk.flows.moveDownNamed", { title })}
              aria-keyshortcuts="Alt+ArrowDown"
              onClick={() => move(index + 1)}
            >
              {t("desk.flows.moveDown")}
            </Button>
            <AddStepMenu
              label={t("desk.flows.addAfter", { title })}
              onAdd={(kind) => onInsert(kind, index + 1)}
            />
            <Button
              type="button"
              appearance="subtle"
              spacing="compact"
              aria-label={t("desk.flows.removeNamed", { title })}
              onClick={() => onChange(removeStep(draft, step.key))}
            >
              {t("desk.flows.remove")}
            </Button>
          </span>
        )}
      </div>
      {rules.length > 0 && (
        <ul id={id("problems")} className="desk-flows-step__problems">
          {rules.map((rule) => (
            <li key={rule.message}>{rule.message}</li>
          ))}
        </ul>
      )}
      <div className="desk-flows-step__pair">
        <TextField
          id={id("id")}
          label={t("desk.flows.field.stepId")}
          help={t("desk.flows.field.stepIdHelp")}
          value={step.id}
          editable={editable}
          error={null}
          mono
          onChange={(value) => onChange(updateStep(draft, step.key, { id: value }))}
        />
        <TextField
          id={id("label")}
          label={t("desk.flows.field.label")}
          help={null}
          value={step.label}
          editable={editable}
          error={labelError}
          onChange={(label) => onChange(updateStep(draft, step.key, { label }))}
        />
      </div>
      <KindFields {...props} />
      <LoopBackFields {...props} />
    </li>
  );
}

export interface FlowFormProps {
  /** The base of every element id. */
  readonly base: string;
  readonly draft: FlowDraft;
  readonly editable: boolean;
  readonly agents: readonly AgentView[];
  readonly fields: readonly FieldProblem[];
  readonly rules: readonly RuleProblem[];
  readonly selected: string | null;
  /** Each new value focuses the Id field of step `key`. */
  readonly focus: { readonly key: string; readonly seq: number } | null;
  readonly onChange: (next: FlowDraft) => void;
  readonly onSelect: (key: string) => void;
  readonly onInsert: (kind: StepKind, at: number) => void;
  readonly onSubmit: () => void;
  /** The form's buttons. */
  readonly children: ReactNode;
}

/**
 * The flow as a list: its name and description, then every step in order with its fields and
 * its problems. Every change the canvas can make is here too, by keyboard: add, remove, move
 * (the buttons, or Alt+Up and Alt+Down in a step), and every reference to an earlier step.
 */
export function FlowForm({
  base,
  draft,
  editable,
  agents,
  fields,
  rules,
  selected,
  focus,
  onChange,
  onSelect,
  onInsert,
  onSubmit,
  children
}: FlowFormProps) {
  const t = useT();
  const refocus = useRef<HTMLElement | null>(null);
  // A moved step is a moved DOM node: put focus back where it was.
  useLayoutEffect(() => {
    const element = refocus.current;
    refocus.current = null;
    if (element !== null && document.activeElement !== element && element.isConnected) {
      element.focus();
    }
  });
  useEffect(() => {
    if (focus === null) return;
    const field = document.getElementById(stepFieldId(base, focus.key, "id"));
    field?.scrollIntoView({ block: "nearest" });
    field?.focus({ preventScroll: true });
  }, [base, focus]);
  const keepFocus = (element: Element | null): void => {
    refocus.current = element instanceof HTMLElement ? element : null;
  };
  const flowError = (field: "name" | "description"): string | null =>
    fields.some((problem) => problem.key === null && problem.field === field)
      ? fieldText(t, field)
      : null;

  return (
    <form
      id={base}
      className="desk-agent-form"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <TextField
        id={`${base}-name`}
        label={t("desk.agents.field.name")}
        help={null}
        value={draft.name}
        editable={editable}
        error={flowError("name")}
        onChange={(name) => onChange({ ...draft, name })}
      />
      <TextField
        id={`${base}-description`}
        label={t("desk.agents.field.description")}
        help={t("desk.flows.field.descriptionHelp")}
        value={draft.description}
        editable={editable}
        error={flowError("description")}
        onChange={(description) => onChange({ ...draft, description })}
      />
      <div className="desk-flows-steps__head">
        <h2 id={`${base}-steps`}>{t("desk.flows.steps")}</h2>
        {editable && (
          <AddStepMenu
            label={t("desk.flows.addStep")}
            appearance="default"
            onAdd={(kind) => onInsert(kind, draft.steps.length)}
          />
        )}
      </div>
      <p className="desk-muted">
        {t(editable ? "desk.flows.stepsHelp" : "desk.flows.stepsHelpReadOnly")}
      </p>
      <ol className="desk-flows-steps" aria-labelledby={`${base}-steps`}>
        <li className="desk-flows-step desk-flows-step--setup">
          <div className="desk-flows-step__head">
            <span className="desk-flows-step__icon">
              <KindIcon kind="setup" />
            </span>
            <h3 className="desk-flows-step__title">{t("desk.stage.setup")}</h3>
          </div>
          <p className="desk-muted">{t("desk.flows.setupNote")}</p>
        </li>
        {draft.steps.map((step, index) => (
          <StepCard
            key={step.key}
            base={base}
            draft={draft}
            step={step}
            index={index}
            editable={editable}
            agents={agents}
            fields={fields.filter((problem) => problem.key === step.key)}
            rules={rules.filter((problem) => problem.key === step.key)}
            selected={selected === step.key}
            onChange={onChange}
            onSelect={onSelect}
            onInsert={onInsert}
            keepFocus={keepFocus}
          />
        ))}
      </ol>
      {children}
    </form>
  );
}
