import type { ActionRequestInput, GithubIssue } from "@repo/desk/contracts";
import { Badge, Button, Checkbox, Input, Label, Modal } from "@repo/ui";
import { useId, useState } from "react";

import { FlowPicker } from "./board.flow-picker";
import { useFlowList } from "../flow/flow.use";
import { useGithubLists } from "../github/github.use";
import { useT } from "../i18n/i18n.t";
import { toastSettled } from "../shell/shell.toast";
import { FailureText, Loading, Muted } from "../shell/shell.ui";
import { useDesk } from "../state/desk.provider";

const ISSUE_NUMBER = /^[1-9]\d{0,8}$/;

const matches = (issue: GithubIssue, filter: string): boolean => {
  const needle = filter.trim().replace(/^#/, "").toLowerCase();
  return (
    needle === "" ||
    String(issue.number).startsWith(needle) ||
    issue.title.toLowerCase().includes(needle)
  );
};

/**
 * The open issues of the repository, to pick one instead of typing its number. Picking fills
 * the number and nothing else: the override stays the engineer's own choice, and intake still
 * checks who applied `ready-for-agent`. An issue the desk already has cannot be picked.
 */
function IssuePicker({
  open,
  selected,
  onPick
}: {
  readonly open: boolean;
  readonly selected: number | null;
  readonly onPick: (issue: GithubIssue) => void;
}) {
  const t = useT();
  const id = useId();
  const { state, reload } = useGithubLists(open);
  const [filter, setFilter] = useState("");
  const issues = state.status === "ok" && state.lists.ok ? state.lists.issues : null;
  const shown = issues?.filter((issue) => matches(issue, filter)) ?? [];
  return (
    <section className="desk-picker" aria-labelledby={`${id}-title`}>
      <div className="desk-picker__head">
        <h3 id={`${id}-title`}>{t("desk.picker.title")}</h3>
        <Button
          type="button"
          appearance="subtle"
          spacing="compact"
          disabled={state.status === "loading"}
          onClick={() => reload(true)}
        >
          {t("desk.github.refresh")}
        </Button>
      </div>
      {state.status === "loading" && <Loading />}
      {state.status === "error" && <FailureText code={state.code} detail={state.detail} />}
      {state.status === "ok" && !state.lists.ok && (
        <p className="desk-muted">
          {t("desk.github.unavailable")} <span>{state.lists.reason}</span>
        </p>
      )}
      {issues !== null && issues.length === 0 && <Muted>{t("desk.picker.empty")}</Muted>}
      {issues !== null && issues.length > 0 && (
        <>
          <Input
            type="search"
            aria-label={t("desk.picker.filter")}
            placeholder={t("desk.picker.filter")}
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
          />
          {shown.length === 0 ? (
            <Muted>{t("desk.picker.noMatch")}</Muted>
          ) : (
            <ul className="desk-picker__list" aria-labelledby={`${id}-title`}>
              {shown.map((issue) => (
                <li key={issue.number}>
                  <Button
                    type="button"
                    appearance="ghost"
                    className="desk-picker__item"
                    aria-pressed={selected === issue.number}
                    disabled={issue.onBoard}
                    onClick={() => onPick(issue)}
                  >
                    <span className="desk-picker__name">
                      {t("desk.issue.number", { number: issue.number })} <span>{issue.title}</span>
                    </span>
                    <span className="desk-picker__meta">
                      {issue.onBoard ? (
                        <Badge appearance="default">{t("desk.picker.onBoard")}</Badge>
                      ) : (
                        <Badge appearance={issue.ready ? "success" : "default"}>
                          {t(issue.ready ? "desk.picker.ready" : "desk.picker.notReady")}
                        </Badge>
                      )}
                      <span className="desk-muted">
                        {t("desk.picker.contract", {
                          found: issue.contract.found,
                          total: issue.contract.total
                        })}
                      </span>
                    </span>
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}

/**
 * Start an issue: pick it from the open issues of the repository, or type its number, and pick
 * the flow it runs on. Picking an issue selects the flow the desk would pick for it.
 * `override` runs it on the owner's own authority instead of the `ready-for-agent` label event:
 * the desk logs it, and it is for your own runs only. The result is a toast; the dialog closes
 * when the desk took the start and stays open on a refusal.
 */
export function StartDialog({
  open,
  onOpenChange
}: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}) {
  const t = useT();
  const id = useId();
  const { act } = useDesk();
  const [value, setValue] = useState("");
  const [picked, setPicked] = useState<GithubIssue | null>(null);
  const [override, setOverride] = useState(false);
  const [flowId, setFlowId] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [touched, setTouched] = useState(false);
  const flows = useFlowList(open);
  const valid = ISSUE_NUMBER.test(value.trim());
  const invalid = touched && !valid;
  // The picked issue, while the number still says so.
  const chosen = picked !== null && String(picked.number) === value.trim() ? picked : null;
  // Only a listed flow is sent: without one the desk picks it, as it would for this issue anyway.
  const listed =
    flows.status === "ok" && flows.list.flows.some((flow) => flow.definition.id === flowId)
      ? flowId
      : null;

  const reset = (): void => {
    setValue("");
    setPicked(null);
    setOverride(false);
    setFlowId(null);
    setTouched(false);
  };

  return (
    <Modal
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
      title={t("desk.start.title")}
      closeButtonLabel={t("desk.common.close")}
      size="md"
      footer={
        <div className="ui-modal__actions">
          <Button type="button" appearance="subtle" onClick={() => onOpenChange(false)}>
            {t("desk.common.cancel")}
          </Button>
          <Button type="submit" form={`${id}-form`} disabled={pending}>
            {pending ? t("desk.start.starting") : t("desk.start.submit")}
          </Button>
        </div>
      }
    >
      <form
        id={`${id}-form`}
        className="desk-start"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          setTouched(true);
          if (!valid || pending) return;
          const issueNumber = Number(value.trim());
          setPending(true);
          const request: ActionRequestInput =
            listed === null
              ? { action: "start", override }
              : { action: "start", override, flowId: listed };
          void act(issueNumber, request, { wait: false })
            .then((settled) => {
              toastSettled(t, issueNumber, "start", settled);
              if (settled.kind !== "error") {
                reset();
                onOpenChange(false);
              }
            })
            .finally(() => setPending(false));
        }}
      >
        <IssuePicker
          open={open}
          selected={chosen?.number ?? null}
          onPick={(issue) => {
            setPicked(issue);
            setValue(String(issue.number));
            setFlowId(issue.flowId);
            setTouched(false);
          }}
        />
        <div className="desk-field">
          <Label htmlFor={`${id}-number`}>{t("desk.start.number")}</Label>
          <Input
            id={`${id}-number`}
            inputMode="numeric"
            autoComplete="off"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            aria-invalid={invalid}
            aria-describedby={`${id}-number-help`}
          />
          {invalid ? (
            <p id={`${id}-number-help`} className="desk-field__error" role="alert">
              {t("desk.start.invalid")}
            </p>
          ) : (
            <p id={`${id}-number-help`} className="desk-muted">
              {t("desk.start.numberHelp")}
            </p>
          )}
        </div>
        <div className="desk-check-row">
          <Checkbox
            id={`${id}-override`}
            checked={override}
            onCheckedChange={(next) => setOverride(next === true)}
            aria-describedby={`${id}-override-help`}
          />
          <Label htmlFor={`${id}-override`}>{t("desk.start.override")}</Label>
        </div>
        <p id={`${id}-override-help`} className="desk-muted">
          {t("desk.start.overrideHelp")}
        </p>
        <FlowPicker
          state={flows}
          suggested={chosen?.flowId ?? null}
          value={listed}
          onChange={setFlowId}
        />
        {chosen !== null && !chosen.ready && !override && (
          <p className="desk-picker__note" role="status">
            {t("desk.picker.needsOverride", { number: chosen.number })}
          </p>
        )}
      </form>
    </Modal>
  );
}
