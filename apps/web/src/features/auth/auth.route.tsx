import { AuthLayout, Button } from "@repo/ui";
import { useMemo, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";

import { LoginForm } from "./components/login-form";
import { SignupForm } from "./components/signup-form";
import { useAuth } from "../../hooks/use-auth";
import { useTranslation } from "../../hooks/use-translation";

export function AuthRoute() {
  const { isLoading, session } = useAuth();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"login" | "signup">("login");

  const copy = useMemo(
    () => ({
      login: {
        subtitle: t("auth.login.subtitle"),
        title: t("auth.login.title")
      },
      signup: {
        subtitle: t("auth.signup.subtitle"),
        title: t("auth.signup.title")
      }
    }),
    [t]
  );

  if (isLoading) {
    return <AuthLayout subtitle={t("common.loadingSession")} title={t("common.loading")} />;
  }

  if (session) {
    return <Navigate replace to="/dashboard" />;
  }

  return (
    <AuthLayout subtitle={copy[mode].subtitle} title={copy[mode].title}>
      <div className="mb-[var(--ds-space-150)] grid grid-cols-2 gap-[var(--ds-space-100)]">
        <Button
          appearance={mode === "login" ? "default" : "subtle"}
          onClick={() => setMode("login")}
        >
          {t("auth.login.title")}
        </Button>
        <Button
          appearance={mode === "signup" ? "default" : "subtle"}
          onClick={() => setMode("signup")}
        >
          {t("auth.signup.title")}
        </Button>
      </div>

      {mode === "login" ? (
        <LoginForm onDone={() => void navigate("/dashboard")} />
      ) : (
        <SignupForm onDone={() => void navigate("/dashboard")} />
      )}
    </AuthLayout>
  );
}
