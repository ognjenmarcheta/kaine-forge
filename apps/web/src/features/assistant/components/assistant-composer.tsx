import { Button, FieldLabel, Textarea } from "@repo/ui";
import { useLayoutEffect, type RefObject } from "react";

import { useTranslation } from "../../../hooks/use-translation";

interface AssistantComposerProps {
  formRef: RefObject<HTMLFormElement | null>;
  canSend: boolean;
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
}

export function AssistantComposer({
  formRef,
  canSend,
  value,
  onChange,
  onSubmit
}: AssistantComposerProps) {
  const { t } = useTranslation();
  useLayoutEffect(() => {
    const textarea = formRef.current?.querySelector("textarea");
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${textarea.scrollHeight.toString()}px`;
  }, [value, formRef]);

  return (
    <form
      ref={formRef}
      className="ui-assistant__composer"
      onSubmit={(event) => {
        event.preventDefault();
        if (canSend && value.trim()) onSubmit();
      }}
    >
      <FieldLabel htmlFor="assistant-message">{t("assistant.inputLabel")}</FieldLabel>
      <Textarea
        id="assistant-message"
        rows={2}
        placeholder={t("assistant.placeholder")}
        aria-describedby="assistant-keyboard-hint"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (
            event.key === "Enter" &&
            !event.shiftKey &&
            !event.nativeEvent.isComposing &&
            event.keyCode !== 229
          ) {
            event.preventDefault();
            event.currentTarget.form?.requestSubmit();
          }
        }}
      />
      <div className="ui-assistant__composer-footer">
        <span id="assistant-keyboard-hint">{t("assistant.keyboardHint")}</span>
        <Button disabled={!canSend || !value.trim()} type="submit">
          {t("assistant.send")}
        </Button>
      </div>
    </form>
  );
}
