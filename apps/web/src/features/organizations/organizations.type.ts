export interface OrganizationOption {
  id: string;
  name: string;
}

export interface ResolveOrganizationSelectionInput {
  organizations: OrganizationOption[];
  rememberedOrganizationId: string | null;
}
