import { createAccessControl } from "better-auth/plugins/access";
import { defaultStatements } from "better-auth/plugins/organization/access";

export const ORGANIZATION_ROLES = {
  OWNER: "owner",
  ADMIN: "admin",
  MEMBER: "member"
} as const;

export type OrganizationRole = (typeof ORGANIZATION_ROLES)[keyof typeof ORGANIZATION_ROLES];

/**
 * Every Permission, as resource → actions: the organization plugin's own
 * statements plus the template's features. `organization:transfer` guards the
 * template's transfer-ownership route, `organization:export` the Organization
 * data export. Every member reads the Organization's
 * shared content; the template resources govern changing it.
 */
export const PERMISSION_STATEMENTS = {
  ...defaultStatements,
  organization: [...defaultStatements.organization, "transfer", "export"],
  invitation: [...defaultStatements.invitation, "read"],
  todo: ["create", "update", "delete"],
  note: ["create", "update", "delete"],
  attachment: ["create", "delete"],
  logo: ["update"],
  audit: ["read"]
} as const;

type PermissionStatements = typeof PERMISSION_STATEMENTS;

/** A named check such as `member:create` or `todo:delete`. */
export type Permission = {
  [
    TResource in keyof PermissionStatements
  ]: `${TResource}:${PermissionStatements[TResource][number]}`;
}[keyof PermissionStatements];

/** The catalog the organization plugin checks its own routes against. */
export const accessControl = createAccessControl(PERMISSION_STATEMENTS);

const CONTENT_STATEMENTS = {
  todo: ["create", "update", "delete"],
  note: ["create", "update", "delete"],
  attachment: ["create", "delete"]
} as const;

/** The built-in roles, for the organization plugin's `roles` option. */
export const BUILT_IN_ROLES = {
  owner: accessControl.newRole({
    organization: ["update", "delete", "transfer", "export"],
    member: ["create", "update", "delete"],
    invitation: ["create", "cancel", "read"],
    team: ["create", "update", "delete"],
    ac: ["create", "read", "update", "delete"],
    ...CONTENT_STATEMENTS,
    logo: ["update"],
    audit: ["read"]
  }),
  admin: accessControl.newRole({
    organization: ["update"],
    member: ["create", "update", "delete"],
    invitation: ["create", "cancel", "read"],
    team: ["create", "update", "delete"],
    ac: ["read"],
    ...CONTENT_STATEMENTS,
    logo: ["update"],
    audit: ["read"]
  }),
  member: accessControl.newRole({
    ac: ["read"],
    ...CONTENT_STATEMENTS
  })
} satisfies Record<OrganizationRole, unknown>;

const PERMISSION_SET: ReadonlySet<string> = new Set(
  Object.entries(PERMISSION_STATEMENTS).flatMap(([resource, actions]) =>
    actions.map((action) => `${resource}:${action}`)
  )
);

export function isPermission(value: string): value is Permission {
  return PERMISSION_SET.has(value);
}

/** Every Permission, in catalog order. */
export const PERMISSIONS: readonly Permission[] = [...PERMISSION_SET].filter(isPermission);

/** Ownership-level Permissions: only the owner role holds them. */
export const OWNER_ONLY_PERMISSIONS = [
  "organization:delete",
  "organization:transfer",
  "organization:export",
  "ac:create",
  "ac:update",
  "ac:delete"
] as const satisfies readonly Permission[];

export type OwnerOnlyPermission = (typeof OWNER_ONLY_PERMISSIONS)[number];

const OWNER_ONLY_SET: ReadonlySet<string> = new Set(OWNER_ONLY_PERMISSIONS);

/**
 * What a Custom Role may grant: every Permission except the owner-only ones
 * and teams, which the template leaves off.
 */
export const CUSTOM_ROLE_PERMISSIONS: readonly Permission[] = PERMISSIONS.filter(
  (permission) => !OWNER_ONLY_SET.has(permission) && !permission.startsWith("team:")
);

const CUSTOM_ROLE_PERMISSION_SET: ReadonlySet<string> = new Set(CUSTOM_ROLE_PERMISSIONS);

/** Lowercase letters, digits, and hyphens; better-auth lowercases names, and commas join roles. */
export const CUSTOM_ROLE_NAME_PATTERN = /^[a-z][a-z0-9-]{1,31}$/;

export function isBuiltInRole(value: string): value is OrganizationRole {
  return Object.hasOwn(BUILT_IN_ROLES, value);
}

/** A member row may hold several roles, comma-separated. */
export function parseRoleNames(role: string): string[] {
  return role
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean);
}

function statementPermissions(statements: Readonly<Record<string, unknown>>): string[] {
  return Object.entries(statements).flatMap(([resource, actions]) =>
    Array.isArray(actions) ? actions.map((action) => `${resource}:${String(action)}`) : [resource]
  );
}

/**
 * The entries of a Custom Role's resource → actions map that it may not
 * grant, as `resource:action` (or the bare resource when its actions are not
 * a list). Empty when every entry is in CUSTOM_ROLE_PERMISSIONS.
 */
export function findUngrantablePermissions(
  statements: Readonly<Record<string, unknown>>
): string[] {
  return statementPermissions(statements).filter(
    (permission) => !CUSTOM_ROLE_PERMISSION_SET.has(permission)
  );
}

/** The catalog Permissions in a resource → actions map, in catalog order. */
export function permissionsOfStatements(
  statements: Readonly<Record<string, unknown>>
): Permission[] {
  const granted = new Set(statementPermissions(statements));
  return PERMISSIONS.filter((permission) => granted.has(permission));
}

/** The resource → actions map better-auth stores for a set of Permissions. */
export function statementsOfPermissions(
  permissions: readonly Permission[]
): Record<string, string[]> {
  const statements: Record<string, string[]> = {};

  for (const permission of permissions) {
    const [resource = "", action = ""] = permission.split(":");
    statements[resource] = [...(statements[resource] ?? []), action];
  }

  return statements;
}

/** A stored Custom Role: better-auth keeps its resource → actions map as JSON text. */
export interface CustomRoleDefinition {
  permission: string;
  role: string;
}

function customRolePermissions(definition: CustomRoleDefinition): string[] {
  let statements: unknown;
  try {
    statements = JSON.parse(definition.permission);
  } catch {
    return [];
  }

  if (typeof statements !== "object" || statements === null || Array.isArray(statements)) {
    return [];
  }

  // A stored row is filtered again, so it never grants an owner-only Permission.
  return statementPermissions({ ...statements }).filter((permission) =>
    CUSTOM_ROLE_PERMISSION_SET.has(permission)
  );
}

/**
 * The Permissions a member's role grants, in catalog order. `customRoles` are
 * the Custom Roles of the member's Organization; an unknown role name grants
 * nothing.
 */
export function resolveRolePermissions(
  role: string,
  customRoles: readonly CustomRoleDefinition[]
): Permission[] {
  const granted = new Set(
    parseRoleNames(role).flatMap((name) => {
      if (isBuiltInRole(name)) {
        return statementPermissions(BUILT_IN_ROLES[name].statements);
      }

      const definition = customRoles.find((customRole) => customRole.role === name);
      return definition ? customRolePermissions(definition) : [];
    })
  );

  return PERMISSIONS.filter((permission) => granted.has(permission));
}

/**
 * Whether a member's role holds an owner-only Permission. Custom Roles never
 * grant one, so the built-in roles decide without loading them.
 */
export function roleHoldsOwnerOnlyPermission(
  role: string,
  permission: OwnerOnlyPermission
): boolean {
  return resolveRolePermissions(role, []).includes(permission);
}
