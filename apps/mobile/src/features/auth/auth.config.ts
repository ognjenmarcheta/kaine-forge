const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:4000";

export const AUTH_CONFIG = {
  baseUrl: API_BASE_URL,
  routes: {
    login: `${API_BASE_URL}/api/auth/login`,
    logout: `${API_BASE_URL}/api/auth/logout`,
    session: `${API_BASE_URL}/api/auth/session`
  }
} as const;
