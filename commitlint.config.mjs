// Enforces Conventional Commits. The allowed types match the type:* labels in
// .github/workflows/labeler.yml so commit/PR titles keep driving release notes
// and triage labels.
// Also blocks AI self-attribution (Co-Authored-By assistants, generator footers).
import { findAiCoauthorViolation } from "./scripts/no-ai-coauthor.mjs";

/** @type {import('@commitlint/types').UserConfig} */
export default {
  extends: ["@commitlint/config-conventional"],
  plugins: [
    {
      rules: {
        "no-ai-coauthor": (parsed) => {
          const raw =
            typeof parsed.raw === "string" && parsed.raw.length > 0
              ? parsed.raw
              : [parsed.header, parsed.body, parsed.footer]
                  .filter((part) => typeof part === "string" && part.length > 0)
                  .join("\n\n");
          const violation = findAiCoauthorViolation(raw);
          if (violation) {
            return [false, violation];
          }
          return [true];
        }
      }
    }
  ],
  rules: {
    "no-ai-coauthor": [2, "always"]
  }
};
