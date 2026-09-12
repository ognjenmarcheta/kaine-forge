import { forwardRef, useEffect, type ElementRef, type ReactNode } from "react";
import { Pressable, type PressableProps } from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming
} from "react-native-reanimated";

import { Text } from "./text";
import { useReducedMotion } from "../../hooks/use-reduced-motion";
import { cn } from "../../lib/cn";
import { motionDistances, motionDurations, motionEasing } from "../../lib/design-tokens";
import { buttonTextVariants, buttonVariants } from "../../lib/variants";

export type ButtonProps = Omit<PressableProps, "children"> & {
  appearance?: "danger" | "default" | "ghost" | "secondary" | "subtle" | "warning";
  children: ReactNode;
  spacing?: "compact" | "default" | "spacious";
  textClassName?: string;
};

export const Button = forwardRef<ElementRef<typeof Pressable>, ButtonProps>(
  (
    {
      appearance,
      children,
      className,
      disabled,
      spacing,
      textClassName,
      onPressIn,
      onPressOut,
      style,
      ...props
    },
    ref
  ) => {
    const reducedMotion = useReducedMotion();
    const offset = useSharedValue(0);
    useEffect(() => {
      if (disabled || reducedMotion) {
        cancelAnimation(offset);
        offset.value = 0;
      }
    }, [disabled, reducedMotion, offset]);
    const animatedStyle = useAnimatedStyle(() => ({ transform: [{ translateY: offset.value }] }));
    function animatePress(pressed: boolean) {
      if (disabled || reducedMotion) return;
      offset.value = withTiming(pressed ? motionDistances.press : 0, {
        duration: motionDurations.control,
        easing: Easing.bezier(...motionEasing)
      });
    }
    return (
      <Pressable
        ref={ref}
        className={cn(
          buttonVariants({ appearance, spacing }),
          disabled && "bg-ds-bg-neutral",
          className
        )}
        disabled={disabled}
        {...props}
        style={style}
        onPressIn={(event) => {
          animatePress(true);
          onPressIn?.(event);
        }}
        onPressOut={(event) => {
          animatePress(false);
          onPressOut?.(event);
        }}
      >
        <Animated.View style={animatedStyle} className="flex-row items-center justify-center">
          {typeof children === "string" ? (
            <Text
              className={cn(
                buttonTextVariants({ appearance, spacing }),
                disabled && "text-ds-text-disabled",
                textClassName
              )}
            >
              {children}
            </Text>
          ) : (
            children
          )}
        </Animated.View>
      </Pressable>
    );
  }
);
Button.displayName = "Button";
