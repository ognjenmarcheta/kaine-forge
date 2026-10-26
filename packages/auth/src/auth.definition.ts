export const AUTH_DEFINITIONS = {
  SESSION_MAX_AGE_SECONDS: 60 * 60 * 24 * 7,
  SESSION_UPDATE_AGE_SECONDS: 60 * 60 * 24,
  INVITATION_MAX_AGE_SECONDS: 60 * 60 * 24 * 7,
  PASSWORD_RESET_MAX_AGE_SECONDS: 60 * 60,
  EMAIL_VERIFICATION_MAX_AGE_SECONDS: 60 * 60 * 24,
  // Signed session cookie that skips the database session read; a revoked
  // session stays valid on cookie clients for at most this long (ADR 0015).
  SESSION_COOKIE_CACHE_MAX_AGE_SECONDS: 60 * 5,
  EMAIL_OTP_LENGTH: 6,
  EMAIL_OTP_MAX_AGE_SECONDS: 60 * 5,
  EMAIL_OTP_ALLOWED_ATTEMPTS: 3,
  // Issuer label authenticator apps show next to the TOTP entry.
  TWO_FACTOR_ISSUER: "Kaine Forge"
} as const;
