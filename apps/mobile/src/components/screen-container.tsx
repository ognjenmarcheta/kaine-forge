import { motionDurations } from "@repo/mobile-ui";
import type { ReactNode } from "react";
import Animated, { FadeIn, ReduceMotion } from "react-native-reanimated";
import { SafeAreaView, type Edge } from "react-native-safe-area-context";

interface ScreenContainerProps {
  children: ReactNode;
  includeTopInset?: boolean;
}

export function ScreenContainer({ children, includeTopInset = false }: ScreenContainerProps) {
  const edges: Edge[] = includeTopInset ? ["top", "bottom"] : ["bottom"];
  return (
    <SafeAreaView edges={edges} className="flex-1 bg-ds-surface">
      <Animated.View
        entering={FadeIn.duration(motionDurations.overlay).reduceMotion(ReduceMotion.System)}
        className="flex-1 bg-ds-surface p-4"
      >
        {children}
      </Animated.View>
    </SafeAreaView>
  );
}
