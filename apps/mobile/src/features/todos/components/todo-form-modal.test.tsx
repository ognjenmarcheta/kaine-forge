// @vitest-environment jsdom
/* eslint-disable no-restricted-syntax -- DOM stand-ins exercise native props without requiring a device runtime. */
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TodoFormModal } from "./todo-form-modal";

function t(key: string) {
  return key;
}

interface ContainerProps {
  children?: ReactNode;
}
vi.mock("react-native", () => ({
  View: ({ children }: ContainerProps) => <div>{children}</div>,
  ScrollView: ({ children }: ContainerProps) => <div>{children}</div>
}));
vi.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ bottom: 24 }) }));
vi.mock("../../../hooks/use-translation", () => ({
  useTranslation: () => ({ t: (key: string) => key })
}));
vi.mock("@repo/mobile-ui", () => {
  const Container = ({ children }: ContainerProps) => <div>{children}</div>;
  return {
    Dialog: ({ children, onClose }: ContainerProps & { onClose: () => void }) => (
      <div>
        <button onClick={onClose}>{t("common.close")}</button>
        {children}
      </div>
    ),
    DialogContent: Container,
    DialogFooter: Container,
    DialogOverlay: Container,
    DialogTitle: Container,
    Text: Container,
    Button: ({
      children,
      disabled,
      onPress
    }: ContainerProps & { disabled?: boolean; onPress: () => void }) => (
      <button disabled={disabled} onClick={onPress}>
        {children}
      </button>
    ),
    Input: ({
      accessibilityLabel,
      editable,
      value
    }: {
      accessibilityLabel: string;
      editable: boolean;
      value: string;
    }) => <input aria-label={accessibilityLabel} disabled={!editable} value={value} readOnly />
  };
});

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

function button(label: string) {
  const result = Array.from(container.querySelectorAll("button")).find(
    (element) => element.textContent === label
  );
  if (!result) throw new Error(`Missing button: ${label}`);
  return result;
}

describe("native Todo form", () => {
  it("keeps its draft during rerenders, blocks pending dismissal, and recovers after failure", async () => {
    let rejectSave: (reason: Error) => void = () => {
      throw new Error("Save not started");
    };
    const submit = vi.fn(
      () =>
        new Promise<void>((_resolve, reject) => {
          rejectSave = reject;
        })
    );
    const close = vi.fn();
    await act(async () =>
      root.render(
        <TodoFormModal
          isOpen
          title="todos.create"
          initialDraft={{ title: "Draft", description: "Description" }}
          onClose={close}
          onSubmit={submit}
        />
      )
    );
    await act(async () =>
      root.render(
        <TodoFormModal
          isOpen
          title="todos.create"
          initialDraft={{ title: "Replacement", description: "" }}
          onClose={close}
          onSubmit={submit}
        />
      )
    );
    expect(container.querySelector("input")?.value).toBe("Draft");
    await act(async () => button("button.save").click());
    expect(submit).toHaveBeenCalledWith({ title: "Draft", description: "Description" });
    expect(container.querySelector("input")?.disabled).toBe(true);
    expect(button("button.cancel").disabled).toBe(true);
    await act(async () => {
      button("common.close").click();
      button("common.loadingShort").click();
    });
    expect(close).not.toHaveBeenCalled();
    expect(submit).toHaveBeenCalledOnce();
    await act(async () => rejectSave(new Error("Unavailable")));
    expect(container.textContent).toContain("error.generic");
    expect(container.querySelector("input")?.value).toBe("Draft");
    expect(container.querySelector("input")?.disabled).toBe(false);
    expect(button("button.save").disabled).toBe(false);
    await act(async () => button("button.cancel").click());
    expect(close).toHaveBeenCalledOnce();
  });
});
