import { publicAssetKeyFromUrl, type PublicAssetConfig } from "@repo/storage";

import { PUBLIC_ASSET_CONFIG, type PublicAssetKind } from "./public-assets.definition";

/** The key a new `kind` asset of `ownerId` (a user or an Organization) is published under. */
export function publicAssetKey(kind: PublicAssetKind, ownerId: string, name: string): string {
  return `${PUBLIC_ASSET_CONFIG.kinds[kind].prefix}/${ownerId}/${name}.webp`;
}

/**
 * The key of `url` when it is a `kind` asset published for `ownerId`, or null.
 * A stored URL can name any object in the public bucket, so a delete that
 * follows one must never reach another owner's asset. S3 keys are literal
 * strings ("../" is not resolved), so the owner prefix is enough.
 */
export function ownedPublicAssetKey(
  storage: PublicAssetConfig,
  kind: PublicAssetKind,
  ownerId: string,
  url: string
): string | null {
  const key = publicAssetKeyFromUrl(storage.baseUrl, url);

  return key?.startsWith(`${PUBLIC_ASSET_CONFIG.kinds[kind].prefix}/${ownerId}/`) ? key : null;
}
