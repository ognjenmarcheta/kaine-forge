import { forwardRef, type ReactNode } from "react";

// Test-only stand-in for the react-native module, wired up through the
// vitest resolve alias. It renders DOM elements while preserving the React
// Native prop contracts these primitives rely on (className via NativeWind,
// onPress, disabled, accessibilityRole/State, onChangeText), so component
// behavior is exercised for real. TypeScript still checks the primitives
// against the genuine react-native types.

interface StubBaseProps {
  accessibilityLabel?: string;
  accessibilityRole?: string;
  accessibilityState?: { checked?: boolean; disabled?: boolean };
  children?: ReactNode;
  className?: string;
  testID?: string;
}

type PressableStubProps = StubBaseProps & {
  disabled?: boolean | null;
  onPress?: () => void;
};

export const Pressable = forwardRef<HTMLButtonElement, PressableStubProps>(
  (
    {
      accessibilityLabel,
      accessibilityRole,
      accessibilityState,
      children,
      className,
      disabled,
      onPress,
      testID
    },
    ref
  ) => (
    <button
      ref={ref}
      aria-checked={accessibilityState?.checked}
      aria-label={accessibilityLabel}
      className={className}
      data-testid={testID}
      disabled={disabled === true}
      role={accessibilityRole}
      type="button"
      onClick={() => {
        // Mirrors React Native Pressable: presses are ignored while disabled.
        if (disabled !== true) {
          onPress?.();
        }
      }}
    >
      {children}
    </button>
  )
);
Pressable.displayName = "Pressable";

export function View({ children, className, testID }: StubBaseProps) {
  return (
    <div className={className} data-testid={testID}>
      {children}
    </div>
  );
}

export function Text({ children, className, testID }: StubBaseProps) {
  return (
    <span className={className} data-testid={testID}>
      {children}
    </span>
  );
}

type TextInputStubProps = StubBaseProps & {
  editable?: boolean;
  onChangeText?: (text: string) => void;
  placeholder?: string;
  placeholderTextColor?: string;
  value?: string;
};

export const TextInput = forwardRef<HTMLInputElement, TextInputStubProps>(
  ({ className, editable, onChangeText, placeholder, testID, value }, ref) => (
    <input
      ref={ref}
      className={className}
      data-testid={testID}
      placeholder={placeholder}
      readOnly={editable === false}
      value={value}
      onChange={(event) => onChangeText?.(event.target.value)}
    />
  )
);
TextInput.displayName = "TextInput";
