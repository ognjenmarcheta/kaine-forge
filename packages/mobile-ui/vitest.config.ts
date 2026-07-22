import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const packageRoot = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      // Tests run against a typed DOM stub that mirrors the React Native
      // prop contracts used by these primitives (see src/test/react-native.stub.tsx).
      "react-native": path.join(packageRoot, "src/test/react-native.stub.tsx")
    }
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/vitest.setup.ts"]
  }
});
