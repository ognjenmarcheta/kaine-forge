import { Button, Input } from "@repo/ui";
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
    <form className="web-form" onSubmit={onSubmit}>
      <label className="web-form__field">
        <span>Email</span>
        <Input
          required
          autoComplete="email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </label>

      <label className="web-form__field">
        <span>Password</span>
        <Input
          required
          autoComplete="current-password"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </label>

      {error ? <p className="web-form__error">{error}</p> : null}

      <Button disabled={isSubmitting} size="md" type="submit">
        {isSubmitting ? "..." : t("auth.login.title")}
      </Button>
    </form>
  );
}
