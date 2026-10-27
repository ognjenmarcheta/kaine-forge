import { expo } from "@better-auth/expo";
import { passkey } from "@better-auth/passkey";
// The passkey plugin's inferred types name this package; importing it here
// lets declaration emit refer to it by name (TS2742).
import type {} from "@simplewebauthn/server";
import {
  accountsTable,
  db,
  invitationsTable,
  membersTable,
  organizationRolesTable,
  organizationsTable,
  passkeysTable,
  sessionsTable,
  twoFactorsTable,
  usersTable,
  verificationsTable
} from "@repo/db";
import { renderEmail, type EmailTemplate } from "@repo/email";
import { jobQueue } from "@repo/jobs/client";
import { createLogger } from "@repo/logger";
import { SUPPORTED_LANGUAGES } from "@repo/translation";
import type { BetterAuthPlugin, GenericEndpointContext, User } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import {
  APIError,
  createAuthEndpoint,
  createAuthMiddleware,
  getSessionFromCtx,
  isAPIError,
  sessionMiddleware
} from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
// The minimal entry leaves out Kysely; the drizzle adapter owns database
// access and drizzle-kit owns migrations (better-auth performance guide).
import { betterAuth } from "better-auth/minimal";
import {
  bearer,
  captcha,
  emailOTP,
  haveIBeenPwned,
  magicLink,
  organization,
  twoFactor
} from "better-auth/plugins";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { recordAuditEvent } from "./auth.audit";
import { auditPlugin } from "./auth.audit.plugin";
import {
  assertProductionAuthSecret,
  buildAccountDeletionUrl,
  buildInvitationUrl,
  getServerAuthConfig
} from "./auth.config";
import { AUTH_DEFINITIONS } from "./auth.definition";
import { AUTH_PASSWORD_MIN_LENGTH } from "./auth.form";
import { dispatchNotification, hasNotificationDispatcher } from "./auth.notification";
import { onboardingPlugin } from "./auth.onboarding.plugin";
import { hashPassword, verifyPassword } from "./auth.password";
import {
  accessControl,
  BUILT_IN_ROLES,
  CUSTOM_ROLE_NAME_PATTERN,
  findUngrantablePermissions,
  ORGANIZATION_ROLES,
  parseRoleNames
} from "./auth.permissions";
import {
  findAccountDeletionRefusal,
  prepareAccountDeletion,
  type AccountDeletionRefusal
} from "./auth.server.account";
import { customRoleHasPendingInvitations } from "./auth.server.invitation";
import {
  ensurePersonalOrganizationForUser,
  findMemberRole,
  getOrganizationMembershipProof,
  isPersonalOrganization,
  loadRolePermissions,
  ORGANIZATION_REFUSALS,
  resolveActiveOrganizationForUser,
  transferOrganizationOwnership,
  type OrganizationRefusal
} from "./auth.server.organization";

// Adapter model names are pluralized (usePlural), so the schema map is keyed
// by the plural model names better-auth resolves at runtime.
const AUTH_SCHEMA = {
  users: usersTable,
  sessions: sessionsTable,
  accounts: accountsTable,
  verifications: verificationsTable,
  organizations: organizationsTable,
  members: membersTable,
  invitations: invitationsTable,
  organizationRoles: organizationRolesTable,
  twoFactors: twoFactorsTable,
  passkeys: passkeysTable
} as const;

const emailLogger = createLogger({ name: "auth.email" });
const notificationLookupLogger = createLogger({ name: "auth.notifications" });

// Every auth email goes through the job runner, which retries a failed send
// (ADR 0018). Each hook starts the locale read, the render, and the enqueue
// on the same path and does not await them, so the response never varies on
// enqueue or delivery outcome, and response timing does not reveal whether an
// account exists (anti-enumeration, better-auth email OTP guidance).
function enqueueAuthEmail(
  to: string,
  email: EmailTemplate,
  locale: Promise<string | null> | string | null
): void {
  void (async () => {
    const content = await renderEmail(email, await locale);
    await jobQueue.enqueue("email.send", { to, ...content });
  })().catch(() => {
    // The queue logs its own enqueue failures by job name. Errors can carry
    // the payload (links, codes), so this names the template only.
    emailLogger.error({ template: email.template }, "auth email not queued");
  });
}

// better-auth passes the stored user row, with additional fields such as
// locale, but its hook types declare the core user fields only.
function readUserLocale(user: User): string | null {
  return "locale" in user && typeof user.locale === "string" ? user.locale : null;
}

// Hooks without a fresh user row (email one-time codes, invitations) read the
// stored locale. A failed read falls back to the default language, and the
// email still goes out.
async function findLocaleByEmail(email: string): Promise<string | null> {
  const [row] = await db
    .select({ locale: usersTable.locale })
    .from(usersTable)
    .where(eq(usersTable.email, email.toLowerCase()))
    .limit(1);

  return row?.locale ?? null;
}

// better-auth stores a magic-link token for any address and only checks for
// an account when the link is opened. Only an existing account gets the
// email; the request answers the same either way, and the lookup runs after
// the response like every other auth email.
function sendMagicLinkToAccount(email: string, url: string): void {
  void (async () => {
    const [account] = await db
      .select({ locale: usersTable.locale })
      .from(usersTable)
      .where(eq(usersTable.email, email.toLowerCase()))
      .limit(1);

    if (account) {
      enqueueAuthEmail(
        email,
        {
          template: "magicLink",
          url,
          expiresInMinutes: AUTH_DEFINITIONS.MAGIC_LINK_MAX_AGE_SECONDS / 60
        },
        account.locale
      );
    }
  })().catch(() => {
    emailLogger.error({ template: "magicLink" }, "auth email not queued");
  });
}

// Only a verified account proves it controls the invited address. Under soft
// verification (ADR 0007) anyone can sign up with an address they do not own.
async function findVerifiedUserIdByEmail(email: string): Promise<string | null> {
  const [row] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(and(eq(usersTable.email, email.toLowerCase()), eq(usersTable.emailVerified, true)))
    .limit(1);

  return row?.id ?? null;
}

// The invitation email always goes to the invited address: it delivers the
// Invitation itself, so no preference or notification failure can stop it.
// A verified account with that address also gets an "invitation received"
// Notification in-app. A resend is a new reminder, so it creates a new one.
function deliverInvitation(
  data: { email: string; id: string; organization: { id: string; name: string }; role: string },
  inviter: { email: string; name: string },
  email: EmailTemplate
): void {
  enqueueAuthEmail(
    data.email,
    email,
    findLocaleByEmail(inviter.email).catch(() => null)
  );

  if (!hasNotificationDispatcher()) {
    return;
  }

  void findVerifiedUserIdByEmail(data.email).then(
    (recipientUserId) => {
      if (recipientUserId) {
        dispatchNotification({
          type: "invitation_received",
          recipientUserId,
          organizationId: data.organization.id,
          payload: {
            invitationId: data.id,
            inviterName: inviter.name,
            organizationName: data.organization.name,
            role: data.role
          },
          email: null
        });
      }
    },
    () => {
      notificationLookupLogger.error("invitee not notified");
    }
  );
}

function buildMembersUrl(webAppUrl: string): string {
  return new URL("/members", webAppUrl).toString();
}

function notifyRoleChanged(
  webAppUrl: string,
  input: { organization: { id: string; name: string }; role: string; userId: string }
): void {
  const organizationName = input.organization.name;

  dispatchNotification({
    type: "role_changed",
    recipientUserId: input.userId,
    organizationId: input.organization.id,
    payload: { organizationName, role: input.role },
    email: {
      template: "roleChanged",
      organizationName,
      role: input.role,
      url: buildMembersUrl(webAppUrl)
    }
  });
}

// Routes that can change a user's email address. /verify-email changes it
// when the link from a change request is opened, with or without a session.
const EMAIL_CHANGE_PATHS = new Set(["/change-email", "/verify-email", "/email-otp/change-email"]);

const verificationTokenClaims = z.object({ email: z.string() });

// /verify-email verifies this signed token before it changes the address, and
// its `email` claim is the previous address.
function readVerificationTokenEmail(token: unknown): string | null {
  if (typeof token !== "string") {
    return null;
  }

  try {
    const payload: unknown = JSON.parse(
      Buffer.from(token.split(".")[1] ?? "", "base64url").toString("utf8")
    );
    return verificationTokenClaims.safeParse(payload).data?.email ?? null;
  } catch {
    return null;
  }
}

function buildSecurityUrl(webAppUrl: string): string {
  return new URL("/security", webAppUrl).toString();
}

const changePasswordResponse = z.object({
  user: z.object({ email: z.string(), locale: z.string().nullish() })
});

// better-auth checks only that a name is a string. Names reach other people's
// inboxes in invitation emails, so a long one could carry a paragraph of
// attacker text from our sender.
const userNameLimitPlugin = {
  id: "user-name-limit",
  hooks: {
    before: [
      {
        matcher: (ctx) => ctx.path === "/sign-up/email" || ctx.path === "/update-user",
        handler: createAuthMiddleware(async (ctx) => {
          const name = readRecord(ctx.body).name;

          if (typeof name === "string" && name.length > AUTH_DEFINITIONS.USER_NAME_MAX_LENGTH) {
            throw APIError.from("BAD_REQUEST", {
              code: "NAME_TOO_LONG",
              message: `Name must be at most ${String(AUTH_DEFINITIONS.USER_NAME_MAX_LENGTH)} characters`
            });
          }
        })
      }
    ]
  }
} satisfies BetterAuthPlugin;

// The organization plugin has no name limit of its own. /organization/update
// carries its fields under `data`.
const organizationNameLimitPlugin = {
  id: "organization-name-limit",
  hooks: {
    before: [
      {
        matcher: (ctx) =>
          ctx.path === "/organization/create" || ctx.path === "/organization/update",
        handler: createAuthMiddleware(async (ctx) => {
          const body = readRecord(ctx.body);
          const fields = ctx.path === "/organization/update" ? readRecord(body.data) : body;
          const name = fields.name;

          if (
            typeof name === "string" &&
            name.length > AUTH_DEFINITIONS.ORGANIZATION_NAME_MAX_LENGTH
          ) {
            throw APIError.from("BAD_REQUEST", {
              code: "ORGANIZATION_NAME_TOO_LONG",
              message: `Organization name must be at most ${String(AUTH_DEFINITIONS.ORGANIZATION_NAME_MAX_LENGTH)} characters`
            });
          }
        })
      }
    ]
  }
} satisfies BetterAuthPlugin;

// /change-password has no callback of its own; the alert reads the user from
// a successful response. Resets alert through onPasswordReset.
function createPasswordChangeAlertPlugin(webAppUrl: string) {
  return {
    id: "password-change-alert",
    hooks: {
      after: [
        {
          matcher: (ctx) => ctx.path === "/change-password",
          handler: createAuthMiddleware(async (ctx) => {
            const response = changePasswordResponse.safeParse(ctx.context.returned);

            if (response.success) {
              enqueueAuthEmail(
                response.data.user.email,
                { template: "passwordChanged", securityUrl: buildSecurityUrl(webAppUrl) },
                response.data.user.locale ?? null
              );
            }
          })
        }
      ]
    }
  } satisfies BetterAuthPlugin;
}

const PASSKEY_REGISTRATION_PATHS = new Set([
  "/passkey/generate-register-options",
  "/passkey/verify-registration"
]);

// Routes that store a passkey name: registration sends it in the query and
// the body, a rename in the body.
const PASSKEY_NAME_PATHS = new Set([...PASSKEY_REGISTRATION_PATHS, "/passkey/update-passkey"]);

const passkeyRegistrationResponse = z.object({ userId: z.string() });

// Under soft verification (ADR 0007) anyone can sign up with an address they
// do not own. A passkey added to such an account would let the squatter back
// in after the owner proves the address, so only a verified account adds
// one. The stored row decides: a cookie-cached session can predate the
// verification. A successful registration alerts the account's address.
function createPasskeyPolicyPlugin(webAppUrl: string) {
  return {
    id: "passkey-policy",
    hooks: {
      before: [
        {
          matcher: (ctx) => PASSKEY_NAME_PATHS.has(ctx.path ?? ""),
          handler: createAuthMiddleware(async (ctx) => {
            const names = [readRecord(ctx.query).name, readRecord(ctx.body).name];

            if (
              names.some(
                (name) =>
                  typeof name === "string" && name.length > AUTH_DEFINITIONS.PASSKEY_NAME_MAX_LENGTH
              )
            ) {
              throw APIError.from("BAD_REQUEST", {
                code: "PASSKEY_NAME_TOO_LONG",
                message: `Passkey name must be at most ${String(AUTH_DEFINITIONS.PASSKEY_NAME_MAX_LENGTH)} characters`
              });
            }

            if (!PASSKEY_REGISTRATION_PATHS.has(ctx.path)) {
              return;
            }

            const session = await getSessionFromCtx(ctx);

            if (!session) {
              // The route itself answers an unauthenticated request.
              return;
            }

            const user = await ctx.context.internalAdapter.findUserById(session.user.id);

            if (user?.emailVerified !== true) {
              throw APIError.from("FORBIDDEN", {
                code: "PASSKEY_REQUIRES_VERIFIED_EMAIL",
                message: "Verify your email address before you add a passkey"
              });
            }
          })
        }
      ],
      after: [
        {
          matcher: (ctx) => ctx.path === "/passkey/verify-registration",
          handler: createAuthMiddleware(async (ctx) => {
            const response = passkeyRegistrationResponse.safeParse(ctx.context.returned);

            if (!response.success) {
              return;
            }

            // better-auth re-throws an after hook's error, which would fail a
            // registration that already succeeded.
            try {
              const user = await ctx.context.internalAdapter.findUserById(response.data.userId);

              if (user) {
                enqueueAuthEmail(
                  user.email,
                  { template: "passkeyAdded", securityUrl: buildSecurityUrl(webAppUrl) },
                  readUserLocale(user)
                );
              }
            } catch {
              emailLogger.error({ template: "passkeyAdded" }, "auth email not queued");
            }
          })
        }
      ]
    }
  } satisfies BetterAuthPlugin;
}

// Sign-ins that prove control of the email address. On these routes the only
// user write that sets emailVerified is better-auth's promotion of an
// unverified account (revokeUnprovenAccountAccess), which removes the
// account's password, social links, and sessions, but not its passkeys.
const EMAIL_PROOF_SIGN_IN_PATHS = new Set(["/magic-link/verify", "/sign-in/email-otp"]);

// Requests whose user write promotes an unverified account, and those whose
// promotion deleted a password. The hooks of one request share its context
// object.
const unverifiedAccountPromotions = new WeakSet<GenericEndpointContext>();
const unverifiedPasswordRemovals = new WeakSet<GenericEndpointContext>();

function buildSignInUrl(webAppUrl: string): string {
  return new URL("/auth", webAppUrl).toString();
}

// Endpoints a bot could abuse to create accounts, guess passwords, or send
// email. Paths are relative to the /api/auth base path.
const AUTH_CAPTCHA_ENDPOINTS = [
  "/sign-up/email",
  "/sign-in/email",
  "/request-password-reset",
  "/email-otp/send-verification-otp",
  "/email-otp/request-password-reset",
  "/sign-in/magic-link"
] as const;

// Captcha is opt-in like social login: Cloudflare Turnstile activates only
// when TURNSTILE_SECRET_KEY is set, so local development and tests run
// without a third-party round trip.
function resolveCaptchaOptions(env: Record<string, string | undefined>): {
  provider: "cloudflare-turnstile";
  secretKey: string;
  endpoints: string[];
  allowedHostnames?: string[];
} | null {
  const secretKey = env.TURNSTILE_SECRET_KEY?.trim();

  if (!secretKey) {
    return null;
  }

  const allowedHostnames = parseCommaList(env.TURNSTILE_ALLOWED_HOSTNAMES);

  return {
    provider: "cloudflare-turnstile",
    secretKey,
    endpoints: [...AUTH_CAPTCHA_ENDPOINTS],
    ...(allowedHostnames.length > 0 ? { allowedHostnames } : {})
  };
}

// The Have I Been Pwned check calls api.pwnedpasswords.com and fails closed
// when it is unreachable, so offline development and e2e can turn it off.
function isPasswordBreachCheckEnabled(env: Record<string, string | undefined>): boolean {
  return env.AUTH_PASSWORD_BREACH_CHECK !== "false";
}

interface SocialProviderCredentials {
  clientId: string;
  clientSecret: string;
}

// Social login is opt-in per provider: a provider activates only when BOTH of
// its env vars are set, so the template works with none, one, or both.
export function resolveSocialProviders(
  env: Record<string, string | undefined>
): Partial<Record<"github" | "google", SocialProviderCredentials>> {
  const providers: Partial<Record<"github" | "google", SocialProviderCredentials>> = {};

  if (env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET) {
    providers.github = {
      clientId: env.GITHUB_CLIENT_ID,
      clientSecret: env.GITHUB_CLIENT_SECRET
    };
  }

  if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) {
    providers.google = {
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET
    };
  }

  return providers;
}

function parseCommaList(value: string | undefined): string[] {
  if (!value) {
    return [];
  }

  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

// better-auth organization routes that act on one Organization through their
// body. Clients send no organization id: the hook below fills in the session's
// Active Organization and refuses any other id a client sends.
const ACTIVE_ORGANIZATION_PATHS = new Set([
  "/organization/invite-member",
  "/organization/remove-member",
  "/organization/update-member-role",
  "/organization/update",
  "/organization/leave",
  "/organization/delete",
  "/organization/create-role",
  "/organization/update-role",
  "/organization/delete-role"
]);

// Routes that change the session's Active Organization in the database
// without refreshing the session cookie cache.
const ACTIVE_ORGANIZATION_CHANGE_PATHS = new Set([
  "/organization/create",
  "/organization/leave",
  "/organization/delete",
  "/organization/accept-invitation"
]);

const ORGANIZATION_REFUSAL_RESPONSES: Record<
  OrganizationRefusal,
  { message: string; status: "BAD_REQUEST" | "FORBIDDEN" }
> = {
  ACTIVE_ORGANIZATION_MISMATCH: {
    message: "Organization actions apply only to the active organization",
    status: "FORBIDDEN"
  },
  CUSTOM_ROLE_NAME_INVALID: {
    message: "A role name uses 2 to 32 lowercase letters, digits, or hyphens",
    status: "BAD_REQUEST"
  },
  CUSTOM_ROLE_PERMISSION_NOT_ALLOWED: {
    message: "A custom role cannot grant this permission",
    status: "BAD_REQUEST"
  },
  CUSTOM_ROLE_RENAME_NOT_SUPPORTED: {
    message: "A custom role cannot be renamed",
    status: "BAD_REQUEST"
  },
  NO_ACTIVE_ORGANIZATION: { message: "No active organization", status: "BAD_REQUEST" },
  ONLY_AN_OWNER_CAN_TRANSFER_OWNERSHIP: {
    message: "Only an owner can transfer ownership",
    status: "FORBIDDEN"
  },
  OWNER_ROLE_REQUIRES_TRANSFER: {
    message: "Ownership moves only through a transfer",
    status: "BAD_REQUEST"
  },
  PERSONAL_ORGANIZATION_CANNOT_BE_DELETED: {
    message: "A personal organization cannot be deleted",
    status: "BAD_REQUEST"
  },
  PERSONAL_ORGANIZATION_CANNOT_BE_LEFT: {
    message: "A personal organization cannot be left",
    status: "BAD_REQUEST"
  },
  PERSONAL_ORGANIZATION_CANNOT_BE_TRANSFERRED: {
    message: "A personal organization cannot be transferred",
    status: "BAD_REQUEST"
  },
  MEMBER_EXCEEDS_YOUR_PERMISSIONS: {
    message: "You cannot change or remove a member who holds permissions you do not hold",
    status: "FORBIDDEN"
  },
  ROLE_EXCEEDS_YOUR_PERMISSIONS: {
    message: "You cannot give a role with permissions you do not hold",
    status: "FORBIDDEN"
  },
  ROLE_IS_ASSIGNED_TO_INVITATIONS: {
    message: "Pending invitations name this role",
    status: "BAD_REQUEST"
  },
  TRANSFER_TARGET_NOT_FOUND: {
    message: "The new owner must be another member of the organization",
    status: "BAD_REQUEST"
  }
};

function refuse(code: OrganizationRefusal): APIError {
  const { message, status } = ORGANIZATION_REFUSAL_RESPONSES[code];
  return APIError.from(status, { code, message });
}

// activeOrganizationId is an organization-plugin session field that the
// core session types do not declare.
function readActiveOrganizationId(session: Readonly<Record<string, unknown>>): string | null {
  return typeof session.activeOrganizationId === "string" ? session.activeOrganizationId : null;
}

function readRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? { ...value } : {};
}

// An invite or a role change never gives the owner role, and never a role
// with a Permission the caller does not hold. The role may be a string, an
// array, or comma-separated names, as the plugin reads it.
async function refuseRoleAssignment(params: {
  organizationId: string;
  role: unknown;
  userId: string;
}): Promise<void> {
  const roleNames = parseRoleNames(
    [params.role]
      .flat()
      .filter((name) => typeof name === "string")
      .join(",")
  );

  if (roleNames.includes(ORGANIZATION_ROLES.OWNER)) {
    throw refuse(ORGANIZATION_REFUSALS.OWNER_ROLE_REQUIRES_TRANSFER);
  }

  const [caller, granted] = await Promise.all([
    getOrganizationMembershipProof({
      organizationId: params.organizationId,
      userId: params.userId
    }),
    loadRolePermissions({ organizationId: params.organizationId, role: roleNames.join(",") })
  ]);

  if (caller && granted.some((permission) => !caller.permissions.includes(permission))) {
    throw refuse(ORGANIZATION_REFUSALS.ROLE_EXCEEDS_YOUR_PERMISSIONS);
  }
}

// A member's role changes, or the member leaves, only through a caller who
// holds every Permission the member holds now. The plugin itself protects
// only the owner role, so a Custom Role with member:update or member:delete
// could otherwise demote or remove an admin.
async function refuseMemberChange(params: {
  memberIdOrEmail: unknown;
  organizationId: string;
  userId: string;
}): Promise<void> {
  if (typeof params.memberIdOrEmail !== "string") {
    return;
  }

  const [caller, role] = await Promise.all([
    getOrganizationMembershipProof({
      organizationId: params.organizationId,
      userId: params.userId
    }),
    findMemberRole({
      memberIdOrEmail: params.memberIdOrEmail,
      organizationId: params.organizationId
    })
  ]);

  if (!caller || role === null) {
    // The route itself answers a caller or member that does not exist.
    return;
  }

  const held = await loadRolePermissions({ organizationId: params.organizationId, role });

  if (held.some((permission) => !caller.permissions.includes(permission))) {
    throw refuse(ORGANIZATION_REFUSALS.MEMBER_EXCEEDS_YOUR_PERMISSIONS);
  }
}

// A Custom Role is a valid name plus Permissions from CUSTOM_ROLE_PERMISSIONS.
// It keeps its name: members hold roles by name, so a rename would drop them.
function refuseCustomRoleDefinition(fields: Record<string, unknown>): void {
  if (fields.roleName !== undefined) {
    throw refuse(ORGANIZATION_REFUSALS.CUSTOM_ROLE_RENAME_NOT_SUPPORTED);
  }

  if (
    fields.role !== undefined &&
    (typeof fields.role !== "string" || !CUSTOM_ROLE_NAME_PATTERN.test(fields.role))
  ) {
    throw refuse(ORGANIZATION_REFUSALS.CUSTOM_ROLE_NAME_INVALID);
  }

  if (
    fields.permission !== undefined &&
    findUngrantablePermissions(readRecord(fields.permission)).length > 0
  ) {
    throw refuse(ORGANIZATION_REFUSALS.CUSTOM_ROLE_PERMISSION_NOT_ALLOWED);
  }
}

// Server-side rules on top of the organization plugin's own role checks: the
// Active Organization comes from the session, a Personal Organization cannot
// be deleted or left, and ownership moves only through the transfer endpoint.
const organizationGuardHook = createAuthMiddleware(async (ctx) => {
  if (!ACTIVE_ORGANIZATION_PATHS.has(ctx.path)) {
    return;
  }

  const session = await getSessionFromCtx(ctx);

  if (!session) {
    // The route itself answers an unauthenticated request.
    return;
  }

  const body = readRecord(ctx.body);
  const organizationId = readActiveOrganizationId(session.session);

  if (!organizationId) {
    throw refuse(ORGANIZATION_REFUSALS.NO_ACTIVE_ORGANIZATION);
  }

  if (body.organizationId !== undefined && body.organizationId !== organizationId) {
    throw refuse(ORGANIZATION_REFUSALS.ACTIVE_ORGANIZATION_MISMATCH);
  }

  if (
    ctx.path === "/organization/update-member-role" ||
    ctx.path === "/organization/invite-member"
  ) {
    await refuseRoleAssignment({ organizationId, role: body.role, userId: session.user.id });
  }

  if (
    ctx.path === "/organization/update-member-role" ||
    ctx.path === "/organization/remove-member"
  ) {
    await refuseMemberChange({
      memberIdOrEmail:
        ctx.path === "/organization/remove-member" ? body.memberIdOrEmail : body.memberId,
      organizationId,
      userId: session.user.id
    });
  }

  // The plugin refuses only while members hold the role; an Invitation would
  // give it to the invitee after it is gone.
  if (
    ctx.path === "/organization/delete-role" &&
    (await customRoleHasPendingInvitations({
      organizationId,
      roleId: typeof body.roleId === "string" ? body.roleId : null,
      roleName: typeof body.roleName === "string" ? body.roleName : null
    }))
  ) {
    throw refuse(ORGANIZATION_REFUSALS.ROLE_IS_ASSIGNED_TO_INVITATIONS);
  }

  if (ctx.path === "/organization/create-role" || ctx.path === "/organization/update-role") {
    refuseCustomRoleDefinition(
      ctx.path === "/organization/create-role" ? body : readRecord(body.data)
    );
  }

  if (
    (ctx.path === "/organization/delete" || ctx.path === "/organization/leave") &&
    (await isPersonalOrganization(organizationId))
  ) {
    throw refuse(
      ctx.path === "/organization/delete"
        ? ORGANIZATION_REFUSALS.PERSONAL_ORGANIZATION_CANNOT_BE_DELETED
        : ORGANIZATION_REFUSALS.PERSONAL_ORGANIZATION_CANNOT_BE_LEFT
    );
  }

  return { context: { body: { ...body, organizationId } } };
});

// Leave and delete clear the Active Organization; create and accept set it.
// Each writes only the session row, so a cookie client would read the old
// value from its cookie cache. Pick a valid Active Organization (another
// membership, or a personal organization) and refresh the cookie.
const activeOrganizationRefreshHook = createAuthMiddleware(async (ctx) => {
  if (!ACTIVE_ORGANIZATION_CHANGE_PATHS.has(ctx.path) || isAPIError(ctx.context.returned)) {
    return;
  }

  const session = await getSessionFromCtx(ctx);

  if (!session) {
    return;
  }

  const stored = await ctx.context.internalAdapter.findSession(session.session.token);
  const activeOrganizationId = await resolveActiveOrganizationForUser({
    requestedActiveOrganizationId: stored ? readActiveOrganizationId(stored.session) : null,
    userId: session.user.id
  });
  const updated = await ctx.context.internalAdapter.updateSession(session.session.token, {
    activeOrganizationId
  });

  if (updated) {
    await setSessionCookie(ctx, { session: updated, user: session.user });
  }
});

// The new owner's role changed, so they get a "role changed" Notification.
// The previous owner made the change and gets none.
async function notifyNewOwner(memberId: string): Promise<void> {
  const [member] = await db
    .select({
      organizationId: organizationsTable.id,
      organizationName: organizationsTable.name,
      role: membersTable.role,
      userId: membersTable.userId
    })
    .from(membersTable)
    .innerJoin(organizationsTable, eq(organizationsTable.id, membersTable.organizationId))
    .where(eq(membersTable.id, memberId))
    .limit(1);

  if (member) {
    notifyRoleChanged(getServerAuthConfig().webAppUrl, {
      organization: { id: member.organizationId, name: member.organizationName },
      role: member.role,
      userId: member.userId
    });
  }
}

// The organization plugin has no transfer-ownership route; this one moves
// ownership of the Active Organization in one database transaction.
const organizationOwnershipPlugin = {
  id: "organization-ownership",
  endpoints: {
    transferOrganizationOwnership: createAuthEndpoint(
      "/organization/transfer-ownership",
      {
        method: "POST",
        body: z.object({ memberId: z.string().min(1) }),
        use: [sessionMiddleware]
      },
      async (ctx) => {
        const organizationId = readActiveOrganizationId(ctx.context.session.session);

        if (!organizationId) {
          throw refuse(ORGANIZATION_REFUSALS.NO_ACTIVE_ORGANIZATION);
        }

        const refusal = await transferOrganizationOwnership({
          organizationId,
          targetMemberId: ctx.body.memberId,
          userId: ctx.context.session.user.id
        });

        if (refusal) {
          throw refuse(refusal);
        }

        void notifyNewOwner(ctx.body.memberId).catch(() => {
          notificationLookupLogger.error("new owner not notified");
        });
        return ctx.json({ success: true });
      }
    )
  }
} satisfies BetterAuthPlugin;

const ACCOUNT_DELETION_REFUSAL_MESSAGES: Record<AccountDeletionRefusal["code"], string> = {
  PERSONAL_ORGANIZATION_HAS_MEMBERS:
    "Remove the other members of your personal organization before you delete your account",
  SOLE_OWNER_OF_SHARED_ORGANIZATION:
    "Transfer ownership of the organization or delete it before you delete your account"
};

// The body names the Organization, so the client can show it in its message.
function refuseAccountDeletion(refusal: AccountDeletionRefusal): APIError {
  return APIError.fromStatus("BAD_REQUEST", {
    code: refusal.code,
    message: ACCOUNT_DELETION_REFUSAL_MESSAGES[refusal.code],
    organizationName: refusal.organizationName
  });
}

// Routes that would let a client set a Public Asset URL, and the body field.
// Only the API's public-asset upload writes users.image and
// organizations.logo; a client-chosen URL could name another owner's file,
// which a later replacement or purge would delete. /organization/update
// carries its fields under `data`.
const PUBLIC_ASSET_URL_FIELDS = new Map([
  ["/sign-up/email", "image"],
  ["/update-user", "image"],
  ["/organization/create", "logo"],
  ["/organization/update", "logo"]
]);

// Account settings: the social providers a user can link, the refusal of a
// client-set Public Asset URL, and the refusal of a delete request before
// better-auth emails the confirmation link. A request with the emailed token
// is checked by user.deleteUser.beforeDelete, under row locks.
const accountPlugin = {
  id: "account",
  endpoints: {
    listSocialProviders: createAuthEndpoint(
      "/account/social-providers",
      { method: "GET", use: [sessionMiddleware] },
      async (ctx) => ctx.json({ providers: Object.keys(resolveSocialProviders(process.env)) })
    )
  },
  hooks: {
    before: [
      {
        matcher: (ctx) => PUBLIC_ASSET_URL_FIELDS.has(ctx.path ?? ""),
        handler: createAuthMiddleware(async (ctx) => {
          const body = readRecord(ctx.body);
          const fields = ctx.path === "/organization/update" ? readRecord(body.data) : body;
          const field = PUBLIC_ASSET_URL_FIELDS.get(ctx.path) ?? "";

          if (fields[field] !== undefined) {
            throw APIError.from("BAD_REQUEST", {
              code: "PUBLIC_ASSET_URL_READ_ONLY",
              message: "Profile pictures and logos change only through an upload"
            });
          }
        })
      },
      {
        matcher: (ctx) => ctx.path === "/delete-user" && readRecord(ctx.body).token === undefined,
        handler: createAuthMiddleware(async (ctx) => {
          const session = await getSessionFromCtx(ctx);

          if (!session) {
            return;
          }

          const refusal = await findAccountDeletionRefusal(session.user.id);

          if (refusal) {
            throw refuseAccountDeletion(refusal);
          }
        })
      }
    ]
  }
} satisfies BetterAuthPlugin;

/** Deep-link scheme for Expo OAuth return (must match apps/mobile app.json scheme). */
export const EXPO_AUTH_SCHEME = "kaineforge";

export function resolveTrustedOrigins(env: Record<string, string | undefined>): string[] {
  const origins = parseCommaList(env.API_CORS_ORIGINS);
  const schemeOrigin = `${EXPO_AUTH_SCHEME}://`;

  if (!origins.includes(schemeOrigin)) {
    origins.push(schemeOrigin);
  }

  return origins;
}

export function createAuthInstance() {
  // getServerAuthConfig falls back to "development-secret"; that fallback
  // must never sign production tokens. Production also requires length and
  // rejects known placeholders (see assertProductionAuthSecret).
  assertProductionAuthSecret(process.env.BETTER_AUTH_SECRET);

  const config = getServerAuthConfig();
  const captchaOptions = resolveCaptchaOptions(process.env);
  // A spread of a conditional array turns the plugins tuple into an array
  // and erases better-auth's plugin type inference (session fields such as
  // activeOrganizationId), so the disabled case is an inert plugin instead.
  const captchaPlugin = captchaOptions
    ? captcha(captchaOptions)
    : ({ id: "captcha-disabled" } satisfies BetterAuthPlugin);
  // Secure (and the __Secure- name prefix) follows the public base URL, so
  // local http://localhost keeps working; production serves https.
  const secureCookies = config.baseUrl.startsWith("https://");

  return betterAuth({
    // TOTP issuer shown in authenticator apps.
    appName: AUTH_DEFINITIONS.TWO_FACTOR_ISSUER,
    baseURL: config.baseUrl,
    secret: config.secret,
    // Browser clients live on separate origins (Vite dev server, deployed
    // web app); Expo OAuth returns via kaineforge://. better-auth rejects
    // state-changing requests from origins outside this list.
    trustedOrigins: resolveTrustedOrigins(process.env),
    socialProviders: resolveSocialProviders(process.env),
    database: drizzleAdapter(db, {
      provider: "pg",
      usePlural: true,
      schema: AUTH_SCHEMA,
      // Pinned off: the database hooks below write through the app's own db
      // pool and FK-reference rows the adapter just wrote; inside an adapter
      // transaction on another connection every signup would FK-violate.
      transaction: false
    }),
    emailAndPassword: {
      enabled: true,
      // One minimum for the web/mobile forms and the server.
      minPasswordLength: AUTH_PASSWORD_MIN_LENGTH,
      // Custom scrypt hooks verify stored scrypt$N$r$p$salt$hash values.
      // Legacy unsalted sha256 hashes no longer verify (ADR 0005, issue #499).
      password: {
        hash: hashPassword,
        verify: ({ hash, password }) => verifyPassword(password, hash)
      },
      sendResetPassword: async ({ user, url }) => {
        enqueueAuthEmail(
          user.email,
          {
            template: "passwordReset",
            url,
            expiresInMinutes: AUTH_DEFINITIONS.PASSWORD_RESET_MAX_AGE_SECONDS / 60
          },
          readUserLocale(user)
        );
      },
      // Runs after both reset flows: the emailed link and the email one-time code.
      // Neither route returns the user, so the audit after hook cannot record it.
      onPasswordReset: async ({ user }) => {
        enqueueAuthEmail(
          user.email,
          { template: "passwordChanged", securityUrl: buildSecurityUrl(config.webAppUrl) },
          readUserLocale(user)
        );
        await recordAuditEvent({
          action: "password_changed",
          actorUserId: user.id,
          metadata: {},
          organizationId: null,
          targetId: user.id
        });
      },
      resetPasswordTokenExpiresIn: AUTH_DEFINITIONS.PASSWORD_RESET_MAX_AGE_SECONDS
      // Soft verification (ADR 0007): requireEmailVerification stays unset so
      // login is never gated on a verified email.
    },
    emailVerification: {
      sendVerificationEmail: async ({ user, url }) => {
        enqueueAuthEmail(
          user.email,
          {
            template: "emailVerification",
            url,
            expiresInHours: AUTH_DEFINITIONS.EMAIL_VERIFICATION_MAX_AGE_SECONDS / 3600
          },
          readUserLocale(user)
        );
      },
      // Soft verification (ADR 0007): verification emails go out on signup
      // only when AUTH_REQUIRE_EMAIL_VERIFICATION=true; the flag never blocks
      // login either way.
      sendOnSignUp: config.requireEmailVerification,
      expiresIn: AUTH_DEFINITIONS.EMAIL_VERIFICATION_MAX_AGE_SECONDS
    },
    user: {
      additionalFields: {
        // Language of the user's emails; the web language switch writes it.
        locale: {
          type: "string",
          required: false,
          input: true,
          validator: { input: z.enum(SUPPORTED_LANGUAGES) }
        },
        // When the web first-run onboarding ended; only onboardingPlugin sets it.
        onboardingCompletedAt: {
          type: "date",
          required: false,
          input: false
        }
      },
      changeEmail: {
        enabled: true,
        // The email on the user row changes only after the new address is
        // verified; a verified user's old address approves the change first.
        updateEmailWithoutVerification: false,
        sendChangeEmailConfirmation: async ({ user, newEmail, url }) => {
          enqueueAuthEmail(
            user.email,
            {
              template: "emailChangeApproval",
              newEmail,
              url,
              expiresInHours: AUTH_DEFINITIONS.EMAIL_VERIFICATION_MAX_AGE_SECONDS / 3600
            },
            readUserLocale(user)
          );
        }
      },
      deleteUser: {
        enabled: true,
        deleteTokenExpiresIn: AUTH_DEFINITIONS.ACCOUNT_DELETION_MAX_AGE_SECONDS,
        // The user row is deleted only after the emailed link is used. The
        // link opens the web app, which confirms with the token.
        sendDeleteAccountVerification: async ({ user, token }) => {
          enqueueAuthEmail(
            user.email,
            {
              template: "accountDeletion",
              url: buildAccountDeletionUrl(config.webAppUrl, token),
              expiresInHours: AUTH_DEFINITIONS.ACCOUNT_DELETION_MAX_AGE_SECONDS / 3600
            },
            readUserLocale(user)
          );
        },
        beforeDelete: async (user) => {
          const refusal = await prepareAccountDeletion(user.id);

          if (refusal) {
            throw refuseAccountDeletion(refusal);
          }
        }
      }
    },
    session: {
      expiresIn: AUTH_DEFINITIONS.SESSION_MAX_AGE_SECONDS,
      updateAge: AUTH_DEFINITIONS.SESSION_UPDATE_AGE_SECONDS,
      // Cookie clients skip the database session read for this window; bearer
      // clients always hit the database. Membership is still proven per
      // GraphQL request (ADR 0015).
      cookieCache: {
        enabled: true,
        maxAge: AUTH_DEFINITIONS.SESSION_COOKIE_CACHE_MAX_AGE_SECONDS
      }
    },
    // Rate limiting for /api/auth and /graphql is handled by our own API
    // middleware, so better-auth's built-in limiter stays off.
    rateLimit: { enabled: false },
    hooks: {
      before: organizationGuardHook,
      after: activeOrganizationRefreshHook
    },
    advanced: {
      cookiePrefix: "kaine",
      // Stated rather than inherited from better-auth defaults, so a library
      // upgrade cannot weaken them silently.
      useSecureCookies: secureCookies,
      defaultCookieAttributes: {
        httpOnly: true,
        sameSite: "lax",
        secure: secureCookies
      },
      database: {
        // Every table has a uuid primary key with a database default. A
        // custom generator function would make better-auth encode the
        // deterministic ids of single-use reservations (the cleanup lock of an
        // email-proof sign-in into an unverified account) as base64url, which
        // a uuid column rejects.
        generateId: "uuid"
      }
    },
    databaseHooks: {
      user: {
        create: {
          // Every user owns a personal organization with an owner membership;
          // seeds, e2e flows, and GraphQL scope resolution rely on it.
          after: async (user) => {
            await ensurePersonalOrganizationForUser(user.id);
            enqueueAuthEmail(
              user.email,
              { template: "welcome", url: config.webAppUrl },
              readUserLocale(user)
            );
          }
        },
        // Security alerts for an email change (to the previous address) and
        // for two-factor turning on. Each is limited to the routes that make
        // that change, so a stale cookie-cached session elsewhere cannot
        // trigger one.
        update: {
          before: async (data, ctx) => {
            if (ctx && EMAIL_PROOF_SIGN_IN_PATHS.has(ctx.path) && data.emailVerified === true) {
              unverifiedAccountPromotions.add(ctx);
            }
          },
          after: async (user, ctx) => {
            if (!ctx) {
              return;
            }

            // The owner just proved the address: a passkey added before that
            // proof may belong to whoever signed up with it.
            if (unverifiedAccountPromotions.has(ctx)) {
              await db.delete(passkeysTable).where(eq(passkeysTable.userId, user.id));

              // Tell the now-verified address why its password stopped working.
              if (unverifiedPasswordRemovals.delete(ctx)) {
                enqueueAuthEmail(
                  user.email,
                  { template: "passwordRemoved", url: buildSignInUrl(config.webAppUrl) },
                  readUserLocale(user)
                );
              }
            }

            const previousUser = ctx.context.session?.user;
            const securityUrl = buildSecurityUrl(config.webAppUrl);

            if (EMAIL_CHANGE_PATHS.has(ctx.path)) {
              const previousEmail =
                ctx.path === "/verify-email"
                  ? readVerificationTokenEmail(ctx.query?.token)
                  : (previousUser?.email ?? null);

              if (previousEmail && previousEmail !== user.email) {
                enqueueAuthEmail(
                  previousEmail,
                  { template: "emailChanged", newEmail: user.email, securityUrl },
                  readUserLocale(user)
                );
              }
            }

            if (
              ctx.path.startsWith("/two-factor/") &&
              "twoFactorEnabled" in user &&
              user.twoFactorEnabled === true &&
              previousUser?.twoFactorEnabled !== true
            ) {
              enqueueAuthEmail(
                user.email,
                { template: "twoFactorEnabled", securityUrl },
                readUserLocale(user)
              );
            }
          }
        }
      },
      account: {
        delete: {
          // The promotion deletes every account row before it sets
          // emailVerified; "credential" is the password.
          before: async (account, ctx) => {
            if (
              ctx &&
              EMAIL_PROOF_SIGN_IN_PATHS.has(ctx.path) &&
              account.providerId === "credential"
            ) {
              unverifiedPasswordRemovals.add(ctx);
            }
          }
        }
      },
      session: {
        create: {
          // New sessions always start with a valid active organization so
          // GraphQL scope resolution never sees a session without one.
          before: async (session) => {
            const requestedActiveOrganizationId =
              typeof session.activeOrganizationId === "string"
                ? session.activeOrganizationId
                : null;
            const activeOrganizationId = await resolveActiveOrganizationForUser({
              requestedActiveOrganizationId,
              userId: session.userId
            });

            return { data: { ...session, activeOrganizationId } };
          }
        }
      }
    },
    plugins: [
      // Runs first so rejected bots never reach password hashing or email.
      captchaPlugin,
      // Enables Expo deep-link OAuth return and mobile cookie/origin handling.
      expo(),
      organization({
        // One Permission catalog for the plugin's routes and the API's checks;
        // owners manage the Active Organization's Custom Roles.
        ac: accessControl,
        roles: BUILT_IN_ROLES,
        dynamicAccessControl: {
          enabled: true,
          maximumRolesPerOrganization: AUTH_DEFINITIONS.CUSTOM_ROLES_PER_ORGANIZATION_MAX
        },
        invitationExpiresIn: AUTH_DEFINITIONS.INVITATION_MAX_AGE_SECONDS,
        // Off: this gate would demand a verified email before accept/reject/get
        // by invitation id. Invitation ids are random UUIDs and soft
        // verification (ADR 0007) never guarantees a verified email, so the
        // gate stays off. The accept route still enforces that the accepting
        // user's email matches the invitation email unconditionally.
        requireEmailVerificationOnInvitation: false,
        // The invitee may have no account, so the email uses the inviter's
        // stored language. The inviter here is the session user, which a
        // cookie cache can hold from before a language change.
        sendInvitationEmail: async (data) => {
          deliverInvitation(data, data.inviter.user, {
            template: "invitation",
            url: buildInvitationUrl(config.webAppUrl, data.id),
            organizationName: data.organization.name,
            inviterName: data.inviter.user.name,
            role: data.role,
            expiresInDays: AUTH_DEFINITIONS.INVITATION_MAX_AGE_SECONDS / 86400
          });
        },
        schema: {
          organization: {
            // organizations.user_id is the owner column predating the plugin
            // (null after its user deleted the account). Declared as a
            // server-only additional field so the
            // beforeCreateOrganization hook value survives the adapter's
            // field mapping while clients cannot set it.
            additionalFields: {
              userId: {
                type: "string",
                required: false,
                input: false
              },
              // Set only by ensurePersonalOrganizationForUser; returned so
              // clients can hide leave and delete for a Personal Organization.
              personal: {
                type: "boolean",
                required: false,
                input: false,
                defaultValue: false
              }
            }
          }
        },
        organizationHooks: {
          beforeCreateOrganization: async ({ organization: organizationData, user }) => ({
            data: { ...organizationData, userId: user.id }
          }),
          afterUpdateMemberRole: async ({ member, previousRole, organization: changed }) => {
            if (member.role !== previousRole) {
              notifyRoleChanged(config.webAppUrl, {
                organization: changed,
                role: member.role,
                userId: member.userId
              });
            }
          }
        }
      }),
      organizationOwnershipPlugin,
      accountPlugin,
      onboardingPlugin,
      auditPlugin,
      userNameLimitPlugin,
      organizationNameLimitPlugin,
      createPasswordChangeAlertPlugin(config.webAppUrl),
      createPasskeyPolicyPlugin(config.webAppUrl),
      bearer(),
      // Second factor for password sign-in only; email OTP, magic-link,
      // passkey, and social sign-in are not challenged (better-auth default,
      // ADR 0015).
      twoFactor({
        issuer: AUTH_DEFINITIONS.TWO_FACTOR_ISSUER,
        otpOptions: {
          sendOTP: ({ user, otp }) => {
            enqueueAuthEmail(
              user.email,
              { template: "twoFactorCode", code: otp },
              readUserLocale(user)
            );
          }
        }
      }),
      emailOTP({
        otpLength: AUTH_DEFINITIONS.EMAIL_OTP_LENGTH,
        expiresIn: AUTH_DEFINITIONS.EMAIL_OTP_MAX_AGE_SECONDS,
        allowedAttempts: AUTH_DEFINITIONS.EMAIL_OTP_ALLOWED_ATTEMPTS,
        storeOTP: "hashed",
        // Accounts are created only through the captcha-protected sign-up
        // form, which also collects the user's name.
        disableSignUp: true,
        sendVerificationOTP: async ({ email, otp, type }, ctx) => {
          // The change-email code goes to the new address, which has no
          // account; the requesting session names the account.
          const accountEmail =
            type === "change-email" ? (ctx?.context.session?.user.email ?? email) : email;

          enqueueAuthEmail(
            email,
            {
              template: "emailOtp",
              code: otp,
              type,
              expiresInMinutes: AUTH_DEFINITIONS.EMAIL_OTP_MAX_AGE_SECONDS / 60
            },
            findLocaleByEmail(accountEmail).catch(() => null)
          );
        }
      }),
      // Passwordless sign-in for existing accounts only, like the email code:
      // the token is stored hashed and consumed on first use (ADR 0015).
      magicLink({
        expiresIn: AUTH_DEFINITIONS.MAGIC_LINK_MAX_AGE_SECONDS,
        storeToken: "hashed",
        disableSignUp: true,
        sendMagicLink: ({ email, url }) => {
          sendMagicLinkToAccount(email, url);
        }
      }),
      // WebAuthn for the web app: credentials are bound to its host, and the
      // browser ceremony must run on its origin (ADR 0015). The relying party
      // name is appName.
      passkey({
        rpID: new URL(config.webAppUrl).hostname,
        origin: new URL(config.webAppUrl).origin
      }),
      // Wraps our scrypt hash hook, so sign-up, change-password, and both
      // reset flows reject passwords found in known breaches.
      haveIBeenPwned({ enabled: isPasswordBreachCheckEnabled(process.env) })
    ]
  });
}

export const auth = createAuthInstance();

export type AuthInstance = ReturnType<typeof createAuthInstance>;
