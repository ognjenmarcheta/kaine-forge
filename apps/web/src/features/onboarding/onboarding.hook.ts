import { resolveOnboardingSteps, type OnboardingStep } from "./onboarding.util";
import { useOrganization } from "../../hooks/use-organization";
import { useOrganizationPermissionsState } from "../organizations/organizations.hook";

/** The onboarding steps for the Active Organization, once they are known. */
export type OnboardingStepsState =
  | { status: "pending" }
  | { status: "error"; retry: () => void }
  | { status: "ready"; steps: OnboardingStep[] };

/**
 * The onboarding steps for the Active Organization. They stay pending while
 * the Organization or the user's Permissions in it load, and a failed
 * Permissions read is an error to retry, never an empty step list.
 */
export function useOnboardingSteps(): OnboardingStepsState {
  const { activeOrganizationId, isLoading, organizations, organizationsVisible } =
    useOrganization();
  const activeOrganization = organizations.find(
    (organization) => organization.id === activeOrganizationId
  );
  const personal = activeOrganization?.personal === true;
  // A Personal Organization belongs to its user, so only a joined one needs the Permissions.
  const permissions = useOrganizationPermissionsState(
    organizationsVisible && activeOrganization !== undefined && !personal
      ? activeOrganizationId
      : null
  );

  // Without the Organization UI there is nothing to name or invite into.
  if (!organizationsVisible) {
    return { status: "ready", steps: [] };
  }

  if (isLoading || !activeOrganization) {
    return { status: "pending" };
  }

  if (personal) {
    return { status: "ready", steps: resolveOnboardingSteps({ personal, canInvite: true }) };
  }

  if (permissions.status !== "success") {
    return permissions;
  }

  return {
    status: "ready",
    steps: resolveOnboardingSteps({
      personal,
      canInvite: permissions.permissions.has("invitation:create")
    })
  };
}
