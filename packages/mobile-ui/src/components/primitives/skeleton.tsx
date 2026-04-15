import { View, type ViewProps } from "react-native";

import { cn } from "../../lib/cn";

export type SkeletonProps = ViewProps & {
  className?: string;
};

export function Skeleton({ className, ...props }: SkeletonProps) {
  return <View className={cn("rounded-md bg-ds-bg-neutral", className)} {...props} />;
}
