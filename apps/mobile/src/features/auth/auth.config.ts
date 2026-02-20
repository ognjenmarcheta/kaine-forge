const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:4000";

export const AUTH_CONFIG = {
  baseUrl: API_BASE_URL,
  routes: {
    login: `${API_BASE_URL}/api/auth/sign-in/email`,
    logout: `${API_BASE_URL}/api/auth/sign-out`,
    session: `${API_BASE_URL}/api/auth/get-session`,
    signup: `${API_BASE_URL}/api/auth/sign-up/email`,
    organizationList: `${API_BASE_URL}/api/auth/organization/list`,
    setActiveOrganization: `${API_BASE_URL}/api/auth/organization/set-active`,
    createOrganization: `${API_BASE_URL}/api/auth/organization/create`
  }
} as const;
