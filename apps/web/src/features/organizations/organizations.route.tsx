import { useTranslation } from "../../hooks/use-translation";

export function OrganizationsRoute() {
  const { t } = useTranslation();

  return (
    <section className="grid gap-[var(--ds-space-200)]">
      <header>
        <h1>{t("navigation.members")}</h1>
      </header>
    </section>
  );
}
