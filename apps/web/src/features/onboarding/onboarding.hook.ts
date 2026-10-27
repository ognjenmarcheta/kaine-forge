import { resolveOnboardingSteps, type OnboardingStep } from "./onboarding.util";
import { useOrganization } from "../../hooks/use-organization";
import { useOrganizationPermissions } from "../organizations/organizations.hook";

/**
 * The onboarding steps for the Active Organization, or null while the
 * Organization or the user's Permissions in it are still loading.
 */
export function useOnboardingSteps(): OnboardingStep[] | null {
  const { activeOrganizationId, isLoading, organizations, organizationsVisible } =
    useOrganization();
  const activeOrganization = organizations.find(
    (organization) => organization.id === activeOrganizationId
  );
  const personal = activeOrganization?.personal === true;
  // A Personal Organization belongs to its user, so only a joined one needs the Permissions.
  const permissions = useOrganizationPermissions(
    organizationsVisible && activeOrganization !== undefined && !personal
      ? activeOrganizationId
      : null
  );

  // Without the Organization UI there is nothing to name or invite into.
  if (!organizationsVisible) {
    return [];
  }

  if (isLoading || !activeOrganization) {
    return null;
  }

  if (!personal && permissions === null) {
    return null;
  }

  return resolveOnboardingSteps({
    personal,
    canInvite: permissions?.has("invitation:create") === true
  });
}
