import type { AssignableOrganizationRole } from "@repo/auth/auth.type";

export const ORGANIZATIONS_DEFINITION = {
  // Under queryKeys.organizations(), so an organization change reloads it too.
  invitationsScope: ["organizations", "invitations"],
  // The roles an invite or a role change may give; ownership moves by transfer.
  assignableRoles: ["admin", "member"]
} as const satisfies {
  invitationsScope: readonly string[];
  assignableRoles: readonly AssignableOrganizationRole[];
};

export function isAssignableRole(value: string): value is AssignableOrganizationRole {
  return ORGANIZATIONS_DEFINITION.assignableRoles.some((role) => role === value);
}
