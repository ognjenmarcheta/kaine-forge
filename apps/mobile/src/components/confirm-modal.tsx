import { Modal, Pressable, Text, View } from "react-native";

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  isConfirming?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmModal({
  isOpen,
  title,
  message,
  confirmLabel,
  cancelLabel,
  isConfirming = false,
  onConfirm,
  onCancel
}: ConfirmModalProps) {
  return (
    <Modal animationType="fade" transparent visible={isOpen}>
      <View className="flex-1 items-center justify-center bg-black/40 px-5">
        <View className="w-full max-w-md rounded-2xl bg-ds-surface p-4">
          <Text className="text-lg font-semibold text-ds-text">{title}</Text>
          <Text className="mt-2 text-sm text-ds-text-subtle">{message}</Text>
          <View className="mt-4 flex-row justify-end gap-2">
            <Pressable
              className="rounded-md border border-ds-border px-3 py-2"
              disabled={isConfirming}
              onPress={onCancel}
            >
              <Text className="text-sm text-ds-text">{cancelLabel}</Text>
            </Pressable>
            <Pressable
              className="rounded-md bg-ds-bg-danger px-3 py-2"
              disabled={isConfirming}
              onPress={onConfirm}
            >
              <Text className="text-sm text-ds-text-inverse">
                {isConfirming ? "..." : confirmLabel}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
