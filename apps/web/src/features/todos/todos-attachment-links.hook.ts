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
  open: boolean
): Record<string, AttachmentLinks> {
  const query = useGetTodoAttachmentLinksQuery({ todoId }, { enabled: open });
  return Object.fromEntries(
    (query.data?.files.items ?? []).map(({ id, downloadUrl, thumbnailUrl }) => [
      id,
      { downloadUrl: downloadUrl ?? null, thumbnailUrl: thumbnailUrl ?? null }
    ])
  );
}
