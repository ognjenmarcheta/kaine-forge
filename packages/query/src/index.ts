export interface TodoListParams {
  limit: number;
  offset: number;
}

export const queryKeys = {
  session: () => ["auth", "session"] as const,
  organizations: () => ["organizations"] as const,
  organizationMembers: (organizationId: string) =>
    ["organizations", "members", organizationId] as const,
  todos: (organizationId: string, params: TodoListParams) =>
    ["todos", organizationId, params] as const
};

interface InvalidateQueriesApi {
  invalidateQueries: (input: { queryKey: readonly unknown[] }) => Promise<unknown>;
}

export async function invalidateOrgScopedQueries(queryClient: InvalidateQueriesApi): Promise<void> {
  await queryClient.invalidateQueries({
    queryKey: ["todos"]
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
    queryKey: ["todos"]
  });
}
