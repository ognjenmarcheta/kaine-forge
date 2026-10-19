import { defineConfig } from "vitest/config";

// Relative, not "@repo/config/vitest": this is the package itself, and a self
// import would need a knip ignore for an "undeclared" dependency.
import { vitestExclude } from "./vitest/index.js";

export default defineConfig({
  test: {
    exclude: vitestExclude
  }
});
