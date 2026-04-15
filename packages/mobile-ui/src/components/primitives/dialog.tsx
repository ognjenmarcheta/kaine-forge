import { createContext, useContext, type ReactNode } from "react";
import {
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  View,
  type ModalProps
} from "react-native";

import { Text } from "./text";
import { cn } from "../../lib/cn";

interface DialogContextValue {
  onClose: () => void;
}

const DialogContext = createContext<DialogContextValue | null>(null);

export interface DialogProps {
  animationType?: ModalProps["animationType"];
  children: ReactNode;
  isOpen: boolean;
  onClose: () => void;
}

export function Dialog({ animationType = "fade", children, isOpen, onClose }: DialogProps) {
  return (
    <DialogContext.Provider value={{ onClose }}>
      <Modal animationType={animationType} transparent visible={isOpen} onRequestClose={onClose}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          className="flex-1"
        >
          {children}
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
      <Pressable>{children}</Pressable>
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
  return (
    <View
      className={cn(
        "bg-ds-surface p-5",
        position === "bottom" ? "w-full rounded-t-md" : "w-full max-w-md rounded-md",
        className
      )}
    >
      {children}
    </View>
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
