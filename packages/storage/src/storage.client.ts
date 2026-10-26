import {
  DeleteObjectCommand,
  HeadObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import type { StorageConfig, PresignedUploadResult, PresignedDownloadResult } from "./storage.type";

export function createStorageClient(config: StorageConfig): S3Client {
  return new S3Client({
    endpoint: config.endpoint,
    region: config.region,
    credentials: {
      accessKeyId: config.accessKey,
      secretAccessKey: config.secretKey
    },
    forcePathStyle: config.forcePathStyle,
    // The default adds a checksum of the (empty) presign-time body to every
    // presigned PUT, so S3 rejects the real upload as a checksum mismatch.
    requestChecksumCalculation: "WHEN_REQUIRED"
  });
}

export async function generatePresignedUploadUrl(
  client: S3Client,
  bucket: string,
  key: string,
  contentType: string,
  contentLength: number,
  expiresIn: number
): Promise<PresignedUploadResult> {
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    ContentType: contentType,
    ContentLength: contentLength
  });

  // Signing both headers makes the store reject a body of any other type or size.
  const url = await getSignedUrl(client, command, {
    expiresIn,
    signableHeaders: new Set(["content-type", "content-length"])
  });

  return { url, key, expiresIn };
}

export async function generatePresignedDownloadUrl(
  client: S3Client,
  bucket: string,
  key: string,
  expiresIn: number,
  options: { contentDisposition?: string } = {}
): Promise<PresignedDownloadResult> {
  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: key,
    ResponseContentDisposition: options.contentDisposition
  });

  const url = await getSignedUrl(client, command, { expiresIn });

  return { url, expiresIn };
}

export async function objectExists(
  client: S3Client,
  bucket: string,
  key: string
): Promise<boolean> {
  try {
    await client.send(
      new HeadObjectCommand({
        Bucket: bucket,
        Key: key
      })
    );
    return true;
  } catch {
    return false;
  }
}

export interface ObjectMetadata {
  contentType: string | undefined;
  sizeBytes: number | undefined;
}

export async function headObjectMetadata(
  client: S3Client,
  bucket: string,
  key: string
): Promise<ObjectMetadata | null> {
  try {
    const result = await client.send(
      new HeadObjectCommand({
        Bucket: bucket,
        Key: key
      })
    );

    return {
      contentType: result.ContentType,
      sizeBytes: typeof result.ContentLength === "number" ? result.ContentLength : undefined
    };
  } catch {
    return null;
  }
}

/** The first `bytes` bytes of an object, or null when there is no readable object. */
export async function readObjectPrefix(
  client: S3Client,
  bucket: string,
  key: string,
  bytes: number
): Promise<Uint8Array | null> {
  try {
    const result = await client.send(
      new GetObjectCommand({
        Bucket: bucket,
        Key: key,
        Range: `bytes=0-${bytes - 1}`
      })
    );

    return (await result.Body?.transformToByteArray()) ?? null;
  } catch {
    return null;
  }
}

/** The whole object, or null when there is no readable object. Callers bound its size first. */
export async function getObjectBytes(
  client: S3Client,
  bucket: string,
  key: string
): Promise<Uint8Array | null> {
  try {
    const result = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    return (await result.Body?.transformToByteArray()) ?? null;
  } catch {
    return null;
  }
}

export async function putObject(
  client: S3Client,
  bucket: string,
  key: string,
  body: Uint8Array,
  options: { contentType: string; cacheControl?: string | undefined }
): Promise<void> {
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: options.contentType,
      CacheControl: options.cacheControl
    })
  );
}

/** Keys under `prefix` last modified before `before`, at most `limit` of them. */
export async function listObjectKeysBefore(
  client: S3Client,
  bucket: string,
  prefix: string,
  before: Date,
  limit: number
): Promise<string[]> {
  const keys: string[] = [];
  let continuationToken: string | undefined;

  do {
    const page = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        ContinuationToken: continuationToken
      })
    );

    for (const object of page.Contents ?? []) {
      if (object.Key && object.LastModified && object.LastModified < before) {
        keys.push(object.Key);
      }
    }

    continuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (continuationToken && keys.length < limit);

  return keys.slice(0, limit);
}

export async function deleteObject(
  client: S3Client,
  bucket: string,
  key: string,
  options: { abortSignal?: AbortSignal } = {}
): Promise<void> {
  await client.send(
    new DeleteObjectCommand({
      Bucket: bucket,
      Key: key
    }),
    options
  );
}
