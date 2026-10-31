// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { TodoAttachments } from "./todo-attachments";
import type { TodoItem } from "../todos.type";

vi.mock("../../../hooks/use-translation", () => ({
  useTranslation: () => ({ language: "en", t: (key: string) => key })
}));

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

it("drops a thumbnail that fails to load and keeps the file row", async () => {
  const item = {
    id: "todo-1",
    attachments: [
      {
        id: "file-1",
        originalName: "photo.png",
        mimeType: "image/png",
        sizeBytes: 2048
      }
    ]
  } as TodoItem; // SAFETY: the component reads only id and attachments.
  const links = {
    "file-1": {
      downloadUrl: "https://storage.example.com/photo.png",
      thumbnailUrl: "https://storage.example.com/photo.png.thumb.webp"
    }
  };

  await act(async () =>
    root.render(
      <TodoAttachments
        item={item}
        links={links}
        offline={false}
        busy={false}
        uploadBusy={false}
        onUpload={() => {}}
        onDelete={() => {}}
      />
    )
  );
  const thumbnail = container.querySelector("img");
  expect(thumbnail).not.toBeNull();

  await act(async () => thumbnail?.dispatchEvent(new Event("error")));

  expect(container.querySelector("img")).toBeNull();
  expect(container.querySelector("li")?.textContent).toContain("photo.png");
});
