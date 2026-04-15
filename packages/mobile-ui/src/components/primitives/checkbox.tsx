import { Pressable, View, type PressableProps } from "react-native";

import { cn } from "../../lib/cn";

export type CheckboxProps = Omit<PressableProps, "onPress"> & {
  checked?: boolean;
  className?: string;
  onCheckedChange?: (checked: boolean) => void;
};

export function Checkbox({ checked = false, className, onCheckedChange, ...props }: CheckboxProps) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      className={cn(
        "size-6 items-center justify-center rounded-sm border border-ds-border",
        checked && "border-ds-border-selected bg-ds-bg-brand-bold",
        className
      )}
      onPress={() => onCheckedChange?.(!checked)}
      {...props}
    >
      {checked ? <View className="size-2 rounded-sm bg-ds-text-inverse" /> : null}
    </Pressable>
  );
}
