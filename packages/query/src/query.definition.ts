export const queryKeys = {
  session: () => ["auth", "session"] as const,
  organizations: () => ["organizations"] as const,
  organizationMembers: (organizationId: string) =>
    ["organizations", "members", organizationId] as const
};
