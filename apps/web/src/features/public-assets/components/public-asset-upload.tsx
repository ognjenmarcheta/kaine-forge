import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  Button,
  SettingsSection,
  resolveNavUserInitials
} from "@repo/ui";
import { useRef } from "react";

import type { PublicAssetKind } from "../../../graphql/generated/react-query";
import { useTranslation } from "../../../hooks/use-translation";
import { usePublicAssets, usePublicAssetUpload } from "../public-assets.hook";

const COPY = {
  avatar: {
    title: "storage.publicAssets.avatar.title",
    description: "storage.publicAssets.avatar.description"
  },
  organization_logo: {
    title: "storage.publicAssets.organizationLogo.title",
    description: "storage.publicAssets.organizationLogo.description"
  }
} as const satisfies Record<PublicAssetKind, { title: string; description: string }>;

/** Shows a Public Asset, or its owner's initials, and replaces it with an image the user picks. */
export function PublicAssetUpload({
  kind,
  ownerName
}: {
  kind: PublicAssetKind;
  ownerName: string;
}) {
  const { t } = useTranslation();
  const input = useRef<HTMLInputElement>(null);
  const { assets } = usePublicAssets();
  const { progress, failed, upload } = usePublicAssetUpload(kind);
  const url = kind === "avatar" ? assets?.avatarUrl : assets?.organizationLogoUrl;
  const title = t(COPY[kind].title);

  return (
    <SettingsSection description={t(COPY[kind].description)} title={title}>
      <div className="flex items-center gap-ds-150">
        <Avatar className="h-ds-600 w-ds-600">
          {url ? <AvatarImage alt={title} src={url} /> : null}
          <AvatarFallback>{resolveNavUserInitials(ownerName)}</AvatarFallback>
        </Avatar>
        {assets?.uploadsEnabled === false ? (
          <p className="text-body text-ds-text-subtle">{t("storage.publicAssets.disabled")}</p>
        ) : (
          <>
            <input
              aria-label={t("storage.publicAssets.choose")}
              accept="image/jpeg,image/png,image/gif,image/webp,image/avif"
              hidden
              ref={input}
              type="file"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void upload(file);
                event.target.value = "";
              }}
            />
            <Button
              appearance="subtle"
              disabled={progress !== null}
              type="button"
              onClick={() => input.current?.click()}
            >
              {progress === null
                ? t("storage.publicAssets.choose")
                : t("storage.publicAssets.uploading")}
            </Button>
          </>
        )}
      </div>
      {failed ? (
        <p role="alert" className="text-body text-ds-text-danger">
          {t("storage.publicAssets.error")}
        </p>
      ) : null}
    </SettingsSection>
  );
}
