import { FEEDBACK_TARGETS, MAX_FEEDBACK_CHARS, type FeedbackTarget } from "@repo/desk/contracts";
import { Button, Label, RadioGroup, RadioGroupItem, Textarea } from "@repo/ui";
import { useEffect, useId, useState } from "react";

import { useT } from "../i18n/i18n.t";

export interface FeedbackFormProps {
  readonly id?: string;
  readonly targets: readonly FeedbackTarget[];
  readonly busy: boolean;
  readonly onSend: (target: FeedbackTarget, text: string) => Promise<boolean>;
  /** Close the form without sending. The draft is dropped. */
  readonly onCancel: () => void;
}

/**
 * Feedback goes to one stage, chosen in a segmented control. The text is kept until the send
 * works, so a refusal loses nothing. The box takes focus when the form opens.
 */
export function FeedbackForm({ id: formId, targets, busy, onSend, onCancel }: FeedbackFormProps) {
  const t = useT();
  const id = useId();
  const first = targets[0] ?? FEEDBACK_TARGETS[0];
  const [target, setTarget] = useState<FeedbackTarget>(first);
  const [text, setText] = useState("");
  const empty = text.trim() === "";
  useEffect(() => {
    document.getElementById(`${id}-text`)?.focus();
  }, [id]);
  return (
    <form
      id={formId}
      className="desk-feedback"
      onSubmit={(event) => {
        event.preventDefault();
        if (busy || empty) return;
        void onSend(target, text).then((sent) => {
          if (sent) setText("");
        });
      }}
    >
      {targets.length > 1 && (
        <fieldset className="desk-fieldset">
          <legend>{t("desk.feedback.to")}</legend>
          <RadioGroup
            value={target}
            onValueChange={(value) => {
              const next = targets.find((entry) => entry === value);
              if (next !== undefined) setTarget(next);
            }}
            orientation="horizontal"
            className="desk-segmented"
          >
            {targets.map((entry) => (
              <div
                key={entry}
                className="desk-segmented__item"
                data-checked={entry === target ? "true" : undefined}
              >
                <RadioGroupItem
                  value={entry}
                  id={`${id}-${entry}`}
                  className="desk-segmented__radio"
                />
                <Label htmlFor={`${id}-${entry}`}>{t(`desk.feedback.target.${entry}`)}</Label>
              </div>
            ))}
          </RadioGroup>
        </fieldset>
      )}
      <Label htmlFor={`${id}-text`}>{t("desk.feedback.label")}</Label>
      <Textarea
        id={`${id}-text`}
        value={text}
        maxLength={MAX_FEEDBACK_CHARS}
        rows={3}
        onChange={(event) => setText(event.target.value)}
        aria-describedby={`${id}-help`}
      />
      <p id={`${id}-help`} className="desk-muted desk-feedback__help">
        {t("desk.feedback.help", { count: text.length, max: MAX_FEEDBACK_CHARS })}
      </p>
      <div className="desk-feedback__actions">
        <Button type="button" appearance="subtle" onClick={onCancel}>
          {t("desk.common.cancel")}
        </Button>
        <Button type="submit" appearance="secondary" disabled={busy || empty}>
          {t("desk.feedback.send")}
        </Button>
      </div>
    </form>
  );
}
