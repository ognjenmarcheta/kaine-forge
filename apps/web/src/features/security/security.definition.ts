export const SECURITY_DEFINITION = {
  // The session user's own data; it does not depend on the Active Organization.
  queryKeys: {
    passkeys: ["security", "passkeys"]
  },
  // A label the user reads in their own list.
  passkeyNameMaxLength: 64
} as const;
