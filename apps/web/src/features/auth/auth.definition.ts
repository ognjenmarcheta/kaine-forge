export const AUTH_DEFINITION = {
  storageKey: "kaine.auth.session",
  tokenStorageKey: "kaine.auth.session-token",
  // Search parameter on /auth that names the page to open after sign-in.
  returnPathParam: "redirect",
  defaultReturnPath: "/dashboard"
} as const;
