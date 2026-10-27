import type { BetterAuthOptions, BetterAuthPlugin } from "better-auth";
import { createAuthMiddleware, getSessionFromCtx, isAPIError } from "better-auth/api";

import {
  hasAuditEvent,
  logAuditFailure,
  recordAuditEvent,
  type AuditEventInput
} from "./auth.audit";

// Routes whose success writes an Audit Event. The organization plugin's
// organizationHooks name the target user but not the acting one, and leave
// has no hook, so every event is read here from the session and the response.
const AUDITED_PATHS = new Set([
  "/change-password",
  "/organization/accept-invitation",
  "/organization/cancel-invitation",
  "/organization/delete",
  "/organization/invite-member",
  "/organization/leave",
  "/organization/remove-member",
  "/organization/transfer-ownership",
  "/organization/update",
  "/organization/update-member-role"
]);

type HookContext = Parameters<Parameters<typeof createAuthMiddleware>[0]>[0];
type UserUpdateHook = NonNullable<
  NonNullable<NonNullable<BetterAuthOptions["databaseHooks"]>["user"]>["update"]
>["after"];
// The endpoint context better-auth passes to a user update hook.
type UserUpdateContext = NonNullable<Parameters<NonNullable<UserUpdateHook>>[1]>;

// Values read before a write, so the event is skipped when nothing changed.
// Each map is keyed by the one request's context object that both of its
// hooks receive, and empties itself when the request ends.
const previousOrganizationNames = new WeakMap<HookContext["context"], string>();
const previousTwoFactorEnabled = new WeakMap<UserUpdateContext, boolean>();

function readRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? { ...value } : {};
}

function readString(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === "string" ? value : null;
}

async function emailOfUser(ctx: HookContext, userId: string | null): Promise<string | null> {
  if (!userId) {
    return null;
  }

  return (await ctx.context.internalAdapter.findUserById(userId))?.email ?? null;
}

// A member row the response returned: remove-member wraps it in { member }.
async function memberEvent(
  ctx: HookContext,
  member: Record<string, unknown>,
  actorUserId: string,
  action: "member_removed" | "member_role_changed"
): Promise<AuditEventInput | null> {
  const id = readString(member, "id");
  const organizationId = readString(member, "organizationId");
  const role = readString(member, "role");

  if (!id || !organizationId || !role) {
    return null;
  }

  const email = await emailOfUser(ctx, readString(member, "userId"));
  return { action, actorUserId, metadata: { email, role }, organizationId, targetId: id };
}

async function auditEventFor(ctx: HookContext): Promise<AuditEventInput | null> {
  const returned = readRecord(ctx.context.returned);

  if (ctx.path === "/change-password") {
    // With revokeOtherSessions the request's session is gone; the response names the user.
    const userId = readString(readRecord(returned.user), "id");
    return userId
      ? {
          action: "password_changed",
          actorUserId: userId,
          metadata: {},
          organizationId: null,
          targetId: userId
        }
      : null;
  }

  const session = await getSessionFromCtx(ctx);

  if (!session) {
    return null;
  }

  const actorUserId = session.user.id;

  switch (ctx.path) {
    case "/organization/invite-member":
    case "/organization/cancel-invitation": {
      const id = readString(returned, "id");
      const organizationId = readString(returned, "organizationId");
      const email = readString(returned, "email");
      const role = readString(returned, "role");

      if (!id || !organizationId || !email || !role) {
        return null;
      }

      // A resend extends the same Invitation; its invite is already recorded.
      if (
        ctx.path === "/organization/invite-member" &&
        readRecord(ctx.body).resend === true &&
        (await hasAuditEvent("member_invited", id))
      ) {
        return null;
      }

      return ctx.path === "/organization/invite-member"
        ? {
            action: "member_invited",
            actorUserId,
            metadata: { email, role },
            organizationId,
            targetId: id
          }
        : {
            action: "invitation_revoked",
            actorUserId,
            metadata: { email },
            organizationId,
            targetId: id
          };
    }
    case "/organization/accept-invitation": {
      const member = readRecord(returned.member);
      const id = readString(member, "id");
      const organizationId = readString(member, "organizationId");
      const role = readString(member, "role");

      return id && organizationId && role
        ? {
            action: "member_joined",
            actorUserId,
            metadata: { email: session.user.email, role },
            organizationId,
            targetId: id
          }
        : null;
    }
    case "/organization/remove-member":
      return memberEvent(ctx, readRecord(returned.member), actorUserId, "member_removed");
    case "/organization/update-member-role":
      return memberEvent(ctx, returned, actorUserId, "member_role_changed");
    case "/organization/leave": {
      const id = readString(returned, "id");
      const organizationId = readString(returned, "organizationId");
      const role = readString(returned, "role");

      return id && organizationId && role
        ? { action: "member_left", actorUserId, metadata: { role }, organizationId, targetId: id }
        : null;
    }
    case "/organization/update": {
      const id = readString(returned, "id");
      const name = readString(returned, "name");
      const renamed =
        typeof readRecord(readRecord(ctx.body).data).name === "string" &&
        name !== previousOrganizationNames.get(ctx.context);

      return renamed && id && name
        ? {
            action: "organization_renamed",
            actorUserId,
            metadata: { name },
            organizationId: id,
            targetId: id
          }
        : null;
    }
    case "/organization/delete": {
      const id = readString(returned, "id");
      const name = readString(returned, "name");

      return id && name
        ? {
            action: "organization_deleted",
            actorUserId,
            metadata: { name },
            organizationId: id,
            targetId: id
          }
        : null;
    }
    case "/organization/transfer-ownership": {
      // The route acts on the session's Active Organization only.
      const organizationId = readString(readRecord(session.session), "activeOrganizationId");
      const memberId = readString(readRecord(ctx.body), "memberId");

      if (!organizationId || !memberId) {
        return null;
      }

      const member = await ctx.context.adapter.findOne<{ userId: string }>({
        model: "member",
        where: [{ field: "id", value: memberId }]
      });

      return {
        action: "ownership_transferred",
        actorUserId,
        metadata: { email: await emailOfUser(ctx, member?.userId ?? null) },
        organizationId,
        targetId: memberId
      };
    }
    default:
      return null;
  }
}

/**
 * Records Audit Events for successful auth actions: organization membership
 * and settings through an after hook, two-factor changes through the user
 * update database hook. `/two-factor/verify-totp` also completes a 2FA
 * sign-in, so the route alone cannot tell "turned on" from "signed in"; the
 * twoFactorEnabled write can.
 */
export const auditPlugin = {
  id: "audit",
  hooks: {
    before: [
      {
        matcher: (ctx) => ctx.path === "/organization/update",
        handler: createAuthMiddleware(async (ctx) => {
          try {
            const session = await getSessionFromCtx(ctx);
            const organizationId = readString(readRecord(session?.session), "activeOrganizationId");
            const organization = organizationId
              ? await ctx.context.adapter.findOne<{ name: string }>({
                  model: "organization",
                  where: [{ field: "id", value: organizationId }]
                })
              : null;

            if (organization) {
              previousOrganizationNames.set(ctx.context, organization.name);
            }
          } catch (error) {
            logAuditFailure({ path: ctx.path }, error);
          }
        })
      }
    ],
    after: [
      {
        matcher: (ctx) => AUDITED_PATHS.has(ctx.path ?? ""),
        handler: createAuthMiddleware(async (ctx) => {
          if (isAPIError(ctx.context.returned)) {
            return;
          }

          // better-auth re-throws an after hook's error, which would fail an
          // action that already succeeded.
          try {
            const event = await auditEventFor(ctx);

            if (event) {
              await recordAuditEvent(event);
            }
          } catch (error) {
            logAuditFailure({ path: ctx.path }, error);
          }
        })
      }
    ]
  },
  init: () => ({
    options: {
      databaseHooks: {
        user: {
          update: {
            before: async (_data, context) => {
              const userId = context?.context.session?.user.id;

              if (!context?.path?.startsWith("/two-factor/") || !userId) {
                return;
              }

              try {
                const current = await context.context.internalAdapter.findUserById(userId);
                // twoFactorEnabled is a two-factor plugin field the core user type does not declare.
                previousTwoFactorEnabled.set(
                  context,
                  readRecord(current).twoFactorEnabled === true
                );
              } catch (error) {
                logAuditFailure({ path: context.path }, error);
              }
            },
            after: async (user, context) => {
              // Every two-factor route that writes the user sets twoFactorEnabled;
              // only a change is recorded.
              if (
                !context?.path?.startsWith("/two-factor/") ||
                previousTwoFactorEnabled.get(context) === (user.twoFactorEnabled === true)
              ) {
                return;
              }

              await recordAuditEvent({
                action:
                  user.twoFactorEnabled === true ? "two_factor_enabled" : "two_factor_disabled",
                actorUserId: user.id,
                metadata: {},
                organizationId: null,
                targetId: user.id
              });
            }
          }
        }
      }
    }
  })
} satisfies BetterAuthPlugin;
