import { TwoFactorSettings } from "./components/two-factor-settings";
import { useAuth } from "../../hooks/use-auth";
import { useTranslation } from "../../hooks/use-translation";
import { PublicAssetUpload } from "../public-assets/components/public-asset-upload";

export function SecurityRoute() {
  const { t } = useTranslation();
  const { session } = useAuth();

  return (
    <section className="grid gap-[var(--ds-space-400)]">
      <header>
        <h1>{t("auth.security.title")}</h1>
        <p className="text-[color:var(--ds-text-subtle)]">{t("auth.security.summary")}</p>
      </header>
      <PublicAssetUpload kind="avatar" ownerName={session?.user.name ?? ""} />
      <TwoFactorSettings />
    </section>
  );
}
