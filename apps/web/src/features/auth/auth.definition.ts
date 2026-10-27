export const AUTH_DEFINITION = {
  storageKey: "kaine.auth.session",
  tokenStorageKey: "kaine.auth.session-token",
  // Search parameter on /auth that names the page to open after sign-in.
  returnPathParam: "redirect",
  // Search parameter on /auth that a used or expired magic link returns with.
  magicLinkErrorParam: "magicLinkError",
  defaultReturnPath: "/dashboard"
} as const;
