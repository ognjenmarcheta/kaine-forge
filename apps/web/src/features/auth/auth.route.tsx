import type { TwoFactorMethod } from "@repo/auth/transport";
import { AuthLayout, Button, FieldDescription } from "@repo/ui";
import { useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";

import { AUTH_DEFINITION } from "./auth.definition";
import { isPasskeySupported, resolveReturnPath } from "./auth.util";
import { EmailOtpSignInForm } from "./components/email-otp-sign-in-form";
import { LoginForm } from "./components/login-form";
import { MagicLinkSignInForm } from "./components/magic-link-sign-in-form";
import { PasskeySignInButton } from "./components/passkey-sign-in-button";
import { PasswordResetForm } from "./components/password-reset-form";
import { SignupForm } from "./components/signup-form";
import { TwoFactorChallenge } from "./components/two-factor-challenge";
import { ThemeSelect } from "../../components/theme-select";
import { useAuth } from "../../hooks/use-auth";
import { useTranslation } from "../../hooks/use-translation";

type AuthMode = "login" | "signup" | "email-code" | "magic-link" | "reset" | "two-factor";

const MODE_COPY_KEYS = {
  login: { subtitle: "auth.login.subtitle", title: "auth.login.title" },
  signup: { subtitle: "auth.signup.subtitle", title: "auth.signup.title" },
  "email-code": { subtitle: "auth.otp.subtitle", title: "auth.otp.title" },
  "magic-link": { subtitle: "auth.magicLink.subtitle", title: "auth.magicLink.title" },
  reset: { subtitle: "auth.reset.subtitle", title: "auth.reset.title" },
  "two-factor": { subtitle: "auth.twoFactor.subtitle", title: "auth.twoFactor.title" }
} as const satisfies Record<AuthMode, { subtitle: string; title: string }>;

export function AuthRoute() {
  const { isLoading, session } = useAuth();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const returnPath = resolveReturnPath(searchParams.get(AUTH_DEFINITION.returnPathParam));
  // A used or expired magic link returns here with this parameter; the error
  // shows until the user moves to another step.
  const [magicLinkFailed, setMagicLinkFailed] = useState(() =>
    searchParams.has(AUTH_DEFINITION.magicLinkErrorParam)
  );
  const [mode, setMode] = useState<AuthMode>(magicLinkFailed ? "magic-link" : "login");
  const [twoFactorMethods, setTwoFactorMethods] = useState<readonly TwoFactorMethod[]>([]);
  const [notice, setNotice] = useState<string | null>(null);

  const showMode = (next: AuthMode) => {
    setNotice(null);
    setMagicLinkFailed(false);
    setMode(next);
  };
  const goToReturnPath = () => void navigate(returnPath);

  if (isLoading) {
    return <AuthLayout subtitle={t("common.loadingSession")} title={t("common.loading")} />;
  }

  if (session) {
    return <Navigate replace to={returnPath} />;
  }

  const isPrimaryMode = mode === "login" || mode === "signup";

  return (
    <AuthLayout
      footer={
        <nav aria-label={t("legal.footerLabel")} className="flex gap-[var(--ds-space-200)]">
          <Button appearance="link" asChild spacing="compact">
            <Link to="/terms">{t("legal.terms.title")}</Link>
          </Button>
          <Button appearance="link" asChild spacing="compact">
            <Link to="/privacy">{t("legal.privacy.title")}</Link>
          </Button>
        </nav>
      }
      subtitle={t(MODE_COPY_KEYS[mode].subtitle)}
      title={t(MODE_COPY_KEYS[mode].title)}
    >
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
            onDone={goToReturnPath}
            onTwoFactorRequired={(methods) => {
              setTwoFactorMethods(methods);
              showMode("two-factor");
            }}
          />
          {isPasskeySupported() ? (
            <div className="mt-[var(--ds-space-150)]">
              <PasskeySignInButton onDone={goToReturnPath} />
            </div>
          ) : null}
          <div className="mt-[var(--ds-space-150)] grid gap-[var(--ds-space-050)]">
            <Button appearance="link" type="button" onClick={() => showMode("magic-link")}>
              {t("auth.login.useMagicLink")}
            </Button>
            <Button appearance="link" type="button" onClick={() => showMode("email-code")}>
              {t("auth.login.useEmailCode")}
            </Button>
            <Button appearance="link" type="button" onClick={() => showMode("reset")}>
              {t("auth.login.forgotPassword")}
            </Button>
          </div>
        </>
      ) : null}
      {mode === "signup" ? <SignupForm onDone={goToReturnPath} /> : null}
      {mode === "email-code" ? <EmailOtpSignInForm onDone={goToReturnPath} /> : null}
      {mode === "magic-link" ? (
        <MagicLinkSignInForm linkFailed={magicLinkFailed} returnPath={returnPath} />
      ) : null}
      {mode === "reset" ? (
        <PasswordResetForm
          onReset={() => {
            showMode("login");
            setNotice(t("auth.reset.success"));
          }}
        />
      ) : null}
      {mode === "two-factor" ? (
        <TwoFactorChallenge methods={twoFactorMethods} onDone={goToReturnPath} />
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
