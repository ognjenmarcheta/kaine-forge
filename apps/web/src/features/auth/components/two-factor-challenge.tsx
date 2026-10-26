import type { TwoFactorMethod } from "@repo/auth/transport";
import { getAuthErrorMessageKey } from "@repo/auth/transport";
import { Button, Checkbox, FieldDescription, FieldError, Label } from "@repo/ui";
import { useState } from "react";

import { CodeField } from "./code-field";
import { useAuth } from "../../../hooks/use-auth";
import { useTranslation } from "../../../hooks/use-translation";
import { twoFactorApi } from "../../../lib/auth-api";

type ChallengeMethod = TwoFactorMethod | "backup";

const METHOD_LABEL_KEYS = {
  backup: "auth.twoFactor.method.backup",
  otp: "auth.twoFactor.method.otp",
  totp: "auth.twoFactor.method.totp"
} as const satisfies Record<ChallengeMethod, string>;

const METHOD_HINT_KEYS = {
  backup: "auth.twoFactor.backupHint",
  otp: "auth.twoFactor.otpHint",
  totp: "auth.twoFactor.totpHint"
} as const satisfies Record<ChallengeMethod, string>;

interface TwoFactorChallengeProps {
  methods: readonly TwoFactorMethod[];
  onDone: () => void;
}

/** Second sign-in step after a password sign-in that requires two-factor verification. */
export function TwoFactorChallenge({ methods, onDone }: TwoFactorChallengeProps) {
  const { completeSignIn } = useAuth();
  const { t } = useTranslation();
  // Backup codes always work, even when no other method is enrolled.
  const availableMethods: ChallengeMethod[] = [...methods, "backup"];
  const [method, setMethod] = useState<ChallengeMethod>(availableMethods[0] ?? "backup");
  const [code, setCode] = useState("");
  const [trustDevice, setTrustDevice] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const selectMethod = (next: ChallengeMethod) => {
    setMethod(next);
    setCode("");
    setError(null);
    setNotice(null);
  };

  const sendOtp = async () => {
    setError(null);

    try {
      await twoFactorApi.sendOtp();
      setNotice(t("auth.otp.codeSent"));
    } catch (sendError) {
      setError(t(getAuthErrorMessageKey(sendError)));
    }
  };

  const submit = async () => {
    const trimmedCode = code.trim();

    if (!trimmedCode) {
      setError(t("auth.form.error.codeRequired"));
      return;
    }

    setError(null);
    setIsSubmitting(true);

    try {
      await completeSignIn(() => twoFactorApi.verify({ code: trimmedCode, method, trustDevice }));
      onDone();
    } catch (verifyError) {
      setError(t(getAuthErrorMessageKey(verifyError)));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form
      className="grid gap-[var(--ds-space-150)]"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <div
        className="grid gap-[var(--ds-space-100)]"
        role="group"
        aria-label={t("auth.twoFactor.title")}
      >
        {availableMethods.map((option) => (
          <Button
            key={option}
            appearance={option === method ? "default" : "subtle"}
            aria-pressed={option === method}
            type="button"
            onClick={() => selectMethod(option)}
          >
            {t(METHOD_LABEL_KEYS[option])}
          </Button>
        ))}
      </div>

      <FieldDescription>{t(METHOD_HINT_KEYS[method])}</FieldDescription>

      {method === "otp" ? (
        <Button appearance="secondary" type="button" onClick={() => void sendOtp()}>
          {notice ? t("auth.otp.resend") : t("auth.otp.send")}
        </Button>
      ) : null}
      {notice ? <FieldDescription role="status">{notice}</FieldDescription> : null}

      <CodeField
        id="two-factor-code"
        label={t("auth.otp.codeLabel")}
        numeric={method !== "backup"}
        value={code}
        onChange={setCode}
      />

      <div className="flex items-center gap-[var(--ds-space-100)]">
        <Checkbox
          id="two-factor-trust-device"
          checked={trustDevice}
          onCheckedChange={(checked) => setTrustDevice(checked === true)}
        />
        <Label htmlFor="two-factor-trust-device">{t("auth.twoFactor.trustDevice")}</Label>
      </div>

      {error ? <FieldError>{error}</FieldError> : null}

      <Button disabled={isSubmitting} type="submit">
        {isSubmitting ? t("common.loadingShort") : t("auth.twoFactor.verify")}
      </Button>
    </form>
  );
}
