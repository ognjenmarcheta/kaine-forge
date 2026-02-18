import { Button, Input } from "@repo/ui";
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
    <form className="web-form" onSubmit={onSubmit}>
      <label className="web-form__field">
        <span>Full name</span>
        <Input required value={name} onChange={(event) => setName(event.target.value)} />
      </label>

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
          autoComplete="new-password"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </label>

      {error ? <p className="web-form__error">{error}</p> : null}

      <Button disabled={isSubmitting} size="md" type="submit">
        {isSubmitting ? "..." : t("auth.signup.title")}
      </Button>
    </form>
  );
}
