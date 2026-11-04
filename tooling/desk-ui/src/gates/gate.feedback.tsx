import { MAX_FEEDBACK_CHARS } from "@repo/desk/contracts";
import { Button, Label, RadioGroup, RadioGroupItem, Textarea } from "@repo/ui";
import { useEffect, useId, useState } from "react";

import { useStageNames } from "../flow/flow.names";
import { stageName, type IssueFlow } from "../flow/flow.steps";
import { useT, type Translate } from "../i18n/i18n.t";

/** The built-in steps that have their own words: "Plan again", "Build again", "Review again". */
const BUILTIN_TARGETS: readonly string[] = ["plan", "build", "review"];

/** What a feedback target says: built-in words for a built-in step, else "Back to <step label>". */
export const targetLabel = (t: Translate, flow: IssueFlow | null, id: string): string =>
  (flow === null || flow.source === "builtin") && BUILTIN_TARGETS.includes(id)
    ? t(`desk.feedback.target.${id}`)
    : t("desk.feedback.targetStep", { stage: stageName(t, flow, id) });

/** A comment that goes with the feedback: where it is, what it says, and how to drop it. */
export interface FormComment {
  readonly where: string;
  readonly text: string;
  readonly onRemove: () => void;
}

export interface FeedbackFormProps {
  readonly id?: string;
  /** Step ids of the issue's flow, the default first. */
  readonly targets: readonly string[];
  readonly busy: boolean;
  readonly onSend: (target: string, text: string) => Promise<boolean>;
  /** Close the form without sending. The draft is dropped. */
  readonly onCancel: () => void;
  /** PR feedback: the text is optional, and the form says what the desk adds to it. */
  readonly fromPr?: boolean;
  /** Comments that are sent with the text. With some, the text is optional. */
  readonly comments?: readonly FormComment[];
  /** Keep the text in the parent, so it can warn about text that was not sent. */
  readonly text?: string;
  readonly onText?: (text: string) => void;
}

/**
 * Feedback goes to one stage, chosen in a segmented control. The text is kept until the send
 * works, so a refusal loses nothing. The box takes focus when the form opens. With `fromPr`
 * the desk collects the feedback on the PR, and the engineer's words are optional.
 */
const NO_COMMENTS: readonly FormComment[] = [];

export function FeedbackForm({
  id: formId,
  targets,
  busy,
  onSend,
  onCancel,
  fromPr = false,
  comments = NO_COMMENTS,
  text: controlledText,
  onText
}: FeedbackFormProps) {
  const t = useT();
  const { flow } = useStageNames();
  const id = useId();
  const [target, setTarget] = useState<string>(targets[0] ?? "");
  const [ownText, setOwnText] = useState("");
  const text = controlledText ?? ownText;
  const setText = onText ?? setOwnText;
  // A gate with no send-back step has no target; the server would refuse an empty one. A PR
  // feedback round needs none.
  const empty =
    (text.trim() === "" && !fromPr && comments.length === 0) || (!fromPr && target === "");
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
        <fieldset className="dk-fieldset">
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
                <Label htmlFor={`${id}-${entry}`}>{targetLabel(t, flow, entry)}</Label>
              </div>
            ))}
          </RadioGroup>
        </fieldset>
      )}
      {comments.length > 0 && (
        <section aria-label={t("desk.feedback.comments")}>
          <p className="dk-t-sub">{t("desk.feedback.commentsIntro")}</p>
          <ul className="dk-stack">
            {comments.map((comment) => (
              <li key={`${comment.where}|${comment.text}`} className="dk-row">
                <span>
                  <code>{comment.where}</code> {comment.text}
                </span>
                <Button
                  type="button"
                  appearance="link"
                  spacing="compact"
                  className="dk-bare dk-linkbtn dk-t-small"
                  onClick={comment.onRemove}
                >
                  {t("desk.lines.delete")}
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}
      {fromPr && <p className="dk-t-sub">{t("desk.prFeedback.intro")}</p>}
      <Label htmlFor={`${id}-text`}>
        {t(fromPr ? "desk.prFeedback.label" : "desk.feedback.label")}
      </Label>
      <Textarea
        id={`${id}-text`}
        value={text}
        maxLength={MAX_FEEDBACK_CHARS}
        rows={3}
        onChange={(event) => setText(event.target.value)}
        aria-describedby={`${id}-help`}
      />
      <p id={`${id}-help`} className="dk-t-sub desk-feedback__help">
        {t("desk.feedback.help", { count: text.length, max: MAX_FEEDBACK_CHARS })}
      </p>
      <div className="desk-feedback__actions">
        <Button type="button" appearance="subtle" onClick={onCancel}>
          {t("desk.common.cancel")}
        </Button>
        <Button type="submit" appearance="secondary" disabled={busy || empty}>
          {comments.length > 0
            ? t("desk.feedback.sendWithComments", { count: comments.length })
            : t(fromPr ? "desk.prFeedback.send" : "desk.feedback.send")}
        </Button>
      </div>
    </form>
  );
}
