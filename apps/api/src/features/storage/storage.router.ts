import { createApiStorageRuntime } from "./storage.runtime";
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
      const scope = ctx.requireOrganizationScope();
      return createApiStorageRuntime(ctx.data, ctx.logger).getFile(scope, args.id);
    },
    async files(_parent: unknown, args: FilesArgs, ctx: ResolverContext) {
      const scope = ctx.requireOrganizationScope();
      return createApiStorageRuntime(ctx.data, ctx.logger).listFiles(scope, args.filter ?? {});
    }
  },
  Mutation: {
    async requestUploadUrl(_parent: unknown, args: RequestUploadArgs, ctx: ResolverContext) {
      const scope = ctx.requireOrganizationScope();
      return createApiStorageRuntime(ctx.data, ctx.logger).requestUploadUrl(scope, args.input);
    },
    async confirmUpload(_parent: unknown, args: ConfirmUploadArgs, ctx: ResolverContext) {
      const scope = ctx.requireOrganizationScope();
      return createApiStorageRuntime(ctx.data, ctx.logger).confirmUpload(scope, args.fileId);
    },
    async deleteFile(_parent: unknown, args: DeleteFileArgs, ctx: ResolverContext) {
      const scope = ctx.requireOrganizationScope();
      return createApiStorageRuntime(ctx.data, ctx.logger).deleteFile(scope, args.fileId);
    }
  },
  FileInfo: {
    async downloadUrl(
      parent: { id: string; status?: string; key: string },
      _args: unknown,
      ctx: ResolverContext
    ) {
      return createApiStorageRuntime(ctx.data).getDownloadUrl(parent);
    }
  }
};
