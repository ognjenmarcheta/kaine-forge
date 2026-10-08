import { Button, Checkbox, Input, Label, Modal } from "@repo/ui";
import { useId, useState } from "react";

import { useT } from "../i18n/i18n.t";
import { toastSettled } from "../shell/shell.toast";
import { useDesk } from "../state/desk.provider";

const ISSUE_NUMBER = /^[1-9]\d{0,8}$/;

/**
 * Start an issue by its number. `override` runs it on the owner's own authority instead of
 * the `ready-for-agent` label event: the desk logs it, and it is for your own runs only. The
 * result is a toast; the dialog closes when the desk took the start and stays open on a refusal.
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
  const [override, setOverride] = useState(false);
  const [pending, setPending] = useState(false);
  const [touched, setTouched] = useState(false);
  const valid = ISSUE_NUMBER.test(value.trim());
  const invalid = touched && !valid;

  const reset = (): void => {
    setValue("");
    setOverride(false);
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
      size="sm"
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
          void act(issueNumber, { action: "start", override }, { wait: false })
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
      </form>
    </Modal>
  );
}
