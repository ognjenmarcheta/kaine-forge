export interface OrganizationOption {
  id: string;
  name: string;
}

export interface OrganizationMember {
  email: string;
  id: string;
  name: string;
  role: string;
  userId: string;
}

export interface ResolveOrganizationSelectionInput {
  organizations: OrganizationOption[];
  rememberedOrganizationId: string | null;
}
