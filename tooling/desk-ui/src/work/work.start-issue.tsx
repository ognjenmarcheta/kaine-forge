import type { ActionRequestInput, GithubIssue } from "@repo/desk/contracts";
import { Button, Checkbox, Input, Label } from "@repo/ui";
import { useId, useState } from "react";

import { FlowPicker } from "./work.flow-picker";
import { useFlowList } from "../flow/flow.use";
import { useGithubLists } from "../github/github.use";
import { useT } from "../i18n/i18n.t";
import { toastSettled } from "../shell/shell.toast";
import { FailureText, Loading, Muted } from "../shell/shell.ui";
import { useDesk } from "../state/desk.provider";
import { StatusChip } from "../status/status.chip";

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
    <section className="dk-stack" aria-labelledby={`${id}-title`}>
      <div className="dk-row">
        <div className="dk-field dk-grow">
          <Label id={`${id}-title`} htmlFor={`${id}-filter`}>
            {t("desk.picker.title")}
          </Label>
          <Input
            id={`${id}-filter`}
            type="search"
            placeholder={t("desk.picker.filter")}
            value={filter}
            disabled={issues === null}
            onChange={(event) => setFilter(event.target.value)}
          />
        </div>
        <Button
          type="button"
          appearance="ghost"
          spacing="compact"
          className="dk-end"
          disabled={state.status === "loading"}
          onClick={() => reload(true)}
        >
          {t("desk.github.refresh")}
        </Button>
      </div>
      {state.status === "loading" && <Loading />}
      {state.status === "error" && <FailureText code={state.code} detail={state.detail} />}
      {state.status === "ok" && !state.lists.ok && (
        <p className="dk-t-sub">
          {t("desk.github.unavailable")} <span>{state.lists.reason}</span>
        </p>
      )}
      {issues !== null && issues.length === 0 && <Muted>{t("desk.picker.empty")}</Muted>}
      {issues !== null &&
        issues.length > 0 &&
        (shown.length === 0 ? (
          <Muted>{t("desk.picker.noMatch")}</Muted>
        ) : (
          <ul className="dk-pickl" aria-labelledby={`${id}-title`}>
            {shown.map((issue) => (
              <li key={issue.number}>
                <Button
                  appearance="ghost"
                  className="dk-bare dk-pick"
                  aria-pressed={selected === issue.number}
                  disabled={issue.onBoard}
                  onClick={() => onPick(issue)}
                >
                  <b className="dk-mono">{t("desk.issue.number", { number: issue.number })}</b>
                  <span>{issue.title}</span>
                  <span className="dk-row">
                    {issue.onBoard ? (
                      <span className="dk-tag">{t("desk.picker.onBoard")}</span>
                    ) : (
                      <StatusChip tone={issue.ready ? "success" : "neutral"}>
                        {t(issue.ready ? "desk.picker.ready" : "desk.picker.notReady")}
                      </StatusChip>
                    )}
                    <StatusChip
                      tone={issue.contract.found === issue.contract.total ? "success" : "warning"}
                    >
                      {t("desk.picker.contract", {
                        found: issue.contract.found,
                        total: issue.contract.total
                      })}
                    </StatusChip>
                  </span>
                </Button>
              </li>
            ))}
          </ul>
        ))}
    </section>
  );
}

/**
 * Start an issue: pick it from the open issues of the repository, or type its number, and pick
 * the flow it runs on. Picking an issue selects the flow the desk would pick for it, unless the
 * form opened on a flow.
 * `override` runs it on the owner's own authority instead of the `ready-for-agent` label event:
 * the desk logs it, and it is for your own runs only. The result is a toast; New work closes
 * when the desk took the start and stays open on a refusal.
 */
export function IssueStartForm({
  open,
  flowId: preset = null,
  onCancel,
  onStarted
}: {
  /** New work is open: the issue list loads only then. */
  readonly open: boolean;
  /** The flow chosen when the form opens, for a start from a flow's page. */
  readonly flowId?: string | null;
  readonly onCancel: () => void;
  readonly onStarted: () => void;
}) {
  const t = useT();
  const id = useId();
  const { act } = useDesk();
  const [value, setValue] = useState("");
  const [picked, setPicked] = useState<GithubIssue | null>(null);
  const [override, setOverride] = useState(false);
  const [flowId, setFlowId] = useState<string | null>(preset);
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

  return (
    <form
      className="dk-stack dk-gap-200"
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
            if (settled.kind !== "error") onStarted();
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
          setFlowId(preset ?? issue.flowId);
          setTouched(false);
        }}
      />
      <div className="dk-field">
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
          <p id={`${id}-number-help`} className="dk-hint dk-t-danger" role="alert">
            {t("desk.start.invalid")}
          </p>
        ) : (
          <p id={`${id}-number-help`} className="dk-hint">
            {t("desk.start.numberHelp")}
          </p>
        )}
      </div>
      <FlowPicker
        state={flows}
        suggested={chosen?.flowId ?? null}
        value={listed}
        onChange={setFlowId}
      />
      <div className="dk-check">
        <Checkbox
          id={`${id}-override`}
          checked={override}
          onCheckedChange={(next) => setOverride(next === true)}
          aria-describedby={`${id}-override-help`}
        />
        <span>
          <Label htmlFor={`${id}-override`}>{t("desk.start.override")}</Label>
          <span id={`${id}-override-help`} className="dk-hint dk-block">
            {t("desk.start.overrideHelp")}
          </span>
        </span>
      </div>
      {chosen !== null && !chosen.ready && !override && (
        <p className="dk-hint" role="status">
          {t("desk.picker.needsOverride", { number: chosen.number })}
        </p>
      )}
      <div className="dk-dialog-f">
        <Button type="button" appearance="outline" onClick={onCancel}>
          {t("desk.common.cancel")}
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? t("desk.start.starting") : t("desk.start.submit")}
        </Button>
      </div>
    </form>
  );
}
