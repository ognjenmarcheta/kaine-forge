import { mergeConfig } from "vitest/config";

import base from "./vitest.config";

export default mergeConfig(base, {
  test: {
    include: ["src/features/assistant/assistant.eval.live.ts"],
    fileParallelism: false,
    testTimeout: 910_000,
    hookTimeout: 30_000,
    coverage: { enabled: false }
  }
});
