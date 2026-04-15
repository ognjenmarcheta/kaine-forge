import { View, type ViewProps } from "react-native";

import { Text } from "./text";
import { cn } from "../../lib/cn";

export interface AvatarProps extends ViewProps {
  className?: string;
  fallback: string;
}

export function Avatar({ className, fallback, ...props }: AvatarProps) {
  return (
    <View
      className={cn(
        "size-10 items-center justify-center rounded-full bg-ds-bg-neutral-bold",
        className
      )}
      {...props}
    >
      <Text className="font-semibold text-ds-text-inverse">
        {fallback.slice(0, 2).toUpperCase()}
      </Text>
    </View>
  );
}
