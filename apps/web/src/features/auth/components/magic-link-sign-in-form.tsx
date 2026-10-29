import { validateAuthEmail } from "@repo/auth/form";
import { getAuthErrorMessageKey } from "@repo/auth/transport";
import { Button, Field, FieldDescription, FieldError, FieldLabel, Input } from "@repo/ui";
import { useState } from "react";

import { CaptchaWidget, isCaptchaPending } from "./captcha-widget";
import { useTranslation } from "../../../hooks/use-translation";
import { magicLinkApi } from "../../../lib/auth-api";

interface MagicLinkSignInFormProps {
  /** True when a used or expired link sent the user back here. */
  linkFailed: boolean;
  returnPath: string;
}

/** Passwordless sign-in for an existing account: email a one-time sign-in link. */
export function MagicLinkSignInForm({ linkFailed, returnPath }: MagicLinkSignInFormProps) {
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [linkSent, setLinkSent] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaResetKey, setCaptchaResetKey] = useState(0);
  const [error, setError] = useState<string | null>(
    linkFailed ? t("auth.magicLink.invalid") : null
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  const sendLink = async () => {
    const emailError = validateAuthEmail(email);

    if (emailError) {
      setError(t(emailError));
      return;
    }

    setError(null);
    setIsSubmitting(true);

    try {
      await magicLinkApi.send({
        email: email.trim(),
        returnPath,
        ...(captchaToken ? { captchaToken } : {})
      });
      setLinkSent(true);
    } catch (sendError) {
      setError(t(getAuthErrorMessageKey(sendError)));
    } finally {
      // Turnstile tokens are single-use, so every attempt needs a new one.
      setCaptchaToken(null);
      setCaptchaResetKey((key) => key + 1);
      setIsSubmitting(false);
    }
  };

  return (
    <form
      className="grid gap-ds-150"
      onSubmit={(event) => {
        event.preventDefault();
        void sendLink();
      }}
    >
      <Field>
        <FieldLabel htmlFor="magic-link-email">{t("common.emailLabel")}</FieldLabel>
        <Input
          id="magic-link-email"
          autoComplete="email"
          disabled={linkSent}
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </Field>

      {linkSent ? (
        <FieldDescription role="status">{t("auth.magicLink.sent")}</FieldDescription>
      ) : (
        <CaptchaWidget resetKey={captchaResetKey} onTokenChange={setCaptchaToken} />
      )}

      {error ? <FieldError>{error}</FieldError> : null}

      {linkSent ? (
        <Button appearance="subtle" type="button" onClick={() => setLinkSent(false)}>
          {t("auth.magicLink.resend")}
        </Button>
      ) : (
        <Button disabled={isSubmitting || isCaptchaPending(captchaToken)} type="submit">
          {isSubmitting ? t("common.loadingShort") : t("auth.magicLink.send")}
        </Button>
      )}
    </form>
  );
}
