import { type ReactNode } from "react";
import { View, type ViewProps } from "react-native";

import { Text } from "./text";
import { cn } from "../../lib/cn";

export interface BadgeProps extends ViewProps {
  appearance?: "danger" | "default" | "information" | "success" | "warning";
  children: ReactNode;
  className?: string;
}

const badgeClasses = {
  danger: "bg-ds-bg-danger",
  default: "bg-ds-bg-neutral",
  information: "bg-ds-bg-information",
  success: "bg-ds-bg-success",
  warning: "bg-ds-bg-warning"
} as const;

const textClasses = {
  danger: "text-ds-text-danger",
  default: "text-ds-text-subtle",
  information: "text-ds-text-information",
  success: "text-ds-text-success",
  warning: "text-ds-text-warning"
} as const;

export function Badge({ appearance = "default", children, className, ...props }: BadgeProps) {
  return (
    <View
      className={cn("self-start rounded-sm px-2 py-1", badgeClasses[appearance], className)}
      {...props}
    >
      <Text variant="caption" className={cn("font-medium", textClasses[appearance])}>
        {children}
      </Text>
    </View>
  );
}
