import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    // Subprocess-heavy checks share host resources and must keep their real deadlines.
    maxWorkers: 1,
    include: [".ai/*.spec.ts"]
  }
});
