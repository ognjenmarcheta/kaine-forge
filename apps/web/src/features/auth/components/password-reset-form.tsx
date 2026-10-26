import {
  validateAuthConfirmPassword,
  validateAuthEmail,
  validateAuthPasswordForSignup
} from "@repo/auth/form";
import { getAuthErrorMessageKey } from "@repo/auth/transport";
import { Button, Field, FieldDescription, FieldError, FieldLabel, Input } from "@repo/ui";
import { useState } from "react";

import { CaptchaWidget, isCaptchaPending } from "./captcha-widget";
import { CodeField } from "./code-field";
import { useTranslation } from "../../../hooks/use-translation";
import { emailOtpApi } from "../../../lib/auth-api";

interface PasswordResetFormProps {
  onReset: () => void;
}

/** Resets a forgotten password with a one-time code sent to the account email. */
export function PasswordResetForm({ onReset }: PasswordResetFormProps) {
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaResetKey, setCaptchaResetKey] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const requestCode = async () => {
    const emailError = validateAuthEmail(email);

    if (emailError) {
      setError(t(emailError));
      return;
    }

    setError(null);
    setIsSubmitting(true);

    try {
      await emailOtpApi.requestPasswordReset({
        email: email.trim(),
        ...(captchaToken ? { captchaToken } : {})
      });
      setCodeSent(true);
    } catch (requestError) {
      setError(t(getAuthErrorMessageKey(requestError)));
    } finally {
      setCaptchaToken(null);
      setCaptchaResetKey((key) => key + 1);
      setIsSubmitting(false);
    }
  };

  const resetPassword = async () => {
    const otp = code.trim();
    const validationError =
      (otp ? undefined : "auth.form.error.codeRequired") ??
      validateAuthPasswordForSignup(password) ??
      validateAuthConfirmPassword(password, confirmPassword);

    if (validationError) {
      setError(t(validationError));
      return;
    }

    setError(null);
    setIsSubmitting(true);

    try {
      await emailOtpApi.resetPassword({ email: email.trim(), otp, password });
      onReset();
    } catch (resetError) {
      setError(t(getAuthErrorMessageKey(resetError)));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form
      className="grid gap-[var(--ds-space-150)]"
      onSubmit={(event) => {
        event.preventDefault();
        void (codeSent ? resetPassword() : requestCode());
      }}
    >
      <Field>
        <FieldLabel htmlFor="reset-email">{t("common.emailLabel")}</FieldLabel>
        <Input
          id="reset-email"
          autoComplete="email"
          disabled={codeSent}
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </Field>

      {codeSent ? (
        <>
          <FieldDescription role="status">{t("auth.otp.codeSent")}</FieldDescription>
          <CodeField
            id="reset-code"
            label={t("auth.otp.codeLabel")}
            value={code}
            onChange={setCode}
          />
          <Field>
            <FieldLabel htmlFor="reset-password">{t("auth.reset.newPasswordLabel")}</FieldLabel>
            <Input
              id="reset-password"
              autoComplete="new-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="reset-confirm-password">
              {t("common.confirmPasswordLabel")}
            </FieldLabel>
            <Input
              id="reset-confirm-password"
              autoComplete="new-password"
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
            />
          </Field>
        </>
      ) : (
        <CaptchaWidget resetKey={captchaResetKey} onTokenChange={setCaptchaToken} />
      )}

      {error ? <FieldError>{error}</FieldError> : null}

      <Button
        disabled={isSubmitting || (!codeSent && isCaptchaPending(captchaToken))}
        type="submit"
      >
        {isSubmitting
          ? t("common.loadingShort")
          : codeSent
            ? t("auth.reset.submit")
            : t("auth.otp.send")}
      </Button>
    </form>
  );
}
