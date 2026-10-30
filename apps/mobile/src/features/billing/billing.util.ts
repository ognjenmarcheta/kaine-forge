import { ClientError } from "graphql-request";

/** Whether the API refused a create because the Plan's limit is reached. */
export function isPlanLimitError(error: unknown): boolean {
  return (
    error instanceof ClientError &&
    (error.response.errors ?? []).some(
      (graphqlError) => graphqlError.extensions?.["code"] === "PLAN_LIMIT_REACHED"
    )
  );
}
