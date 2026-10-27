export interface OrganizationOption {
  id: string;
  name: string;
  // A Personal Organization cannot be deleted or left.
  personal?: boolean;
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
