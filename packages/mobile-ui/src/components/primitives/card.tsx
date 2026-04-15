import { type ReactNode } from "react";
import { View, type ViewProps } from "react-native";

import { Text } from "./text";
import { cn } from "../../lib/cn";

export type CardProps = ViewProps & {
  className?: string;
};

export function Card({ className, ...props }: CardProps) {
  return (
    <View
      className={cn(
        "rounded-md border border-ds-border bg-ds-surface p-4 shadow-raised",
        className
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: CardProps) {
  return <View className={cn("gap-1", className)} {...props} />;
}

export function CardContent({ className, ...props }: CardProps) {
  return <View className={cn("mt-4", className)} {...props} />;
}

export function CardTitle({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <Text variant="subheading" {...(className ? { className } : {})}>
      {children}
    </Text>
  );
}

export function CardDescription({
  children,
  className
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <Text variant="caption" {...(className ? { className } : {})}>
      {children}
    </Text>
  );
}
