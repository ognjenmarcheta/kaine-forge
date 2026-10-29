import { View } from "react-native";

import { cn } from "../../lib/cn";

export interface ProgressBarProps {
  value: number;
  max?: number;
  /** A translated name, such as "Schedule progress". */
  accessibilityLabel: string;
  className?: string;
}

/** A horizontal bar that fills toward `max`. Screen readers get its name and value. */
export function ProgressBar({ value, max = 100, accessibilityLabel, className }: ProgressBarProps) {
  const percent = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;

  return (
    <View
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max, now: value }}
      className={cn("h-2 w-full overflow-hidden rounded-full bg-ds-bg-neutral", className)}
    >
      <View className="h-full rounded-full bg-ds-bg-brand-bold" style={{ width: `${percent}%` }} />
    </View>
  );
}
