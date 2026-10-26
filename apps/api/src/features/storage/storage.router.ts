import type { FilesFilterInput, RequestUploadInput } from "./storage.type";
import type { ApiContext } from "../../context";

type ResolverContext = ApiContext;

type RequestUploadArgs = { input: RequestUploadInput };
type FileByIdArgs = { id: string };
type FilesArgs = { filter?: FilesFilterInput };
type ConfirmUploadArgs = { fileId: string };
type DeleteFileArgs = { fileId: string };

export const storageResolvers = {
  Query: {
    async file(_parent: unknown, args: FileByIdArgs, ctx: ResolverContext) {
      return ctx.attachments.get(args.id);
    },
    async files(_parent: unknown, args: FilesArgs, ctx: ResolverContext) {
      return ctx.attachments.list(args.filter ?? {});
    }
  },
  Mutation: {
    async requestUploadUrl(_parent: unknown, args: RequestUploadArgs, ctx: ResolverContext) {
      return ctx.attachments.request(args.input);
    },
    async confirmUpload(_parent: unknown, args: ConfirmUploadArgs, ctx: ResolverContext) {
      return ctx.attachments.confirm(args.fileId);
    },
    async deleteFile(_parent: unknown, args: DeleteFileArgs, ctx: ResolverContext) {
      return ctx.attachments.delete(args.fileId);
    }
  },
  FileInfo: {
    async downloadUrl(
      parent: {
        bucket: string;
        key: string;
        mimeType: string;
        originalName: string;
        status: "pending" | "uploaded" | "deleted";
      },
      _args: unknown,
      ctx: ResolverContext
    ) {
      return ctx.attachments.downloadUrl(parent);
    }
  }
};
