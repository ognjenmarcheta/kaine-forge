import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@repo/ui";

import { useTheme } from "../hooks/use-theme";
import { useTranslation } from "../hooks/use-translation";

export function ThemeSelect() {
  const { themeMode, setThemeMode } = useTheme();
  const { t } = useTranslation();
  return (
    <Select
      value={themeMode}
      onValueChange={(value) => {
        if (value === "system" || value === "light" || value === "dark") setThemeMode(value);
      }}
    >
      <SelectTrigger aria-label={t("navigation.theme")}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="system">{t("navigation.themeSystem")}</SelectItem>
        <SelectItem value="light">{t("navigation.themeLight")}</SelectItem>
        <SelectItem value="dark">{t("navigation.themeDark")}</SelectItem>
      </SelectContent>
    </Select>
  );
}
