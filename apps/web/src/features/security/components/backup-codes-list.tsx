import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@repo/ui";

import { useTranslation } from "../../../hooks/use-translation";

interface BackupCodesListProps {
  codes: readonly string[];
  onDone: () => void;
}

/** Shows freshly generated backup codes once; the server never returns them again. */
export function BackupCodesList({ codes, onDone }: BackupCodesListProps) {
  const { t } = useTranslation();

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("auth.security.backupCodesTitle")}</CardTitle>
        <CardDescription>{t("auth.security.backupCodesHint")}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-[var(--ds-space-150)]">
        <ul
          aria-label={t("auth.security.backupCodesTitle")}
          className="grid grid-cols-2 gap-[var(--ds-space-100)] font-mono"
        >
          {codes.map((code) => (
            <li key={code}>{code}</li>
          ))}
        </ul>
        <Button type="button" onClick={onDone}>
          {t("auth.security.done")}
        </Button>
      </CardContent>
    </Card>
  );
}
