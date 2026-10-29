/* global localStorage, document, matchMedia */
// Apply the persisted color mode and the last Organization Theme before the browser paints.
(() => {
  let mode = "system";
  try {
    const stored = JSON.parse(localStorage.getItem("kaine.theme.mode") ?? "null");
    const value = stored?.state?.themeMode;
    if (value === "light" || value === "dark") mode = value;
    // An unknown name matches no theme rule, so the default theme applies.
    const theme = localStorage.getItem("kaine.theme.name");
    if (theme && /^[a-z0-9-]+$/.test(theme)) document.documentElement.dataset.theme = theme;
  } catch {
    // Unavailable or invalid storage falls back to the system preference.
  }
  document.documentElement.dataset.colorMode =
    mode === "system"
      ? matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light"
      : mode;
})();
