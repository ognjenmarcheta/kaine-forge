import { hasRoleAtLeast, ORGANIZATION_ROLES, type OrganizationRole } from "@repo/auth/permissions";

import type { AuthSession } from "../auth/auth.type";

export type OnboardingStep = "organization" | "invite";

/** True while the signed-in user has not finished or skipped onboarding. */
export function needsOnboarding(session: AuthSession | null): boolean {
  return session?.user.onboardingCompleted === false;
}

function isOrganizationRole(value: string): value is OrganizationRole {
  return Object.values(ORGANIZATION_ROLES).some((role) => role === value);
}

/**
 * The steps that apply to the Active Organization. Naming applies to the
 * user's Personal Organization only; a user who joined through an Invitation
 * already has an Organization, and invites only when they may manage members.
 */
export function resolveOnboardingSteps(input: {
  personal: boolean;
  role: string | null;
}): OnboardingStep[] {
  if (input.personal) {
    return ["organization", "invite"];
  }

  const role = input.role !== null && isOrganizationRole(input.role) ? input.role : null;

  return role !== null && hasRoleAtLeast(role, ORGANIZATION_ROLES.ADMIN) ? ["invite"] : [];
}
