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
  status?: string;
  limit?: number;
  offset?: number;
}
