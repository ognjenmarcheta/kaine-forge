export const AUTH_CONFIG = {
  basePath: "/api/auth",
  routes: {
    login: "/api/auth/sign-in/email",
    logout: "/api/auth/sign-out",
    session: "/api/auth/get-session",
    signup: "/api/auth/sign-up/email",
    organizationList: "/api/auth/organization/list",
    organizationMembers: "/api/auth/organization/get-members",
    setActiveOrganization: "/api/auth/organization/set-active",
    createOrganization: "/api/auth/organization/create"
  }
} as const;
