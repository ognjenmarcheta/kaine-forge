import "@repo/ui/styles/globals.css";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { LabApp } from "./lab.app";
import { installLabThemes, labScreens } from "./lab.registry";

installLabThemes();
// The screenshot script reads the screens from the page, since it cannot glob TSX.
window.labScreens = labScreens.map(({ id, width, height }) => ({ id, width, height }));

const root = document.getElementById("root");

if (!root) {
  throw new Error("index.html has no #root element");
}

createRoot(root).render(
  <StrictMode>
    <LabApp />
  </StrictMode>
);
