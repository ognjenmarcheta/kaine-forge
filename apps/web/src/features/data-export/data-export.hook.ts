import { createActiveOrganizationQueryKey } from "@repo/query";
import { useQueryClient } from "@tanstack/react-query";
import { ClientError } from "graphql-request";

import { DATA_EXPORT_CONFIG } from "./data-export.config";
import {
  useDataExportDownloadUrlMutation,
  useDataExportsQuery,
  useRequestDataExportMutation,
  type DataExportKind,
  type DataExportsQuery,
  type DataExportStatus
} from "../../graphql/generated/react-query";

const IN_PROGRESS: readonly DataExportStatus[] = ["pending", "running"];

export function isExportInProgress(status: DataExportStatus): boolean {
  return IN_PROGRESS.includes(status);
}

/** True when the API refused a request because an export of that kind is still running. */
export function isExportAlreadyInProgress(error: unknown): boolean {
  return (
    error instanceof ClientError &&
    (error.response.errors ?? []).some(
      (graphqlError) => graphqlError.extensions?.["code"] === "DATA_EXPORT_IN_PROGRESS"
    )
  );
}

// The fetcher casts the response without checking it, so a response without
// the list fails this query instead of throwing while the section renders.
function hasItems(value: unknown): boolean {
  return (
    typeof value === "object" && value !== null && "items" in value && Array.isArray(value.items)
  );
}

function exportItems(data: DataExportsQuery) {
  if (!hasItems(data.dataExports)) {
    throw new Error("data exports response is incomplete");
  }

  return data.dataExports.items;
}

/**
 * The caller's exports of one kind, refreshed while one is in progress, and
 * the request and download actions. An Organization list is keyed by the
 * Active Organization; the API takes the Organization from the session.
 */
export function useDataExports(kind: DataExportKind, organizationId: string | null) {
  const queryClient = useQueryClient();
  const variables = { kind, first: DATA_EXPORT_CONFIG.pageSize };
  const queryKey =
    kind === "organization"
      ? createActiveOrganizationQueryKey(useDataExportsQuery.getKey(variables), organizationId)
      : useDataExportsQuery.getKey(variables);
  const exports = useDataExportsQuery(variables, {
    queryKey,
    select: exportItems,
    refetchInterval: ({ state: { data } }) =>
      data &&
      hasItems(data.dataExports) &&
      data.dataExports.items.some((item) => isExportInProgress(item.status))
        ? DATA_EXPORT_CONFIG.pollIntervalMs
        : false
  });
  const request = useRequestDataExportMutation({
    onSettled: () => queryClient.invalidateQueries({ queryKey })
  });
  const download = useDataExportDownloadUrlMutation({
    onSuccess: ({ dataExportDownloadUrl }) => window.location.assign(dataExportDownloadUrl)
  });

  return { exports, request, download };
}
