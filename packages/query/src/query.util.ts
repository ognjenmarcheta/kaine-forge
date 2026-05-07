import { queryKeys } from "./query.definition";

interface InvalidateQueriesApi {
  invalidateQueries: (input: { queryKey: readonly unknown[] }) => Promise<unknown>;
}

interface SetQueryDataApi {
  setQueryData: (queryKey: readonly unknown[], value: unknown) => void;
}

interface ActiveOrganizationOption {
  id: string;
}

interface ResolvePreferredActiveOrganizationIdInput {
  fallbackOrganizationId: string | null;
  organizations: ActiveOrganizationOption[];
  rememberedOrganizationId: string | null;
}

interface ActiveOrganizationSession {
  activeOrganizationId: string | null;
}

interface ApplyActiveOrganizationSessionInput<TSession extends ActiveOrganizationSession> {
  queryClient: InvalidateQueriesApi & SetQueryDataApi;
  session: TSession;
  persistActiveOrganizationId: (organizationId: string | null) => Promise<void> | void;
}

interface ApplyCreatedOrganizationSessionInput<
  TSession extends ActiveOrganizationSession
> extends ApplyActiveOrganizationSessionInput<TSession> {
  invalidateOrganizations?: boolean;
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

export function resolvePreferredActiveOrganizationId(
  input: ResolvePreferredActiveOrganizationIdInput
): string | null {
  if (input.organizations.length === 0) {
    return input.fallbackOrganizationId;
  }

  if (input.rememberedOrganizationId) {
    const remembered = input.organizations.find(
      (organization) => organization.id === input.rememberedOrganizationId
    );

    if (remembered) {
      return remembered.id;
    }
  }

  return input.organizations[0]?.id ?? input.fallbackOrganizationId;
}

export async function applyActiveOrganizationSession<TSession extends ActiveOrganizationSession>(
  input: ApplyActiveOrganizationSessionInput<TSession>
): Promise<void> {
  input.queryClient.setQueryData(queryKeys.session(), input.session);
  await input.persistActiveOrganizationId(input.session.activeOrganizationId);
  await invalidateOrgScopedQueries(input.queryClient);
}

export async function applyCreatedOrganizationSession<TSession extends ActiveOrganizationSession>(
  input: ApplyCreatedOrganizationSessionInput<TSession>
): Promise<void> {
  await applyActiveOrganizationSession(input);

  if (input.invalidateOrganizations ?? true) {
    await input.queryClient.invalidateQueries({
      queryKey: queryKeys.organizations()
    });
  }
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
