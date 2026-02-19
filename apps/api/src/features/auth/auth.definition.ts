export const AUTH_ROUTES = {
  GET_SESSION: "/api/auth/get-session",
  SIGN_IN_EMAIL: "/api/auth/sign-in/email",
  SIGN_UP_EMAIL: "/api/auth/sign-up/email",
  SIGN_OUT: "/api/auth/sign-out",
  ORGANIZATION_LIST: "/api/auth/organization/list",
  ORGANIZATION_CREATE: "/api/auth/organization/create",
  ORGANIZATION_SET_ACTIVE: "/api/auth/organization/set-active",
  ORGANIZATION_GET_MEMBERS: "/api/auth/organization/get-members"
} as const;
