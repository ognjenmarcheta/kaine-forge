import { useContext } from "react";

import { OrganizationContext } from "../providers/organization.provider";

export function useOrganization() {
  const value = useContext(OrganizationContext);

  if (!value) {
    throw new Error("useOrganization must be used within OrganizationProvider");
  }

  return value;
}
