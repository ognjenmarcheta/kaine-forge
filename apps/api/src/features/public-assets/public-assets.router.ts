import type { PublicAssetKind } from "./public-assets.definition";
import type { ApiContext } from "../../context";

type ResolverContext = ApiContext;

type RequestPublicAssetUploadArgs = {
  input: { kind: PublicAssetKind; mimeType: string; sizeBytes: number };
};
type ConfirmPublicAssetUploadArgs = { kind: PublicAssetKind; stagingKey: string };

export const publicAssetsResolvers = {
  Query: {
    async publicAssets(_parent: unknown, _args: unknown, ctx: ResolverContext) {
      return ctx.publicAssets.current();
    }
  },
  Mutation: {
    async requestPublicAssetUpload(
      _parent: unknown,
      args: RequestPublicAssetUploadArgs,
      ctx: ResolverContext
    ) {
      return ctx.publicAssets.request(args.input);
    },
    async confirmPublicAssetUpload(
      _parent: unknown,
      args: ConfirmPublicAssetUploadArgs,
      ctx: ResolverContext
    ) {
      return ctx.publicAssets.confirm(args.kind, args.stagingKey);
    }
  }
};
