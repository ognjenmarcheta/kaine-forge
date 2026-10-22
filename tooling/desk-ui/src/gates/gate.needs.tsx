import { MAX_FEEDBACK_CHARS } from "@repo/desk/contracts";
import {
  Button,
  Checkbox,
  Label,
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
import { Kbd, type GateBodyProps } from "./gate.frame";
import { builderStepOf, incidentOf, resumeCommandOf, retryTargets } from "./gate.model";
import { useStageNames } from "../flow/flow.names";
import { issueFlowOf } from "../flow/flow.steps";
import { useT } from "../i18n/i18n.t";
import { copyText } from "../shell/shell.copy";
import { useShortcuts } from "../shell/shell.keys";
import { usePaletteActions } from "../shell/shell.palette";
import { useDesk } from "../state/desk.provider";

const AUTO_STAGE = "auto";

/** What stopped, the engine's reason, the likely cause when facts show one, and a way to the trace. */
function IncidentCard({ detail, onShowTrace }: Pick<GateBodyProps, "detail" | "onShowTrace">) {
  const t = useT();
  const names = useStageNames();
  const id = useId();
  const incident = incidentOf(detail);
  return (
    <section className="desk-incident" aria-labelledby={`${id}-head`}>
      <div className="desk-incident__top">
        <span className="desk-incident__mark" aria-hidden="true" />
        <h3 id={`${id}-head`} className="desk-incident__head">
          {incident.stage === null
            ? t("desk.incident.headUnknown")
            : t("desk.incident.head", { stage: names.stage(incident.stage) })}
        </h3>
      </div>
      {incident.reason !== null && (
        <p className="desk-incident__reason" aria-label={t("desk.gate.needsYou.reason")}>
          {incident.reason}
        </p>
      )}
      <div className="desk-incident__foot">
        {incident.cause !== null && (
          <span className="desk-why-chip">{t(`desk.incident.cause.${incident.cause}`)}</span>
        )}
        <Button appearance="link" spacing="compact" onClick={onShowTrace}>
          {t("desk.incident.trace")}
        </Button>
      </div>
    </section>
  );
}

/**
 * The desk stopped. The incident says what and why. Three ways on, each with what happens next:
 * tell the builder (recommended: it gets the note and the failing output), retry a stage of the
 * issue's flow, or open the agent session in a terminal. C continues. A flow without a change
 * step has no builder to tell.
 */
export function NeedsYouGate({ detail, summary, actions, send, onShowTrace }: GateBodyProps) {
  const t = useT();
  const names = useStageNames();
  const id = useId();
  const [resume, setResume] = useState<string>(AUTO_STAGE);
  const [note, setNote] = useState("");
  const command = resumeCommandOf(detail);
  const targets = retryTargets(detail.state.flowSnapshot.flow);
  const builder = builderStepOf(issueFlowOf(summary), summary.resumeStage);
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

  useShortcuts([{ key: "c", run: continueRun, labelKey: "desk.board.keys.continue" }]);
  usePaletteActions([
    { id: "gate-continue", label: t("desk.gate.needsYou.continue"), hint: "C", run: continueRun }
  ]);

  return (
    <>
      <IncidentCard detail={detail} onShowTrace={onShowTrace} />
      <section className="desk-sec">
        <h3>{t("desk.incident.options")}</h3>
        <div className="desk-opts">
          {builder !== null && (
            <div className="desk-opt" data-recommended="true">
              <h4>
                {t("desk.incident.tell.title")}{" "}
                <span className="desk-recommended">{t("desk.incident.recommended")}</span>
              </h4>
              <p>{t("desk.incident.tell.text")}</p>
              <Label htmlFor={`${id}-note`}>{t("desk.incident.tell.label")}</Label>
              <Textarea
                id={`${id}-note`}
                value={note}
                rows={3}
                maxLength={MAX_FEEDBACK_CHARS}
                onChange={(event) => setNote(event.target.value)}
              />
              <p className="desk-next">{t("desk.incident.tell.next")}</p>
              <Button
                spacing="compact"
                disabled={actions.busy || note.trim() === ""}
                onClick={() => void tellBuilder()}
              >
                {t("desk.incident.tell.send")}
              </Button>
            </div>
          )}
          <div className="desk-opt">
            <h4>{t("desk.incident.retry.title")}</h4>
            <p>{t("desk.incident.retry.text")}</p>
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
            <p className="desk-next">
              {retryStage === null
                ? t("desk.incident.retry.nextAuto")
                : t("desk.incident.retry.next", { stage: names.stage(retryStage) })}
            </p>
            <Button
              appearance="secondary"
              spacing="compact"
              disabled={actions.busy}
              aria-keyshortcuts="C"
              onClick={continueRun}
            >
              {t("desk.gate.needsYou.continue")}
              <Kbd shortcut="c" />
            </Button>
          </div>
          {command !== null && (
            <div className="desk-opt">
              <h4>{t("desk.incident.session.title")}</h4>
              <p>{t("desk.incident.session.text")}</p>
              <code className="desk-command">{command}</code>
              <p className="desk-next">
                {t("desk.incident.session.next", { number: summary.issueNumber })}
              </p>
              <Button
                appearance="subtle"
                spacing="compact"
                onClick={() =>
                  copyText(command, t("desk.incident.session.copied"), t("desk.issue.copyFailed"))
                }
              >
                {t("desk.incident.session.copy")}
              </Button>
            </div>
          )}
        </div>
      </section>
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
        <p className="desk-reason" aria-label={t("desk.gate.needsYou.reason")}>
          {summary.needsYouReason}
        </p>
      )}
      {contract !== null && (
        <section className="desk-sec">
          <h3>{t("desk.intake.contract", { found: contract.found, total: contract.total })}</h3>
          {contract.missing.length > 0 && (
            <ul className="desk-criteria">
              {contract.missing.map((section) => (
                <li key={section} className="desk-criteria__missing">
                  <strong>{section}</strong>
                  <span className="desk-muted">{t("desk.intake.missing")}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
      <section className="desk-sec">
        <h3>{t("desk.intake.fix")}</h3>
        <p className="desk-muted">{t("desk.draft.help")}</p>
        <div className="desk-draft__actions">
          <Button disabled={actions.busy} onClick={() => void draft()}>
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
            <Button appearance="secondary" onClick={() => setDraftOpen(true)}>
              {t("desk.draft.review")}
            </Button>
          )}
        </div>
      </section>
      <section className="desk-sec" aria-labelledby={`${id}-again`}>
        <h3 id={`${id}-again`}>{t("desk.intake.again")}</h3>
        <p className="desk-muted">{t("desk.gate.needsYou.restartHelp")}</p>
        <div className="desk-check-row">
          <Checkbox
            id={`${id}-override`}
            checked={override}
            onCheckedChange={(next) => setOverride(next === true)}
          />
          <Label htmlFor={`${id}-override`}>{t("desk.start.override")}</Label>
        </div>
        <div className="desk-draft__actions" role="group" aria-labelledby={titleId}>
          <Button
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
