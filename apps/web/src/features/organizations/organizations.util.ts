export interface OrganizationOption {
  id: string;
  name: string;
}

interface ResolveOrganizationSelectionInput {
  organizations: OrganizationOption[];
  rememberedOrganizationId: string | null;
}

export function resolveOrganizationSelection(
  input: ResolveOrganizationSelectionInput
): OrganizationOption | null {
  if (input.organizations.length === 0) {
    return null;
  }

  if (input.rememberedOrganizationId) {
    const remembered = input.organizations.find(
      (organization) => organization.id === input.rememberedOrganizationId
    );

    if (remembered) {
      return remembered;
    }
  }

  return input.organizations[0] ?? null;
}
