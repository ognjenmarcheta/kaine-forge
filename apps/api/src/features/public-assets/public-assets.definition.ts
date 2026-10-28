import { COMMON_MIME_TYPES } from "@repo/storage";

export const PUBLIC_ASSET_KINDS = ["avatar", "organization_logo"] as const;

/**
 * Upload types for avatars and logos. AVIF is accepted here, not for Attachments:
 * a Public Asset is always re-encoded to WebP, so AVIF is only ever decoded.
 */
export const PUBLIC_ASSET_MIME_TYPES: readonly string[] = [
  ...COMMON_MIME_TYPES.images,
  "image/avif"
];

export type PublicAssetKind = (typeof PUBLIC_ASSET_KINDS)[number];

/** GraphQL error code of an upload to a deployment without a public bucket. */
export const PUBLIC_ASSETS_NOT_CONFIGURED = "PUBLIC_ASSETS_NOT_CONFIGURED";

export const PUBLIC_ASSET_CONFIG = {
  /** Square WebP size and public key prefix of each kind. */
  kinds: {
    avatar: { size: 256, prefix: "avatars" },
    organization_logo: { size: 512, prefix: "organization-logos" }
  },
  /** Uploads land here in the private bucket until confirm publishes them; the sweep clears leftovers. */
  stagingPrefix: "staging/",
  /** Every published key is new, so a CDN can cache it forever. */
  cacheControl: "public, max-age=31536000, immutable"
} as const satisfies {
  kinds: Record<PublicAssetKind, { size: number; prefix: string }>;
  stagingPrefix: string;
  cacheControl: string;
};
