import { getServerAuthConfig } from "./auth.config";

export function createServerAuth() {
  const config = getServerAuthConfig();

  return {
    kind: "server-auth",
    config
  } as const;
}
