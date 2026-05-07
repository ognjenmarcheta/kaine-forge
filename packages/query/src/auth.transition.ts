import { queryKeys } from "./query.definition";
import type { QueryRuntime } from "./query.util";

type MaybePromise<T> = Promise<T> | T;

interface QueryClientApi {
  invalidateQueries: (input: { queryKey: readonly unknown[] }) => Promise<unknown>;
  removeQueries: (input: { queryKey: readonly unknown[] }) => void;
  setQueryData: (queryKey: readonly unknown[], value: unknown) => void;
}

export interface ClientAuthTransitionInput<TLoginInput, TSignupInput, TSession> {
  disposeSubscriptions?: (() => MaybePromise<void>) | undefined;
  loginWithPassword: (input: TLoginInput) => Promise<TSession>;
  logout: () => Promise<void>;
  queryClient: QueryClientApi;
  queryRuntime: QueryRuntime;
  signupWithPassword: (input: TSignupInput) => Promise<TSession>;
}

export interface ClientAuthTransition<TLoginInput, TSignupInput, TSession> {
  login: (input: TLoginInput) => Promise<TSession>;
  logout: () => Promise<void>;
  signup: (input: TSignupInput) => Promise<TSession>;
}

export function createClientAuthTransition<TLoginInput, TSignupInput, TSession>(
  input: ClientAuthTransitionInput<TLoginInput, TSignupInput, TSession>
): ClientAuthTransition<TLoginInput, TSignupInput, TSession> {
  async function applyAuthenticatedSession(session: TSession): Promise<TSession> {
    input.queryClient.setQueryData(queryKeys.session(), session);
    await input.queryClient.invalidateQueries({
      queryKey: queryKeys.organizations()
    });
    return session;
  }

  return {
    async login(loginInput) {
      return applyAuthenticatedSession(await input.loginWithPassword(loginInput));
    },
    async signup(signupInput) {
      return applyAuthenticatedSession(await input.signupWithPassword(signupInput));
    },
    async logout() {
      await input.logout();
      await input.disposeSubscriptions?.();
      input.queryRuntime.resetAuthBoundQueries(input.queryClient);
      input.queryClient.setQueryData(queryKeys.session(), null);
    }
  };
}
