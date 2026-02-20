export const queryKeys = {
  session: () => ["auth", "session"] as const,
  organizations: () => ["organizations"] as const,
  organizationMembers: (organizationId: string) =>
    ["organizations", "members", organizationId] as const
};

interface InvalidateQueriesApi {
  invalidateQueries: (input: { queryKey: readonly unknown[] }) => Promise<unknown>;
}

export async function invalidateOrgScopedQueries(queryClient: InvalidateQueriesApi): Promise<void> {
  await queryClient.invalidateQueries({
    queryKey: ["GetTodos"]
  });
  await queryClient.invalidateQueries({
    queryKey: ["GetMobileTodos"]
  });
  await queryClient.invalidateQueries({
    queryKey: ["organizations", "members"]
  });
}

interface RemoveQueriesApi {
  removeQueries: (input: { queryKey: readonly unknown[] }) => void;
}

export function resetAuthBoundQueries(queryClient: RemoveQueriesApi): void {
  queryClient.removeQueries({
    queryKey: queryKeys.session()
  });
  queryClient.removeQueries({
    queryKey: queryKeys.organizations()
  });
  queryClient.removeQueries({
    queryKey: ["GetTodos"]
  });
  queryClient.removeQueries({
    queryKey: ["GetMobileTodos"]
  });
}
