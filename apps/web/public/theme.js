/* global localStorage, document, matchMedia */
// Apply persisted appearance before the browser paints the app.
(() => {
  let mode = "system";
  try {
    const stored = JSON.parse(localStorage.getItem("kaine.theme.mode") ?? "null");
    const value = stored?.state?.themeMode;
    if (value === "light" || value === "dark") mode = value;
  } catch {
    // Unavailable or invalid storage falls back to the system preference.
  }
  document.documentElement.dataset.theme =
    mode === "system"
      ? matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light"
      : mode;
})();
