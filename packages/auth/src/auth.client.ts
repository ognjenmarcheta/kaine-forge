import { getClientAuthConfig } from "./auth.config";
import { createAuthTransport } from "./auth.transport";
import type { CreateOrganizationInput, ClientAuth } from "./auth.type";

export function createClientAuth(): ClientAuth {
  const config = getClientAuthConfig();
  const transport = createAuthTransport({
    adapter: {
      baseUrl: config.baseUrl,
      credentials: "include",
      fetch,
      getSessionToken: () => null,
      setSessionToken: () => undefined
    }
  });

  return {
    createOrganization(input: CreateOrganizationInput) {
      return transport.createOrganization(input);
    },
    getSession: transport.getSession,
    listOrganizations: transport.listOrganizations,
    loginWithPassword: transport.loginWithPassword,
    logout: transport.logout,
    setActiveOrganization: transport.setActiveOrganization,
    signupWithPassword: transport.signupWithPassword
  };
}
