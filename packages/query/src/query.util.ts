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

const registeredOrgScopedQueryKeys = new Map<string, readonly unknown[]>();

function serializeQueryKey(queryKey: readonly unknown[]): string {
  return JSON.stringify(queryKey);
}

export function createActiveOrganizationQueryKey(
  queryKey: readonly unknown[],
  activeOrganizationId: string | null
): readonly unknown[] {
  return [...queryKey, activeOrganizationId ?? "inactive"];
}

export function registerOrgScopedQueryKey(queryKey: readonly unknown[]): void {
  registeredOrgScopedQueryKeys.set(serializeQueryKey(queryKey), queryKey);
}

export function clearOrgScopedQueryKeys(): void {
  registeredOrgScopedQueryKeys.clear();
}

export function getOrgScopedQueryKeys(): readonly (readonly unknown[])[] {
  return [queryKeys.organizationMembersScope(), ...registeredOrgScopedQueryKeys.values()];
}

export async function invalidateOrgScopedQueries(queryClient: InvalidateQueriesApi): Promise<void> {
  for (const queryKey of getOrgScopedQueryKeys()) {
    await queryClient.invalidateQueries({
      queryKey
    });
  }
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
  for (const queryKey of getOrgScopedQueryKeys()) {
    queryClient.removeQueries({
      queryKey
    });
  }
}
