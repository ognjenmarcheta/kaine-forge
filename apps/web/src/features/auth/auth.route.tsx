import type { TwoFactorMethod } from "@repo/auth/transport";
import {
  AuthLayout,
  Button,
  FieldDescription,
  tabsListClassName,
  tabsTriggerClassName,
  cn
} from "@repo/ui";
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
type PrimaryMode = "login" | "signup";
type SecondaryMode = Exclude<AuthMode, PrimaryMode>;

/** The login/signup choice lives in the URL so refresh and back keep it. */
const MODE_PARAM = "mode";

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
  const primaryMode: PrimaryMode = searchParams.get(MODE_PARAM) === "signup" ? "signup" : "login";
  const [secondaryMode, setSecondaryMode] = useState<SecondaryMode | null>(() =>
    magicLinkFailed ? "magic-link" : null
  );
  const mode: AuthMode = secondaryMode ?? primaryMode;
  const [twoFactorMethods, setTwoFactorMethods] = useState<readonly TwoFactorMethod[]>([]);
  const [notice, setNotice] = useState<string | null>(null);

  const modeSearch = (value: PrimaryMode) => {
    const params = new URLSearchParams(searchParams);
    if (value === "signup") params.set(MODE_PARAM, "signup");
    else params.delete(MODE_PARAM);
    const search = params.toString();
    return search ? `?${search}` : "";
  };
  const showMode = (next: AuthMode) => {
    setNotice(null);
    setMagicLinkFailed(false);
    if (next !== "login" && next !== "signup") {
      setSecondaryMode(next);
      return;
    }
    setSecondaryMode(null);
    if (next !== primaryMode) void navigate({ search: modeSearch(next) });
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
        <nav
          aria-label={t("auth.modeSwitch")}
          className={cn(tabsListClassName, "mb-[var(--ds-space-150)] flex w-full")}
        >
          {(["login", "signup"] as const).map((value) => (
            <Link
              key={value}
              to={{ search: modeSearch(value) }}
              aria-current={mode === value ? "page" : undefined}
              className={cn(tabsTriggerClassName, "flex-1")}
              onClick={() => setNotice(null)}
            >
              {t(MODE_COPY_KEYS[value].title)}
            </Link>
          ))}
        </nav>
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
