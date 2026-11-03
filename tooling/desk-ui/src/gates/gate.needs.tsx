import { MAX_FEEDBACK_CHARS } from "@repo/desk/contracts";
import {
  Button,
  Checkbox,
  Label,
  RadioGroup,
  RadioGroupItem,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Spinner,
  Textarea
} from "@repo/ui";
import { useId, useState } from "react";

import { DraftDialog } from "./gate.draft-dialog";
import { DecideBar, Kbd, type GateBodyProps } from "./gate.frame";
import { builderStepOf, incidentOf, resumeCommandOf, retryTargets } from "./gate.model";
import { useStageNames } from "../flow/flow.names";
import { issueFlowOf } from "../flow/flow.steps";
import { useT } from "../i18n/i18n.t";
import { stepPassed } from "../inspector/inspector.model";
import { copyText } from "../shell/shell.copy";
import { useShortcuts } from "../shell/shell.keys";
import { usePaletteActions } from "../shell/shell.palette";
import { useDesk } from "../state/desk.provider";

const AUTO_STAGE = "auto";

/** What stopped, the engine's reason, the failing command, the likely cause, and the trace. */
function IncidentCard({ detail, onShowTrace }: Pick<GateBodyProps, "detail" | "onShowTrace">) {
  const t = useT();
  const incident = incidentOf(detail);
  const failing = detail.check?.steps.find((step) => !stepPassed(step)) ?? null;
  return (
    <div
      className="dk-banner dk-banner-danger"
      role="group"
      aria-label={t("desk.gate.needsYou.reason")}
    >
      <span className="dk-g dk-g-bang" aria-hidden="true" />
      <div className="dk-grow dk-stack dk-gap-100">
        {incident.reason !== null && <b>{incident.reason}</b>}
        {failing !== null && (
          <p className="dk-t-small">
            {t("desk.incident.failing", {
              command: failing.argv.join(" "),
              code: failing.code ?? "–"
            })}
          </p>
        )}
        <p className="dk-t-small dk-row">
          {incident.cause !== null && <span>{t(`desk.incident.cause.${incident.cause}`)}</span>}
          <Button
            type="button"
            appearance="link"
            spacing="compact"
            className="dk-bare dk-linkbtn"
            onClick={onShowTrace}
          >
            {t("desk.incident.trace")}
          </Button>
        </p>
      </div>
    </div>
  );
}

type Choice = "tell" | "retry" | "terminal";

/**
 * The desk stopped. The incident says what and why. Three ways on in one list, each with what
 * happens next: tell the builder (recommended: it gets the note and the failing output), retry
 * from a step of the item's flow, or open the agent session in a terminal. One primary button
 * acts on the choice; C presses it. A flow without a change step has no builder to tell.
 */
export function NeedsYouGate({
  detail,
  summary,
  actions,
  send,
  onShowTrace,
  titleId
}: GateBodyProps) {
  const t = useT();
  const names = useStageNames();
  const id = useId();
  const [resume, setResume] = useState<string>(AUTO_STAGE);
  const [note, setNote] = useState("");
  const command = resumeCommandOf(detail);
  const targets = retryTargets(detail.state.flowSnapshot.flow);
  const builder = builderStepOf(issueFlowOf(summary), summary.resumeStage);
  const [choice, setChoice] = useState<Choice>(builder === null ? "retry" : "tell");
  const chosen = targets.find((stage) => stage === resume);
  const retryStage = chosen ?? summary.resumeStage;

  const continueRun = (): void => {
    if (actions.busy) return;
    void send(chosen === undefined ? { action: "continue" } : { action: "continue", from: chosen });
  };
  const tellBuilder = async (): Promise<void> => {
    const text = note.trim();
    if (text === "" || actions.busy || builder === null) return;
    if (await send({ action: "feedback", to: builder, text })) setNote("");
  };
  const copyCommand = (): void => {
    if (command !== null) {
      copyText(command, t("desk.incident.session.copied"), t("desk.issue.copyFailed"));
    }
  };
  const act = (): void => {
    if (choice === "tell") void tellBuilder();
    else if (choice === "retry") continueRun();
    else copyCommand();
  };
  const cta =
    choice === "tell"
      ? t("desk.incident.tell.send")
      : choice === "retry"
        ? t("desk.gate.needsYou.continue")
        : t("desk.incident.session.copy");
  const disabled = actions.busy || (choice === "tell" && note.trim() === "");

  useShortcuts([{ key: "c", run: act, labelKey: "desk.board.keys.continue" }]);
  usePaletteActions([
    { id: "gate-continue", label: t("desk.gate.needsYou.continue"), hint: "C", run: continueRun }
  ]);

  const options: readonly { readonly id: Choice; readonly show: boolean }[] = [
    { id: "tell", show: builder !== null },
    { id: "retry", show: true },
    { id: "terminal", show: command !== null }
  ];

  return (
    <>
      <IncidentCard detail={detail} onShowTrace={onShowTrace} />
      <div className="dk-sec">
        <h3 className="dk-h-sec" id={`${id}-what`}>
          {t("desk.incident.options")}
        </h3>
        <RadioGroup
          value={choice}
          onValueChange={(next) => {
            const picked = options.find((option) => option.id === next);
            if (picked !== undefined) setChoice(picked.id);
          }}
          className="dk-choices"
          aria-labelledby={`${id}-what`}
        >
          {options
            .filter((option) => option.show)
            .map((option) => (
              <div key={option.id} className={`dk-choice${choice === option.id ? " dk-on" : ""}`}>
                <RadioGroupItem value={option.id} id={`${id}-${option.id}`} />
                <div className="dk-body">
                  <Label htmlFor={`${id}-${option.id}`}>
                    <b>{t(`desk.incident.${option.id}.title`)}</b>
                    {option.id === "tell" && (
                      <span className="dk-rec">{t("desk.incident.recommended")}</span>
                    )}
                  </Label>
                  <span className="dk-t-small dk-t-sub">
                    {option.id === "retry"
                      ? retryStage === null
                        ? t("desk.incident.retry.nextAuto")
                        : t("desk.incident.retry.next", { stage: names.stage(retryStage) })
                      : option.id === "terminal"
                        ? t("desk.incident.session.next", { number: summary.issueNumber })
                        : t("desk.incident.tell.text")}
                  </span>
                  {choice === "tell" && option.id === "tell" && (
                    <Textarea
                      aria-label={t("desk.incident.tell.label")}
                      value={note}
                      rows={3}
                      maxLength={MAX_FEEDBACK_CHARS}
                      placeholder={t("desk.incident.tell.placeholder")}
                      onChange={(event) => setNote(event.target.value)}
                    />
                  )}
                  {choice === "retry" && option.id === "retry" && (
                    <span className="dk-field">
                      <Label htmlFor={`${id}-resume`}>{t("desk.gate.needsYou.resume")}</Label>
                      <Select value={resume} onValueChange={setResume}>
                        <SelectTrigger id={`${id}-resume`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={AUTO_STAGE}>
                            {summary.resumeStage === null
                              ? t("desk.gate.needsYou.resumeAuto")
                              : t("desk.gate.needsYou.resumeRemembered", {
                                  stage: names.stage(summary.resumeStage)
                                })}
                          </SelectItem>
                          {targets.map((stage) => (
                            <SelectItem key={stage} value={stage}>
                              {names.stage(stage)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </span>
                  )}
                  {choice === "terminal" && option.id === "terminal" && command !== null && (
                    <code className="dk-out dk-block">{command}</code>
                  )}
                </div>
              </div>
            ))}
        </RadioGroup>
      </div>
      <DecideBar labelledBy={titleId} hint={t("desk.incident.hint")}>
        <Button
          type="button"
          spacing="spacious"
          disabled={disabled}
          aria-keyshortcuts="C"
          onClick={act}
        >
          {cta}
          <Kbd shortcut="c" />
        </Button>
      </DecideBar>
    </>
  );
}

/**
 * Intake stopped: the issue is not in the format the desk reads. The intake agent can draft
 * the format (nothing reaches GitHub until the owner applies it), or the owner fixes the issue
 * and starts again, on their own authority if they choose.
 */
export function IntakeGate({ detail, summary, actions, send, titleId }: GateBodyProps) {
  const t = useT();
  const id = useId();
  const { api } = useDesk();
  const [override, setOverride] = useState(false);
  const [draftOpen, setDraftOpen] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const hasDraft = detail.artifacts.some((entry) => entry.id === "issue-draft" && entry.present);
  const { contract } = detail;

  /** The intake agent drafts the issue format. The dialog opens when a draft exists afterwards. */
  const draft = async (): Promise<void> => {
    setDrafting(true);
    try {
      const settled = await actions.run({ action: "draft" });
      if (settled.kind !== "done") return;
      const ready = await api
        .artifactText(summary.issueNumber, "issue-draft")
        .then(() => true)
        .catch(() => false);
      if (ready) setDraftOpen(true);
    } finally {
      setDrafting(false);
    }
  };

  return (
    <>
      {summary.needsYouReason !== null && (
        <p className="dk-lede" aria-label={t("desk.gate.needsYou.reason")}>
          {summary.needsYouReason}
        </p>
      )}
      {contract !== null && (
        <section className="dk-sec">
          <h3 className="dk-h-sec">
            {t("desk.intake.contract", { found: contract.found, total: contract.total })}
          </h3>
          {contract.missing.length > 0 && (
            <ul className="dk-checks dk-cols2">
              {contract.missing.map((section) => (
                <li key={section}>
                  <span className="dk-gl dk-bad dk-g-bang" aria-hidden="true" />
                  <div>
                    <b>{section}</b>
                    <div className="dk-t-small dk-t-sub">{t("desk.intake.missing")}</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
      <section className="dk-sec">
        <h3 className="dk-h-sec">{t("desk.intake.fix")}</h3>
        <p className="dk-t-sub">{t("desk.draft.help")}</p>
        <div className="dk-row">
          <Button type="button" disabled={actions.busy} onClick={() => void draft()}>
            {drafting ? (
              <>
                <Spinner size="sm" label={t("desk.draft.drafting")} aria-hidden="true" />
                {t("desk.draft.drafting")}
              </>
            ) : (
              t("desk.draft.start")
            )}
          </Button>
          {hasDraft && (
            <Button type="button" appearance="secondary" onClick={() => setDraftOpen(true)}>
              {t("desk.draft.review")}
            </Button>
          )}
        </div>
      </section>
      <section className="dk-sec" aria-labelledby={`${id}-again`}>
        <h3 id={`${id}-again`} className="dk-h-sec">
          {t("desk.intake.again")}
        </h3>
        <p className="dk-t-sub">{t("desk.gate.needsYou.restartHelp")}</p>
        <div className="dk-check">
          <Checkbox
            id={`${id}-override`}
            checked={override}
            onCheckedChange={(next) => setOverride(next === true)}
          />
          <Label htmlFor={`${id}-override`}>{t("desk.start.override")}</Label>
        </div>
        <div className="dk-row" role="group" aria-labelledby={titleId}>
          <Button
            type="button"
            appearance="secondary"
            disabled={actions.busy}
            onClick={() => void send({ action: "start", override })}
          >
            {t("desk.gate.needsYou.startAgain")}
          </Button>
        </div>
      </section>
      <DraftDialog
        issueNumber={summary.issueNumber}
        open={draftOpen}
        onOpenChange={setDraftOpen}
        actions={actions}
      />
    </>
  );
}
