import { isBuiltInRole } from "@repo/auth/permissions";

import { ORGANIZATIONS_DEFINITION } from "./organizations.definition";

/** A built-in role's translated name; a Custom Role shows the name its owner gave it. */
export function roleLabel(role: string, t: (key: string) => string): string {
  return isBuiltInRole(role) ? t(`organizations.role.${role}`) : role;
}

/** The roles an invite or a role change may give: admin, member, then each Custom Role. */
export function assignableRoleOptions(
  customRoleNames: readonly string[],
  t: (key: string) => string
): { label: string; value: string }[] {
  return [...ORGANIZATIONS_DEFINITION.assignableRoles, ...customRoleNames].map((value) => ({
    label: roleLabel(value, t),
    value
  }));
}
