export const AUTH_CONFIG = {
  basePath: "/api/auth",
  routes: {
    login: "/api/auth/login",
    logout: "/api/auth/logout",
    session: "/api/auth/session"
  }
} as const;
