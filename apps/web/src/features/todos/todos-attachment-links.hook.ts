import { useGetTodoAttachmentLinksQuery } from "../../graphql/generated/react-query";

export interface AttachmentLinks {
  downloadUrl: string | null;
  thumbnailUrl: string | null;
}

/**
 * Signed links of a Todo's Attachments, by file id, read while `open`. The
 * links expire, so sync never stores them; offline the query waits.
 */
export function useTodoAttachmentLinks(
  todoId: string,
  attachmentIds: readonly string[],
  open: boolean
): Record<string, AttachmentLinks> {
  // Keyed by the Attachment ids too: a synced upload or removal reads fresh links.
  const query = useGetTodoAttachmentLinksQuery(
    { todoId },
    {
      enabled: open,
      queryKey: [...useGetTodoAttachmentLinksQuery.getKey({ todoId }), [...attachmentIds].sort()]
    }
  );
  return Object.fromEntries(
    (query.data?.files.items ?? []).map(({ id, downloadUrl, thumbnailUrl }) => [
      id,
      { downloadUrl: downloadUrl ?? null, thumbnailUrl: thumbnailUrl ?? null }
    ])
  );
}
