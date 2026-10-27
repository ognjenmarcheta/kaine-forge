import { getAuthErrorMessageKey } from "@repo/auth/transport";
import { AuthLayout, Button, FieldError } from "@repo/ui";
import { useMutation } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";

import { OnboardingInviteStep } from "./components/onboarding-invite-step";
import { OnboardingOrganizationStep } from "./components/onboarding-organization-step";
import { useOnboardingSteps } from "./onboarding.hook";
import { needsOnboarding, type OnboardingStep } from "./onboarding.util";
import { useAuth } from "../../hooks/use-auth";
import { useOrganization } from "../../hooks/use-organization";
import { useTranslation } from "../../hooks/use-translation";
import { onboardingApi } from "../../lib/auth-api";
import { AUTH_DEFINITION } from "../auth/auth.definition";

const STEP_COPY_KEYS = {
  organization: {
    subtitle: "auth.onboarding.organization.subtitle",
    title: "auth.onboarding.organization.title"
  },
  invite: { subtitle: "auth.onboarding.invite.subtitle", title: "auth.onboarding.invite.title" }
} as const satisfies Record<OnboardingStep, { subtitle: string; title: string }>;

/**
 * The first-run flow after sign-up: name the Organization, then invite
 * teammates. It shows until the user finishes or skips it, once per user.
 */
export function OnboardingRoute() {
  const { t } = useTranslation();
  const { isLoading, session } = useAuth();

  if (isLoading) {
    return <AuthLayout subtitle={t("common.loadingSession")} title={t("common.loading")} />;
  }

  if (!session) {
    const search = new URLSearchParams({ [AUTH_DEFINITION.returnPathParam]: "/onboarding" });
    return <Navigate replace to={`/auth?${search.toString()}`} />;
  }

  if (!needsOnboarding(session)) {
    return <Navigate replace to={AUTH_DEFINITION.defaultReturnPath} />;
  }

  return <OnboardingFlow />;
}

function OnboardingFlow() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { refreshSession } = useAuth();
  const { activeOrganizationId, organizations } = useOrganization();
  const resolved = useOnboardingSteps();
  // Kept from the first answer: a new Organization from the first step
  // changes the Active Organization, and with it the steps that apply.
  const [steps, setSteps] = useState<OnboardingStep[] | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const complete = useMutation({
    mutationFn: () => onboardingApi.complete(),
    onSuccess: async () => {
      await refreshSession();
      void navigate(AUTH_DEFINITION.defaultReturnPath, { replace: true });
    }
  });
  const { isIdle, mutate: completeOnboarding } = complete;
  const nothingToOffer = steps?.length === 0;

  if (steps === null && resolved.status === "ready") {
    setSteps(resolved.steps);
  }

  useEffect(() => {
    if (nothingToOffer && isIdle) {
      completeOnboarding();
    }
  }, [completeOnboarding, isIdle, nothingToOffer]);

  const step = steps?.[stepIndex];
  const activeOrganization = organizations.find(
    (organization) => organization.id === activeOrganizationId
  );

  return (
    <AuthLayout
      subtitle={t(step ? STEP_COPY_KEYS[step].subtitle : "auth.onboarding.loading")}
      title={t(step ? STEP_COPY_KEYS[step].title : "auth.onboarding.title")}
    >
      {step === "organization" ? (
        <OnboardingOrganizationStep
          initialName={activeOrganization?.name ?? ""}
          onDone={() => setStepIndex((index) => index + 1)}
        />
      ) : null}
      {step === "invite" ? <OnboardingInviteStep /> : null}
      {steps === null && resolved.status === "error" ? (
        <div className="grid gap-[var(--ds-space-100)]">
          <FieldError>{t("auth.onboarding.loadError")}</FieldError>
          <div>
            <Button appearance="subtle" type="button" onClick={resolved.retry}>
              {t("common.retry")}
            </Button>
          </div>
        </div>
      ) : null}
      {complete.error ? (
        <FieldError className="mt-[var(--ds-space-150)]">
          {t(getAuthErrorMessageKey(complete.error))}
        </FieldError>
      ) : null}
      <div className="mt-[var(--ds-space-200)] flex justify-end gap-[var(--ds-space-100)]">
        <Button
          appearance="subtle"
          disabled={complete.isPending}
          type="button"
          onClick={() => completeOnboarding()}
        >
          {t("auth.onboarding.skip")}
        </Button>
        {step === "invite" ? (
          <Button disabled={complete.isPending} type="button" onClick={() => completeOnboarding()}>
            {t("auth.onboarding.finish")}
          </Button>
        ) : null}
      </div>
    </AuthLayout>
  );
}
