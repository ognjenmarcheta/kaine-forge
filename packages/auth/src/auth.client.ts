import { getClientAuthConfig } from "./auth.config";
import { createAuthTransport } from "./auth.transport";
import type { ClientAuth } from "./auth.type";

export function createClientAuth(): ClientAuth {
  const config = getClientAuthConfig();
  const transport = createAuthTransport({
    adapter: {
      baseUrl: config.baseUrl,
      credentials: "include",
      fetch: (input, init) => fetch(input, init),
      getSessionToken: () => null,
      setSessionToken: () => undefined
    }
  });

  return {
    createOrganization: transport.createOrganization,
    getSession: transport.getSession,
    listOrganizations: transport.listOrganizations,
    loginWithPassword: transport.loginWithPassword,
    logout: transport.logout,
    setActiveOrganization: transport.setActiveOrganization,
    signInWithSocial: transport.signInWithSocial,
    signupWithPassword: transport.signupWithPassword
  };
}
