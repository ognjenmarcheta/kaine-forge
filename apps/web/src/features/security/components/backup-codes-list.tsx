import { Button, CopyButton, SettingsSection } from "@repo/ui";

import { useTranslation } from "../../../hooks/use-translation";

const BACKUP_CODES_FILE_NAME = "backup-codes.txt";

interface BackupCodesListProps {
  codes: readonly string[];
  onDone: () => void;
}

/** Saves the codes as a text file through a temporary object URL. */
function downloadCodes(codes: readonly string[]) {
  const url = URL.createObjectURL(new Blob([`${codes.join("\n")}\n`], { type: "text/plain" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = BACKUP_CODES_FILE_NAME;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/** Shows freshly generated backup codes once; the server never returns them again. */
export function BackupCodesList({ codes, onDone }: BackupCodesListProps) {
  const { t } = useTranslation();

  return (
    <SettingsSection
      description={t("auth.security.backupCodesHint")}
      title={t("auth.security.backupCodesTitle")}
    >
      <ul
        aria-label={t("auth.security.backupCodesTitle")}
        className="grid grid-cols-2 gap-[var(--ds-space-100)] font-mono"
      >
        {codes.map((code) => (
          <li key={code}>{code}</li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-[var(--ds-space-100)]">
        <CopyButton
          copiedLabel={t("common.copied")}
          label={t("auth.security.copyBackupCodes")}
          value={codes.join("\n")}
        />
        <Button appearance="secondary" type="button" onClick={() => downloadCodes(codes)}>
          {t("auth.security.downloadBackupCodes")}
        </Button>
      </div>
      <div>
        <Button type="button" onClick={onDone}>
          {t("auth.security.done")}
        </Button>
      </div>
    </SettingsSection>
  );
}
