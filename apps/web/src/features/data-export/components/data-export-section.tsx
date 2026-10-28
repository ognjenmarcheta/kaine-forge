import { Badge, Button, FieldError, QueryError, SettingsSection } from "@repo/ui";

import { LoadingRows } from "../../../components/loading-rows";
import type { DataExportKind } from "../../../graphql/generated/react-query";
import { useTranslation } from "../../../hooks/use-translation";
import { isExportAlreadyInProgress, isExportInProgress, useDataExports } from "../data-export.hook";

interface DataExportSectionProps {
  kind: DataExportKind;
  /** The Active Organization, for an Organization export's cache key. */
  organizationId: string | null;
}

/**
 * Requests an archive of the user's own data or of the Active Organization's
 * data, and lists the caller's exports with a download action while one is
 * ready. The API checks every rule; this only offers the actions.
 */
export function DataExportSection({ kind, organizationId }: DataExportSectionProps) {
  const { language, t } = useTranslation();
  const { exports, request, download } = useDataExports(kind, organizationId);
  const date = new Intl.DateTimeFormat(language, { dateStyle: "medium", timeStyle: "short" });
  const size = new Intl.NumberFormat(language, {
    style: "unit",
    unit: "kilobyte",
    maximumFractionDigits: 0
  });
  const inProgress = exports.data?.some((item) => isExportInProgress(item.status)) === true;

  return (
    <SettingsSection
      description={t(`dataExport.${kind}.description`)}
      title={t(`dataExport.${kind}.title`)}
    >
      <div>
        <Button disabled={inProgress || request.isPending} onClick={() => request.mutate({ kind })}>
          {t("dataExport.request")}
        </Button>
      </div>
      {request.error ? (
        <FieldError>
          {t(
            isExportAlreadyInProgress(request.error)
              ? "dataExport.error.inProgress"
              : "dataExport.error.request"
          )}
        </FieldError>
      ) : null}
      {download.error ? <FieldError>{t("dataExport.error.download")}</FieldError> : null}
      {exports.status === "pending" ? <LoadingRows label={t("dataExport.loading")} /> : null}
      {exports.status === "error" ? (
        <QueryError
          message={t("dataExport.error.list")}
          retryLabel={t("common.retry")}
          onRetry={() => void exports.refetch()}
        />
      ) : null}
      {exports.data && exports.data.length === 0 ? (
        <p className="text-body text-ds-text-subtle">{t("dataExport.empty")}</p>
      ) : null}
      {exports.data && exports.data.length > 0 ? (
        <ul aria-label={t("dataExport.list")} className="ui-work-list">
          {exports.data.map((item) => (
            <li
              key={item.id}
              className="ui-work-row flex flex-wrap items-center justify-between gap-ds-150"
            >
              <span className="grid gap-ds-050">
                <span className="text-body text-ds-text">
                  {t("dataExport.requestedAt")} {date.format(new Date(item.createdAt))}
                </span>
                {item.status === "ready" && item.expiresAt ? (
                  <span className="flex flex-wrap gap-ds-100 text-body-sm text-ds-text-subtle">
                    <span>
                      {t("dataExport.availableUntil")} {date.format(new Date(item.expiresAt))}
                    </span>
                    <span>
                      {size.format(Math.max(1, Math.round((item.sizeBytes ?? 0) / 1024)))}
                    </span>
                  </span>
                ) : null}
                {item.status === "failed" ? (
                  <span className="text-body-sm text-ds-text-danger">
                    {t(`dataExport.failure.${item.failureReason ?? "error"}`)}
                  </span>
                ) : null}
              </span>
              <span className="flex items-center gap-ds-100">
                <Badge>{t(`dataExport.status.${item.status}`)}</Badge>
                {item.status === "ready" ? (
                  <Button
                    appearance="subtle"
                    disabled={download.isPending}
                    onClick={() => download.mutate({ id: item.id })}
                  >
                    {t("dataExport.download")}
                  </Button>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </SettingsSection>
  );
}
