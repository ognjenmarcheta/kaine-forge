import { themes } from "@repo/theme";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SettingsSection
} from "@repo/ui";
import { useQueryClient } from "@tanstack/react-query";
import { useId } from "react";

import { useSetOrganizationThemeMutation } from "../../../graphql/generated/react-query";
import { useTranslation } from "../../../hooks/use-translation";
import { organizationThemeQueryKey, useOrganizationThemeName } from "../organizations.theme";

interface OrganizationThemeSettingsProps {
  organizationId: string;
}

/** Picks the Organization Theme every member sees. The server checks organization:update. */
export function OrganizationThemeSettings({ organizationId }: OrganizationThemeSettingsProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const selectId = useId();
  const theme = useOrganizationThemeName(organizationId);
  const setTheme = useSetOrganizationThemeMutation({
    onSuccess: (data) =>
      queryClient.setQueryData(organizationThemeQueryKey(organizationId), {
        organizationTheme: data.setOrganizationTheme
      })
  });

  return (
    <SettingsSection
      description={t("organizations.settings.themeDescription")}
      title={t("organizations.settings.themeTitle")}
    >
      <Field>
        <FieldLabel htmlFor={selectId}>{t("organizations.settings.themeLabel")}</FieldLabel>
        <Select
          disabled={theme === null || setTheme.isPending}
          value={theme ?? ""}
          onValueChange={(value) => setTheme.mutate({ theme: value })}
        >
          <SelectTrigger id={selectId}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {themes.map((option) => (
              <SelectItem key={option.name} value={option.name}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      {setTheme.error ? <FieldError>{t("organizations.settings.themeError")}</FieldError> : null}
      {setTheme.isSuccess ? (
        <FieldDescription role="status">{t("organizations.settings.themeSaved")}</FieldDescription>
      ) : null}
    </SettingsSection>
  );
}
