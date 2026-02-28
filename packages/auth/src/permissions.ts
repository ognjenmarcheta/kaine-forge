export const ORGANIZATION_ROLES = {
  OWNER: "owner",
  ADMIN: "admin",
  MEMBER: "member"
} as const;

export type OrganizationRole = (typeof ORGANIZATION_ROLES)[keyof typeof ORGANIZATION_ROLES];

export const ORGANIZATION_ROLE_HIERARCHY: readonly OrganizationRole[] = [
  ORGANIZATION_ROLES.OWNER,
  ORGANIZATION_ROLES.ADMIN,
  ORGANIZATION_ROLES.MEMBER
] as const;

export function hasRoleAtLeast(
  userRole: OrganizationRole,
  requiredRole: OrganizationRole
): boolean {
  const userIndex = ORGANIZATION_ROLE_HIERARCHY.indexOf(userRole);
  const requiredIndex = ORGANIZATION_ROLE_HIERARCHY.indexOf(requiredRole);

  if (userIndex === -1 || requiredIndex === -1) {
    return false;
  }

  return userIndex <= requiredIndex;
}
