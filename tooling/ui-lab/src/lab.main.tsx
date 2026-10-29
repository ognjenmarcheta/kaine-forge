import "@repo/ui/styles/globals.css";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { LabApp } from "./lab.app";
import { installLabThemes, loadLabCatalog } from "./lab.registry";

const root = document.getElementById("root");

if (!root) {
  throw new Error("index.html has no #root element");
}

void loadLabCatalog().then((catalog) => {
  installLabThemes(catalog);
  // The screenshot script reads the screens from the page, since it cannot glob TSX.
  window.labScreens = catalog.screens.map(
    ({ id, width, height, mode, reference, referenceCrop }) => ({
      id,
      width,
      height,
      mode,
      reference,
      referenceCrop
    })
  );
  createRoot(root).render(
    <StrictMode>
      <LabApp catalog={catalog} />
    </StrictMode>
  );
});
