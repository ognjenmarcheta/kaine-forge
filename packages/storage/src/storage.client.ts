import {
  DeleteObjectCommand,
  HeadObjectCommand,
  GetObjectCommand,
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
    forcePathStyle: config.forcePathStyle
  });
}

export async function generatePresignedUploadUrl(
  client: S3Client,
  bucket: string,
  key: string,
  contentType: string,
  expiresIn: number
): Promise<PresignedUploadResult> {
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    ContentType: contentType
  });

  const url = await getSignedUrl(client, command, { expiresIn });

  return { url, key, expiresIn };
}

export async function generatePresignedDownloadUrl(
  client: S3Client,
  bucket: string,
  key: string,
  expiresIn: number
): Promise<PresignedDownloadResult> {
  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: key
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

export async function deleteObject(client: S3Client, bucket: string, key: string): Promise<void> {
  await client.send(
    new DeleteObjectCommand({
      Bucket: bucket,
      Key: key
    })
  );
}
