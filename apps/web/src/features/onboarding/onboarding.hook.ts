import { createActiveOrganizationQueryKey, queryKeys } from "@repo/query";
import { useQuery } from "@tanstack/react-query";

import { resolveOnboardingSteps, type OnboardingStep } from "./onboarding.util";
import { useOrganization } from "../../hooks/use-organization";
import { listOrganizationMembersRequest } from "../../lib/auth-api";

/**
 * The onboarding steps for the Active Organization, or null while the
 * Organization or the user's role in it is still loading.
 */
export function useOnboardingSteps(userId: string): OnboardingStep[] | null {
  const { activeOrganizationId, isLoading, organizations, organizationsVisible } =
    useOrganization();
  const activeOrganization = organizations.find(
    (organization) => organization.id === activeOrganizationId
  );
  const personal = activeOrganization?.personal === true;
  // A Personal Organization belongs to its user, so only a joined one needs the role.
  const membersQuery = useQuery({
    queryKey: createActiveOrganizationQueryKey(
      queryKeys.organizationMembersScope(),
      activeOrganizationId
    ),
    queryFn: listOrganizationMembersRequest,
    enabled: organizationsVisible && activeOrganization !== undefined && !personal
  });

  // Without the Organization UI there is nothing to name or invite into.
  if (!organizationsVisible) {
    return [];
  }

  if (isLoading || !activeOrganization) {
    return null;
  }

  if (!personal && membersQuery.status !== "success") {
    return null;
  }

  const role = membersQuery.data?.members.find((member) => member.userId === userId)?.role ?? null;

  return resolveOnboardingSteps({ personal, role });
}
