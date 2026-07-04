import {
  accountsTable,
  db,
  invitationsTable,
  membersTable,
  organizationsTable,
  sessionsTable,
  usersTable,
  verificationsTable
} from "@repo/db";
import { createEmailSender, type EmailMessage } from "@repo/email";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { bearer, organization } from "better-auth/plugins";

import { getServerAuthConfig } from "./auth.config";
import { AUTH_DEFINITIONS } from "./auth.definition";
import { hashPassword, verifyPassword } from "./auth.password";
import {
  ensurePersonalOrganizationForUser,
  resolveActiveOrganizationForUser
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
  invitations: invitationsTable
} as const;

// One sender shared by every auth email hook below; adapters own delivery
// logging and provider configuration.
const emailSender = createEmailSender();

// Auth endpoint responses must not vary on delivery outcome
// (anti-enumeration), so hooks swallow send failures; the adapter behind
// emailSender owns delivery logging and never leaks provider details.
async function sendAuthEmail(message: EmailMessage): Promise<void> {
  try {
    await emailSender.send(message);
  } catch {
    // Swallowed on purpose; see above.
  }
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

function parseTrustedOrigins(value: string | undefined): string[] {
  if (!value) {
    return [];
  }

  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

export function createAuthInstance() {
  // getServerAuthConfig falls back to "development-secret"; that fallback
  // must never sign production tokens.
  if (process.env.NODE_ENV === "production" && !process.env.BETTER_AUTH_SECRET) {
    throw new Error("BETTER_AUTH_SECRET must be set in production");
  }

  const config = getServerAuthConfig();

  return betterAuth({
    baseURL: config.baseUrl,
    secret: config.secret,
    // Browser clients live on separate origins (Vite dev server, deployed
    // web app); better-auth's origin check rejects state-changing requests
    // from origins outside this list.
    trustedOrigins: parseTrustedOrigins(process.env.API_CORS_ORIGINS),
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
      // Custom scrypt hooks preserve every stored hash produced by the
      // previous custom auth implementation (scrypt$N$r$p$salt$hash and
      // legacy unsalted sha256 hex).
      password: {
        hash: hashPassword,
        verify: ({ hash, password }) => verifyPassword(password, hash)
      },
      sendResetPassword: async ({ user, url, token }) => {
        // The raw token rides along for dev visibility with the console
        // adapter; real adapters simply deliver the message as-is.
        await sendAuthEmail({
          to: user.email,
          subject: "Reset your password",
          text: `Reset your password: ${url}\n\nReset token: ${token}`
        });
      },
      resetPasswordTokenExpiresIn: AUTH_DEFINITIONS.PASSWORD_RESET_MAX_AGE_SECONDS
      // Soft verification (ADR 0007): requireEmailVerification stays unset so
      // login is never gated on a verified email.
    },
    emailVerification: {
      sendVerificationEmail: async ({ user, url, token }) => {
        await sendAuthEmail({
          to: user.email,
          subject: "Verify your email address",
          text: `Verify your email address: ${url}\n\nVerification token: ${token}`
        });
      },
      // Soft verification (ADR 0007): verification emails go out on signup
      // only when AUTH_REQUIRE_EMAIL_VERIFICATION=true; the flag never blocks
      // login either way.
      sendOnSignUp: config.requireEmailVerification,
      expiresIn: AUTH_DEFINITIONS.EMAIL_VERIFICATION_MAX_AGE_SECONDS
    },
    session: {
      expiresIn: AUTH_DEFINITIONS.SESSION_MAX_AGE_SECONDS,
      updateAge: AUTH_DEFINITIONS.SESSION_UPDATE_AGE_SECONDS
    },
    // Rate limiting for /api/auth and /graphql is handled by our own API
    // middleware, so better-auth's built-in limiter stays off.
    rateLimit: { enabled: false },
    advanced: {
      cookiePrefix: "kaine",
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
        sendInvitationEmail: async (data) => {
          await sendAuthEmail({
            to: data.email,
            subject: `You have been invited to ${data.organization.name}`,
            text: `You were invited to join ${data.organization.name} as ${data.role}. Sign in with this email address and accept invitation ${data.id}.`
          });
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
      bearer()
    ]
  });
}

export const auth = createAuthInstance();

export type AuthInstance = ReturnType<typeof createAuthInstance>;
