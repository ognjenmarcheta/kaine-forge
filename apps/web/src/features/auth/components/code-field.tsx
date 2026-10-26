import { Field, FieldLabel, Input } from "@repo/ui";

interface CodeFieldProps {
  id: string;
  label: string;
  onChange: (value: string) => void;
  // Backup codes mix letters and digits; one-time codes are numeric.
  numeric?: boolean;
  value: string;
}

/** Single code input that lets the browser and password managers offer one-time codes. */
export function CodeField({ id, label, numeric = true, onChange, value }: CodeFieldProps) {
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input
        id={id}
        autoComplete="one-time-code"
        inputMode={numeric ? "numeric" : "text"}
        spellCheck={false}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </Field>
  );
}
