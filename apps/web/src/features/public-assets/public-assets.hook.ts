import { createActiveOrganizationQueryKey } from "@repo/query";
import { createBrowserUploadTransfer } from "@repo/storage/client";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import {
  useConfirmPublicAssetUploadMutation,
  useGetPublicAssetsQuery,
  useRequestPublicAssetUploadMutation,
  type PublicAssetKind
} from "../../graphql/generated/react-query";
import { useOrganization } from "../../hooks/use-organization";

/** The session user's avatar URL and the Active Organization's logo URL. */
export function usePublicAssets() {
  const { activeOrganizationId } = useOrganization();
  const queryKey = createActiveOrganizationQueryKey(
    useGetPublicAssetsQuery.getKey(),
    activeOrganizationId
  );
  const query = useGetPublicAssetsQuery(undefined, {
    enabled: Boolean(activeOrganizationId),
    queryKey
  });

  return { assets: query.data?.publicAssets ?? null, queryKey };
}

/** Uploads one image as a Public Asset of `kind`: request, direct PUT, confirm. */
export function usePublicAssetUpload(kind: PublicAssetKind) {
  const queryClient = useQueryClient();
  const { queryKey } = usePublicAssets();
  const request = useRequestPublicAssetUploadMutation({ retry: false });
  const confirm = useConfirmPublicAssetUploadMutation({ retry: false });
  const [state, setState] = useState<{ progress: number | null; failed: boolean }>({
    progress: null,
    failed: false
  });

  async function upload(file: File) {
    setState({ progress: 0, failed: false });

    try {
      const mimeType = file.type || "application/octet-stream";
      const { requestPublicAssetUpload: ticket } = await request.mutateAsync({
        input: { kind, mimeType, sizeBytes: file.size }
      });
      await createBrowserUploadTransfer({
        file,
        mimeType,
        uploadUrl: ticket.uploadUrl,
        onProgress: (progress) => setState({ progress, failed: false })
      }).promise;
      const { confirmPublicAssetUpload: assets } = await confirm.mutateAsync({
        kind,
        stagingKey: ticket.stagingKey
      });
      queryClient.setQueryData(queryKey, { publicAssets: assets });
      setState({ progress: null, failed: false });
    } catch {
      setState({ progress: null, failed: true });
    }
  }

  return { ...state, upload };
}
