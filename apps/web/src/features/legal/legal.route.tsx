import { AuthLayout, Button } from "@repo/ui";
import { Link } from "react-router-dom";

import { useTranslation } from "../../hooks/use-translation";

const LEGAL_COPY_KEYS = {
  privacy: { body: "legal.privacy.body", title: "legal.privacy.title" },
  terms: { body: "legal.terms.body", title: "legal.terms.title" }
} as const;

interface LegalRouteProps {
  page: keyof typeof LEGAL_COPY_KEYS;
}

export function LegalRoute({ page }: LegalRouteProps) {
  const { t } = useTranslation();
  const copy = LEGAL_COPY_KEYS[page];

  return (
    <AuthLayout subtitle={t("legal.stubNotice")} title={t(copy.title)}>
      <p className="mb-[var(--ds-space-300)]">{t(copy.body)}</p>
      <Button appearance="subtle" asChild className="w-full">
        <Link to="/auth">{t("auth.backToSignIn")}</Link>
      </Button>
    </AuthLayout>
  );
}
