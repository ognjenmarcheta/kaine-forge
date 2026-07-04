// better-auth serves /api/auth/*; these constants name the subset of its
// routes our clients use (core email/password + organization plugin paths,
// read from the installed better-auth 1.6.23 route tables).
export const AUTH_ROUTES = {
  GET_SESSION: "/api/auth/get-session",
  SIGN_IN_EMAIL: "/api/auth/sign-in/email",
  SIGN_UP_EMAIL: "/api/auth/sign-up/email",
  SIGN_OUT: "/api/auth/sign-out",
  REQUEST_PASSWORD_RESET: "/api/auth/request-password-reset",
  RESET_PASSWORD: "/api/auth/reset-password",
  VERIFY_EMAIL: "/api/auth/verify-email",
  SEND_VERIFICATION_EMAIL: "/api/auth/send-verification-email",
  ORGANIZATION_LIST: "/api/auth/organization/list",
  ORGANIZATION_CREATE: "/api/auth/organization/create",
  ORGANIZATION_SET_ACTIVE: "/api/auth/organization/set-active",
  ORGANIZATION_LIST_MEMBERS: "/api/auth/organization/list-members",
  ORGANIZATION_INVITE_MEMBER: "/api/auth/organization/invite-member",
  ORGANIZATION_ACCEPT_INVITATION: "/api/auth/organization/accept-invitation",
  ORGANIZATION_CANCEL_INVITATION: "/api/auth/organization/cancel-invitation",
  ORGANIZATION_LIST_INVITATIONS: "/api/auth/organization/list-invitations"
} as const;
