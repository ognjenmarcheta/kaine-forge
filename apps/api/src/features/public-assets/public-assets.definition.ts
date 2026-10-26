export const PUBLIC_ASSET_KINDS = ["avatar", "organization_logo"] as const;

export type PublicAssetKind = (typeof PUBLIC_ASSET_KINDS)[number];

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
