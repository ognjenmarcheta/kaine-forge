import { Text, View } from "react-native";

import { useTranslation } from "../../src/hooks/use-translation";

export default function MembersScreen() {
  const { t } = useTranslation();

  return (
    <View className="flex-1 items-center justify-center bg-ds-surface">
      <Text className="text-ds-text">{t("navigation.members")}</Text>
    </View>
  );
}
