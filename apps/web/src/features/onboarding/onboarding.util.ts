import type { AuthSession } from "../auth/auth.type";

export type OnboardingStep = "organization" | "invite";

/** True while the signed-in user has not finished or skipped onboarding. */
export function needsOnboarding(session: AuthSession | null): boolean {
  return session?.user.onboardingCompleted === false;
}

/**
 * The steps that apply to the Active Organization. Naming applies to the
 * user's Personal Organization only; a user who joined through an Invitation
 * already has an Organization, and invites only with the `invitation:create`
 * Permission.
 */
export function resolveOnboardingSteps(input: {
  personal: boolean;
  canInvite: boolean;
}): OnboardingStep[] {
  if (input.personal) {
    return ["organization", "invite"];
  }

  return input.canInvite ? ["invite"] : [];
}
