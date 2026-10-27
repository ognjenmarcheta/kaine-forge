import { expo } from "@better-auth/expo";
import {
  accountsTable,
  db,
  invitationsTable,
  membersTable,
  organizationsTable,
  sessionsTable,
  twoFactorsTable,
  usersTable,
  verificationsTable
} from "@repo/db";
import { renderEmail, type EmailTemplate } from "@repo/email";
import { jobQueue } from "@repo/jobs/client";
import { createLogger } from "@repo/logger";
import { SUPPORTED_LANGUAGES } from "@repo/translation";
import type { BetterAuthPlugin, User } from "better-auth";
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
  organization,
  twoFactor
} from "better-auth/plugins";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { recordAuditEvent } from "./auth.audit";
import { auditPlugin } from "./auth.audit.plugin";
import { assertProductionAuthSecret, buildInvitationUrl, getServerAuthConfig } from "./auth.config";
import { AUTH_DEFINITIONS } from "./auth.definition";
import { AUTH_PASSWORD_MIN_LENGTH } from "./auth.form";
import { hashPassword, verifyPassword } from "./auth.password";
import { ORGANIZATION_ROLES } from "./auth.permissions";
import {
  ensurePersonalOrganizationForUser,
  isPersonalOrganization,
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
  twoFactors: twoFactorsTable
} as const;

const emailLogger = createLogger({ name: "auth.email" });

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

// Endpoints a bot could abuse to create accounts, guess passwords, or send
// email. Paths are relative to the /api/auth base path.
const AUTH_CAPTCHA_ENDPOINTS = [
  "/sign-up/email",
  "/sign-in/email",
  "/request-password-reset",
  "/email-otp/send-verification-otp",
  "/email-otp/request-password-reset"
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
  "/organization/delete"
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

  // An invite or a role change gives admin or member only; the role may be a
  // string or an array.
  if (
    (ctx.path === "/organization/update-member-role" ||
      ctx.path === "/organization/invite-member") &&
    [body.role].flat().includes(ORGANIZATION_ROLES.OWNER)
  ) {
    throw refuse(ORGANIZATION_REFUSALS.OWNER_ROLE_REQUIRES_TRANSFER);
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

        return ctx.json({ success: true });
      }
    )
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
        // Keep uuid primary-key continuity with the existing schema.
        generateId: () => crypto.randomUUID()
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
          after: async (user, ctx) => {
            if (!ctx) {
              return;
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
        invitationExpiresIn: AUTH_DEFINITIONS.INVITATION_MAX_AGE_SECONDS,
        // Our advanced.database.generateId is a custom function, which
        // better-auth's heuristic treats as potentially predictable and would
        // therefore demand a verified email before accept/reject/get by
        // invitation id. Our ids are opaque crypto.randomUUID values and soft
        // verification (ADR 0007) never guarantees a verified email, so the
        // gate stays off. The accept route still enforces that the accepting
        // user's email matches the invitation email unconditionally.
        requireEmailVerificationOnInvitation: false,
        // The invitee may have no account, so the email uses the inviter's
        // stored language. The inviter here is the session user, which a
        // cookie cache can hold from before a language change.
        sendInvitationEmail: async (data) => {
          enqueueAuthEmail(
            data.email,
            {
              template: "invitation",
              url: buildInvitationUrl(config.webAppUrl, data.id),
              organizationName: data.organization.name,
              inviterName: data.inviter.user.name,
              role: data.role,
              expiresInDays: AUTH_DEFINITIONS.INVITATION_MAX_AGE_SECONDS / 86400
            },
            findLocaleByEmail(data.inviter.user.email).catch(() => null)
          );
        },
        schema: {
          organization: {
            // organizations.user_id is NOT NULL (owner column predating the
            // plugin). Declared as a server-only additional field so the
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
          })
        }
      }),
      organizationOwnershipPlugin,
      auditPlugin,
      userNameLimitPlugin,
      createPasswordChangeAlertPlugin(config.webAppUrl),
      bearer(),
      // Second factor for password sign-in only; email OTP and social sign-in
      // are not challenged (better-auth default, ADR 0015).
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
      // Wraps our scrypt hash hook, so sign-up, change-password, and both
      // reset flows reject passwords found in known breaches.
      haveIBeenPwned({ enabled: isPasswordBreachCheckEnabled(process.env) })
    ]
  });
}

export const auth = createAuthInstance();

export type AuthInstance = ReturnType<typeof createAuthInstance>;
