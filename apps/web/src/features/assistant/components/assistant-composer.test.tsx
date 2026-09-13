// @vitest-environment jsdom
import { act, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { AssistantComposer } from "./assistant-composer";
import { AssistantMessageList } from "./assistant-message-list";

vi.mock("../../../hooks/use-translation", () => ({
  useTranslation: () => ({ t: (key: string) => key })
}));
const submit = vi.fn();
let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
function Harness({ canSend = true }: { canSend?: boolean }) {
  const form = useRef<HTMLFormElement>(null);
  const [value, setValue] = useState("");
  return (
    <>
      <AssistantMessageList
        messages={[]}
        onUsePrompt={(prompt) => {
          setValue(prompt);
          form.current?.querySelector("textarea")?.focus();
        }}
      />
      <AssistantComposer
        formRef={form}
        canSend={canSend}
        value={value}
        onChange={setValue}
        onSubmit={submit}
      />
    </>
  );
}
function textarea() {
  const element = container.querySelector("textarea");
  if (!element) throw new Error("Missing composer");
  return element;
}
function sendButton() {
  const button = container.querySelector('button[type="submit"]');
  if (!(button instanceof HTMLButtonElement)) throw new Error("Missing send button");
  return button;
}
async function type(value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set?.call(
      textarea(),
      value
    );
    textarea().dispatchEvent(new Event("input", { bubbles: true }));
  });
}
beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  submit.mockClear();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root.render(<Harness />));
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

it("fills and focuses a starter without sending", async () => {
  const starter = container.querySelector(".ui-assistant__starters button");
  if (!(starter instanceof HTMLButtonElement)) throw new Error("Missing starter");
  await act(async () => starter.click());
  expect(textarea().value).toBe("assistant.starter.list");
  expect(document.activeElement).toBe(textarea());
  expect(submit).not.toHaveBeenCalled();
});
it("sends on Enter, but preserves Shift+Enter and IME composition", async () => {
  await type("Plan");
  for (const options of [{ shiftKey: true }, { isComposing: true }, { keyCode: 229 }]) {
    await act(async () =>
      textarea().dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true, ...options })
      )
    );
  }
  expect(submit).not.toHaveBeenCalled();
  await act(async () =>
    textarea().dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true })
    )
  );
  expect(submit).toHaveBeenCalledTimes(1);
});
it("blocks blank and pending submissions while keeping the draft editable", async () => {
  await type("   ");
  expect(sendButton().disabled).toBe(true);
  await type("Plan");
  expect(sendButton().disabled).toBe(false);
  await act(async () => root.render(<Harness canSend={false} />));
  await type("Next draft");
  expect(textarea().value).toBe("Next draft");
  expect(sendButton().disabled).toBe(true);
  await act(async () =>
    textarea().dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true })
    )
  );
  expect(submit).not.toHaveBeenCalled();
});
