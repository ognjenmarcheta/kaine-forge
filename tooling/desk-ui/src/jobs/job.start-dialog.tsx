import { JOB_DEFAULT_MODEL, JOB_LIMITS, type JobKind } from "@repo/desk/contracts";
import { Input, Label, Modal, Textarea } from "@repo/ui";
import { useId, useState } from "react";

import { toApiError } from "../api/api.client";
import { failureMessageKey } from "../api/api.errors";
import { useT } from "../i18n/i18n.t";
import { useRouter } from "../shell/shell.router";
import { useDesk } from "../state/desk.provider";

/**
 * Start a desk job: what to keep in mind, the model, and the limits. The limits start at the
 * kind's defaults; a run that reaches one stops and waits for the owner.
 */
export function JobStartDialog({
  kind,
  open,
  onOpenChange
}: {
  readonly kind: JobKind;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}) {
  const t = useT();
  const id = useId();
  const { api } = useDesk();
  const { navigate } = useRouter();
  const limits = JOB_LIMITS[kind];
  const [note, setNote] = useState("");
  const [model, setModel] = useState(JOB_DEFAULT_MODEL);
  const [budget, setBudget] = useState(String(limits.costUsd));
  const [minutes, setMinutes] = useState(String(limits.minutes));
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const budgetValue = Number(budget);
  const minutesValue = Number(minutes);
  const valid =
    Number.isFinite(budgetValue) &&
    budgetValue > 0 &&
    budgetValue <= 200 &&
    Number.isInteger(minutesValue) &&
    minutesValue > 0 &&
    minutesValue <= 240 &&
    model.trim() !== "";

  const start = async (): Promise<void> => {
    setPending(true);
    setError(null);
    try {
      const job = await api.startJob({
        kind,
        note: note.trim(),
        model: model.trim(),
        budgetUsd: budgetValue,
        minutes: minutesValue
      });
      onOpenChange(false);
      navigate({ view: "job", jobId: job.id });
    } catch (failure) {
      const converted = toApiError(failure);
      setError(converted.detail ?? t(failureMessageKey(converted.code)));
    } finally {
      setPending(false);
    }
  };

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={t(`desk.job.start.title.${kind}`)}
      description={t(`desk.job.start.description.${kind}`)}
      closeButtonLabel={t("desk.common.close")}
      size="md"
      actions={[
        {
          appearance: "subtle",
          label: t("desk.common.cancel"),
          onClick: () => onOpenChange(false)
        },
        {
          appearance: "default",
          label: t("desk.job.start.confirm"),
          loadingLabel: t("desk.job.start.starting"),
          loading: pending,
          disabled: !valid || pending,
          onClick: () => void start()
        }
      ]}
    >
      <div className="desk-field">
        <Label htmlFor={`${id}-note`}>{t("desk.job.start.note")}</Label>
        <Textarea
          id={`${id}-note`}
          value={note}
          maxLength={2000}
          onChange={(event) => setNote(event.target.value)}
        />
      </div>
      <div className="desk-job-limits">
        <div className="desk-field">
          <Label htmlFor={`${id}-model`}>{t("desk.job.start.model")}</Label>
          <Input
            id={`${id}-model`}
            value={model}
            onChange={(event) => setModel(event.target.value)}
          />
        </div>
        <div className="desk-field">
          <Label htmlFor={`${id}-budget`}>{t("desk.job.start.budget")}</Label>
          <Input
            id={`${id}-budget`}
            inputMode="decimal"
            value={budget}
            onChange={(event) => setBudget(event.target.value)}
          />
        </div>
        <div className="desk-field">
          <Label htmlFor={`${id}-minutes`}>{t("desk.job.start.minutes")}</Label>
          <Input
            id={`${id}-minutes`}
            inputMode="numeric"
            value={minutes}
            onChange={(event) => setMinutes(event.target.value)}
          />
        </div>
      </div>
      <p className="desk-muted">{t("desk.job.start.limitsHelp")}</p>
      {error !== null && (
        <p className="desk-field__error" role="alert">
          {error}
        </p>
      )}
    </Modal>
  );
}
