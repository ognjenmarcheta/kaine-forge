import { Button, Field, FieldLabel, Textarea } from "@repo/ui";
import { type FormEvent } from "react";

interface AssistantComposerProps {
  inputLabel: string;
  isPending: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  placeholder: string;
  sendLabel: string;
  sendingLabel: string;
  value: string;
  onChange: (value: string) => void;
}

export function AssistantComposer({
  inputLabel,
  isPending,
  onChange,
  onSubmit,
  placeholder,
  sendLabel,
  sendingLabel,
  value
}: AssistantComposerProps) {
  return (
    <form className="flex flex-col gap-[var(--ds-space-150)]" onSubmit={onSubmit}>
      <Field>
        <FieldLabel htmlFor="assistant-message">{inputLabel}</FieldLabel>
        <Textarea
          id="assistant-message"
          placeholder={placeholder}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      </Field>
      <div>
        <Button disabled={isPending} type="submit">
          {isPending ? sendingLabel : sendLabel}
        </Button>
      </div>
    </form>
  );
}
