import type { ReactNode } from "react";
import { View } from "react-native";

interface ScreenContainerProps {
  children: ReactNode;
}

export function ScreenContainer({ children }: ScreenContainerProps) {
  return <View className="flex-1 bg-background-default p-4">{children}</View>;
}
