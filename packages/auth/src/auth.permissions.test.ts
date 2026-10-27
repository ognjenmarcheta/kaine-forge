import { describe, expect, it } from "vitest";

import {
  CUSTOM_ROLE_PERMISSIONS,
  findUngrantablePermissions,
  resolveRolePermissions
} from "./auth.permissions";

describe("built-in role permissions", () => {
  // Pins what owner, admin, and member could do before named permissions:
  // owners everything, admins everything but deleting or transferring the
  // Organization and editing Custom Roles, members only the shared content.
  it.each([
    [
      "owner",
      [
        "organization:update",
        "organization:delete",
        "organization:transfer",
        "member:create",
        "member:update",
        "member:delete",
        "invitation:create",
        "invitation:cancel",
        "invitation:read",
        "team:create",
        "team:update",
        "team:delete",
        "ac:create",
        "ac:read",
        "ac:update",
        "ac:delete",
        "todo:create",
        "todo:update",
        "todo:delete",
        "note:create",
        "note:update",
        "note:delete",
        "attachment:create",
        "attachment:delete",
        "logo:update",
        "audit:read"
      ]
    ],
    [
      "admin",
      [
        "organization:update",
        "member:create",
        "member:update",
        "member:delete",
        "invitation:create",
        "invitation:cancel",
        "invitation:read",
        "team:create",
        "team:update",
        "team:delete",
        "ac:read",
        "todo:create",
        "todo:update",
        "todo:delete",
        "note:create",
        "note:update",
        "note:delete",
        "attachment:create",
        "attachment:delete",
        "logo:update",
        "audit:read"
      ]
    ],
    [
      "member",
      [
        "ac:read",
        "todo:create",
        "todo:update",
        "todo:delete",
        "note:create",
        "note:update",
        "note:delete",
        "attachment:create",
        "attachment:delete"
      ]
    ]
  ])("%s grants exactly its permissions", (role, permissions) => {
    expect(resolveRolePermissions(role, [])).toEqual(permissions);
  });
});

describe("resolveRolePermissions", () => {
  const editor = {
    role: "editor",
    permission: JSON.stringify({ note: ["create", "update"], logo: ["update"] })
  };

  it("grants a Custom Role exactly its stored permissions", () => {
    expect(resolveRolePermissions("editor", [editor])).toEqual([
      "note:create",
      "note:update",
      "logo:update"
    ]);
  });

  it("never grants an owner-only or unknown permission from a stored Custom Role", () => {
    const tampered = {
      role: "editor",
      permission: JSON.stringify({
        organization: ["delete", "transfer", "update"],
        ac: ["create"],
        todo: ["purge"],
        billing: ["read"]
      })
    };

    expect(resolveRolePermissions("editor", [tampered])).toEqual(["organization:update"]);
  });

  it("grants nothing for an unknown role or an unreadable Custom Role", () => {
    expect(resolveRolePermissions("ghost", [editor])).toEqual([]);
    expect(resolveRolePermissions("editor", [{ role: "editor", permission: "not json" }])).toEqual(
      []
    );
  });

  it("joins the permissions of every role in a comma-separated member role", () => {
    expect(resolveRolePermissions("member, editor", [editor])).toContain("logo:update");
  });
});

describe("findUngrantablePermissions", () => {
  it("names each permission a Custom Role may not grant", () => {
    expect(
      findUngrantablePermissions({
        note: ["create"],
        organization: ["delete", "transfer"],
        ac: ["update"],
        team: ["create"],
        todo: ["purge"],
        billing: ["read"],
        logo: "update"
      })
    ).toEqual([
      "organization:delete",
      "organization:transfer",
      "ac:update",
      "team:create",
      "todo:purge",
      "billing:read",
      "logo"
    ]);
  });

  it("accepts every permission the Custom Role editor offers", () => {
    const statements: Record<string, string[]> = {};
    for (const permission of CUSTOM_ROLE_PERMISSIONS) {
      const [resource = "", action = ""] = permission.split(":");
      statements[resource] = [...(statements[resource] ?? []), action];
    }

    expect(findUngrantablePermissions(statements)).toEqual([]);
  });
});
