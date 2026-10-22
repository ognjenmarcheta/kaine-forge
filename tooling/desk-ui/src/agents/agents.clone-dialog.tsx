import { definitionIdSchema, type DefinitionKind } from "@repo/desk/contracts";
import { Button, Input, Label, Modal } from "@repo/ui";
import { useId, useState } from "react";
import { toast } from "sonner";

import { copyIdOf } from "./agents.model";
import { toApiError, type DeskApiError } from "../api/api.client";
import { useT } from "../i18n/i18n.t";
import type { Route } from "../shell/shell.route";
import { useRouter } from "../shell/shell.router";
import { FailureText } from "../shell/shell.ui";
import { useDesk } from "../state/desk.provider";

/** What a clone copies: an agent or a flow, by id and name. */
export interface CloneSource {
  readonly id: string;
  readonly name: string;
}

/** The words of a clone that differ by kind. */
const WORDS: Readonly<Record<DefinitionKind, { idTaken: string; intro: string; done: string }>> = {
  agent: {
    idTaken: "desk.agents.error.idTaken",
    intro: "desk.agents.clone.intro",
    done: "desk.agents.clone.done"
  },
  flow: {
    idTaken: "desk.flows.error.idTaken",
    intro: "desk.flows.clone.intro",
    done: "desk.flows.clone.done"
  }
};

const routeOf = (kind: DefinitionKind, id: string): Route =>
  kind === "agent" ? { view: "agent", agentId: id } : { view: "flow", flowId: id };

function CloneForm({
  kind,
  source,
  taken,
  formId,
  onPending,
  onDone
}: {
  readonly kind: DefinitionKind;
  readonly source: CloneSource;
  readonly taken: readonly string[];
  readonly formId: string;
  readonly onPending: (pending: boolean) => void;
  readonly onDone: () => void;
}) {
  const t = useT();
  const id = useId();
  const { api } = useDesk();
  const { navigate } = useRouter();
  const [newId, setNewId] = useState(() => copyIdOf(source.id));
  const [name, setName] = useState("");
  const [touched, setTouched] = useState(false);
  const [failure, setFailure] = useState<DeskApiError | null>(null);
  const trimmed = newId.trim();
  const problem = !definitionIdSchema.safeParse(trimmed).success
    ? t("desk.agents.error.id")
    : taken.includes(trimmed)
      ? t(WORDS[kind].idTaken)
      : null;
  const shownProblem = touched || taken.includes(trimmed) ? problem : null;
  const placeholder = t("desk.agents.clone.namePlaceholder", { name: source.name });

  return (
    <form
      id={formId}
      className="desk-start"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        setTouched(true);
        if (problem !== null) return;
        onPending(true);
        setFailure(null);
        const copyName = name.trim();
        api
          .cloneDefinition(kind, source.id, trimmed, copyName === "" ? undefined : copyName)
          .then(
            (result) => {
              toast.success(t(WORDS[kind].done), { description: result.path });
              onDone();
              navigate(routeOf(kind, result.id));
            },
            (error: unknown) => setFailure(toApiError(error))
          )
          .finally(() => onPending(false));
      }}
    >
      <div className="desk-field">
        <Label htmlFor={`${id}-id`}>{t("desk.agents.field.id")}</Label>
        <Input
          id={`${id}-id`}
          autoComplete="off"
          spellCheck={false}
          value={newId}
          onChange={(event) => setNewId(event.target.value)}
          aria-invalid={shownProblem !== null}
          aria-describedby={`${id}-id-help`}
        />
        {shownProblem === null ? (
          <p id={`${id}-id-help`} className="desk-muted">
            {t("desk.agents.field.idHelp")}
          </p>
        ) : (
          <p id={`${id}-id-help`} className="desk-field__error">
            {shownProblem}
          </p>
        )}
      </div>
      <div className="desk-field">
        <Label htmlFor={`${id}-name`}>{t("desk.agents.clone.name")}</Label>
        <Input
          id={`${id}-name`}
          autoComplete="off"
          value={name}
          placeholder={placeholder}
          onChange={(event) => setName(event.target.value)}
          aria-describedby={`${id}-name-help`}
        />
        <p id={`${id}-name-help`} className="desk-muted">
          {t("desk.agents.clone.nameHelp", { name: placeholder })}
        </p>
      </div>
      {failure !== null && <FailureText code={failure.code} detail={failure.detail} />}
    </form>
  );
}

/**
 * Copy an agent or a flow to a new local id, then open the copy. The server refuses an id that
 * any file of the kind has, a broken one too, and the dialog shows its words.
 */
export function CloneDialog({
  kind,
  source,
  taken,
  title,
  onOpenChange
}: {
  readonly kind: DefinitionKind;
  /** The definition to copy; `null` closes the dialog. */
  readonly source: CloneSource | null;
  readonly taken: readonly string[];
  /** Instead of "Clone <name>". */
  readonly title?: string;
  readonly onOpenChange: (open: boolean) => void;
}) {
  const t = useT();
  const formId = useId();
  const [pending, setPending] = useState(false);
  return (
    <Modal
      open={source !== null}
      onOpenChange={onOpenChange}
      title={title ?? t("desk.agents.clone.title", { name: source?.name ?? "" })}
      description={t(WORDS[kind].intro)}
      closeButtonLabel={t("desk.common.close")}
      size="sm"
      footer={
        <div className="ui-modal__actions">
          <Button type="button" appearance="subtle" onClick={() => onOpenChange(false)}>
            {t("desk.common.cancel")}
          </Button>
          <Button type="submit" form={formId} disabled={pending}>
            {pending ? t("desk.common.working") : t("desk.agents.clone.submit")}
          </Button>
        </div>
      }
    >
      {source !== null && (
        <CloneForm
          key={source.id}
          kind={kind}
          source={source}
          taken={taken}
          formId={formId}
          onPending={setPending}
          onDone={() => onOpenChange(false)}
        />
      )}
    </Modal>
  );
}
