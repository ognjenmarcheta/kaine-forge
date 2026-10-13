import "@repo/ui/styles/globals.css";
import "@xyflow/react/dist/style.css";
// Sonner injects its styles with a <style> element, which the server CSP blocks. Bundle them instead.
import "sonner/dist/styles.css";
import "./desk.styles.css";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { DeskApp } from "./desk.app";
import { LanguageProvider } from "./i18n/i18n.t";
import { RouterProvider } from "./shell/shell.router";
import { DeskProvider } from "./state/desk.provider";

const root = document.getElementById("root");
if (root !== null) {
  createRoot(root).render(
    <StrictMode>
      <LanguageProvider>
        <RouterProvider>
          <DeskProvider>
            <DeskApp />
          </DeskProvider>
        </RouterProvider>
      </LanguageProvider>
    </StrictMode>
  );
}
