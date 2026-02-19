import { useContext } from "react";

import { OrganizationContext } from "../providers/organization.provider";

export function useOrganization() {
  const context = useContext(OrganizationContext);

  if (!context) {
    throw new Error("useOrganization must be used inside OrganizationProvider");
  }

  return context;
}
