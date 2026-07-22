import { validateAuthEmail, validateAuthPasswordRequired } from "@repo/auth/form";
import type { AuthSocialProvider } from "@repo/auth/transport";
import { Button, Field, FieldError, FieldLabel, Input, useUiForm } from "@repo/ui";
import { useState } from "react";

import { useAuth } from "../../../hooks/use-auth";
import { useTranslation } from "../../../hooks/use-translation";
import { signInWithSocialRequest } from "../../../lib/auth-api";
import { AUTH_CONFIG } from "../auth.config";

interface LoginFormProps {
  onDone: () => void;
}

const SOCIAL_PROVIDER_LABEL_KEYS = {
  github: "auth.social.github",
  google: "auth.social.google"
} as const satisfies Record<AuthSocialProvider, string>;

interface LoginFormValues {
  email: string;
  password: string;
}

export function LoginForm({ onDone }: LoginFormProps) {
  const { login } = useAuth();
  const { t } = useTranslation();
  const [error, setError] = useState<string | null>(null);

  const form = useUiForm({
    defaultValues: {
      email: "test@test.test",
      password: "ChangeMe123!"
    } satisfies LoginFormValues,
    onSubmit: async ({ value }) => {
      try {
        setError(null);
        await login({ email: value.email, password: value.password });
        onDone();
      } catch {
        setError(t("error.generic"));
      }
    }
  });

  const isSubmitting = form.state.isSubmitting;

  return (
    <form
      className="grid gap-[var(--ds-space-150)]"
      onSubmit={(event) => {
        event.preventDefault();
        event.stopPropagation();
        void form.handleSubmit();
      }}
    >
      <form.Field
        name="email"
        validators={{
          onChange: ({ value }) => {
            const key = validateAuthEmail(value);
            return key ? t(key) : undefined;
          }
        }}
      >
        {(fieldApi) => (
          <Field>
            <FieldLabel htmlFor="login-email">{t("common.emailLabel")}</FieldLabel>
            <Input
              id="login-email"
              autoComplete="email"
              type="email"
              value={fieldApi.state.value}
              onBlur={fieldApi.handleBlur}
              onChange={(event) => fieldApi.handleChange(event.target.value)}
            />
            {fieldApi.state.meta.isTouched && fieldApi.state.meta.errors[0] ? (
              <FieldError>{String(fieldApi.state.meta.errors[0])}</FieldError>
            ) : null}
          </Field>
        )}
      </form.Field>

      <form.Field
        name="password"
        validators={{
          onChange: ({ value }) => {
            const key = validateAuthPasswordRequired(value);
            return key ? t(key) : undefined;
          }
        }}
      >
        {(fieldApi) => (
          <Field>
            <FieldLabel htmlFor="login-password">{t("common.passwordLabel")}</FieldLabel>
            <Input
              id="login-password"
              autoComplete="current-password"
              type="password"
              value={fieldApi.state.value}
              onBlur={fieldApi.handleBlur}
              onChange={(event) => fieldApi.handleChange(event.target.value)}
            />
            {fieldApi.state.meta.isTouched && fieldApi.state.meta.errors[0] ? (
              <FieldError>{String(fieldApi.state.meta.errors[0])}</FieldError>
            ) : null}
          </Field>
        )}
      </form.Field>

      {error ? <FieldError>{error}</FieldError> : null}

      <Button disabled={isSubmitting} type="submit">
        {isSubmitting ? t("common.loadingShort") : t("auth.login.title")}
      </Button>

      {AUTH_CONFIG.socialProviders.map((provider) => (
        <Button
          key={provider}
          appearance="secondary"
          type="button"
          onClick={() => {
            setError(null);
            signInWithSocialRequest(provider).catch(() => {
              setError(t("error.generic"));
            });
          }}
        >
          {t(SOCIAL_PROVIDER_LABEL_KEYS[provider])}
        </Button>
      ))}
    </form>
  );
}
