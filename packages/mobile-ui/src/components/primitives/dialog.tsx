import { createContext, useContext, type ReactNode } from "react";
import {
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  View,
  useWindowDimensions,
  type ModalProps
} from "react-native";
import Animated, { useAnimatedStyle, type SharedValue } from "react-native-reanimated";

import { Text } from "./text";
import { useMotionPresence } from "../../hooks/use-motion-presence";
import { useReducedMotion } from "../../hooks/use-reduced-motion";
import { cn } from "../../lib/cn";
import { motionDistances } from "../../lib/design-tokens";

interface DialogContextValue {
  onClose: () => void;
  progress: SharedValue<number>;
  distance: number;
}

const DialogContext = createContext<DialogContextValue | null>(null);

export interface DialogProps {
  animationType?: ModalProps["animationType"];
  children: ReactNode;
  isOpen: boolean;
  onClose: () => void;
}

export function Dialog({ animationType = "fade", children, isOpen, onClose }: DialogProps) {
  const reducedMotion = useReducedMotion();
  const { height } = useWindowDimensions();
  const immediate = reducedMotion || animationType === "none";
  const { visible, progress } = useMotionPresence(isOpen, immediate);
  const distance = immediate ? 0 : animationType === "slide" ? height : motionDistances.dialog;
  const animatedStyle = useAnimatedStyle(() => ({ opacity: progress.value }));
  return (
    <DialogContext.Provider value={{ onClose, progress, distance }}>
      <Modal
        animationType="none"
        transparent
        visible={visible}
        onRequestClose={() => {
          if (isOpen) onClose();
        }}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          className="flex-1"
        >
          <Animated.View
            className="flex-1"
            style={animatedStyle}
            pointerEvents={isOpen ? "auto" : "none"}
          >
            {children}
          </Animated.View>
        </KeyboardAvoidingView>
      </Modal>
    </DialogContext.Provider>
  );
}

export function DialogOverlay({
  children,
  className
}: {
  children: ReactNode;
  className?: string;
}) {
  const ctx = useContext(DialogContext);

  return (
    <Pressable
      className={cn("flex-1 items-center justify-center bg-ds-blanket px-5", className)}
      onPress={() => {
        if (Keyboard.isVisible()) {
          Keyboard.dismiss();
        } else {
          ctx?.onClose();
        }
      }}
    >
      <Pressable className="w-full max-h-full">{children}</Pressable>
    </Pressable>
  );
}

export function DialogContent({
  children,
  className,
  position = "center"
}: {
  children: ReactNode;
  className?: string;
  position?: "bottom" | "center";
}) {
  const ctx = useContext(DialogContext);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: (1 - (ctx?.progress.value ?? 1)) * (ctx?.distance ?? 0) }]
  }));
  return (
    <Animated.View
      style={animatedStyle}
      accessibilityViewIsModal
      className={cn(
        "bg-ds-surface p-5",
        position === "bottom" ? "w-full rounded-t-md" : "w-full max-w-md rounded-md",
        className
      )}
    >
      {children}
    </Animated.View>
  );
}

export function DialogHeader({ children, className }: { children: ReactNode; className?: string }) {
  return <View className={cn("gap-1", className)}>{children}</View>;
}

export function DialogFooter({ children, className }: { children: ReactNode; className?: string }) {
  return <View className={cn("mt-4 flex-row justify-end gap-2", className)}>{children}</View>;
}

export function DialogTitle({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <Text variant="subheading" {...(className ? { className } : {})}>
      {children}
    </Text>
  );
}

export function DialogDescription({
  children,
  className
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <Text variant="caption" className={cn("mt-2", className)}>
      {children}
    </Text>
  );
}
