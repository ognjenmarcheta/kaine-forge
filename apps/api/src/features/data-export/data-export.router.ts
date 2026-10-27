import type { DataExportKind } from "./data-export.module";
import type { ApiContext } from "../../context";
import type { PageInput } from "../../context.data";

// The DataExportKind enum admits only these values.
interface KindArgs {
  kind: DataExportKind;
}

export const dataExportResolvers = {
  Query: {
    async dataExports(_parent: unknown, args: KindArgs & PageInput, ctx: ApiContext) {
      return ctx.dataExports.list(args.kind, args);
    }
  },
  Mutation: {
    async requestDataExport(_parent: unknown, args: KindArgs, ctx: ApiContext) {
      return ctx.dataExports.request(args.kind);
    },
    async dataExportDownloadUrl(_parent: unknown, args: { id: string }, ctx: ApiContext) {
      return ctx.dataExports.downloadUrl(args.id);
    }
  }
};
