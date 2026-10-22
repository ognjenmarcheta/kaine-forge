import {
  AGENT_OUTPUT_KINDS,
  CAPABILITY_PRESETS,
  PROVIDERS,
  type AgentOutputKind,
  type CapabilityPreset,
  type Provider
} from "@repo/desk/contracts";
import { Badge, Checkbox, Input, Label, RadioGroup, RadioGroupItem, Textarea } from "@repo/ui";
import type { ReactNode } from "react";

import {
  presetFits,
  withOutput,
  type AgentDraft,
  type AgentField,
  type Installed
} from "./agents.model";
import { useT } from "../i18n/i18n.t";

export interface AgentFormProps {
  /** The base of every field's element id: `<base>-<field>`. */
  readonly base: string;
  readonly draft: AgentDraft;
  readonly isNew: boolean;
  readonly editable: boolean;
  readonly installed: Installed;
  readonly errorOf: (field: AgentField) => string | null;
  readonly onChange: (next: AgentDraft, field: AgentField) => void;
  readonly onSubmit: () => void;
  /** The form's buttons. */
  readonly children: ReactNode;
}

const fieldId = (base: string, field: AgentField): string => `${base}-${field}`;

/** The help line, or the error in its place, and the ids a control names in `aria-describedby`. */
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
  base,
  field,
  label,
  help,
  value,
  editable,
  error,
  onChange,
  mono = false
}: {
  readonly base: string;
  readonly field: AgentField;
  readonly label: string;
  readonly help: string | null;
  readonly value: string;
  readonly editable: boolean;
  readonly error: string | null;
  readonly onChange: (value: string) => void;
  readonly mono?: boolean;
}) {
  const id = fieldId(base, field);
  return (
    <div className="desk-field">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        className={mono ? "desk-mono" : undefined}
        autoComplete="off"
        spellCheck={!mono}
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

/** One choice of a few, each with a line that says what it means. */
function Choices<T extends string>({
  base,
  field,
  legend,
  options,
  value,
  editable,
  error,
  name,
  about,
  disabledReason,
  onChange
}: {
  readonly base: string;
  readonly field: AgentField;
  readonly legend: string;
  readonly options: readonly T[];
  readonly value: T;
  readonly editable: boolean;
  readonly error: string | null;
  readonly name: (option: T) => string;
  readonly about: (option: T) => string | null;
  /** Why an option cannot be picked now, or `null` when it can. */
  readonly disabledReason?: (option: T) => string | null;
  readonly onChange: (option: T) => void;
}) {
  const id = fieldId(base, field);
  return (
    <fieldset className="desk-fieldset">
      <legend id={`${id}-legend`}>{legend}</legend>
      <RadioGroup
        value={value}
        aria-labelledby={`${id}-legend`}
        aria-invalid={error !== null}
        aria-describedby={error === null ? undefined : `${id}-hint`}
        className="desk-flowpick__list"
        onValueChange={(next) => {
          const option = options.find((candidate) => candidate === next);
          if (option !== undefined) onChange(option);
        }}
      >
        {options.map((option, index) => {
          const reason = disabledReason?.(option) ?? null;
          const text = reason ?? about(option);
          const optionId = `${id}-${option}`;
          return (
            <div
              key={option}
              className="desk-flowpick__item"
              data-checked={option === value ? "true" : undefined}
              data-disabled={reason === null ? undefined : "true"}
            >
              <RadioGroupItem
                value={option}
                id={index === 0 ? id : optionId}
                disabled={!editable || reason !== null}
                aria-describedby={text === null ? undefined : `${optionId}-about`}
              />
              <Label htmlFor={index === 0 ? id : optionId} className="desk-flowpick__name">
                {name(option)}
              </Label>
              {text !== null && (
                <span id={`${optionId}-about`} className="desk-flowpick__about desk-muted">
                  {text}
                </span>
              )}
            </div>
          );
        })}
      </RadioGroup>
      <Hint id={id} help={null} error={error} />
    </fieldset>
  );
}

/** Names to switch on: the installed ones, and any the agent asks for that this checkout lacks. */
function NameList({
  base,
  field,
  legend,
  help,
  installed,
  value,
  editable,
  error,
  onChange
}: {
  readonly base: string;
  readonly field: "mcp" | "skills";
  readonly legend: string;
  readonly help: string;
  readonly installed: readonly string[];
  readonly value: readonly string[];
  readonly editable: boolean;
  readonly error: string | null;
  readonly onChange: (value: readonly string[]) => void;
}) {
  const t = useT();
  const id = fieldId(base, field);
  const names = [...new Set([...installed, ...value])].sort();
  return (
    <fieldset className="desk-fieldset" aria-describedby={`${id}-hint`}>
      <legend>{legend}</legend>
      {names.length === 0 ? (
        <p className="desk-muted">{t("desk.agents.field.noneKnown")}</p>
      ) : (
        <ul className="desk-namelist">
          {names.map((name, index) => {
            const optionId = index === 0 ? id : `${id}-${name}`;
            const missing = !installed.includes(name);
            return (
              <li key={name} className="desk-check-row">
                <Checkbox
                  id={optionId}
                  checked={value.includes(name)}
                  disabled={!editable}
                  onCheckedChange={(checked) =>
                    onChange(
                      checked === true
                        ? [...value, name]
                        : value.filter((candidate) => candidate !== name)
                    )
                  }
                />
                <Label htmlFor={optionId} className="desk-mono">
                  {name}
                </Label>
                {missing && <Badge appearance="warning">{t("desk.agents.notInstalled")}</Badge>}
              </li>
            );
          })}
        </ul>
      )}
      <Hint id={id} help={help} error={error} />
    </fieldset>
  );
}

/**
 * The fields of an agent definition. The id is typed only for a new agent. A preset that the
 * output does not allow is disabled with the reason; a changed output takes a preset it allows.
 */
export function AgentForm({
  base,
  draft,
  isNew,
  editable,
  installed,
  errorOf,
  onChange,
  onSubmit,
  children
}: AgentFormProps) {
  const t = useT();
  const set = <K extends keyof AgentDraft>(field: AgentField, key: K, value: AgentDraft[K]) =>
    onChange({ ...draft, [key]: value }, field);
  const promptId = fieldId(base, "prompt");
  const promptError = errorOf("prompt");

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
      {isNew && (
        <TextField
          base={base}
          field="id"
          label={t("desk.agents.field.id")}
          help={t("desk.agents.field.idHelp")}
          value={draft.id}
          editable={editable}
          error={errorOf("id")}
          onChange={(value) => set("id", "id", value)}
          mono
        />
      )}
      <TextField
        base={base}
        field="name"
        label={t("desk.agents.field.name")}
        help={null}
        value={draft.name}
        editable={editable}
        error={errorOf("name")}
        onChange={(value) => set("name", "name", value)}
      />
      <TextField
        base={base}
        field="description"
        label={t("desk.agents.field.description")}
        help={t("desk.agents.field.descriptionHelp")}
        value={draft.description}
        editable={editable}
        error={errorOf("description")}
        onChange={(value) => set("description", "description", value)}
      />
      <div className="desk-agent-form__pair">
        <Choices<Provider>
          base={base}
          field="provider"
          legend={t("desk.agents.field.provider")}
          options={PROVIDERS}
          value={draft.provider}
          editable={editable}
          error={errorOf("provider")}
          name={(provider) => t(`desk.agents.provider.${provider}`)}
          about={() => null}
          onChange={(provider) => set("provider", "provider", provider)}
        />
        <TextField
          base={base}
          field="model"
          label={t("desk.agents.field.model")}
          help={t("desk.agents.field.modelHelp")}
          value={draft.model}
          editable={editable}
          error={errorOf("model")}
          onChange={(value) => set("model", "model", value)}
          mono
        />
      </div>
      <Choices<AgentOutputKind>
        base={base}
        field="output"
        legend={t("desk.agents.field.output")}
        options={AGENT_OUTPUT_KINDS}
        value={draft.output}
        editable={editable}
        error={errorOf("output")}
        name={(output) => t(`desk.agents.output.${output}`)}
        about={(output) => t(`desk.agents.outputAbout.${output}`)}
        onChange={(output) => onChange(withOutput(draft, output), "output")}
      />
      <Choices<CapabilityPreset>
        base={base}
        field="preset"
        legend={t("desk.agents.field.preset")}
        options={CAPABILITY_PRESETS}
        value={draft.preset}
        editable={editable}
        error={errorOf("preset")}
        name={(preset) => t(`desk.caps.preset.${preset}`)}
        about={(preset) => t(`desk.agents.presetAbout.${preset}`)}
        disabledReason={(preset) =>
          presetFits(draft, preset)
            ? null
            : t(
                preset === "edit-code"
                  ? "desk.agents.presetOnlyChange"
                  : "desk.agents.presetChangeNeedsEdit"
              )
        }
        onChange={(preset) => set("preset", "preset", preset)}
      />
      <NameList
        base={base}
        field="mcp"
        legend={t("desk.caps.mcp")}
        help={t("desk.agents.field.mcpHelp")}
        installed={installed.mcp}
        value={draft.mcp}
        editable={editable}
        error={errorOf("mcp")}
        onChange={(value) => set("mcp", "mcp", value)}
      />
      <NameList
        base={base}
        field="skills"
        legend={t("desk.caps.skills")}
        help={t("desk.agents.field.skillsHelp")}
        installed={installed.skills}
        value={draft.skills}
        editable={editable}
        error={errorOf("skills")}
        onChange={(value) => set("skills", "skills", value)}
      />
      <TextField
        base={base}
        field="timeoutMinutes"
        label={t("desk.agents.field.timeout")}
        help={t("desk.agents.field.timeoutHelp")}
        value={draft.timeout}
        editable={editable}
        error={errorOf("timeoutMinutes")}
        onChange={(value) => set("timeoutMinutes", "timeout", value)}
      />
      <div className="desk-field">
        <Label htmlFor={promptId}>{t("desk.agents.field.prompt")}</Label>
        <Textarea
          id={promptId}
          className="desk-prompt"
          rows={16}
          spellCheck={false}
          value={draft.prompt}
          readOnly={!editable}
          aria-invalid={promptError !== null}
          aria-describedby={`${promptId}-hint ${promptId}-count`}
          onChange={(event) => set("prompt", "prompt", event.target.value)}
        />
        <p className="desk-agent-form__count desk-muted">
          <span id={`${promptId}-count`}>
            {t("desk.agents.field.promptCount", { count: draft.prompt.length })}
          </span>
        </p>
        <Hint id={promptId} help={t("desk.agents.field.promptHelp")} error={promptError} />
      </div>
      {children}
    </form>
  );
}
