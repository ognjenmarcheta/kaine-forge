import { validateAuthEmail } from "@repo/auth/form";
import { getAuthErrorMessageKey } from "@repo/auth/transport";
import { Button, Field, FieldDescription, FieldError, FieldLabel, Input } from "@repo/ui";
import { useState } from "react";

import { CaptchaWidget, isCaptchaPending } from "./captcha-widget";
import { CodeField } from "./code-field";
import { useAuth } from "../../../hooks/use-auth";
import { useTranslation } from "../../../hooks/use-translation";
import { emailOtpApi } from "../../../lib/auth-api";

interface EmailOtpSignInFormProps {
  onDone: () => void;
}

/** Passwordless sign-in for an existing account: email a one-time code, then enter it. */
export function EmailOtpSignInForm({ onDone }: EmailOtpSignInFormProps) {
  const { completeSignIn } = useAuth();
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaResetKey, setCaptchaResetKey] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const sendCode = async () => {
    const emailError = validateAuthEmail(email);

    if (emailError) {
      setError(t(emailError));
      return;
    }

    setError(null);
    setIsSubmitting(true);

    try {
      await emailOtpApi.sendSignInCode({
        email: email.trim(),
        ...(captchaToken ? { captchaToken } : {})
      });
      setCodeSent(true);
    } catch (sendError) {
      setError(t(getAuthErrorMessageKey(sendError)));
    } finally {
      setCaptchaToken(null);
      setCaptchaResetKey((key) => key + 1);
      setIsSubmitting(false);
    }
  };

  const signIn = async () => {
    const otp = code.trim();

    if (!otp) {
      setError(t("auth.form.error.codeRequired"));
      return;
    }

    setError(null);
    setIsSubmitting(true);

    try {
      await completeSignIn(() => emailOtpApi.signIn({ email: email.trim(), otp }));
      onDone();
    } catch (signInError) {
      setError(t(getAuthErrorMessageKey(signInError)));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form
      className="grid gap-[var(--ds-space-150)]"
      onSubmit={(event) => {
        event.preventDefault();
        void (codeSent ? signIn() : sendCode());
      }}
    >
      <Field>
        <FieldLabel htmlFor="otp-email">{t("common.emailLabel")}</FieldLabel>
        <Input
          id="otp-email"
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
            id="otp-code"
            label={t("auth.otp.codeLabel")}
            value={code}
            onChange={setCode}
          />
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
            ? t("auth.otp.submit")
            : t("auth.otp.send")}
      </Button>

      {codeSent ? (
        <Button
          appearance="subtle"
          type="button"
          onClick={() => {
            setCode("");
            setCodeSent(false);
          }}
        >
          {t("auth.otp.resend")}
        </Button>
      ) : null}
    </form>
  );
}
