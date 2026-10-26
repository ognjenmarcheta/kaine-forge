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
import { createEmailSender, type EmailMessage } from "@repo/email";
import type { BetterAuthPlugin } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
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

import { assertProductionAuthSecret, getServerAuthConfig } from "./auth.config";
import { AUTH_DEFINITIONS } from "./auth.definition";
import { AUTH_PASSWORD_MIN_LENGTH } from "./auth.form";
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
  invitations: invitationsTable,
  twoFactors: twoFactorsTable
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

// Codes are short-lived secrets; the send is not awaited so response timing
// does not reveal whether an account exists (better-auth email OTP guidance).
function sendAuthEmailInBackground(message: EmailMessage): void {
  void sendAuthEmail(message);
}

type EmailOtpType = "sign-in" | "email-verification" | "forget-password" | "change-email";

const EMAIL_OTP_SUBJECTS: Record<EmailOtpType, string> = {
  "sign-in": "Your sign-in code",
  "email-verification": "Your email verification code",
  "forget-password": "Your password reset code",
  "change-email": "Your email change code"
};

function buildEmailOtpMessage(input: {
  email: string;
  otp: string;
  type: EmailOtpType;
}): EmailMessage {
  const minutes = String(AUTH_DEFINITIONS.EMAIL_OTP_MAX_AGE_SECONDS / 60);

  return {
    to: input.email,
    subject: EMAIL_OTP_SUBJECTS[input.type],
    text: `Your code is ${input.otp}. It expires in ${minutes} minutes. If you did not request it, ignore this email.`
  };
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
      bearer(),
      // Second factor for password sign-in only; email OTP and social sign-in
      // are not challenged (better-auth default, ADR 0015).
      twoFactor({
        issuer: AUTH_DEFINITIONS.TWO_FACTOR_ISSUER,
        otpOptions: {
          sendOTP: ({ user, otp }) => {
            sendAuthEmailInBackground({
              to: user.email,
              subject: "Your sign-in verification code",
              text: `Your verification code is ${otp}. If you did not try to sign in, change your password.`
            });
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
        sendVerificationOTP: async ({ email, otp, type }) => {
          sendAuthEmailInBackground(buildEmailOtpMessage({ email, otp, type }));
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
