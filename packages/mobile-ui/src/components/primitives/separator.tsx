import { View, type ViewProps } from "react-native";

import { cn } from "../../lib/cn";

export interface SeparatorProps extends ViewProps {
  className?: string;
  orientation?: "horizontal" | "vertical";
}

export function Separator({ className, orientation = "horizontal", ...props }: SeparatorProps) {
  return (
    <View
      className={cn(
        "bg-ds-border",
        orientation === "horizontal" ? "h-px w-full" : "h-full w-px",
        className
      )}
      {...props}
    />
  );
}
