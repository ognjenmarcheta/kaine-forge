import { ORGANIZATION_ROLES } from "@repo/auth/permissions";

export const ORGANIZATIONS_DEFINITION = {
  // Under queryKeys.organizations(), so an organization change reloads them too.
  invitationsScope: ["organizations", "invitations"],
  customRolesScope: ["organizations", "roles"],
  // The built-in roles an invite or a role change may give; ownership moves by
  // transfer. The Active Organization's Custom Roles follow them.
  assignableRoles: [ORGANIZATION_ROLES.ADMIN, ORGANIZATION_ROLES.MEMBER]
} as const;
