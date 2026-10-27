import { AuthRequestError, getAuthErrorMessageKey } from "@repo/auth/transport";

/** The translated message of a failed account request, with the Organization it names. */
export function getAccountErrorMessage(t: (key: string) => string, error: unknown): string {
  const message = t(getAuthErrorMessageKey(error));

  return error instanceof AuthRequestError && error.organizationName
    ? message.replace("{organization}", error.organizationName)
    : message;
}
