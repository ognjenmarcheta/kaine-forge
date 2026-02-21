import { Button, Field, FieldError, FieldLabel, Input } from "@repo/ui";
import { useState, type FormEvent } from "react";

import { useAuth } from "../../../hooks/use-auth";
import { useTranslation } from "../../../hooks/use-translation";

interface SignupFormProps {
  onDone: () => void;
}

export function SignupForm({ onDone }: SignupFormProps) {
  const { signup } = useAuth();
  const { t } = useTranslation();
  const [name, setName] = useState("Test User");
  const [email, setEmail] = useState("test@test.test");
  const [password, setPassword] = useState("ChangeMe123!");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    try {
      setError(null);
      setIsSubmitting(true);
      await signup({ email, name, password });
      onDone();
    } catch {
      setError(t("error.generic"));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="grid gap-ds-150" onSubmit={onSubmit}>
      <Field>
        <FieldLabel htmlFor="signup-name">{t("common.nameLabel")}</FieldLabel>
        <Input
          id="signup-name"
          required
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </Field>

      <Field>
        <FieldLabel htmlFor="signup-email">{t("common.emailLabel")}</FieldLabel>
        <Input
          id="signup-email"
          required
          autoComplete="email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </Field>

      <Field>
        <FieldLabel htmlFor="signup-password">{t("common.passwordLabel")}</FieldLabel>
        <Input
          id="signup-password"
          required
          autoComplete="new-password"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </Field>

      {error ? <FieldError>{error}</FieldError> : null}

      <Button disabled={isSubmitting} type="submit">
        {isSubmitting ? "..." : t("auth.signup.title")}
      </Button>
    </form>
  );
}
