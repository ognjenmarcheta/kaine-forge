// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { AssistantMessageList } from "./assistant-message-list";
import type { ChatMessage } from "../assistant.type";

vi.mock("../../../hooks/use-translation", () => ({
  useTranslation: () => ({ t: (key: string) => key })
}));

const history: ChatMessage[] = Array.from({ length: 30 }, (_, index) => ({
  id: String(index),
  content: `History message ${index.toString()}`,
  role: "assistant",
  toolActions: []
}));
let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
let scrollTop = 0;

function render(messages: ChatMessage[]) {
  return act(async () =>
    root.render(
      <MemoryRouter>
        <AssistantMessageList messages={messages} onUsePrompt={() => {}} />
      </MemoryRouter>
    )
  );
}
function viewport() {
  const element = container.querySelector(".ui-assistant__messages");
  if (!(element instanceof HTMLElement)) throw new Error("Missing message viewport");
  return element;
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  // jsdom has no layout: the transcript is 3000px of messages in a 600px viewport.
  scrollTop = 0;
  vi.spyOn(Element.prototype, "scrollHeight", "get").mockReturnValue(3000);
  vi.spyOn(Element.prototype, "clientHeight", "get").mockReturnValue(600);
  vi.spyOn(Element.prototype, "scrollTop", "get").mockImplementation(() => scrollTop);
  vi.spyOn(Element.prototype, "scrollTop", "set").mockImplementation((value: number) => {
    scrollTop = value;
  });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("keeps the reader's place when the list re-renders before the scroll event arrives", async () => {
  await render(history);
  expect(scrollTop).toBe(3000);

  // The reader scrolls to the top; a keystroke re-renders the list in the same frame, before
  // the browser dispatches the scroll event.
  viewport().scrollTop = 0;
  await render([...history]);

  expect(scrollTop).toBe(0);
});
