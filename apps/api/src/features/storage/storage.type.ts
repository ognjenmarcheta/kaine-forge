export interface RequestUploadInput {
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  entityType?: string;
  entityId?: string;
}

export interface FilesFilterInput {
  entityType?: string;
  entityId?: string;
  // Mirrors the FileStatus enum in storage.schema.ts; GraphQL validates the
  // value against that enum before any resolver runs.
  status?: "pending" | "uploaded" | "deleted";
  limit?: number;
  offset?: number;
}
