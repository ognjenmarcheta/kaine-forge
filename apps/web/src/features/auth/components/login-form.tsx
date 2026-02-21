import { Button, Field, FieldError, FieldLabel, Input } from "@repo/ui";
import { useState, type FormEvent } from "react";

import { useAuth } from "../../../hooks/use-auth";
import { useTranslation } from "../../../hooks/use-translation";

interface LoginFormProps {
  onDone: () => void;
}

export function LoginForm({ onDone }: LoginFormProps) {
  const { login } = useAuth();
  const { t } = useTranslation();
  const [email, setEmail] = useState("test@test.test");
  const [password, setPassword] = useState("ChangeMe123!");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    try {
      setIsSubmitting(true);
      setError(null);
      await login({ email, password });
      onDone();
    } catch {
      setError(t("error.generic"));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="grid gap-[var(--ds-space-150)]" onSubmit={onSubmit}>
      <Field>
        <FieldLabel htmlFor="login-email">{t("common.emailLabel")}</FieldLabel>
        <Input
          id="login-email"
          required
          autoComplete="email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </Field>

      <Field>
        <FieldLabel htmlFor="login-password">{t("common.passwordLabel")}</FieldLabel>
        <Input
          id="login-password"
          required
          autoComplete="current-password"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </Field>

      {error ? <FieldError>{error}</FieldError> : null}

      <Button disabled={isSubmitting} type="submit">
        {isSubmitting ? "..." : t("auth.login.title")}
      </Button>
    </form>
  );
}
