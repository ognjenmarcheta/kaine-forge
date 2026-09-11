import { Text, View } from "react-native";

import { useTranslation } from "../../src/hooks/use-translation";

export default function MembersScreen() {
  const { t } = useTranslation();

  return (
    <View className="flex-1 items-center justify-center gap-3 bg-ds-surface p-4">
      <Text className="text-ds-text">{t("navigation.members")}</Text>
      <Text className="text-center text-ds-text-subtle">
        {t("organizations.members.mobilePlaceholder")}
      </Text>
    </View>
  );
}
