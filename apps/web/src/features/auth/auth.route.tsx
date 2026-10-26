import type { TwoFactorMethod } from "@repo/auth/transport";
import { AuthLayout, Button, FieldDescription } from "@repo/ui";
import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";

import { EmailOtpSignInForm } from "./components/email-otp-sign-in-form";
import { LoginForm } from "./components/login-form";
import { PasswordResetForm } from "./components/password-reset-form";
import { SignupForm } from "./components/signup-form";
import { TwoFactorChallenge } from "./components/two-factor-challenge";
import { ThemeSelect } from "../../components/theme-select";
import { useAuth } from "../../hooks/use-auth";
import { useTranslation } from "../../hooks/use-translation";

type AuthMode = "login" | "signup" | "email-code" | "reset" | "two-factor";

const MODE_COPY_KEYS = {
  login: { subtitle: "auth.login.subtitle", title: "auth.login.title" },
  signup: { subtitle: "auth.signup.subtitle", title: "auth.signup.title" },
  "email-code": { subtitle: "auth.otp.subtitle", title: "auth.otp.title" },
  reset: { subtitle: "auth.reset.subtitle", title: "auth.reset.title" },
  "two-factor": { subtitle: "auth.twoFactor.subtitle", title: "auth.twoFactor.title" }
} as const satisfies Record<AuthMode, { subtitle: string; title: string }>;

export function AuthRoute() {
  const { isLoading, session } = useAuth();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [mode, setMode] = useState<AuthMode>("login");
  const [twoFactorMethods, setTwoFactorMethods] = useState<readonly TwoFactorMethod[]>([]);
  const [notice, setNotice] = useState<string | null>(null);

  const showMode = (next: AuthMode) => {
    setNotice(null);
    setMode(next);
  };
  const goToDashboard = () => void navigate("/dashboard");

  if (isLoading) {
    return <AuthLayout subtitle={t("common.loadingSession")} title={t("common.loading")} />;
  }

  if (session) {
    return <Navigate replace to="/dashboard" />;
  }

  const isPrimaryMode = mode === "login" || mode === "signup";

  return (
    <AuthLayout subtitle={t(MODE_COPY_KEYS[mode].subtitle)} title={t(MODE_COPY_KEYS[mode].title)}>
      <div className="mb-[var(--ds-space-300)]">
        <ThemeSelect />
      </div>
      {isPrimaryMode ? (
        <div className="mb-[var(--ds-space-150)] grid grid-cols-2 gap-[var(--ds-space-100)]">
          <Button
            appearance={mode === "login" ? "default" : "subtle"}
            onClick={() => showMode("login")}
          >
            {t("auth.login.title")}
          </Button>
          <Button
            appearance={mode === "signup" ? "default" : "subtle"}
            onClick={() => showMode("signup")}
          >
            {t("auth.signup.title")}
          </Button>
        </div>
      ) : null}

      {notice ? (
        <FieldDescription className="mb-[var(--ds-space-150)]" role="status">
          {notice}
        </FieldDescription>
      ) : null}

      {mode === "login" ? (
        <>
          <LoginForm
            onDone={goToDashboard}
            onTwoFactorRequired={(methods) => {
              setTwoFactorMethods(methods);
              showMode("two-factor");
            }}
          />
          <div className="mt-[var(--ds-space-150)] grid gap-[var(--ds-space-050)]">
            <Button appearance="link" type="button" onClick={() => showMode("email-code")}>
              {t("auth.login.useEmailCode")}
            </Button>
            <Button appearance="link" type="button" onClick={() => showMode("reset")}>
              {t("auth.login.forgotPassword")}
            </Button>
          </div>
        </>
      ) : null}
      {mode === "signup" ? <SignupForm onDone={goToDashboard} /> : null}
      {mode === "email-code" ? <EmailOtpSignInForm onDone={goToDashboard} /> : null}
      {mode === "reset" ? (
        <PasswordResetForm
          onReset={() => {
            showMode("login");
            setNotice(t("auth.reset.success"));
          }}
        />
      ) : null}
      {mode === "two-factor" ? (
        <TwoFactorChallenge methods={twoFactorMethods} onDone={goToDashboard} />
      ) : null}

      {isPrimaryMode ? null : (
        <Button
          appearance="subtle"
          className="mt-[var(--ds-space-150)] w-full"
          type="button"
          onClick={() => showMode("login")}
        >
          {t("auth.backToSignIn")}
        </Button>
      )}
    </AuthLayout>
  );
}
