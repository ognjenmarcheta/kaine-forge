import type { AuthSession, ClientAuth, LoginInput, SignupInput } from "./auth.type";

type MaybePromise<T> = Promise<T> | T;

export interface ClientSessionPersistence {
  clearSessionToken?: (() => MaybePromise<void>) | undefined;
  getStoredSession: () => MaybePromise<AuthSession | null>;
  setStoredSession: (session: AuthSession | null) => MaybePromise<void>;
}

export interface CreateClientSessionLifecycleInput {
  auth: ClientAuth;
  fallbackToStoredSession?: boolean | undefined;
  onLogoutError?: ((error: Error) => void) | undefined;
  onRefreshError?: ((error: Error) => void) | undefined;
  persistence: ClientSessionPersistence;
}

export interface ClientSessionLifecycle {
  loginWithPassword(input: LoginInput): Promise<AuthSession>;
  logout(): Promise<void>;
  refreshSession(): Promise<AuthSession | null>;
  signupWithPassword(input: SignupInput): Promise<AuthSession>;
}

function toError(error: unknown, fallbackMessage: string): Error {
  return error instanceof Error ? error : new Error(fallbackMessage);
}

async function persistSession(
  persistence: ClientSessionPersistence,
  session: AuthSession | null
): Promise<void> {
  await persistence.setStoredSession(session);

  if (!session) {
    await persistence.clearSessionToken?.();
  }
}

export function createClientSessionLifecycle(
  input: CreateClientSessionLifecycleInput
): ClientSessionLifecycle {
  return {
    async refreshSession() {
      const storedSession = await input.persistence.getStoredSession();

      try {
        const session = await input.auth.getSession();
        await persistSession(input.persistence, session);
        return session;
      } catch (error) {
        const refreshError = toError(error, "auth session refresh failed");
        input.onRefreshError?.(refreshError);

        if (input.fallbackToStoredSession) {
          return storedSession;
        }

        throw refreshError;
      }
    },
    async loginWithPassword(loginInput) {
      const session = await input.auth.loginWithPassword(loginInput);
      await persistSession(input.persistence, session);
      return session;
    },
    async signupWithPassword(signupInput) {
      const session = await input.auth.signupWithPassword(signupInput);
      await persistSession(input.persistence, session);
      return session;
    },
    async logout() {
      try {
        await input.auth.logout();
      } catch (error) {
        const logoutError = toError(error, "auth logout request failed");

        if (!input.onLogoutError) {
          throw logoutError;
        }

        input.onLogoutError(logoutError);
      } finally {
        await persistSession(input.persistence, null);
      }
    }
  };
}
