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

interface ActiveOrganizationLifecycleInput<TSession extends ActiveOrganizationSession> {
  isOrganizationUiVisible: () => boolean;
  persistActiveOrganizationId: (organizationId: string | null) => Promise<void> | void;
  queryClient: InvalidateQueriesApi & SetQueryDataApi;
  readActiveOrganizationId: () => Promise<string | null> | string | null;
  setActiveOrganization: (organizationId: string) => Promise<TSession>;
}

interface SyncActiveOrganizationInput<TSession extends ActiveOrganizationSession> {
  fallbackOrganizationId?: string | null;
  organizations: ActiveOrganizationOption[];
  session: TSession | null;
}

const registeredOrgScopedQueryKeys = new Map<string, readonly unknown[]>();
const defaultOrgScopedQueryRegistry = createOrgScopedQueryRegistry();

function serializeQueryKey(queryKey: readonly unknown[]): string {
  return JSON.stringify(queryKey);
}

export interface OrgScopedQueryRegistry {
  getOperationKeys: () => readonly (readonly unknown[])[];
  invalidateOrgScopedQueries: (queryClient: InvalidateQueriesApi) => Promise<void>;
  registerOperation: (operationName: string, queryKey: readonly unknown[]) => void;
  removeAuthBoundQueries: (queryClient: RemoveQueriesApi) => void;
}

export function createOrgScopedQueryRegistry(): OrgScopedQueryRegistry {
  const operationKeys = new Map<string, readonly unknown[]>();

  function getOperationKeys(): readonly (readonly unknown[])[] {
    return [...operationKeys.values()];
  }

  return {
    getOperationKeys,
    async invalidateOrgScopedQueries(queryClient) {
      for (const queryKey of getOperationKeys()) {
        await queryClient.invalidateQueries({
          queryKey
        });
      }
    },
    registerOperation(operationName, queryKey) {
      operationKeys.set(operationName, queryKey);
    },
    removeAuthBoundQueries(queryClient) {
      queryClient.removeQueries({
        queryKey: queryKeys.session()
      });
      queryClient.removeQueries({
        queryKey: queryKeys.organizations()
      });
      for (const queryKey of getOperationKeys()) {
        queryClient.removeQueries({
          queryKey
        });
      }
    }
  };
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

export function registerOrgScopedOperationKey(
  operationName: string,
  queryKey: readonly unknown[]
): void {
  defaultOrgScopedQueryRegistry.registerOperation(operationName, queryKey);
}

export function clearOrgScopedQueryKeys(): void {
  registeredOrgScopedQueryKeys.clear();
}

export function getOrgScopedQueryKeys(): readonly (readonly unknown[])[] {
  return [
    queryKeys.organizationMembersScope(),
    ...registeredOrgScopedQueryKeys.values(),
    ...defaultOrgScopedQueryRegistry.getOperationKeys()
  ];
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

export function createActiveOrganizationLifecycle<TSession extends ActiveOrganizationSession>(
  input: ActiveOrganizationLifecycleInput<TSession>
) {
  return {
    async sync(syncInput: SyncActiveOrganizationInput<TSession>): Promise<string | null> {
      const session = syncInput.session;

      if (!session) {
        await input.persistActiveOrganizationId(null);
        return null;
      }

      const rememberedOrganizationId = input.isOrganizationUiVisible()
        ? await input.readActiveOrganizationId()
        : null;
      const preferredOrganizationId = resolvePreferredActiveOrganizationId({
        fallbackOrganizationId: syncInput.fallbackOrganizationId ?? session.activeOrganizationId,
        organizations: syncInput.organizations,
        rememberedOrganizationId
      });

      if (!preferredOrganizationId) {
        await input.persistActiveOrganizationId(null);
        return null;
      }

      if (preferredOrganizationId !== session.activeOrganizationId) {
        const nextSession = await input.setActiveOrganization(preferredOrganizationId);
        await applyActiveOrganizationSession({
          queryClient: input.queryClient,
          session: nextSession,
          persistActiveOrganizationId: input.persistActiveOrganizationId
        });
        return nextSession.activeOrganizationId;
      }

      await input.persistActiveOrganizationId(preferredOrganizationId);
      return preferredOrganizationId;
    }
  };
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
