import {
  validateAuthConfirmPassword,
  validateAuthEmail,
  validateAuthName,
  validateAuthPasswordForSignup
} from "@repo/auth/form";
import { getAuthErrorMessageKey } from "@repo/auth/transport";
import { Button, Field, FieldError, FieldLabel, Input, useUiForm } from "@repo/ui";
import { useState } from "react";

import { CaptchaWidget, isCaptchaPending } from "./captcha-widget";
import { useAuth } from "../../../hooks/use-auth";
import { useTranslation } from "../../../hooks/use-translation";

interface SignupFormProps {
  onDone: () => void;
}

interface SignupFormValues {
  confirmPassword: string;
  email: string;
  name: string;
  password: string;
}

export function SignupForm({ onDone }: SignupFormProps) {
  const { signup } = useAuth();
  const { t } = useTranslation();
  const [error, setError] = useState<string | null>(null);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaResetKey, setCaptchaResetKey] = useState(0);

  const form = useUiForm({
    // No prefilled password: the seed password appears in known breaches, so
    // the Have I Been Pwned check would reject it on sign-up.
    defaultValues: {
      confirmPassword: "",
      email: "test@test.test",
      name: "Test User",
      password: ""
    } satisfies SignupFormValues,
    onSubmit: async ({ value }) => {
      try {
        setError(null);
        await signup({
          email: value.email,
          name: value.name,
          password: value.password,
          ...(captchaToken ? { captchaToken } : {})
        });
        onDone();
      } catch (signupError) {
        setError(t(getAuthErrorMessageKey(signupError)));
      } finally {
        setCaptchaToken(null);
        setCaptchaResetKey((key) => key + 1);
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
        name="name"
        validators={{
          onChange: ({ value }) => {
            const key = validateAuthName(value);
            return key ? t(key) : undefined;
          }
        }}
      >
        {(fieldApi) => (
          <Field>
            <FieldLabel htmlFor="signup-name">{t("common.nameLabel")}</FieldLabel>
            <Input
              id="signup-name"
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
            <FieldLabel htmlFor="signup-email">{t("common.emailLabel")}</FieldLabel>
            <Input
              id="signup-email"
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
            const key = validateAuthPasswordForSignup(value);
            return key ? t(key) : undefined;
          }
        }}
      >
        {(fieldApi) => (
          <Field>
            <FieldLabel htmlFor="signup-password">{t("common.passwordLabel")}</FieldLabel>
            <Input
              id="signup-password"
              autoComplete="new-password"
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

      <form.Field
        name="confirmPassword"
        validators={{
          onChangeListenTo: ["password"],
          onChange: ({ value, fieldApi }) => {
            const password = fieldApi.form.getFieldValue("password");
            const key = validateAuthConfirmPassword(password, value);
            return key ? t(key) : undefined;
          }
        }}
      >
        {(fieldApi) => (
          <Field>
            <FieldLabel htmlFor="signup-confirm-password">
              {t("common.confirmPasswordLabel")}
            </FieldLabel>
            <Input
              id="signup-confirm-password"
              autoComplete="new-password"
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

      <CaptchaWidget resetKey={captchaResetKey} onTokenChange={setCaptchaToken} />

      {error ? <FieldError>{error}</FieldError> : null}

      <Button disabled={isSubmitting || isCaptchaPending(captchaToken)} type="submit">
        {isSubmitting ? t("common.loadingShort") : t("auth.signup.title")}
      </Button>
    </form>
  );
}
