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
      <SelectTrigger aria-label={t("navigation.appearance")}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="system">{t("navigation.appearanceSystem")}</SelectItem>
        <SelectItem value="light">{t("navigation.appearanceLight")}</SelectItem>
        <SelectItem value="dark">{t("navigation.appearanceDark")}</SelectItem>
      </SelectContent>
    </Select>
  );
}
