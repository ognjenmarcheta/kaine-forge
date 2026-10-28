import type { TwoFactorEnrollment } from "@repo/auth/transport";
import { getAuthErrorMessageKey } from "@repo/auth/transport";
import { Button, CopyButton, FieldDescription, FieldError, SettingsSection } from "@repo/ui";
import { useState } from "react";
import QRCode from "react-qr-code";

import { BackupCodesList } from "./backup-codes-list";
import { PasswordConfirmForm } from "./password-confirm-form";
import { useAuth } from "../../../hooks/use-auth";
import { useTranslation } from "../../../hooks/use-translation";
import { twoFactorApi } from "../../../lib/auth-api";
import { CodeField } from "../../auth/components/code-field";
import { getTotpSetupKey } from "../security.util";

type SettingsStep =
  | { kind: "idle" }
  | { kind: "confirm"; action: "enable" | "disable" | "regenerate" }
  | { kind: "enroll"; enrollment: TwoFactorEnrollment }
  | { kind: "backup-codes"; codes: readonly string[] };

/** Turns TOTP two-factor verification on or off and manages backup codes. */
export function TwoFactorSettings() {
  const { refreshSession, session } = useAuth();
  const { t } = useTranslation();
  const [step, setStep] = useState<SettingsStep>({ kind: "idle" });
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isEnabled = session?.user.twoFactorEnabled === true;
  const reset = () => {
    setStep({ kind: "idle" });
    setCode("");
    setError(null);
  };

  const confirmWithPassword = async (
    action: "enable" | "disable" | "regenerate",
    password: string
  ) => {
    if (action === "enable") {
      setStep({ kind: "enroll", enrollment: await twoFactorApi.enable(password) });
      return;
    }

    if (action === "disable") {
      await twoFactorApi.disable(password);
      await refreshSession();
      reset();
      return;
    }

    setStep({ kind: "backup-codes", codes: await twoFactorApi.regenerateBackupCodes(password) });
  };

  const verifyEnrollment = async (enrollment: TwoFactorEnrollment) => {
    const trimmedCode = code.trim();

    if (!trimmedCode) {
      setError(t("auth.form.error.codeRequired"));
      return;
    }

    setError(null);
    setIsSubmitting(true);

    try {
      await twoFactorApi.verifyEnrollment(trimmedCode);
      await refreshSession();
      setCode("");
      setStep({ kind: "backup-codes", codes: enrollment.backupCodes });
    } catch (verifyError) {
      setError(t(getAuthErrorMessageKey(verifyError)));
    } finally {
      setIsSubmitting(false);
    }
  };

  const setupKey = step.kind === "enroll" ? getTotpSetupKey(step.enrollment.totpUri) : null;

  if (step.kind === "backup-codes") {
    return <BackupCodesList codes={step.codes} onDone={reset} />;
  }

  return (
    <SettingsSection
      description={
        <span role="status">
          {isEnabled ? t("auth.security.statusEnabled") : t("auth.security.statusDisabled")}
        </span>
      }
      title={t("auth.twoFactor.title")}
    >
      {step.kind === "idle" ? (
        <div className="flex flex-wrap gap-[var(--ds-space-100)]">
          {isEnabled ? (
            <>
              <Button
                appearance="danger"
                type="button"
                onClick={() => setStep({ kind: "confirm", action: "disable" })}
              >
                {t("auth.security.disable")}
              </Button>
              <Button
                appearance="secondary"
                type="button"
                onClick={() => setStep({ kind: "confirm", action: "regenerate" })}
              >
                {t("auth.security.regenerate")}
              </Button>
            </>
          ) : (
            <Button type="button" onClick={() => setStep({ kind: "confirm", action: "enable" })}>
              {t("auth.security.enable")}
            </Button>
          )}
        </div>
      ) : null}

      {step.kind === "confirm" ? (
        <PasswordConfirmForm
          id={`two-factor-${step.action}-password`}
          onCancel={reset}
          onConfirm={(password) => confirmWithPassword(step.action, password)}
        />
      ) : null}

      {step.kind === "enroll" ? (
        <form
          className="grid gap-[var(--ds-space-150)]"
          onSubmit={(event) => {
            event.preventDefault();
            void verifyEnrollment(step.enrollment);
          }}
        >
          <FieldDescription>{t("auth.security.scanQr")}</FieldDescription>
          <div className="w-fit rounded-[var(--ds-radius-100)] bg-[var(--ds-surface)] p-[var(--ds-space-150)] text-[color:var(--ds-text)]">
            <QRCode
              aria-label={t("auth.security.qrLabel")}
              bgColor="transparent"
              fgColor="currentColor"
              role="img"
              size={176}
              value={step.enrollment.totpUri}
            />
          </div>
          <FieldDescription>{t("auth.security.setupKey")}</FieldDescription>
          <div className="flex flex-wrap items-center gap-[var(--ds-space-100)]">
            <code className="break-all">{setupKey}</code>
            {setupKey ? (
              <CopyButton
                copiedLabel={t("common.copied")}
                label={t("auth.security.copySetupKey")}
                value={setupKey}
              />
            ) : null}
          </div>
          <CodeField
            id="two-factor-enroll-code"
            label={t("auth.security.verifyCode")}
            value={code}
            onChange={setCode}
          />
          {error ? <FieldError>{error}</FieldError> : null}
          <div className="flex gap-[var(--ds-space-100)]">
            <Button disabled={isSubmitting} type="submit">
              {isSubmitting ? t("common.loadingShort") : t("auth.security.confirm")}
            </Button>
            <Button appearance="subtle" type="button" onClick={reset}>
              {t("auth.security.cancel")}
            </Button>
          </div>
        </form>
      ) : null}
    </SettingsSection>
  );
}
