import { TwoFactorSettings } from "./components/two-factor-settings";
import { useTranslation } from "../../hooks/use-translation";

export function SecurityRoute() {
  const { t } = useTranslation();

  return (
    <section className="grid gap-[var(--ds-space-400)]">
      <header>
        <h1>{t("auth.security.title")}</h1>
        <p className="text-[color:var(--ds-text-subtle)]">{t("auth.security.summary")}</p>
      </header>
      <TwoFactorSettings />
    </section>
  );
}
