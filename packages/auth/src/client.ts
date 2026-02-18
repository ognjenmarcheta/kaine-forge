import { getClientAuthConfig } from "./auth.config";

export function createClientAuth() {
  const config = getClientAuthConfig();

  return {
    kind: "client-auth",
    config
  } as const;
}
