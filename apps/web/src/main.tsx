import "@repo/ui/styles/globals.css";
import "./styles.css";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./app";
import { getWebEnv } from "./env.config";

const root = document.getElementById("root");

if (!root) {
  throw new Error("Root element not found");
}

// Fail fast on a misconfigured client build instead of rendering a broken app.
try {
  getWebEnv();
} catch (error) {
  root.textContent = error instanceof Error ? error.message : "Invalid environment configuration";
  throw error;
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>
);
